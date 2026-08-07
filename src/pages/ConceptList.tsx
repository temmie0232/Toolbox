import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ConceptStatusChip } from '../components/Badges'
import { DeletePrompt } from '../components/DeletePrompt'
import { TextBox } from '../components/TextBox'
import { formatDateTime } from '../lib/date'
import { useInitialMode, useModeActions } from '../lib/mode'
import { focusedItemId, useDeleteCommand } from '../lib/useDeleteCommand'
import { useShortcuts } from '../lib/useShortcuts'
import { createConcept, removeConcept, useStore } from '../store'
import { type Concept } from '../types'

/**
 * F4 概念の受信箱。AI駆動で理解より先に成果物ができていく状況で、
 * 「わからないまま素通りした言葉」を積み上がる前に捕まえる。
 * 作業中は名前を放り込むだけ(3秒)。理解の作業はすきま時間に詳細画面で。
 */
export function ConceptList() {
  const { status, concepts, tasks } = useStore()
  const navigate = useNavigate()
  const { enterInsert } = useModeActions()
  useInitialMode('normal')
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const captureRef = useRef<HTMLInputElement>(null)

  // Shift+Y(新規)で来たら、そのまま打てる状態にする。印は使ったら消す
  // (残すと Ctrl+O で戻るたびに入力モードへ落とされる)
  const [params] = useSearchParams()
  useEffect(() => {
    if (!params.get('new')) return
    enterInsert(captureRef.current)
    navigate('/concepts', { replace: true })
  }, [params, enterInsert, navigate])

  const taskTitle = useMemo(() => {
    const map = new Map(tasks.map((t) => [t.id, t.title || '(無題)']))
    return (id?: string) => (id ? (map.get(id) ?? '') : '')
  }, [tasks])

  // 未理解(未着手・ふわっと)が受信箱の本体。説明できたものは畳んで下へ
  const { open, done } = useMemo(() => {
    const byUpdated = (a: Concept, b: Concept) => (a.updatedAt > b.updatedAt ? -1 : 1)
    return {
      open: concepts.filter((c) => c.status !== 'explainable').sort(byUpdated),
      done: concepts.filter((c) => c.status === 'explainable').sort(byUpdated),
    }
  }, [concepts])

  const add = async () => {
    const trimmed = name.trim()
    if (!trimmed) return
    try {
      setError('')
      await createConcept({ name: trimmed })
      // 書き込みが通ってから消す。失敗したら打ち直しにならない
      setName('')
    } catch (e) {
      setError(`保存できませんでした: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  // d で乗っている行を消す(1回目は確認)
  const del = useDeleteCommand({
    resolve: () => {
      const concept = concepts.find((c) => c.id === focusedItemId())
      if (!concept) return undefined
      return { id: concept.id, kind: '概念', name: concept.name || '(無名)' }
    },
    remove: (target) => removeConcept(target.id).catch(() => undefined),
    emptyHint: '消す概念の行に乗ってから d(j / k で乗る)',
  })

  const shortcuts = useMemo(
    () => ({
      // o は他の一覧の「新規作成」と同じ位置づけ。ここでは放り込み欄に入る
      o: () => enterInsert(captureRef.current),
      a: () => enterInsert(captureRef.current),
      d: del.press,
    }),
    [enterInsert, del.press],
  )
  useShortcuts(shortcuts)

  return (
    <div className="space-y-6">
      <TextBox
        ref={captureRef}
        className="box-input"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          // 変換確定のEnterで登録しない。移動モードのEnter(ModeProviderがprevent済み)は
          // 「書き始める」の操作なので、これも登録に取らない
          if (
            e.key === 'Enter' &&
            !e.defaultPrevented &&
            !e.nativeEvent.isComposing &&
            !e.ctrlKey &&
            !e.metaKey
          ) {
            e.preventDefault()
            void add()
          }
        }}
        placeholder="わからない言葉を放り込む(Enterで追加 / oでここへ)"
        aria-label="概念を追加"
      />

      {error && <p className="text-sm text-red-600">{error}</p>}

      {status === 'loading' && <p className="text-sm text-neutral-500">読み込み中…</p>}

      {status === 'ready' && concepts.length === 0 && (
        <div className="rounded-lg border border-dashed border-neutral-300 px-6 py-12 text-center">
          <p className="text-sm text-neutral-600">まだ概念がありません。</p>
          <p className="mt-1 text-xs text-neutral-500">
            作業中に知らない言葉が出たら、意味を調べる前にまず名前だけここへ。
            <br />
            理解した気になる前に「自分の言葉で説明」の箱を埋めに戻ってくる。
          </p>
        </div>
      )}

      {open.length > 0 && (
        <ul className="divide-y divide-neutral-100 border-y border-neutral-100">
          {open.map((concept) => (
            <ConceptRow key={concept.id} concept={concept} taskTitle={taskTitle} />
          ))}
        </ul>
      )}

      {done.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer text-sm text-neutral-500 hover:text-neutral-800">
            説明できる {done.length}件
          </summary>
          <ul className="mt-2 divide-y divide-neutral-100 border-y border-neutral-100">
            {done.map((concept) => (
              <ConceptRow key={concept.id} concept={concept} taskTitle={taskTitle} />
            ))}
          </ul>
        </details>
      )}

      <DeletePrompt {...del} />
    </div>
  )
}

function ConceptRow({
  concept,
  taskTitle,
}: {
  concept: Concept
  taskTitle: (id?: string) => string
}) {
  const linked = taskTitle(concept.taskId)
  return (
    <li>
      <Link
        to={`/concepts/${concept.id}`}
        data-item-id={concept.id}
        className="flex items-center gap-3 px-1 py-2.5 hover:bg-neutral-50"
      >
        <ConceptStatusChip status={concept.status} />
        <span
          className={`flex-1 truncate text-sm ${
            concept.status === 'explainable' ? 'text-neutral-400' : 'text-neutral-900'
          }`}
        >
          {concept.name || '(無名)'}
        </span>
        {linked && <span className="max-w-40 shrink-0 truncate text-xs text-neutral-400">{linked}</span>}
        <span className="shrink-0 text-xs text-neutral-400">
          {formatDateTime(concept.updatedAt)}
        </span>
      </Link>
    </li>
  )
}
