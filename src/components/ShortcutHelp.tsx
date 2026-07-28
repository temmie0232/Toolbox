import { useEffect, useRef } from 'react'

const SHORTCUTS: { keys: string[]; label: string }[] = [
  { keys: ['n'], label: '新しいタスク(タスク受信箱)' },
  { keys: ['m'], label: '新しいメモ(空雨傘 / 自由)' },
  { keys: ['t'], label: 'タスク一覧へ' },
  { keys: ['l'], label: 'メモ一覧へ' },
  { keys: ['b'], label: 'バックアップ画面へ' },
  { keys: ['↑', '↓'], label: '一覧の中を移動(j / k でも可)' },
  { keys: ['Enter'], label: '選択中の項目を開く' },
  { keys: ['Tab'], label: '箱から次の箱へ移動' },
  { keys: ['Ctrl', 'Enter'], label: '保存する' },
  { keys: ['Esc'], label: '取り消して戻る / 閉じる' },
  { keys: ['?'], label: 'このヘルプ' },
]

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
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
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
        className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="キーボードショートカット"
      >
        <h2 className="mb-3 text-sm font-semibold text-neutral-900">キーボードショートカット</h2>
        <ul className="space-y-1.5">
          {SHORTCUTS.map((s) => (
            <li key={s.label} className="flex items-center justify-between gap-4 text-sm">
              <span className="text-neutral-700">{s.label}</span>
              <span className="flex shrink-0 gap-1">
                {s.keys.map((k) => (
                  <kbd key={k}>{k}</kbd>
                ))}
              </span>
            </li>
          ))}
        </ul>
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
