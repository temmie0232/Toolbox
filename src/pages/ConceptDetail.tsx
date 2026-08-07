import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { DeletePrompt } from '../components/DeletePrompt'
import { Field } from '../components/Field'
import { GuiButton } from '../components/GuiButton'
import { TextArea, TextBox } from '../components/TextBox'
import { formatDateTime } from '../lib/date'
import { useInitialMode } from '../lib/mode'
import { useDeleteCommand } from '../lib/useDeleteCommand'
import { useFieldChain } from '../lib/useFieldChain'
import { useNumberShortcuts, useSaveShortcut, useShortcuts } from '../lib/useShortcuts'
import { registerFlush, removeConcept, updateConceptWith, useStore } from '../store'
import {
  CONCEPT_STATUS_LABEL,
  CONCEPT_STATUS_ORDER,
  canExplain,
  type Concept,
  type ConceptStatus,
  type Task,
} from '../types'

export function ConceptDetail() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { status, concepts, tasks } = useStore()
  const concept = concepts.find((c) => c.id === id)
  const onDeleted = useCallback(() => navigate('/concepts'), [navigate])

  if (status === 'loading') return <p className="text-sm text-neutral-500">読み込み中…</p>
  if (!concept) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-neutral-600">この概念は見つかりませんでした。</p>
        <Link to="/concepts" className="btn-ghost">
          概念一覧へ
        </Link>
      </div>
    )
  }
  return <ConceptDetailBody key={concept.id} concept={concept} tasks={tasks} onDeleted={onDeleted} />
}

interface BodyProps {
  concept: Concept
  tasks: Task[]
  onDeleted: () => void
}

/**
 * 概念の箱を埋める画面。理解の判定は「自分の言葉で説明が書けたか」に置く。
 * 説明の箱が空のままでは「説明できる」に上げられない。
 */
