import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { DeletePrompt } from '../components/DeletePrompt'
import { Field } from '../components/Field'
import { TextArea, TextBox } from '../components/TextBox'
import { formatDateTime } from '../lib/date'
import { useInitialMode, useModeActions } from '../lib/mode'
import {
  REPORT_TEXT_KEYS,
  emptyReportValues,
  formatReport,
  pickReportValues,
  reportFields,
  type ReportTextKey,
  type ReportValues,
} from '../lib/reportText'
import { useDeleteCommand } from '../lib/useDeleteCommand'
import { useFieldChain } from '../lib/useFieldChain'
import {
  useDiscardGuard,
  useNumberShortcuts,
  useSaveShortcut,
  useShortcuts,
  type ShortcutMap,
} from '../lib/useShortcuts'
import {
  addReport,
  registerDraftGuard,
  registerFlush,
  removeReport,
  updateReport,
  useStore,
} from '../store'
import {
  REPORT_KIND_LABEL,
  reportSummary,
  unexplainedConcepts,
  type Concept,
  type Report,
  type ReportKind,
  type Task,
} from '../types'

const KIND_KEYS: { kind: ReportKind; key: string }[] = [
  { kind: 'progress', key: '1' },
  { kind: 'final', key: '2' },
]

/** 完了タスクなら完了報告から始める。途中なら30%確認などの中間報告 */
function defaultKind(task: Task): ReportKind {
  return task.status === 'done' ? 'final' : 'progress'
}

/** 未解決の疑問点は、そのまま「相手に確認したいこと」の初期値になる */
function prefillRequests(task: Task): string {
  return task.questions
    .filter((q) => !q.resolved)
    .map((q) => `・${q.text}`)
    .join('\n')
}

export function ReportNew() {
  const { taskId = '' } = useParams()
  const { status, tasks, concepts } = useStore()
  const task = tasks.find((t) => t.id === taskId)

  if (status === 'loading') return <p className="text-sm text-neutral-500">読み込み中…</p>
  if (!task) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-neutral-600">このタスクは見つかりませんでした。</p>
        <Link to="/" className="btn-ghost">
          タスク一覧へ
        </Link>
      </div>
    )
  }
  return <ReportForm key={task.id} task={task} unexplained={unexplainedConcepts(concepts, task.id)} />
}

export function ReportDetail() {
  const { taskId = '', reportId = '' } = useParams()
  const { status, tasks, concepts } = useStore()
  const task = tasks.find((t) => t.id === taskId)
  const report = task?.reports?.find((r) => r.id === reportId)

  if (status === 'loading') return <p className="text-sm text-neutral-500">読み込み中…</p>
  if (!task || !report) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-neutral-600">この報告は見つかりませんでした。</p>
        <Link to={task ? `/tasks/${task.id}` : '/'} className="btn-ghost">
          {task ? 'タスクへ戻る' : 'タスク一覧へ'}
        </Link>
      </div>
    )
  }
  return (
    <ReportForm
      key={report.id}
      task={task}
      report={report}
      unexplained={unexplainedConcepts(concepts, task.id)}
    />
  )
}

interface ReportFormProps {
  task: Task
  report?: Report
  /** このタスクに紐付いた、まだ説明できない概念。報告前の死角として見せる */
  unexplained: Concept[]
}

/**
 * 報告の骨格を埋める画面。白紙から報告文を考えさせない。
 * 箱そのものがチェックリストで、空の箱=まだ考えていない死角として見せる。
 */
