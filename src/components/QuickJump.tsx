import { useEffect, useMemo, useRef, useState } from 'react'
import { deadlineLabel, formatDateTime } from '../lib/date'
import { memoSummary } from '../lib/memoSummary'
import { useEscapeOwner } from '../lib/mode'
import { useStore } from '../store'
import { MEMO_TYPE_LABEL, TASK_STATUS_LABEL, needsConfirmation } from '../types'

const LIMIT = 12

interface Entry {
  key: string
  kind: string
  title: string
  sub: string
  path: string
  /** 新しいものを上に出すための並べ替え用 */
  at: string
  /** 未解決の疑問が残っているタスクなど、目印を付けたいもの */
  flag?: string
}

/** 打った文字が順番に含まれていれば当たり。頭文字を飛ばし打ちしても届く */
function subsequence(query: string, text: string): boolean {
  let at = 0
  for (const char of query) {
    at = text.indexOf(char, at)
    if (at === -1) return false
    at += 1
  }
  return true
}

interface Scored {
  entry: Entry
  rank: number
}

/**
 * どの画面からでも `/` で開く絞り込み。
 * 一覧を辿らずに、名前の数文字で目的のものへ直接着く。
 * 件数が増えても打鍵数が増えないのがここの狙い。
 */
interface QuickJumpProps {
  /**
   * 選んだ先へ移る。書きかけの見張り(registerDraftGuard)を通す必要があるので、
   * ここで navigate せず Layout の go に渡す。
   * 直に navigate すると、新規作成の書きかけを黙って捨ててしまう
   */
  onPick: (path: string) => void
  onClose: () => void
}

export function QuickJump({ onPick, onClose }: QuickJumpProps) {
  const { tasks, memos, meetings } = useStore()
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  useEscapeOwner(true, onClose)

  // 閉じたら元いた場所へフォーカスを返す。戻らないと j/k の続きが分からなくなる
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    inputRef.current?.focus()
    return () => previous?.focus()
  }, [])

  const entries = useMemo<Entry[]>(() => {
    const list: Entry[] = []
    for (const t of tasks) {
      list.push({
        key: `task-${t.id}`,
        kind: 'タスク',
        title: t.title || '(無題)',
        sub: `${deadlineLabel(t.deadline)} / ${TASK_STATUS_LABEL[t.status]}`,
        path: `/tasks/${t.id}`,
        at: t.updatedAt,
        flag: needsConfirmation(t) ? '要確認' : undefined,
      })
    }
    for (const m of memos) {
      list.push({
        key: `memo-${m.id}`,
        kind: 'メモ',
        title: memoSummary(m) || '(空)',
        sub: MEMO_TYPE_LABEL[m.type],
        path: `/memos/${m.id}`,
        at: m.updatedAt,
      })
    }
    for (const m of meetings) {
      const openTodos = m.blocks.filter((b) => b.kind === 'todo' && !b.done).length
      list.push({
        key: `meeting-${m.id}`,
        kind: '議事録',
        title: m.title || '(無題)',
        sub: formatDateTime(m.startedAt),
        path: `/meetings/${m.id}`,
        at: m.updatedAt,
        flag: openTodos > 0 ? `TODO ${openTodos}` : undefined,
      })
    }
    return list.sort((a, b) => (a.at > b.at ? -1 : 1))
  }, [tasks, memos, meetings])

  const hits = useMemo<Entry[]>(() => {
    const q = query.trim().toLowerCase()
    if (!q) return entries.slice(0, LIMIT)
    const scored: Scored[] = []
    for (const entry of entries) {
      const haystack = `${entry.title} ${entry.kind} ${entry.sub}`.toLowerCase()
      // まとまりで含む方を上に出す。飛ばし打ちは下
      if (haystack.includes(q)) scored.push({ entry, rank: 0 })
      else if (subsequence(q, haystack)) scored.push({ entry, rank: 1 })
    }
    // entries が新しい順なので、同じ rank の中では自然に新しいものが上に来る
    return scored.sort((a, b) => a.rank - b.rank).slice(0, LIMIT).map((s) => s.entry)
  }, [entries, query])

  // 絞り込みが変わったら選択を先頭へ。取り残した位置で Enter を押す事故を防ぐ
  useEffect(() => {
    setIndex(0)
  }, [query])

  // 選んでいる行が枠の外に出ないようにする。フォーカスは入力欄に置いたままなので、
  // ブラウザ任せでは動いてくれない。
  // 動かすのは li(画面の端向けの余白を持たない側)。この狭い枠に 2.5rem は要らない
  useEffect(() => {
    const row = listRef.current?.children[index]
    row?.scrollIntoView({ block: 'nearest' })
  }, [index, hits])

  const open = (entry: Entry | undefined) => {
    if (!entry) return
    onClose()
    onPick(entry.path)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/20 p-4 pt-16">
      <div
        className="w-full max-w-xl overflow-hidden rounded-lg bg-white shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-label="絞り込んで開く"
      >
        {/*
          モードの仕組みには乗せない素の input。
          ここは常に打てる場所なので readOnly にしてはいけない
        */}
        <input
          ref={inputRef}
          className="w-full border-b border-neutral-200 px-4 py-3 text-[15px] outline-none placeholder:text-neutral-400"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="打って絞る(↑↓ か Ctrl+N / Ctrl+P で選ぶ / Enterで開く)"
          aria-label="絞り込み"
          onKeyDown={(e) => {
            const move = (delta: number) => {
              e.preventDefault()
              setIndex((prev) => Math.min(hits.length - 1, Math.max(0, prev + delta)))
            }
            if (e.key === 'ArrowDown' || (e.ctrlKey && e.key.toLowerCase() === 'n')) return move(1)
            if (e.key === 'ArrowUp' || (e.ctrlKey && e.key.toLowerCase() === 'p')) return move(-1)
            // 変換確定のEnterで開いてしまわないようにする
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
              e.preventDefault()
              open(hits[index])
            }
          }}
        />

        {hits.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-neutral-400">見つかりません。</p>
        ) : (
          <ul ref={listRef} className="max-h-[60vh] overflow-y-auto py-1">
            {hits.map((entry, i) => (
              <li key={entry.key}>
                <button
                  type="button"
                  // 一覧の中は自前で選ぶのでフォーカスは動かさない(打鍵の邪魔になる)
                  tabIndex={-1}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => open(entry)}
                  className={`flex w-full items-center gap-3 px-4 py-2 text-left ${
                    i === index ? 'bg-neutral-100' : 'hover:bg-neutral-50'
                  }`}
                >
                  <span className="w-16 shrink-0 text-xs text-neutral-500">{entry.kind}</span>
                  <span className="min-w-0 flex-1 truncate text-sm text-neutral-900">
                    {entry.title}
                  </span>
                  {entry.flag && (
                    <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800">
                      {entry.flag}
                    </span>
                  )}
                  <span className="shrink-0 text-xs text-neutral-400">{entry.sub}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
