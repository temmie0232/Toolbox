import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Field } from '../components/Field'
import { TextBox } from '../components/TextBox'
import { useInitialMode } from '../lib/mode'
import { useDiscardGuard, useSaveShortcut, useShortcuts } from '../lib/useShortcuts'
import { createBrainstorm, registerDraftGuard } from '../store'

const PRESETS = [3, 5, 10, 15]

export function BrainstormNew() {
  const navigate = useNavigate()
  useInitialMode('insert')
  const [theme, setTheme] = useState('')
  const [limitMinutes, setLimitMinutes] = useState(5)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const start = useCallback(async () => {
    if (saving) return
    setSaving(true)
    setError('')
    try {
      const brainstorm = await createBrainstorm({ theme, limitMinutes })
      navigate(`/brainstorms/${brainstorm.id}`, { replace: true })
    } catch (e) {
      setError(`始められませんでした: ${e instanceof Error ? e.message : String(e)}`)
      setSaving(false)
    }
  }, [saving, theme, limitMinutes, navigate])

  useSaveShortcut(() => void start())

  const dirtyRef = useRef(false)
  dirtyRef.current = Boolean(theme)
  useEffect(() => registerDraftGuard(() => dirtyRef.current), [])

  const leave = useCallback(() => navigate('/brainstorms'), [navigate])
  const { armed, onEscape, disarm } = useDiscardGuard(Boolean(theme), leave)
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
      <Field label="テーマ" hint="何について出すのか。1行で" htmlFor="theme">
        <TextBox
          id="theme"
          className="box-input"
          value={theme}
          onChange={(e) => setTheme(e.target.value)}
          placeholder="例: 資料の説得力を上げる方法"
          autoFocus
        />
      </Field>

      <Field label="制限時間" hint="短く区切るほど手が動く">
        <div className="flex items-center gap-1">
          {PRESETS.map((minutes) => (
            <button
              key={minutes}
              type="button"
              onClick={() => setLimitMinutes(minutes)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                limitMinutes === minutes
                  ? 'bg-neutral-900 text-white'
                  : 'border border-neutral-300 text-neutral-600 hover:bg-neutral-50'
              }`}
              aria-pressed={limitMinutes === minutes}
            >
              {minutes}分
            </button>
          ))}
        </div>
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