function ReportForm({ task, report, unexplained }: ReportFormProps) {
  const navigate = useNavigate()
  const { enterInsert } = useModeActions()
  const isEdit = Boolean(report)
  // 新規は打ちに来た画面。既存は読み返しに来ることもあるので移動から始める
  useInitialMode(isEdit ? 'normal' : 'insert')
  const [kind, setKind] = useState<ReportKind>(report?.kind ?? defaultKind(task))
  const [values, setValues] = useState<ReportValues>(() =>
    report
      ? pickReportValues(report)
      : { ...emptyReportValues(), requests: prefillRequests(task) },
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const conclusionRef = useRef<HTMLInputElement>(null)
  // Shift+Enter=次の箱 / Enter=改行(1行の箱では次の箱) / Ctrl+Enter=保存
  const onFieldEnter = useFieldChain()

  // 新規のdirtyは「開いた時点(プリフィル込み)から変わったか」。
  // プリフィルだけでdirty扱いにすると、開いた直後から画面切替が止まってしまう
  const initialRef = useRef({ kind, values })
  const dirty = isEdit
    ? kind !== report!.kind || REPORT_TEXT_KEYS.some((k) => values[k] !== report![k])
    : kind !== initialRef.current.kind ||
      REPORT_TEXT_KEYS.some((k) => values[k] !== initialRef.current.values[k])

  const latest = useRef({ kind, values })
  latest.current = { kind, values }
  const reportRef = useRef(report)
  reportRef.current = report

  const payload = () => ({ kind: latest.current.kind, ...latest.current.values })

  const back = useCallback(() => navigate(`/tasks/${task.id}`), [navigate, task.id])

  // ---- 既存の報告は自動保存 ----
  const flush = useCallback(async () => {
    const r = reportRef.current
    if (!r) return true
    const v = latest.current
    if (v.kind === r.kind && REPORT_TEXT_KEYS.every((k) => v.values[k] === r[k])) return true
    try {
      setError('')
      await updateReport(task.id, r.id, payload())
      return true
    } catch (e) {
      setError(`保存できませんでした: ${e instanceof Error ? e.message : String(e)}`)
      return false
    }
  }, [task.id])

  useEffect(() => {
    if (!isEdit || !dirty) return
    const timer = setTimeout(() => void flush(), 700)
    return () => clearTimeout(timer)
  }, [isEdit, dirty, kind, values, flush])

  // 打ちっぱなしだと上のデバウンスは延び続けるので、書きかけがある間は2秒ごとにも書く
  useEffect(() => {
    if (!isEdit || !dirty) return
    const interval = setInterval(() => void flush(), 2000)
    return () => clearInterval(interval)
  }, [isEdit, dirty, flush])

  useEffect(() => {
    if (!isEdit) return
    return () => void flush()
  }, [isEdit, flush])
  useEffect(() => (isEdit ? registerFlush(flush) : undefined), [isEdit, flush])

  // ---- 新規は明示保存(空の報告を量産しないため) ----
  // 常駐アプリなので、閉じる操作(=隠すだけ)で救済保存したあともフォームは生きたまま戻ってくる。
  // 作った報告のidを覚えておき、2回目からは作り直さず上書きする。
  // これが無いと「閉じる → 開き直して保存」で二重作成、「閉じる → 書き足して終了」で消失になる
  const createdIdRef = useRef<string | null>(null)
  // 保存は1本の列に並べる。閉じる操作が重なって flush が2回来ても、両方が「未作成」を見て
  // addReport を走らせることがないようにする
  const persistChainRef = useRef<Promise<unknown>>(Promise.resolve())

  const persistNew = useCallback(() => {
    const run = persistChainRef.current.then(async () => {
      if (createdIdRef.current) {
        await updateReport(task.id, createdIdRef.current, payload())
      } else {
        const created = await addReport(task.id, payload())
        createdIdRef.current = created.id
      }
    })
    persistChainRef.current = run.catch(() => undefined)
    return run
  }, [task.id])

  const saveNew = useCallback(async () => {
    if (saving) return
    if (!latest.current.values.conclusion.trim()) {
      setError('結論だけは1行入れてください(あとから直せます)')
      enterInsert(conclusionRef.current)
      return
    }
    setSaving(true)
    setError('')
    try {
      await persistNew()
      back()
    } catch (e) {
      setError(`保存できませんでした: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setSaving(false)
    }
  }, [saving, persistNew, back, enterInsert])

  // 書きかけ中は画面切替キーで飛ばさない + ウィンドウを閉じるときは救済保存する
  const dirtyRef = useRef(false)
  dirtyRef.current = !isEdit && dirty
  useEffect(() => {
    if (isEdit) return
    return registerDraftGuard(() => dirtyRef.current)
  }, [isEdit])
  useEffect(() => {
    if (isEdit) return
    return registerFlush(async () => {
      if (!dirtyRef.current) return
      // 全欄空(プリフィルを消しただけ等)の報告は作らない。明示保存の「結論必須」と同じ趣旨
      if (!REPORT_TEXT_KEYS.some((k) => latest.current.values[k].trim())) return
      await persistNew()
    })
  }, [isEdit, persistNew])

  useSaveShortcut(() => (isEdit ? void flush() : void saveNew()))

  const leaveEdit = useCallback(() => {
    void flush()
    back()
  }, [flush, back])

  const { armed, onEscape, disarm } = useDiscardGuard(dirty, back)

  /** そのまま Teams やメールに貼れる文面にしてコピーする */
  const copy = useCallback(async () => {
    const v = latest.current
    try {
      await navigator.clipboard.writeText(formatReport(task.title, v.kind, v.values))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setError('クリップボードにコピーできませんでした')
    }
  }, [task.title])

  // d でこの報告を消す(1回目は確認)。まだ保存していない新規には出さない
  const del = useDeleteCommand({
    resolve: () =>
      report && {
        id: report.id,
        kind: '報告',
        name: `${REPORT_KIND_LABEL[report.kind]} — ${reportSummary(report)}`,
      },
    remove: (target) =>
      removeReport(task.id, target.id)
        .then(back)
        .catch((e: unknown) =>
          setError(`削除できませんでした: ${e instanceof Error ? e.message : String(e)}`),
        ),
  })

  const shortcuts = useMemo<ShortcutMap>(() => {
    const map: ShortcutMap = {
      Escape: isEdit ? leaveEdit : onEscape,
      c: () => void copy(),
    }
    // 既存は自動保存なので、hでそのまま戻れる。新規は取消の確認を挟む
    if (isEdit) {
      map.h = leaveEdit
      map.d = del.press
    }
    return map
  }, [isEdit, leaveEdit, onEscape, copy, del.press])
  useShortcuts(shortcuts)

  // Ctrl+1〜2 で種類切替。書いている最中でも切り替えられる(中身は消えない)
  const kindHandlers = useMemo(() => KIND_KEYS.map(({ kind: k }) => () => setKind(k)), [])
  useNumberShortcuts(kindHandlers)

  const setValue = (key: ReportTextKey, value: string) =>
    setValues((prev) => ({ ...prev, [key]: value }))

  const fields = reportFields(kind)
  // 空の箱=まだ考えていない死角。埋めろとは言わないが、見えるようにはしておく
  const empties = fields.filter((f) => !values[f.key].trim())

  return (
    <div className="space-y-5" onKeyDown={onFieldEnter}>
      <div className="flex items-center justify-end gap-2">
        {isEdit && (
          <span className="text-xs text-neutral-400">{dirty ? '保存中…' : '保存済み'}</span>
        )}
        {/* 種類は Ctrl+1〜2 で足りるので、j/k の列からは外す */}
        <div data-secondary className="flex gap-1">
          {KIND_KEYS.map(({ kind: value, key }) => (
            <button
              key={value}
              type="button"
              onClick={() => setKind(value)}
              title={`${REPORT_KIND_LABEL[value]}に切り替え(Ctrl+${key})`}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                kind === value
                  ? 'bg-neutral-900 text-white'
                  : 'border border-neutral-300 text-neutral-600 hover:bg-neutral-50'
              }`}
              aria-pressed={kind === value}
            >
              {REPORT_KIND_LABEL[value]}
            </button>
          ))}
        </div>
      </div>

      {/* 受け取ったときの約束。結論はこの目的に答える */}
      <div className="rounded-md bg-neutral-50 px-3 py-2 text-xs leading-relaxed text-neutral-600">
        <span className="font-medium text-neutral-800">{task.title || '(無題)'}</span>
        {task.purpose && (
          <>
            <br />
            目的: {task.purpose}
          </>
        )}
        {task.deliverable && (
          <>
            <br />
            完成形: {task.deliverable}
          </>
        )}
        {task.deadline && (
          <>
            <br />
            期限: {task.deadline}
          </>
        )}
      </div>

      {fields.map((f) => (
        <Field key={f.key} label={f.label} hint={f.hint} htmlFor={`report-${f.key}`}>
          {f.rows ? (
            <TextArea
              id={`report-${f.key}`}
              className="box-input"
              rows={f.rows}
              value={values[f.key]}
              onChange={(e) => setValue(f.key, e.target.value)}
              placeholder={f.placeholder}
            />
          ) : (
            <TextBox
              id={`report-${f.key}`}
              ref={f.key === 'conclusion' ? conclusionRef : undefined}
              className="box-input"
              value={values[f.key]}
              onChange={(e) => setValue(f.key, e.target.value)}
              placeholder={f.placeholder}
              autoFocus={!isEdit && f.key === 'conclusion'}
            />
          )}
        </Field>
      ))}

      {/* 中のリンクは j/k の列から外す(件数に比例して保存ボタンが遠くなる)。Tab と札(f)では届く */}
      {unexplained.length > 0 && (
        <p data-secondary className="rounded-md bg-red-50 px-3 py-2 text-xs leading-relaxed text-red-800">
          まだ説明できない概念が {unexplained.length} 件:{' '}
          {unexplained.map((c, i) => (
            <span key={c.id}>
              {i > 0 && '・'}
              <Link to={`/concepts/${c.id}`} className="underline">
                {c.name || '(無名)'}
              </Link>
            </span>
          ))}
          <br />
          この報告のあと「これ何?」と聞かれたら答えられない。先に埋めるか、
          正直に「理解が追いついていない」と懸念に書く。
        </p>
      )}

      {empties.length > 0 && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800">
          空の箱: {empties.map((f) => f.label).join(' / ')}
          <br />
          ここが報告の死角になりやすい。該当が無いなら「なし」と書くと、考えた上で無いと伝わる。
        </p>
      )}

      {!isEdit && armed && (
        <p className="text-sm text-amber-700">
          書きかけがあります。破棄するならもう一度 <kbd>Esc</kbd>。
          <button type="button" className="ml-2 underline" onClick={disarm}>
            編集を続ける
          </button>
        </p>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex items-center gap-3 pt-2">
        {isEdit ? (
          <button type="button" className="btn-ghost" onClick={leaveEdit}>
            戻る <kbd>Esc</kbd>
          </button>
        ) : (
          <>
            <button
              type="button"
              className="btn-primary"
              onClick={() => void saveNew()}
              disabled={saving}
            >
              保存 <kbd className="border-blue-500 bg-blue-500 text-blue-50">Ctrl+Enter</kbd>
            </button>
            <button type="button" className="btn-ghost" onClick={onEscape}>
              取消 <kbd>Esc</kbd>
            </button>
          </>
        )}
        <button type="button" className="btn-ghost" onClick={() => void copy()}>
          {copied ? (
            'コピーしました ✓'
          ) : (
            <>
              報告文をコピー <kbd>c</kbd>
            </>
          )}
        </button>
      </div>

      {report && (
        <div className="flex items-center justify-between border-t border-neutral-100 pt-4">
          <span className="text-xs text-neutral-400">
            作成 {formatDateTime(report.createdAt)} / 更新 {formatDateTime(report.updatedAt)}
          </span>
          {/* 確認は画面下に固定で出る(DeletePrompt)。ここは入口だけ */}
          <button type="button" className="btn-danger" onClick={del.press}>
            削除 <kbd>d</kbd>
          </button>
        </div>
      )}

      <DeletePrompt {...del} />
    </div>
  )
}
