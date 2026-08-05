import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { GuiButton } from '../components/GuiButton'
import { InlineText } from '../components/InlineText'
import { TextBox } from '../components/TextBox'
import { useInitialMode, useModeActions, useOnExitInsert } from '../lib/mode'
import { useShortcuts } from '../lib/useShortcuts'
import {
  addBrainCard,
  brainGroupToMemo,
  removeBrainCard,
  removeBrainstorm,
  updateBrainCard,
  updateBrainstormWith,
  useStore,
} from '../store'
import type { Brainstorm } from '../types'

/**
 * グループ名の入力。1文字ごとに書き込むとデータファイル全体を毎回書き直すことになるので、
 * 手を止めた(離れた/Enterした)ときにだけ確定する。
 */
function GroupInput({ value, onCommit }: { value: string; onCommit: (value: string) => void }) {
  const [draft, setDraft] = useState(value)
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    if (!editing) setDraft(value)
  }, [value, editing])

  // Esc で入力モードを抜けたら書きかけを捨てる
  useOnExitInsert(() => {
    if (!editing) return
    setDraft(value)
    setEditing(false)
  })

  const commit = () => {
    setEditing(false)
    const next = draft.trim()
    if (next !== value) onCommit(next)
  }

  return (
    <TextBox
      className="w-40 shrink-0 rounded border border-neutral-300 px-2 py-1 text-xs"
      value={draft}
      list="brain-groups"
      placeholder="グループ名"
      aria-label="グループ名"
      onFocus={() => setEditing(true)}
      onChange={(e) => {
        setEditing(true)
        setDraft(e.target.value)
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
          e.preventDefault()
          commit()
        }
      }}
    />
  )
}

function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export function BrainstormDetail() {
  const { id = '' } = useParams()
  const { status, brainstorms } = useStore()
  const brainstorm = brainstorms.find((b) => b.id === id)

  if (status === 'loading') return <p className="text-sm text-neutral-500">読み込み中…</p>
  if (!brainstorm) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-neutral-600">このブレストは見つかりませんでした。</p>
        <Link to="/brainstorms" className="btn-ghost">
          ブレスト一覧へ
        </Link>
      </div>
    )
  }
  return <BrainstormBody key={brainstorm.id} brainstorm={brainstorm} />
}

