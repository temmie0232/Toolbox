import { useCallback, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { GuiButton } from '../components/GuiButton'
import { formatDateTime } from '../lib/date'
import { useGuiMode } from '../lib/guiMode'
import { useInitialMode } from '../lib/mode'
import { useShortcuts } from '../lib/useShortcuts'
import { useStore } from '../store'

export function BrainstormList() {
  const { status, brainstorms } = useStore()
  const navigate = useNavigate()
  const gui = useGuiMode()
  useInitialMode('normal')

  const sorted = useMemo(
    () => [...brainstorms].sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1)),
    [brainstorms],
  )

  const openNew = useCallback(() => navigate('/brainstorms/new'), [navigate])
  const shortcuts = useMemo(() => ({ o: openNew }), [openNew])
  useShortcuts(shortcuts)

  return (
    <div className="space-y-6">
      {gui && (
        <div className="flex justify-end">
          <GuiButton label="新規" hint="o" variant="primary" onClick={openNew} />
        </div>
      )}

      {status === 'loading' && <p className="text-sm text-neutral-500">読み込み中…</p>}

      {status === 'ready' && sorted.length === 0 && (
        <div className="rounded-lg border border-dashed border-neutral-300 px-6 py-12 text-center">
          <p className="text-sm text-neutral-600">まだブレストがありません。</p>
          <p className="mt-1 text-xs text-neutral-500">
            行き詰まったら <kbd>Shift</kbd> <kbd>S</kbd>。時間を区切って、質より量を出す。
          </p>
        </div>
      )}

      {sorted.length > 0 && (
        <ul className="divide-y divide-neutral-100 border-y border-neutral-100">
          {sorted.map((brainstorm) => {
            const groups = new Set(brainstorm.cards.map((c) => c.group).filter(Boolean))
            return (
              <li key={brainstorm.id}>
                <Link
                  to={`/brainstorms/${brainstorm.id}`}
                  className="flex items-center gap-3 px-1 py-2.5 hover:bg-neutral-50"
                >
                  <span className="w-28 shrink-0 text-xs text-neutral-500">
                    {formatDateTime(brainstorm.createdAt)}
                  </span>
                  <span className="flex-1 truncate text-sm text-neutral-900">
                    {brainstorm.theme || '(テーマなし)'}
                  </span>
                  <span className="shrink-0 text-xs text-neutral-400">
                    {brainstorm.cards.length}件
                    {groups.size > 0 ? ` / ${groups.size}グループ` : ''}
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
