import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ConfirmBadge } from '../components/Badges'
import { DeadlinePick } from '../components/DeadlinePick'
import { Field } from '../components/Field'
import { formatDateTime } from '../lib/date'
import { newId } from '../lib/id'
import { memoSummary } from '../lib/memoSummary'
import { useNumberShortcuts, useSaveShortcut, useShortcuts } from '../lib/useShortcuts'
import { registerFlush, removeTask, updateTaskWith, useStore } from '../store'
import {
  MEMO_TYPE_LABEL,
  TASK_STATUS_LABEL,
  TASK_STATUS_ORDER,
  needsConfirmation,
  type Memo,
  type SubmitCheck,
  type Task,
  type TaskStatus,
} from '../types'

const SUBMIT_QUESTIONS: { key: keyof SubmitCheck; label: string }[] = [
  { key: 'answersPurpose', label: '目的に答えている?' },
  { key: 'conclusionIn10s', label: '結論は10秒で見つかる?' },
  { key: 'nextActionClear', label: '相手の次アクションは明確?' },
]

export function TaskDetail() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { status, tasks, memos } = useStore()
  const task = tasks.find((t) => t.id === id)
  const onDeleted = useCallback(() => navigate('/'), [navigate])

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

  return (
    <TaskDetailBody
      key={task.id}
      task={task}
      linkedMemos={memos.filter((m) => m.taskId === task.id)}
      onDeleted={onDeleted}
    />
  )
}

interface BodyProps {
  task: Task
  linkedMemos: Memo[]
  onDeleted: () => void
}

