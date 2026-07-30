import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { isComposing } from './keys'
import { useMode, useModeActions } from './mode'

/**
 * モーダルが開いている間、画面側のショートカットを止めるための仕組み。
 * これがないと、ヘルプをEscで閉じたときに画面側のEscも同時に発火して
 * 書きかけのフォームごと閉じてしまう。
 */
export const ShortcutSuspendContext = createContext(false)

export function useShortcutsSuspended(): boolean {
  return useContext(ShortcutSuspendContext)
}

export type ShortcutMap = Record<string, (e: KeyboardEvent) => void>

/**
 * 単キーのショートカット。キーは 'n' / '?' / 'Escape' のように書く。
 *
 * **移動モードのときだけ発火する。**入力モード中は文字が優先で、単キーは死ぬ。
 * 逆に移動モードなら、入力欄にフォーカスがあっても効く(欄は readOnly なので取り合いにならない)。
 */
export function useShortcuts(map: ShortcutMap, enabled = true): void {
  const suspended = useShortcutsSuspended()
  const mode = useMode()
  const active = enabled && !suspended && mode === 'normal'

  useEffect(() => {
    if (!active) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (isComposing(e)) return
      const handler = map[e.key]
      if (!handler) return
      e.preventDefault()
      handler(e)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [map, active])
}

/**
 * Ctrl+数字。その画面の主要な切り替え(ステータス・テンプレ・種別)に使う。
 * 修飾キー付きなので、打っている最中(入力モード)でも効く。
 */
export function useNumberShortcuts(handlers: (() => void)[], enabled = true): void {
  const suspended = useShortcutsSuspended()
  const active = enabled && !suspended

  useEffect(() => {
    if (!active) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (!e.ctrlKey || e.altKey || e.shiftKey || e.metaKey) return
      const index = Number(e.key) - 1
      if (!Number.isInteger(index) || index < 0 || index >= handlers.length) return
      e.preventDefault()
      handlers[index]()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [handlers, active])
}

/** Ctrl+Enter(Macは Cmd+Enter)で保存。入力モード中でも効く */
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
 *
 * ここに来るのは移動モードのEscだけ(入力中のEscは入力を抜けるのに使われる)。
 */
export function useDiscardGuard(dirty: boolean, leave: () => void) {
  const [armed, setArmed] = useState(false)
  const armedRef = useRef(false)
  armedRef.current = armed
  const mode = useMode()

  const onEscape = useCallback(() => {
    if (!dirty || armedRef.current) {
      leave()
      return
    }
    setArmed(true)
  }, [dirty, leave])

  const disarm = useCallback(() => setArmed(false), [])

  // また打ち始めたら構えを解く。
  // 解かないと「Escで確認 → 書き足す → Escで即破棄」になってしまう
  useEffect(() => {
    if (mode === 'insert') setArmed(false)
  }, [mode])

  return { armed, onEscape, disarm }
}

/** 入力欄へ移りつつ入力モードに入る。ページ側から「aで追加欄へ」等に使う */
export function useFocusInput(): (el: HTMLElement | null) => void {
  const { enterInsert } = useModeActions()
  return useCallback((el: HTMLElement | null) => enterInsert(el), [enterInsert])
}
