import { useEffect, useMemo, useState, type RefObject } from 'react'
import { isEditable, makeHintLabels, spotsIn } from '../lib/keys'
import { useEscapeOwner, useModeActions } from '../lib/mode'

interface HintOverlayProps {
  rootRef: RefObject<HTMLElement | null>
  /** true: 札を打った先を押す(f) / false: そこへ移るだけ(Shift+F) */
  activate: boolean
  onDone: () => void
}

/**
 * 画面に映っている押せるもの全部に札を出し、札を打つとそこへ一撃で飛ぶ。
 *
 * j/k は「近づく」動きなので、行数ぶんの時間がかかる。
 * 札は狙った先に何個あっても2打鍵以内で着くので、慣れるほど速くなる。
 * 貼る対象は主も副も全部(期限のチップや行ごとの削除もここから届く)。
 */
export function HintOverlay({ rootRef, activate, onDone }: HintOverlayProps) {
  const { enterInsert } = useModeActions()
  const [typed, setTyped] = useState('')

  // 開いた瞬間の配置で貼る。開いている間は画面を動かさないので測り直さない
  const targets = useMemo(() => {
    const root = rootRef.current
    if (!root) return []
    const els = spotsIn(root, { inViewport: true })
    const labels = makeHintLabels(els.length)
    return labels.map((label, i) => ({ label, el: els[i], rect: els[i].getBoundingClientRect() }))
  }, [rootRef])

  useEscapeOwner(true, onDone)

  useEffect(() => {
    // 貼れるものが無ければ出しっぱなしにしない
    if (targets.length === 0) onDone()
  }, [targets, onDone])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Esc は useEscapeOwner が受ける。修飾キー付きは素通し(Ctrl+Alt+Tなどを潰さない)
      if (e.key === 'Escape' || e.ctrlKey || e.altKey || e.metaKey) return
      e.preventDefault()
      e.stopPropagation()

      if (e.key === 'Backspace') {
        setTyped((prev) => prev.slice(0, -1))
        return
      }
      if (e.key.length !== 1) return

      const next = (typed + e.key).toLowerCase()
      const hit = targets.find((t) => t.label === next)
      if (hit) {
        onDone()
        // フォーカスも移す。ここから j/k や Ctrl+数字を続けられるようにするため。
        // 端に張り付かせないので、寄せるのは自前でやる(scroll-margin は index.css)
        hit.el.focus({ preventScroll: true })
        hit.el.scrollIntoView({ block: 'nearest' })
        if (activate) {
          if (isEditable(hit.el)) enterInsert(hit.el)
          else hit.el.click()
        }
        return
      }
      // まだ続きがあるなら受け付ける。無ければ打ち間違いなのでやめる
      if (targets.some((t) => t.label.startsWith(next))) setTyped(next)
      else onDone()
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [typed, targets, activate, onDone, enterInsert])

  return (
    <div className="pointer-events-none fixed inset-0 z-40" aria-hidden="true">
      {targets.map(({ label, rect }) => {
        if (typed && !label.startsWith(typed)) return null
        return (
          <span
            key={label}
            className="absolute rounded bg-neutral-900 px-1 font-mono text-[11px] leading-4 font-bold text-white shadow"
            style={{
              // 対象の左上に、少しだけ食い込ませて置く
              left: Math.max(0, rect.left - 4),
              top: Math.max(0, rect.top - 4),
            }}
          >
            <span className="text-neutral-500">{typed}</span>
            {label.slice(typed.length)}
          </span>
        )
      })}
    </div>
  )
}