function TaskDetailBody({ task, linkedMemos, onDeleted }: BodyProps) {
  const navigate = useNavigate()
  const [title, setTitle] = useState(task.title)
  const [purpose, setPurpose] = useState(task.purpose)
  const [deliverable, setDeliverable] = useState(task.deliverable)
  const [deadline, setDeadline] = useState(task.deadline ?? '')
  const [newQuestion, setNewQuestion] = useState('')
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [copied, setCopied] = useState(false)

  const dirty =
    title !== task.title ||
    purpose !== task.purpose ||
    deliverable !== task.deliverable ||
    deadline !== (task.deadline ?? '')

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
  const latest = useRef({ title, purpose, deliverable, deadline })
  latest.current = { title, purpose, deliverable, deadline }
  const taskRef = useRef(task)
  taskRef.current = task

  const flush = useCallback(() => {
    const t = taskRef.current
    const v = latest.current
    if (
      v.title === t.title &&
      v.purpose === t.purpose &&
      v.deliverable === t.deliverable &&
      v.deadline === (t.deadline ?? '')
    ) {
      return Promise.resolve(true)
    }
    return run(() =>
      updateTaskWith(t.id, () => ({
        title: v.title,
        purpose: v.purpose,
        deliverable: v.deliverable,
        deadline: v.deadline || undefined,
      })),
    )
  }, [run])

  // 入力が止まって0.7秒後に書き込む。保存が済むと task が更新されて dirty が消える
  useEffect(() => {
    if (!dirty) return
    const timer = setTimeout(() => void flush(), 700)
    return () => clearTimeout(timer)
  }, [title, purpose, deliverable, deadline, dirty, flush])

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
    navigate('/')
  }, [flush, navigate])

  const setStatus = useCallback(
    (next: TaskStatus) => void run(() => updateTaskWith(task.id, () => ({ status: next }))),
    [run, task.id],
  )

  const questionInputRef = useRef<HTMLInputElement>(null)
  const copyRef = useRef<() => Promise<void>>(null)

  const shortcuts = useMemo(
    () => ({
      Escape: leave,
      h: leave,
      // vim風: a(append)で疑問点の追加欄へ、cで確認文コピー
      a: () => questionInputRef.current?.focus(),
      c: () => void copyRef.current?.(),
    }),
    [leave],
  )
  useShortcuts(shortcuts)

  // Ctrl+1〜4 でステータス。目的や完成形を書いている最中でも切り替えられる
  const statusHandlers = useMemo(
    () => TASK_STATUS_ORDER.map((s) => () => setStatus(s)),
    [setStatus],
  )
  useNumberShortcuts(statusHandlers)

  // 疑問点・チェック類は「最新のtask」を元に差分を作る(連続操作で前の変更が消えないように)
  const toggleQuestion = (questionId: string) =>
    void run(() =>
      updateTaskWith(task.id, (t) => ({
        questions: t.questions.map((q) =>
          q.id === questionId ? { ...q, resolved: !q.resolved } : q,
        ),
      })),
    )

  const deleteQuestion = (questionId: string) =>
    void run(() =>
      updateTaskWith(task.id, (t) => ({
        questions: t.questions.filter((q) => q.id !== questionId),
      })),
    )

  const addQuestion = async () => {
    const text = newQuestion.trim()
    if (!text) return
    const ok = await run(() =>
      updateTaskWith(task.id, (t) => ({
        questions: [...t.questions, { id: newId(), text, resolved: false }],
      })),
    )
    // 書き込みが通ってから消す。失敗したら打ち直しにならない
    if (ok) setNewQuestion('')
  }

  const toggleCheck = (key: keyof SubmitCheck) =>
    void run(() =>
      updateTaskWith(task.id, (t) => ({
        submitCheck: { ...t.submitCheck, [key]: !t.submitCheck[key] },
      })),
    )

  const unresolvedQuestions = task.questions.filter((q) => !q.resolved)

  /** 未解決の疑問を、そのまま上司に送れる文面にしてコピーする */
  const copyQuestions = async () => {
    if (unresolvedQuestions.length === 0) return
    const text =
      `「${task.title || '(無題)'}」について確認させてください。\n` +
      unresolvedQuestions.map((q) => `・${q.text}`).join('\n')
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setError('クリップボードにコピーできませんでした')
    }
  }
  copyRef.current = copyQuestions

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <div className="flex items-start gap-3">
          <input
            className="box-input flex-1 text-base font-medium"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            aria-label="タイトル"
          />
          {needsConfirmation(task) && <ConfirmBadge count={unresolvedQuestions.length} />}
        </div>

        <div className="flex flex-wrap items-center gap-1">
          {TASK_STATUS_ORDER.map((s, i) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatus(s)}
              title={`${TASK_STATUS_LABEL[s]}にする(Ctrl+${i + 1})`}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                task.status === s
                  ? 'bg-neutral-900 text-white'
                  : 'border border-neutral-300 text-neutral-600 hover:bg-neutral-50'
              }`}
              aria-pressed={task.status === s}
            >
              {TASK_STATUS_LABEL[s]}
            </button>
          ))}
          <span className="ml-2 text-xs text-neutral-400">{dirty ? '保存中…' : '保存済み'}</span>
        </div>
      </div>

      <div className="space-y-5">
        <Field label="目的" hint="何のため / 誰が何に使う" htmlFor="purpose">
          <textarea
            id="purpose"
            className="box-input"
            rows={2}
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
          />
        </Field>

        <Field label="完成形" hint="どんな形で出す" htmlFor="deliverable">
          <textarea
            id="deliverable"
            className="box-input"
            rows={2}
            value={deliverable}
            onChange={(e) => setDeliverable(e.target.value)}
          />
        </Field>

        <Field label="期限" htmlFor="deadline">
          <div className="flex flex-wrap items-center gap-3">
            <input
              id="deadline"
              type="date"
              className="box-input max-w-48"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
            />
            <DeadlinePick value={deadline} onChange={setDeadline} />
          </div>
        </Field>

        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-neutral-900">
            疑問点{' '}
            <span className="font-normal text-neutral-500">— 未解決は「上司に確認すべきこと」</span>
          </h2>
          {unresolvedQuestions.length > 0 && (
            <button
              type="button"
              onClick={() => void copyQuestions()}
              className="shrink-0 text-xs text-blue-600 hover:underline"
              title="未解決の疑問点を、そのまま送れる文面でコピーする"
            >
              {copied ? 'コピーしました ✓' : '確認用にコピー'}
            </button>
          )}
        </div>
        <ul className="space-y-1.5">
          {task.questions.map((q) => (
            <li key={q.id} className="group flex items-start gap-2">
              <input
                type="checkbox"
                id={`q-${q.id}`}
                checked={q.resolved}
                onChange={() => toggleQuestion(q.id)}
                className="mt-1 size-4 accent-blue-600"
              />
              <label
                htmlFor={`q-${q.id}`}
                className={`flex-1 text-sm ${q.resolved ? 'text-neutral-400 line-through' : 'text-neutral-800'}`}
              >
                {q.text}
              </label>
              <button
                type="button"
                onClick={() => deleteQuestion(q.id)}
                className="text-xs text-neutral-300 opacity-0 group-hover:opacity-100 hover:text-red-600 focus:opacity-100"
                aria-label="この疑問点を削除"
              >
                削除
              </button>
            </li>
          ))}
          {task.questions.length === 0 && (
            <li className="text-sm text-neutral-400">疑問点はありません。</li>
          )}
        </ul>
        <div className="flex gap-2">
          <input
            ref={questionInputRef}
            className="box-input"
            value={newQuestion}
            onChange={(e) => setNewQuestion(e.target.value)}
            onKeyDown={(e) => {
              // 変換確定のEnterで登録してしまわないようにする
              if (e.key === 'Enter' && !e.nativeEvent.isComposing && !e.ctrlKey && !e.metaKey) {
                e.preventDefault()
                void addQuestion()
              }
            }}
            placeholder="疑問点を追加(Enterで追加 / aでここへ)"
            aria-label="疑問点を追加"
          />
          <button type="button" className="btn-ghost shrink-0" onClick={() => void addQuestion()}>
            追加
          </button>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-neutral-900">
          提出前チェック{' '}
          <span className="font-normal text-neutral-500">— 通さなくても完了にはできる</span>
        </h2>
        <ul className="space-y-1.5">
          {SUBMIT_QUESTIONS.map((q) => (
            <li key={q.key} className="flex items-center gap-2">
              <input
                type="checkbox"
                id={`c-${q.key}`}
                checked={task.submitCheck[q.key]}
                onChange={() => toggleCheck(q.key)}
                className="size-4 accent-blue-600"
              />
              <label htmlFor={`c-${q.key}`} className="text-sm text-neutral-800">
                {q.label}
              </label>
            </li>
          ))}
        </ul>
        {task.status !== 'done' && (
          <button type="button" className="btn-ghost" onClick={() => setStatus('done')}>
            完了にする
          </button>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-neutral-900">紐付いたメモ</h2>
          <Link
            to={`/memos/new?taskId=${task.id}`}
            className="text-sm text-blue-600 hover:underline"
          >
            + このタスクにメモ
          </Link>
        </div>
        <ul className="divide-y divide-neutral-100 border-y border-neutral-100">
          {linkedMemos.map((memo) => (
            <li key={memo.id}>
              <Link to={`/memos/${memo.id}`} className="flex gap-3 px-1 py-2 hover:bg-neutral-50">
                <span className="w-24 shrink-0 text-xs text-neutral-500">
                  {MEMO_TYPE_LABEL[memo.type]}
                </span>
                <span className="flex-1 truncate text-sm text-neutral-800">
                  {memoSummary(memo)}
                </span>
                <span className="shrink-0 text-xs text-neutral-400">
                  {formatDateTime(memo.createdAt)}
                </span>
              </Link>
            </li>
          ))}
          {linkedMemos.length === 0 && (
            <li className="px-1 py-2 text-sm text-neutral-400">まだありません。</li>
          )}
        </ul>
      </section>

      <div className="flex items-center justify-between border-t border-neutral-100 pt-4">
        <span className="text-xs text-neutral-400">
          作成 {formatDateTime(task.createdAt)} / 更新 {formatDateTime(task.updatedAt)}
        </span>
        {confirmDelete ? (
          <span className="flex items-center gap-2">
            <span className="text-xs text-neutral-600">削除する?(メモは残ります)</span>
            <button
              type="button"
              className="btn-danger"
              onClick={() => void run(() => removeTask(task.id)).then((ok) => ok && onDeleted())}
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
