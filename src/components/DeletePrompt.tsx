import type { DeleteCommand } from '../lib/useDeleteCommand'

/**
 * `d` で構えたときに出る確認。全画面で同じ場所・同じ文にする。
 *
 * 画面の下に固定するのが要点。詳細画面は縦に長いので、
 * 削除の欄のところに出しても、上の方を見ているときは確認が画面の外に出てしまう。
 *
 * ボタンは `data-secondary` と `tabIndex={-1}` を両方付けて、j/k・Tab・札(f) から外す
 * (components/GuiButton.tsx と同じ理由。キーボードは d と Esc で完結しているので、
 * 列に入れると打鍵数と札の文字数だけが増える)。
 */
export function DeletePrompt({ armed, notice, confirm, disarm }: DeleteCommand) {
  if (!armed && !notice) return null

  return (
    <div className="fixed inset-x-0 bottom-1 z-30 flex justify-center px-16">
      {armed ? (
        <div className="flex max-w-full items-center gap-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 shadow-sm">
          <span className="min-w-0 text-sm text-red-800">
            <span className="text-red-600">{armed.kind}</span>「
            <span className="font-medium">{armed.name}</span>」を削除する?
            {armed.note && <span className="ml-1 text-xs text-red-600">({armed.note})</span>}
          </span>
          <span className="shrink-0 text-xs text-red-700">
            もう一度 <kbd>d</kbd> / やめる <kbd>Esc</kbd>
          </span>
          <span data-secondary className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              tabIndex={-1}
              className="btn-danger"
              // 押してもフォーカスを動かさない。動かすと構えが解ける(useDeleteCommand)
              onMouseDown={(e) => e.preventDefault()}
              onClick={confirm}
            >
              削除する
            </button>
            <button
              type="button"
              tabIndex={-1}
              className="btn-ghost"
              onMouseDown={(e) => e.preventDefault()}
              onClick={disarm}
            >
              やめる
            </button>
          </span>
        </div>
      ) : (
        <div className="rounded-md border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-sm text-neutral-600 shadow-sm">
          {notice}
        </div>
      )}
    </div>
  )
}
