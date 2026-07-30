import { useEffect, useRef, useState } from 'react'
import { useModeActions, useOnExitInsert } from '../lib/mode'

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
 * 確定は Enter か、他所へ移ったとき。Esc(入力モードを抜ける)で元に戻る。
 */
export function InlineText({ value, onCommit, placeholder, className, ariaLabel }: InlineTextProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const inputRef = useRef<HTMLInputElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const wasEditing = useRef(false)
  const { enterInsert } = useModeActions()

  useEffect(() => {
    // 編集に入ったら、そのまま打てる状態(入力モード)にする
    if (editing) enterInsert(inputRef.current)
    // 編集を抜けたらフォーカスをここへ戻す。body に落ちると、
    // 次に打った1文字が画面切替のショートカットとして拾われてしまう
    else if (wasEditing.current) buttonRef.current?.focus()
    wasEditing.current = editing
  }, [editing, enterInsert])

  // 編集していない間は、外からの変更をそのまま映す
  useEffect(() => {
    if (!editing) setDraft(value)
  }, [value, editing])

  // Esc で入力モードを抜けたら、書きかけを捨てて元の表示に戻す
  useOnExitInsert(() => {
    if (!editing) return
    setDraft(value)
    setEditing(false)
  })

  const commit = () => {
    setEditing(false)
    const next = draft.trim()
    if (next !== value) onCommit(next)
  }

  if (!editing) {
    return (
      <button
        ref={buttonRef}
        type="button"
        // Tabで来ただけでは編集に入らない(戻したフォーカスで編集が再開してしまうため)。
        // Enter か Space、クリックで入る
        onClick={() => setEditing(true)}
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
        }
      }}
    />
  )
}
