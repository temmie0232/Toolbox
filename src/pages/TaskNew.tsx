import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { DeadlinePick } from '../components/DeadlinePick'
import { Field } from '../components/Field'
import { useDiscardGuard, useSaveShortcut, useShortcuts } from '../lib/useShortcuts'
import { createTask, registerDraftGuard, registerFlush } from '../store'

/**
 * F1 タスク受信箱。白紙ではなく4つの箱を出す。
 * 埋まらなかった箱(特に疑問点)は「上司に確認すべきこと」になる。
 */
export function TaskNew() {
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [purpose, setPurpose] = useState('')
  const [deliverable, setDeliverable] = useState('')
  const [deadline, setDeadline] = useState('')
  const [questions, setQuestions] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const titleRef = useRef<HTMLInputElement>(null)

  const dirty = Boolean(title || purpose || deliverable || deadline || questions)

  const latest = useRef({ title, purpose, deliverable, deadline, questions })
  latest.current = { title, purpose, deliverable, deadline, questions }
  const savedRef = useRef(false)

  const save = useCallback(async () => {
    if (saving) return
    if (!title.trim()) {
      setError('タイトルだけは入れてください(あとから直せます)')
      titleRef.current?.focus()
      return
    }
    setSaving(true)
    setError('')
    try {
      await createTask({
        title,
        purpose,
        deliverable,
        deadline: deadline || undefined,
        questionTexts: questions.split('\n'),
      })
      savedRef.current = true
      navigate('/')
    } catch (e) {
      setError(`保存できませんでした: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setSaving(false)
    }
  }, [saving, title, purpose, deliverable, deadline, questions, navigate])

  // 書きかけ中は画面切替キーで飛ばさない + ウィンドウを閉じるときは救済保存する
  const dirtyRef = useRef(false)
  dirtyRef.current = dirty
  useEffect(() => registerDraftGuard(() => dirtyRef.current), [])
  useEffect(
    () =>
      registerFlush(async () => {
        if (savedRef.current || !dirtyRef.current) return
        const v = latest.current
        await createTask({
          title: v.title.trim() || '(無題)',
          purpose: v.purpose,
          deliverable: v.deliverable,
          deadline: v.deadline || undefined,
          questionTexts: v.questions.split('\n'),
        })
        savedRef.current = true
      }),
    [],
  )

  useSaveShortcut(() => void save())

  const leave = useCallback(() => navigate('/'), [navigate])
  const { armed, onEscape, disarm } = useDiscardGuard(dirty, leave)
  const shortcuts = useMemo(() => ({ Escape: onEscape }), [onEscape])
  useShortcuts(shortcuts)

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
    >
      <div>
        <h1 className="text-lg font-semibold text-neutral-900">タスク受信箱</h1>
        <p className="mt-1 text-xs text-neutral-500">
          キーワードでいい。埋まらなかった箱は、そのまま上司に確認すること。
        </p>
      </div>

      <Field label="タイトル" htmlFor="title">
        <input
          id="title"
          ref={titleRef}
          className="box-input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="例: 来期の販促資料"
          autoFocus
        />
      </Field>

      <Field label="目的" hint="何のため / 誰が何に使う" htmlFor="purpose">
        <textarea
          id="purpose"
          className="box-input"
          rows={2}
          value={purpose}
          onChange={(e) => setPurpose(e.target.value)}
          placeholder="例: 部長が役員会で説明するため"
        />
      </Field>

      <Field label="完成形" hint="どんな形で出す(枚数・形式・粒度)" htmlFor="deliverable">
        <textarea
          id="deliverable"
          className="box-input"
          rows={2}
          value={deliverable}
          onChange={(e) => setDeliverable(e.target.value)}
          placeholder="例: パワポ3枚 / 数字は概算でよい"
        />
      </Field>

      <Field label="期限" hint="未定でも可" htmlFor="deadline">
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

      <Field label="疑問点" hint="1行に1件。あとで1件ずつ解決済みにできる" htmlFor="questions">
        <textarea
          id="questions"
          className="box-input"
          rows={3}
          value={questions}
          onChange={(e) => setQuestions(e.target.value)}
          placeholder={'例: 想定読者は役員だけ?\n例: 去年の資料は流用していい?'}
        />
      </Field>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {armed && (
        <p className="text-sm text-amber-700">
          書きかけがあります。破棄するならもう一度 <kbd>Esc</kbd>、続けるなら入力に戻ってください。
          <button type="button" className="ml-2 underline" onClick={disarm}>
            編集を続ける
          </button>
        </p>
      )}

      <div className="flex items-center gap-3 pt-2">
        <button type="submit" className="btn-primary" disabled={saving}>
          保存 <kbd className="border-blue-500 bg-blue-500 text-blue-50">Ctrl+Enter</kbd>
        </button>
        <button type="button" className="btn-ghost" onClick={onEscape}>
          取消 <kbd>Esc</kbd>
        </button>
      </div>
    </form>
  )
}
