import { useCallback, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Field } from '../components/Field'
import { formatDateTime } from '../lib/date'
import { useDiscardGuard, useSaveShortcut, useShortcuts } from '../lib/useShortcuts'
import { createMemo, removeMemo, updateMemo, useStore } from '../store'
import type { Memo, MemoType, Task } from '../types'

/** F3 空雨傘メモ。テンプレは「空雨傘」と「自由」の2つだけ */
export function MemoNew() {
  const [params] = useSearchParams()
  const { tasks } = useStore()
  const taskId = params.get('taskId') ?? ''
  return <MemoForm key={taskId} tasks={tasks} initialTaskId={taskId} />
}

export function MemoDetail() {
  const { id = '' } = useParams()
  const { status, tasks, memos } = useStore()
  const memo = memos.find((m) => m.id === id)

  if (status === 'loading') return <p className="text-sm text-neutral-500">読み込み中…</p>
  if (!memo) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-neutral-600">このメモは見つかりませんでした。</p>
        <Link to="/memos" className="btn-ghost">
          メモ一覧へ
        </Link>
      </div>
    )
  }
  return <MemoForm key={memo.id} tasks={tasks} memo={memo} />
}

interface MemoFormProps {
  tasks: Task[]
  memo?: Memo
  initialTaskId?: string
}

function MemoForm({ tasks, memo, initialTaskId = '' }: MemoFormProps) {
  const navigate = useNavigate()
  const [type, setType] = useState<MemoType>(memo?.type ?? 'soraamekasa')
  const [taskId, setTaskId] = useState(memo?.taskId ?? initialTaskId)
  const [fact, setFact] = useState(memo?.fact ?? '')
  const [interpretation, setInterpretation] = useState(memo?.interpretation ?? '')
  const [action, setAction] = useState(memo?.action ?? '')
  const [body, setBody] = useState(memo?.body ?? '')
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)

  const dirty =
    type !== (memo?.type ?? 'soraamekasa') ||
    taskId !== (memo?.taskId ?? initialTaskId) ||
    fact !== (memo?.fact ?? '') ||
    interpretation !== (memo?.interpretation ?? '') ||
    action !== (memo?.action ?? '') ||
    body !== (memo?.body ?? '')

  const back = useCallback(() => {
    const linked = memo?.taskId || initialTaskId
    navigate(linked ? `/tasks/${linked}` : '/memos')
  }, [navigate, memo?.taskId, initialTaskId])

  const save = useCallback(async () => {
    if (saving) return
    setSaving(true)
    setError('')
    // テンプレを切り替えても、もう一方に書いた内容は消さずに持っておく
    const payload = { type, taskId: taskId || undefined, fact, interpretation, action, body }
    try {
      if (memo) {
        await updateMemo(memo.id, payload)
        setSavedAt(new Date().toISOString())
      } else {
        await createMemo(payload)
        back()
      }
    } catch (e) {
      setError(`保存できませんでした: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setSaving(false)
    }
  }, [saving, type, taskId, fact, interpretation, action, body, memo, back])

  useSaveShortcut(() => void save())

  const { armed, onEscape, disarm } = useDiscardGuard(dirty, back)
  const shortcuts = useMemo(() => ({ Escape: onEscape }), [onEscape])
  useShortcuts(shortcuts)

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-neutral-900">{memo ? 'メモ' : '新しいメモ'}</h1>
        <div className="flex gap-1">
          {(
            [
              ['soraamekasa', '空雨傘'],
              ['free', '自由'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setType(value)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                type === value
                  ? 'bg-neutral-900 text-white'
                  : 'border border-neutral-300 text-neutral-600 hover:bg-neutral-50'
              }`}
              aria-pressed={type === value}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {type === 'soraamekasa' ? (
        <div className="space-y-5">
          <Field label="空(事実)" hint="見たまま・聞いたまま。解釈を混ぜない" htmlFor="fact">
            <textarea
              id="fact"
              className="box-input"
              rows={3}
              value={fact}
              onChange={(e) => setFact(e.target.value)}
              autoFocus
            />
          </Field>
          <Field label="雨(解釈)" hint="その事実は何を意味する?" htmlFor="interpretation">
            <textarea
              id="interpretation"
              className="box-input"
              rows={3}
              value={interpretation}
              onChange={(e) => setInterpretation(e.target.value)}
            />
          </Field>
          <Field label="傘(行動)" hint="だから何をする?" htmlFor="action">
            <textarea
              id="action"
              className="box-input"
              rows={3}
              value={action}
              onChange={(e) => setAction(e.target.value)}
            />
          </Field>
        </div>
      ) : (
        <Field label="メモ" htmlFor="body">
          <textarea
            id="body"
            className="box-input"
            rows={10}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            autoFocus
          />
        </Field>
      )}

      <Field label="紐付け" hint="タスクに結び付ける(任意)" htmlFor="taskId">
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

      {armed && (
        <p className="text-sm text-amber-700">
          未保存の変更があります。破棄して戻るならもう一度 <kbd>Esc</kbd>。
          <button type="button" className="ml-2 underline" onClick={disarm}>
            編集を続ける
          </button>
        </p>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex items-center gap-3 pt-2">
        <button type="button" className="btn-primary" onClick={() => void save()} disabled={saving}>
          保存 <kbd className="border-blue-500 bg-blue-500 text-blue-50">Ctrl+Enter</kbd>
        </button>
        <button type="button" className="btn-ghost" onClick={onEscape}>
          {memo ? '戻る' : '取消'} <kbd>Esc</kbd>
        </button>
        <span className="text-xs text-neutral-500">
          {dirty ? '未保存の変更があります' : savedAt ? `保存しました ${formatDateTime(savedAt)}` : ''}
        </span>
      </div>

      {memo && (
        <div className="flex items-center justify-between border-t border-neutral-100 pt-4">
          <span className="text-xs text-neutral-400">
            作成 {formatDateTime(memo.createdAt)} / 更新 {formatDateTime(memo.updatedAt)}
          </span>
          {confirmDelete ? (
            <span className="flex items-center gap-2">
              <span className="text-xs text-neutral-600">削除する?</span>
              <button
                type="button"
                className="btn-danger"
                onClick={() =>
                  void removeMemo(memo.id)
                    .then(() => navigate('/memos'))
                    .catch((e: unknown) =>
                      setError(`削除できませんでした: ${e instanceof Error ? e.message : String(e)}`),
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
      )}
    </div>
  )
}
