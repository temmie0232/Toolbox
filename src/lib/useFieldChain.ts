import { useCallback, type KeyboardEvent } from 'react'
import { isComposing, isEditable, isMultilineEntry, spotsIn } from './keys'
import { useModeActions } from './mode'

/**
 * 箱を埋める画面(メモ編集・タスク新規・タスク詳細)の Enter。
 *
 * - Shift+Enter  次の箱へ。打っている手を止めずに移る
 * - Enter        改行。ただし**改行が入る箱に限る**
 * - Ctrl+Enter   保存(`useSaveShortcut` の担当)
 *
 * 素の Enter は改行に使う。長文を書く箱で送りに取られると、
 * 段落を切るたびに手が止まって書けなくなるため。
 *
 * **1行しか入らない箱(タイトル・結論・根拠・期限)では、素の Enter も送りのまま。**
 * そこに改行は入りようがないので、止めると打鍵が死ぬうえ、
 * form の既定動作で保存が走ってしまう。
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
 * 最後の箱では動かない(改行も入れない)。箱によって送りの意味が変わるほうが困る。
 */
export function useFieldChain(): (e: KeyboardEvent<HTMLElement>) => void {
  const { enterInsert } = useModeActions()

  return useCallback(
    (e: KeyboardEvent<HTMLElement>) => {
      if (e.key !== 'Enter') return
      // 保存(Ctrl)は担当が別
      if (e.ctrlKey || e.altKey || e.metaKey) return
      if (isComposing(e.nativeEvent)) return
      if (e.defaultPrevented) return
      if (!isEditable(e.target)) return

      // 改行が入る箱の素の Enter は改行に渡す。送りは Shift+Enter が持つ
      if (!e.shiftKey && isMultilineEntry(e.target)) return

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
