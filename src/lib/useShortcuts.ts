import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'

/**
 * モーダルが開いている間、画面側のショートカットを止めるための仕組み。
 * これがないと、ヘルプをEscで閉じたときに画面側のEscも同時に発火して
 * 書きかけのフォームごと閉じてしまう。
 */
export const ShortcutSuspendContext = createContext(false)

export function useShortcutsSuspended(): boolean {
  return useContext(ShortcutSuspendContext)
}

/** 文字入力中とみなす要素。チェックボックスや日付ピッカーは含めない(単キーを使いたいため) */
const TEXT_INPUT_TYPES = new Set(['text', 'search', 'url', 'tel', 'email', 'password', 'number'])

export function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  if (target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return true
  if (target instanceof HTMLInputElement) return TEXT_INPUT_TYPES.has(target.type)
  return false
}

/** 日本語入力の変換中は、確定用のキーをショートカットとして扱わない */
export function isComposing(e: KeyboardEvent | { isComposing: boolean; keyCode: number }): boolean {
  return e.isComposing || e.keyCode === 229
}

export type ShortcutMap = Record<string, (e: KeyboardEvent) => void>

/**
 * 単キーのショートカット。キーは 'n' / '?' / 'Escape' のように書く。
 * 入力欄にフォーカスがあるときは発火しない(Escapeだけは常に効く)。
 */
export function useShortcuts(map: ShortcutMap, enabled = true): void {
  const suspended = useShortcutsSuspended()
  const active = enabled && !suspended

  useEffect(() => {
    if (!active) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (isComposing(e)) return
      const handler = map[e.key]
      if (!handler) return
      if (e.key !== 'Escape' && isTyping(e.target)) return
      e.preventDefault()
      handler(e)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [map, active])
}

/** Ctrl+Enter(Macは Cmd+Enter)で保存。入力欄の中でも効く */
export function useSaveShortcut(save: () => void, enabled = true): void {
  const suspended = useShortcutsSuspended()
  const active = enabled && !suspended

  useEffect(() => {
    if (!active) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !isComposing(e)) {
        e.preventDefault()
        save()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [save, active])
}

/**
 * 書きかけがあるときのEsc。1回目は確認を出し、2回目で破棄する。
 * 「Escを押したら数分ぶんの入力が無言で消えた」を防ぐ。
 */
export function useDiscardGuard(dirty: boolean, leave: () => void) {
  const [armed, setArmed] = useState(false)
  const armedRef = useRef(false)
  armedRef.current = armed

  const onEscape = useCallback(() => {
    if (!dirty || armedRef.current) {
      leave()
      return
    }
    setArmed(true)
  }, [dirty, leave])

  const disarm = useCallback(() => setArmed(false), [])

  return { armed, onEscape, disarm }
}
