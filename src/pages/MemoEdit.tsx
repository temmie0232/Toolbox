import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Field } from '../components/Field'
import { formatDateTime } from '../lib/date'
import {
  useDiscardGuard,
  useNumberShortcuts,
  useSaveShortcut,
  useShortcuts,
  type ShortcutMap,
} from '../lib/useShortcuts'
import {
  createMemo,
  registerDraftGuard,
  registerFlush,
  removeMemo,
  updateMemo,
  useStore,
} from '../store'
import { MEMO_TYPE_LABEL, REASON_COUNT, type Memo, type MemoType, type Task } from '../types'

const TYPE_KEYS: { type: MemoType; key: string }[] = [
  { type: 'soraamekasa', key: '1' },
  { type: 'conclusion', key: '2' },
  { type: 'free', key: '3' },
]

function emptyReasons(): string[] {
  return Array.from({ length: REASON_COUNT }, () => '')
}

function toReasons(value: string[] | undefined): string[] {
  const base = emptyReasons()
  ;(value ?? []).slice(0, REASON_COUNT).forEach((v, i) => {
    base[i] = v
  })
  return base
}

/** F3 メモ。空雨傘 / 結論ファースト / 自由 の3テンプレ */
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
  const isEdit = Boolean(memo)
  const [type, setType] = useState<MemoType>(memo?.type ?? 'soraamekasa')
  const [taskId, setTaskId] = useState(memo?.taskId ?? initialTaskId)
  const [fact, setFact] = useState(memo?.fact ?? '')
  const [interpretation, setInterpretation] = useState(memo?.interpretation ?? '')
  const [action, setAction] = useState(memo?.action ?? '')
  const [conclusion, setConclusion] = useState(memo?.conclusion ?? '')
  const [reasons, setReasons] = useState<string[]>(toReasons(memo?.reasons))
  const [body, setBody] = useState(memo?.body ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)

  const savedReasons = useMemo(() => toReasons(memo?.reasons), [memo?.reasons])
  const dirty =
    type !== (memo?.type ?? 'soraamekasa') ||
    taskId !== (memo?.taskId ?? initialTaskId) ||
    fact !== (memo?.fact ?? '') ||
    interpretation !== (memo?.interpretation ?? '') ||
    action !== (memo?.action ?? '') ||
    conclusion !== (memo?.conclusion ?? '') ||
    reasons.some((r, i) => r !== savedReasons[i]) ||
    body !== (memo?.body ?? '')

  // ---- 既存メモは自動保存 ----
  const latest = useRef({ type, taskId, fact, interpretation, action, conclusion, reasons, body })
  latest.current = { type, taskId, fact, interpretation, action, conclusion, reasons, body }
  const memoRef = useRef(memo)
  memoRef.current = memo

  const payload = () => {
    const v = latest.current
    return {
      type: v.type,
      taskId: v.taskId || undefined,
      // テンプレを切り替えても、もう一方に書いた内容は消さずに持っておく
      fact: v.fact,
      interpretation: v.interpretation,
      action: v.action,
      conclusion: v.conclusion,
      reasons: v.reasons,
      body: v.body,
    }
  }

  const back = useCallback(() => {
    const linked = latest.current.taskId || initialTaskId
    navigate(linked ? `/tasks/${linked}` : '/memos')
  }, [navigate, initialTaskId])

  const flush = useCallback(async () => {
    const m = memoRef.current
    if (!m) return true
    const v = latest.current
    if (
      v.type === m.type &&
      v.taskId === (m.taskId ?? '') &&
      v.fact === (m.fact ?? '') &&
      v.interpretation === (m.interpretation ?? '') &&
      v.action === (m.action ?? '') &&
      v.conclusion === (m.conclusion ?? '') &&
      v.body === (m.body ?? '') &&
      v.reasons.every((r, i) => r === toReasons(m.reasons)[i])
    ) {
      return true
    }
    try {
      setError('')
      await updateMemo(m.id, payload())
      return true
    } catch (e) {
      setError(`保存できませんでした: ${e instanceof Error ? e.message : String(e)}`)
      return false
    }
  }, [])

  useEffect(() => {
    if (!isEdit || !dirty) return
    const timer = setTimeout(() => void flush(), 700)
    return () => clearTimeout(timer)
  }, [isEdit, dirty, type, taskId, fact, interpretation, action, conclusion, reasons, body, flush])

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

  // ---- 新規メモは明示保存(空のメモを量産しないため) ----
  const savedRef = useRef(false)

  const saveNew = useCallback(async () => {
    if (saving) return
    setSaving(true)
    setError('')
    try {
      await createMemo(payload())
      savedRef.current = true
      back()
    } catch (e) {
      setError(`保存できませんでした: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setSaving(false)
    }
  }, [saving, back])

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
      const v = latest.current
      const hasContent = Boolean(
        v.fact || v.interpretation || v.action || v.conclusion || v.body || v.reasons.some(Boolean),
      )
      if (savedRef.current || !hasContent) return
      await createMemo(payload())
      savedRef.current = true
    })
  }, [isEdit])

  useSaveShortcut(() => (isEdit ? void flush() : void saveNew()))

  const leaveEdit = useCallback(() => {
    void flush()
    back()
  }, [flush, back])

  const { armed, onEscape, disarm } = useDiscardGuard(dirty, back)

  const shortcuts = useMemo<ShortcutMap>(() => {
    const map: ShortcutMap = { Escape: isEdit ? leaveEdit : onEscape }
    // 既存メモは自動保存なので、hでそのまま戻れる。新規は取消の確認を挟む
    if (isEdit) map.h = leaveEdit
    return map
  }, [isEdit, leaveEdit, onEscape])
  useShortcuts(shortcuts)

  // Ctrl+1〜3 でテンプレ切替。本文を書いている最中でも切り替えられる
  const typeHandlers = useMemo(
    () => TYPE_KEYS.map(({ type: t }) => () => setType(t)),
    [],
  )
  useNumberShortcuts(typeHandlers)

  const setReason = (index: number, value: string) =>
    setReasons((prev) => prev.map((r, i) => (i === index ? value : r)))

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-end">
        <div className="flex items-center gap-2">
          {isEdit && (
            <span className="text-xs text-neutral-400">{dirty ? '保存中…' : '保存済み'}</span>
          )}
          <div className="flex gap-1">
            {TYPE_KEYS.map(({ type: value, key }) => (
              <button
                key={value}
                type="button"
                onClick={() => setType(value)}
                title={`${MEMO_TYPE_LABEL[value]}に切り替え(Ctrl+${key})`}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  type === value
                    ? 'bg-neutral-900 text-white'
                    : 'border border-neutral-300 text-neutral-600 hover:bg-neutral-50'
                }`}
                aria-pressed={type === value}
              >
                {MEMO_TYPE_LABEL[value]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {type === 'soraamekasa' && (
        <div className="space-y-5">
          <Field label="空(事実)" hint="見たまま・聞いたまま。解釈を混ぜない" htmlFor="fact">
            <textarea
              id="fact"
              className="box-input"
              rows={3}
              value={fact}
              onChange={(e) => setFact(e.target.value)}
              autoFocus={!isEdit}
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
      )}

      {type === 'conclusion' && (
        <div className="space-y-5">
          <Field label="結論" hint="1行で。これだけ読めば伝わる形にする" htmlFor="conclusion">
            <input
              id="conclusion"
              className="box-input"
              value={conclusion}
              onChange={(e) => setConclusion(e.target.value)}
              placeholder="例: A案で進めるべき"
              autoFocus={!isEdit}
            />
          </Field>
          <div className="space-y-2">
            <span className="block text-sm font-medium text-neutral-800">
              根拠
              <span className="ml-2 text-xs font-normal text-neutral-500">
                なぜそう言えるのか。3つに絞る
              </span>
            </span>
            {reasons.map((reason, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="w-4 shrink-0 text-xs text-neutral-400">{i + 1}</span>
                <input
                  className="box-input"
                  value={reason}
                  onChange={(e) => setReason(i, e.target.value)}
                  aria-label={`根拠${i + 1}`}
                />
              </div>
            ))}
          </div>
          <Field label="肉付け" hint="根拠を支える中身。後回しでよい" htmlFor="body">
            <textarea
              id="body"
              className="box-input"
              rows={6}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </Field>
        </div>
      )}

      {type === 'free' && (
        <Field label="メモ" htmlFor="body">
          <textarea
            id="body"
            className="box-input"
            rows={10}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            autoFocus={!isEdit}
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
                      setError(
                        `削除できませんでした: ${e instanceof Error ? e.message : String(e)}`,
                      ),
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
