import { useEffect, useRef } from 'react'
import { ShortcutList } from './ShortcutList'

/** ? で出す一時的なカンペ。腰を据えて見るときは設定画面(上のバーをダブルクリック) */
export function ShortcutHelp({ onClose }: { onClose: () => void }) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)

  // 開いたら閉じるボタンへ、閉じたら元いた場所へフォーカスを戻す
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    closeRef.current?.focus()
    return () => previous?.focus()
  }, [])

  // Tabがモーダルの外へ抜けないようにする
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'Tab') return
    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>('button')
    if (!focusable || focusable.length === 0) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    const current = document.activeElement
    // 本文クリックなどでフォーカスが枠内の要素から外れていたら、まず先頭へ戻す
    if (!Array.from(focusable).includes(current as HTMLElement)) {
      e.preventDefault()
      first.focus()
      return
    }
    if (e.shiftKey && current === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && current === last) {
      e.preventDefault()
      first.focus()
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 p-4"
      onClick={onClose}
      onKeyDown={onKeyDown}
      role="presentation"
    >
      <div
        ref={dialogRef}
        className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="キーボードショートカット"
      >
        <h2 className="mb-3 text-sm font-semibold text-neutral-900">キーボードショートカット</h2>
        <ShortcutList />
        <button
          ref={closeRef}
          type="button"
          className="btn-ghost mt-4 w-full justify-center"
          onClick={onClose}
        >
          閉じる
        </button>
      </div>
    </div>
  )
}