function BrainstormBody({ brainstorm }: { brainstorm: Brainstorm }) {
  const navigate = useNavigate()
  const { enterInsert } = useModeActions()
  // 始まっているなら、開いた瞬間から出せる状態にする
  useInitialMode(brainstorm.startedAt ? 'insert' : 'normal')
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const [grouping, setGrouping] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [remainMs, setRemainMs] = useState<number | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const run = useCallback(async (work: () => Promise<unknown>) => {
    try {
      setError('')
      await work()
      return true
    } catch (e) {
      setError(`保存できませんでした: ${e instanceof Error ? e.message : String(e)}`)
      return false
    }
  }, [])

  // 残り時間。開始していない間は動かさない。0になったら止める(回し続ける意味がない)
  useEffect(() => {
    if (!brainstorm.startedAt) {
      setRemainMs(null)
      return
    }
    const endAt = new Date(brainstorm.startedAt).getTime() + brainstorm.limitMinutes * 60_000
    let timer: ReturnType<typeof setInterval> | undefined
    const tick = () => {
      const remain = endAt - Date.now()
      setRemainMs(remain)
      if (remain <= 0 && timer) clearInterval(timer)
    }
    tick()
    if (endAt - Date.now() > 0) timer = setInterval(tick, 500)
    return () => {
      if (timer) clearInterval(timer)
    }
  }, [brainstorm.startedAt, brainstorm.limitMinutes])

  const timeUp = remainMs !== null && remainMs <= 0

  const start = () =>
    void run(() =>
      updateBrainstormWith(brainstorm.id, () => ({ startedAt: new Date().toISOString() })),
    )

  /**
   * 始めたら入力欄へ手を移す。
   * 入力欄は startedAt が入ってから描かれるので、押した直後ではまだ無い。
   * 描かれたのを見てから移る
   */
  const started = Boolean(brainstorm.startedAt)
  const wasStarted = useRef(started)
  useEffect(() => {
    if (!started || wasStarted.current) return
    wasStarted.current = true
    enterInsert(inputRef.current)
  }, [started, enterInsert])

  const add = async () => {
    const value = text.trim()
    if (!value) return
    const ok = await run(() => addBrainCard(brainstorm.id, value))
    if (ok) setText('')
  }

  // 打ちかけのカードを Esc で抱えたまま画面を出ないようにする。
  // 入力中の Esc は入力モードを抜けるだけなので、ここへ来るのは移動モードのEscだけ
  const textRef = useRef('')
  textRef.current = text

  const leave = useCallback(() => navigate('/brainstorms'), [navigate])

  const shortcuts = useMemo(
    () => ({
      Escape: () => {
        if (textRef.current) setText('')
        else leave()
      },
      h: leave,
      a: () => enterInsert(inputRef.current),
    }),
    [leave, enterInsert],
  )
  useShortcuts(shortcuts)

  // まとめる画面では、同じグループ名のカードを寄せて見せる
  const groups = useMemo(() => {
    const map = new Map<string, typeof brainstorm.cards>()
    for (const card of brainstorm.cards) {
      const key = card.group ?? ''
      map.set(key, [...(map.get(key) ?? []), card])
    }
    // 未分類は最後に回す
    return [...map.entries()].sort(([a], [b]) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b)))
  }, [brainstorm.cards])

  const groupNames = useMemo(
    () => [...new Set(brainstorm.cards.map((c) => c.group).filter(Boolean))] as string[],
    [brainstorm.cards],
  )

  return (
    <div className="space-y-5">
      <GuiButton label="← 一覧" hint="h" onClick={leave} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <InlineText
            value={brainstorm.theme}
            onCommit={(v) =>
              void run(() => updateBrainstormWith(brainstorm.id, () => ({ theme: v })))
            }
            placeholder="(テーマ)"
            className="text-base font-medium"
            ariaLabel="テーマ"
          />
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span className="font-mono text-lg tabular-nums">
            {remainMs === null ? (
              <span className="text-neutral-400">{brainstorm.limitMinutes}:00</span>
            ) : timeUp ? (
              <span className="text-red-600">0:00</span>
            ) : (
              <span className="text-neutral-900">{formatClock(remainMs)}</span>
            )}
          </span>
          <span className="text-sm text-neutral-500">{brainstorm.cards.length}件</span>
        </div>
      </div>

      {!grouping ? (
        <>
          {/* 批判を止めるための宣言。ここに出しておかないと自分で自分を止めてしまう */}
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            批判・評価はしない。実現性も今は考えない。<strong>質より量</strong>。まとめるのは後。
          </div>

          {brainstorm.startedAt === undefined ? (
            <button type="button" className="btn-primary" onClick={start}>
              {brainstorm.limitMinutes}分で始める
            </button>
          ) : (
            <div className="flex gap-2">
              <TextBox
                ref={inputRef}
                className="box-input"
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                    e.preventDefault()
                    void add()
                  }
                  // Esc は入力モードを抜けるだけ(画面は動かない)
                }}
                placeholder={timeUp ? '時間切れ。まだ出せるなら続けてよい' : '思いついたまま(Enterで確定)'}
                aria-label="カードを追加"
                autoFocus
              />
              <GuiButton
                label="追加"
                hint="Enter"
                variant="primary"
                onClick={() => {
                  void add()
                  // クリックで入力欄からフォーカスが外れ、入力モードが移動モードへ落ちるのを防ぐ
                  enterInsert(inputRef.current)
                }}
              />
            </div>
          )}

          {timeUp && (
            <p className="text-sm text-neutral-600">
              時間切れ。ここからは <strong>まとめ</strong> に移る。
            </p>
          )}

          <ul className="flex flex-wrap gap-2">
            {[...brainstorm.cards].reverse().map((card) => (
              <li
                key={card.id}
                className="group flex items-center gap-1 rounded-md border border-neutral-200 px-2 py-1 text-sm"
              >
                <span>{card.text}</span>
                <button
                  type="button"
                  data-secondary
                  onClick={() => void run(() => removeBrainCard(brainstorm.id, card.id))}
                  className="text-xs text-neutral-300 opacity-0 group-hover:opacity-100 hover:text-red-600 focus:opacity-100"
                  aria-label="このカードを削除"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>

          {brainstorm.cards.length > 0 && (
            <button type="button" className="btn-ghost" onClick={() => setGrouping(true)}>
              まとめる(KJ法)へ
            </button>
          )}
        </>
      ) : (
        <>
          <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-600">
            似ているカードに同じ名前を付けると、下でまとまって表示される。
          </div>

          <ul className="space-y-1">
            {brainstorm.cards.map((card) => (
              <li key={card.id} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-sm">{card.text}</span>
                <GroupInput
                  value={card.group ?? ''}
                  onCommit={(v) =>
                    void run(() =>
                      updateBrainCard(brainstorm.id, card.id, { group: v || undefined }),
                    )
                  }
                />
              </li>
            ))}
          </ul>
          <datalist id="brain-groups">
            {groupNames.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>

          <div className="space-y-4 border-t border-neutral-100 pt-4">
            {groups.map(([name, cards]) => (
              <section key={name || '(未分類)'} className="space-y-1">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-neutral-900">
                    {name || '未分類'}{' '}
                    <span className="font-normal text-neutral-400">{cards.length}</span>
                  </h2>
                  {name && (
                    <button
                      type="button"
                      className="text-xs text-blue-600 hover:underline"
                      onClick={() =>
                        void run(() => brainGroupToMemo(brainstorm.id, name)).then(
                          (ok) => ok && navigate('/memos'),
                        )
                      }
                    >
                      メモにする
                    </button>
                  )}
                </div>
                <ul className="space-y-0.5 text-sm text-neutral-700">
                  {cards.map((card) => (
                    <li key={card.id}>・{card.text}</li>
                  ))}
                </ul>
              </section>
            ))}
          </div>

          <button type="button" className="btn-ghost" onClick={() => setGrouping(false)}>
            出す方へ戻る
          </button>
        </>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex items-center justify-end border-t border-neutral-100 pt-4">
        {confirmDelete ? (
          <span className="flex items-center gap-2">
            <span className="text-xs text-neutral-600">このブレストを削除する?</span>
            <button
              type="button"
              className="btn-danger"
              onClick={() =>
                void run(() => removeBrainstorm(brainstorm.id)).then(
                  (ok) => ok && navigate('/brainstorms'),
                )
              }
            >
              削除する
            </button>
            <button type="button" className="btn-ghost" onClick={() => setConfirmDelete(false)}>
              やめる
            </button>
          </span>
        ) : (
          <button type="button" className="btn-danger" onClick={() => setConfirmDelete(true)}>
            削除
          </button>
        )}
      </div>
    </div>
  )
}