function ConceptDetailBody({ concept, tasks, onDeleted }: BodyProps) {
  const navigate = useNavigate()
  // 見に来る画面。書きたくなったら i か Enter で欄に入る
  useInitialMode('normal')
  const [name, setName] = useState(concept.name)
  const [briefing, setBriefing] = useState(concept.briefing)
  const [explanation, setExplanation] = useState(concept.explanation)
  const [gaps, setGaps] = useState(concept.gaps)
  const [taskId, setTaskId] = useState(concept.taskId ?? '')
  const [error, setError] = useState('')
  // 「説明できる」に上げようとして弾かれたときの説明。理由が見えないと故障に見える
  const [gateNotice, setGateNotice] = useState(false)

  const dirty =
    name !== concept.name ||
    briefing !== concept.briefing ||
    explanation !== concept.explanation ||
    gaps !== concept.gaps ||
    taskId !== (concept.taskId ?? '')

  /** 保存に失敗したら必ず画面に出す。黙って消えるのが一番まずい */
  const run = useCallback(async (work: () => Promise<void>) => {
    try {
      setError('')
      await work()
      return true
    } catch (e) {
      setError(`保存できませんでした: ${e instanceof Error ? e.message : String(e)}`)
      return false
    }
  }, [])

  // ---- テキスト欄は自動保存。保存ボタンを意識させない ----
  const latest = useRef({ name, briefing, explanation, gaps, taskId })
  latest.current = { name, briefing, explanation, gaps, taskId }
  const conceptRef = useRef(concept)
  conceptRef.current = concept

  const flush = useCallback(() => {
    const c = conceptRef.current
    const v = latest.current
    if (
      v.name === c.name &&
      v.briefing === c.briefing &&
      v.explanation === c.explanation &&
      v.gaps === c.gaps &&
      v.taskId === (c.taskId ?? '')
    ) {
      return Promise.resolve(true)
    }
    return run(() =>
      updateConceptWith(c.id, (current) => ({
        name: v.name,
        briefing: v.briefing,
        explanation: v.explanation,
        gaps: v.gaps,
        taskId: v.taskId || undefined,
        // 説明が消えたら「説明できる」は名乗れない。ゲート(canExplain)は上げる瞬間しか
        // 見ないので、後から説明を消す裏口をここで塞ぐ
        status:
          current.status === 'explainable' && !canExplain({ explanation: v.explanation })
            ? 'fuzzy'
            : current.status,
      })),
    )
  }, [run])

  // 入力が止まって0.7秒後に書き込む。保存が済むと concept が更新されて dirty が消える
  useEffect(() => {
    if (!dirty) return
    const timer = setTimeout(() => void flush(), 700)
    return () => clearTimeout(timer)
  }, [name, briefing, explanation, gaps, taskId, dirty, flush])

  // 打ちっぱなしだと上のデバウンスは延び続けるので、書きかけがある間は2秒ごとにも書く
  useEffect(() => {
    if (!dirty) return
    const interval = setInterval(() => void flush(), 2000)
    return () => clearInterval(interval)
  }, [dirty, flush])

  // 画面を離れるときに書き残しを流し込む(commitはメモリへ即反映なので待たなくてよい)
  useEffect(() => () => void flush(), [flush])
  // ウィンドウを閉じる直前にも呼んでもらう
  useEffect(() => registerFlush(flush), [flush])

  useSaveShortcut(() => void flush())

  const leave = useCallback(() => {
    void flush()
    navigate('/concepts')
  }, [flush, navigate])

  /**
   * 理解度の変更。「説明できる」だけは説明の箱が埋まっていないと弾く。
   * 判定は画面の入力値(latest)で行う。保存待ちの書きかけも理解のうち
   */
  const setStatus = useCallback(
    (next: ConceptStatus) => {
      if (next === 'explainable' && !canExplain({ explanation: latest.current.explanation })) {
        setGateNotice(true)
        return
      }
      setGateNotice(false)
      void run(() => updateConceptWith(concept.id, () => ({ status: next })))
    },
    [run, concept.id],
  )

  // 説明を書き始めたら、弾かれた表示は引っ込める
  useEffect(() => {
    if (gateNotice && canExplain({ explanation })) setGateNotice(false)
  }, [explanation, gateNotice])

  // d でこの概念を消す(1回目は確認)。下の「削除」ボタンもここを通る
  const del = useDeleteCommand({
    resolve: () => ({ id: concept.id, kind: '概念', name: concept.name || '(無名)' }),
    remove: () => run(() => removeConcept(concept.id)).then((ok) => void (ok && onDeleted())),
  })

  const shortcuts = useMemo(
    () => ({
      Escape: leave,
      h: leave,
      d: del.press,
    }),
    [leave, del.press],
  )
  useShortcuts(shortcuts)

  // Ctrl+1〜3 で理解度。説明を書いている最中でも切り替えられる
  const statusHandlers = useMemo(
    () => CONCEPT_STATUS_ORDER.map((s) => () => setStatus(s)),
    [setStatus],
  )
  useNumberShortcuts(statusHandlers)

  // Shift+Enter=次の箱 / Enter=改行(1行の箱では次の箱) / Ctrl+Enter=保存
  const onFieldEnter = useFieldChain()

  const explainReady = canExplain({ explanation })

  return (
    <div className="space-y-8" onKeyDown={onFieldEnter}>
      <div className="space-y-3">
        <GuiButton label="← 一覧" hint="h" onClick={leave} />
        <TextBox
          className="box-input text-base font-medium"
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label="概念の名前"
        />

        {/* 理解度は Ctrl+1〜3 で足りるので、j/k の列からは外す */}
        <div data-secondary className="flex flex-wrap items-center gap-1">
          {CONCEPT_STATUS_ORDER.map((s, i) => {
            const gated = s === 'explainable' && !explainReady
            return (
              <button
                key={s}
                type="button"
                onClick={() => setStatus(s)}
                title={
                  gated
                    ? '自分の言葉の説明が書けてから(それが理解の判定)'
                    : `${CONCEPT_STATUS_LABEL[s]}にする(Ctrl+${i + 1})`
                }
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  concept.status === s
                    ? 'bg-neutral-900 text-white'
                    : gated
                      ? 'border border-dashed border-neutral-300 text-neutral-300'
                      : 'border border-neutral-300 text-neutral-600 hover:bg-neutral-50'
                }`}
                aria-pressed={concept.status === s}
              >
                {CONCEPT_STATUS_LABEL[s]}
              </button>
            )
          })}
          <span className="ml-2 text-xs text-neutral-400">{dirty ? '保存中…' : '保存済み'}</span>
        </div>

      </div>

      <div className="space-y-5">
        <Field label="30秒説明" hint="上司に「これ何?」と聞かれたときに言う1行" htmlFor="briefing">
          <TextBox
            id="briefing"
            className="box-input"
            value={briefing}
            onChange={(e) => setBriefing(e.target.value)}
            placeholder="例: 結合済みのシステム全体を、業務シナリオに沿って通しで検証するテスト"
          />
        </Field>

        <Field
          label="自分の言葉で説明"
          hint="AIの説明の貼り付けは禁止。書けない部分がそのまま理解の穴"
          htmlFor="explanation"
        >
          <TextArea
            id="explanation"
            className="box-input"
            rows={6}
            value={explanation}
            onChange={(e) => setExplanation(e.target.value)}
          />
        </Field>

        <Field
          label="まだ分からない点"
          hint="説明を書こうとして詰まった部分。次にAIに聞くことリスト"
          htmlFor="gaps"
        >
          <TextArea
            id="gaps"
            className="box-input"
            rows={3}
            value={gaps}
            onChange={(e) => setGaps(e.target.value)}
          />
        </Field>

        <Field label="出どころ" hint="どのタスクで出てきたか(任意)" htmlFor="taskId">
          <select
            id="taskId"
            className="box-input"
            value={taskId}
            onChange={(e) => setTaskId(e.target.value)}
          >
            <option value="">(紐付けなし)</option>
            {tasks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title || '(無題)'}
              </option>
            ))}
          </select>
        </Field>

        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>

      <div className="flex items-center justify-between border-t border-neutral-100 pt-4">
        <span className="text-xs text-neutral-400">
          作成 {formatDateTime(concept.createdAt)} / 更新 {formatDateTime(concept.updatedAt)}
        </span>
        {/* 確認は画面下に固定で出る(DeletePrompt)。ここは入口だけ */}
        <button type="button" className="btn-danger" onClick={del.press}>
          削除 <kbd>d</kbd>
        </button>
      </div>

      {/*
        「説明できる」に上げようとして弾かれた理由。Ctrl+3 は画面のどこからでも効くので、
        DeletePrompt と同じく画面下に固定で出す(欄の近くに出すと視界の外で無反応に見える)
      */}
      {gateNotice && (
        <div className="fixed inset-x-0 bottom-1 z-30 flex justify-center px-16">
          <div className="max-w-full rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 shadow-sm">
            「説明できる」は自己申告にしない。「自分の言葉で説明」が書けたら上げられる —
            書けないなら、それはまだ理解していないということ。
          </div>
        </div>
      )}

      <DeletePrompt {...del} />
    </div>
  )
}
