import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Field } from '../components/Field'
import { useDiscardGuard, useSaveShortcut, useShortcuts } from '../lib/useShortcuts'
import { createMeeting, registerDraftGuard } from '../store'

/**
 * 議事録の入口。会議が始まる瞬間に開くので、聞かれるのは2つだけ。
 * ここで止まると本編に間に合わないため、空でも始められるようにしてある。
 */
export function MeetingNew() {
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [participants, setParticipants] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const start = useCallback(async () => {
    if (saving) return
    setSaving(true)
    setError('')
    try {
      const meeting = await createMeeting({ title, participants })
      navigate(`/meetings/${meeting.id}`, { replace: true })
    } catch (e) {
      setError(`始められませんでした: ${e instanceof Error ? e.message : String(e)}`)
      setSaving(false)
    }
  }, [saving, title, participants, navigate])

  useSaveShortcut(() => void start())

  const dirty = Boolean(title || participants)
  const dirtyRef = useRef(false)
  dirtyRef.current = dirty
  useEffect(() => registerDraftGuard(() => dirtyRef.current), [])

  const leave = useCallback(() => navigate('/meetings'), [navigate])
  const { armed, onEscape, disarm } = useDiscardGuard(dirty, leave)
  const shortcuts = useMemo(() => ({ Escape: onEscape }), [onEscape])
  useShortcuts(shortcuts)

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault()
        void start()
      }}
    >
      <Field label="会議名" htmlFor="title">
        <input
          id="title"
          className="box-input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="例: 週次定例"
          autoFocus
        />
      </Field>

      <Field label="参加者" hint="あとで足せる。空でもよい" htmlFor="participants">
        <input
          id="participants"
          className="box-input"
          value={participants}
          onChange={(e) => setParticipants(e.target.value)}
          placeholder="例: 部長、田中さん、自分"
        />
      </Field>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {armed && (
        <p className="text-sm text-amber-700">
          書きかけがあります。破棄するならもう一度 <kbd>Esc</kbd>。
          <button type="button" className="ml-2 underline" onClick={disarm}>
            編集を続ける
          </button>
        </p>
      )}

      <div className="flex items-center gap-3 pt-2">
        <button type="submit" className="btn-primary" disabled={saving}>
          始める <kbd className="border-blue-500 bg-blue-500 text-blue-50">Ctrl+Enter</kbd>
        </button>
        <button type="button" className="btn-ghost" onClick={onEscape}>
          取消 <kbd>Esc</kbd>
        </button>
      </div>
    </form>
  )
}
