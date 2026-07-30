import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { isEditable, spotsIn } from './keys'
import { useModeActions } from './mode'
import type { ShortcutMap } from './useShortcuts'

/**
 * 画面にある押せるものを、上から下へ1本の列として扱う。
 * j/k で辿り、Enter で開く(入力欄なら書ける状態にする)。
 *
 * 一覧の行だけでなく詳細画面のチェックや入力欄も同じ列に入るので、
 * どの画面でも同じ手つきで一周できる。
 * 辿るのは「主」だけ(`data-secondary` の中は飛ばす)。細かいものは Tab か 札(f) で。
 *
 * 数字を先に打つと回数になる(`3j` で3行下)。移動モードのときだけ効く。
 */
export function useSpotNav(rootRef: RefObject<HTMLElement | null>, resetKey: string) {
  const { enterInsert } = useModeActions()
  // 押した行が消えてフォーカスが飛んだとき、続きから動けるように覚えておく
  const lastIndex = useRef(-1)
  const pendingG = useRef<number | null>(null)
  // 打ちかけの回数。画面に出したいので state で持つ
  const [count, setCount] = useState(0)
  const countRef = useRef(0)
  countRef.current = count

  // 画面が変わったら忘れる。前の画面の位置から再開すると、脈絡のない行に飛ぶ
  useEffect(() => {
    lastIndex.current = -1
    setCount(0)
  }, [resetKey])

  const nav = useMemo<ShortcutMap>(() => {
    const list = () => {
      const root = rootRef.current
      return root ? spotsIn(root, { primaryOnly: true }) : []
    }

    const focusAt = (items: HTMLElement[], index: number) => {
      const el = items[index]
      if (!el) return
      el.focus({ preventScroll: true })
      el.scrollIntoView({ block: 'nearest' })
      lastIndex.current = index
    }

    /** 打ちかけの回数を使い切る。指定がなければ1 */
    const takeCount = () => {
      const n = countRef.current
      if (n > 0) setCount(0)
      return n > 0 ? n : 1
    }

    const move = (direction: number) => {
      const items = list()
      if (items.length === 0) return
      const delta = direction * takeCount()
      const current = items.indexOf(document.activeElement as HTMLElement)
      if (current === -1) {
        // フォーカスが列から外れている。押した行が消えた直後ならそこから、
        // そうでなければ端から始める
        const resume =
          lastIndex.current >= 0
            ? Math.min(lastIndex.current, items.length - 1)
            : direction > 0
              ? 0
              : items.length - 1
        focusAt(items, resume)
        return
      }
      focusAt(items, Math.min(items.length - 1, Math.max(0, current + delta)))
    }

    const jump = (index: number) => {
      const items = list()
      if (items.length === 0) return
      focusAt(items, index < 0 ? items.length - 1 : Math.min(index, items.length - 1))
    }

    /** 数字を打ったら回数として溜める。0 は溜まっている途中だけ(10行下など) */
    const digit = (key: string) => () => {
      setCount((prev) => {
        if (key === '0' && prev === 0) return 0
        return Math.min(999, prev * 10 + Number(key))
      })
    }

    const map: ShortcutMap = {
      j: () => move(1),
      k: () => move(-1),
      ArrowDown: () => move(1),
      ArrowUp: () => move(-1),
      // gg: 1回目のgは覚えておくだけ。600ms以内の2回目で先頭へ
      g: () => {
        if (pendingG.current !== null) {
          clearTimeout(pendingG.current)
          pendingG.current = null
          setCount(0)
          jump(0)
        } else {
          pendingG.current = window.setTimeout(() => {
            pendingG.current = null
          }, 600)
        }
      },
      // 5G で5行目へ、素の G で末尾へ
      G: () => {
        const n = countRef.current
        setCount(0)
        jump(n > 0 ? n - 1 : -1)
      },
      /**
       * 入力欄なら書ける状態にし、それ以外は押す。
       * 素のEnterに任せるとフォーム送信と二重に発火するので、こちらから押す。
       */
      Enter: () => {
        setCount(0)
        const el = document.activeElement
        if (!(el instanceof HTMLElement) || el === document.body) return
        if (isEditable(el)) enterInsert(el)
        else el.click()
      },
      /** i: いまいる欄に書き始める。欄の上にいなければ、その画面の最初の欄へ */
      i: () => {
        setCount(0)
        enterInsert()
      },
    }
    for (const key of '0123456789') map[key] = digit(key)
    return map
  }, [rootRef, enterInsert])

  return { nav, count }
}
