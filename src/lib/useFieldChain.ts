import { useCallback, type KeyboardEvent } from 'react'
import { isComposing, isEditable, spotsIn } from './keys'
import { useModeActions } from './mode'

/**
 * 箱を埋める画面(メモ・タスク)の Enter。
 *
 * - Enter        次の箱へ。打っている手を止めずに移る
 * - Shift+Enter  改行
 * - Ctrl+Enter   保存(`useSaveShortcut` の担当)
 *
 * 「1つの箱に長文を書く」画面ではなく「箱を順に埋める」画面なので、
 * Enter は送りに使い、改行のほうを Shift 付きに追いやる。
 *
 * 画面の一番外側に付ける。並びは `spotsIn` が見た画面の上から下なので、
 * 箱を足しても勝手に列に入る(順番の二重管理をしない)。
 *
 * 触らない場合が3つある:
 * - その欄が自分で Enter を持っているとき(タスク詳細の疑問点の追加欄)。
 *   欄側が先に `preventDefault` するので、それを見て降りる
 * - 移動モードのとき。ModeProvider が capture で止めているので、ここには来ない
 *   (箱に入る Enter は `useSpotNav` の担当)
 * - 日本語入力の変換確定。これを見落とすと、変換しただけで次の箱へ飛ぶ
 *
 * 最後の箱では動かない(改行も入れない)。箱によって Enter の意味が変わるほうが困る。
 */
export function useFieldChain(): (e: KeyboardEvent<HTMLElement>) => void {
  const { enterInsert } = useModeActions()

  return useCallback(
    (e: KeyboardEvent<HTMLElement>) => {
      if (e.key !== 'Enter') return
      // 改行(Shift)と保存(Ctrl)はそれぞれの担当に渡す
      if (e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return
      if (isComposing(e.nativeEvent)) return
      if (e.defaultPrevented) return
      if (!isEditable(e.target)) return

      const fields = spotsIn(e.currentTarget).filter(isEditable)
      const at = fields.indexOf(e.target as HTMLElement)
      if (at === -1) return

      e.preventDefault()
      const next = fields[at + 1]
      if (next) enterInsert(next)
    },
    [enterInsert],
  )
}
