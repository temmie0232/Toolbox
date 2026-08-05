import { useGuiMode } from '../lib/guiMode'

interface GuiButtonProps {
  label: string
  /** 対応するキーボードショートカット。ボタン自体がキーへの入口にもなるよう併記する */
  hint?: string
  onClick: () => void
  variant?: 'primary' | 'ghost' | 'danger'
  disabled?: boolean
}

const VARIANT_CLASS = {
  primary: 'btn-primary',
  ghost: 'btn-ghost',
  danger: 'btn-danger',
} as const

/**
 * GUIモード専用のボタン。OFFなら何も描画しない。
 *
 * `data-secondary` と `tabIndex={-1}` を両方付けるのが要点。
 * `spotsIn`(lib/keys.ts)は `tabIndex === -1` を無条件で弾くので、
 * この2つを付けた要素は j/k・Tab・札(f)のどこにも一切現れない。
 * 既存キーの写しでしかないボタンが、キーボード操作の速さや札の文字数に影響しないようにするため。
 *
 * `onMouseDown` で `preventDefault` し、クリックでフォーカスが移らないようにする。
 * フォーカスが入力欄から外れると入力モードが強制的に移動モードへ落ち(lib/mode.tsx)、
 * 直後に打った文字が本文ではなく単キーのショートカットとして発火してしまうため。
 */
export function GuiButton({ label, hint, onClick, variant = 'ghost', disabled }: GuiButtonProps) {
  const gui = useGuiMode()
  if (!gui) return null
  return (
    <button
      type="button"
      data-secondary
      tabIndex={-1}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      title={hint ? `${label}(${hint})` : label}
      className={VARIANT_CLASS[variant]}
    >
      {label}
      {hint && <kbd>{hint}</kbd>}
    </button>
  )
}
