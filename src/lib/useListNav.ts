import { useMemo, useRef } from 'react'
import type { ShortcutMap } from './useShortcuts'

/**
 * 一覧のvim風移動。j/k(↑↓)で行を移動、gg で先頭、Shift+g で末尾。
 * フォーカスが「現在行」を兼ねるので、Enterでそのまま開ける。
 */
export function useListNav() {
  const rows = useRef<(HTMLElement | null)[]>([])
  // 毎レンダーで配り直す(削除で行が減っても古い参照が残らないように)
  rows.current = []
  const pendingG = useRef<number | null>(null)

  const setRow = (index: number) => (el: HTMLElement | null) => {
    rows.current[index] = el
  }

  const nav = useMemo<ShortcutMap>(() => {
    // 折りたたまれた「完了」の中など、非表示の行は飛ばす(focusしても何も起きないため)
    const items = () =>
      rows.current.filter((el): el is HTMLElement => Boolean(el) && el!.offsetParent !== null)
    const move = (delta: number) => {
      const list = items()
      if (list.length === 0) return
      const current = list.indexOf(document.activeElement as HTMLElement)
      const next =
        current === -1
          ? delta > 0
            ? 0
            : list.length - 1
          : Math.min(list.length - 1, Math.max(0, current + delta))
      list[next]?.focus()
    }
    const jump = (index: number) => {
      const list = items()
      list[index < 0 ? list.length - 1 : index]?.focus()
    }
    return {
      j: () => move(1),
      k: () => move(-1),
      ArrowDown: () => move(1),
      ArrowUp: () => move(-1),
      // gg: 1回目のgは覚えておくだけ。600ms以内の2回目で先頭へ
      g: () => {
        if (pendingG.current !== null) {
          clearTimeout(pendingG.current)
          pendingG.current = null
          jump(0)
        } else {
          pendingG.current = window.setTimeout(() => {
            pendingG.current = null
          }, 600)
        }
      },
      G: () => jump(-1),
    }
  }, [])

  return { setRow, nav }
}
