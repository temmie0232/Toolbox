import { useEffect, useRef, useState } from 'react'

interface InlineTextProps {
  value: string
  onCommit: (value: string) => void
  placeholder?: string
  className?: string
  ariaLabel?: string
}

/**
 * 触ったときだけ入力欄になるテキスト。
 * 会議中の一覧はできるだけ素の文字に見せたいが、直したくなったらすぐ直せるようにする。
 * 確定は Enter か、他所をクリックしたとき。Esc で元に戻す。
 */
export function InlineText({ value, onCommit, placeholder, className, ariaLabel }: InlineTextProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  // 編集していない間は、外からの変更をそのまま映す
  useEffect(() => {
    if (!editing) setDraft(value)
  }, [value, editing])

  const commit = () => {
    setEditing(false)
    const next = draft.trim()
    if (next !== value) onCommit(next)
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        onFocus={() => setEditing(true)}
        className={`w-full rounded px-1 py-0.5 text-left hover:bg-neutral-100 ${
          value ? '' : 'text-neutral-400'
        } ${className ?? ''}`}
        aria-label={ariaLabel}
      >
        {value || placeholder || '(空)'}
      </button>
    )
  }

  return (
    <input
      ref={inputRef}
      className={`w-full rounded border border-blue-600 px-1 py-0.5 outline-none ${className ?? ''}`}
      value={draft}
      placeholder={placeholder}
      aria-label={ariaLabel}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        // 変換確定のEnterで抜けてしまわないようにする
        if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
          e.preventDefault()
          commit()
        } else if (e.key === 'Escape') {
          e.stopPropagation()
          setDraft(value)
          setEditing(false)
        }
      }}
    />
  )
}
