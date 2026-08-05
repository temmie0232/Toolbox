import { useCallback, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { GuiButton } from '../components/GuiButton'
import { formatDateTime } from '../lib/date'
import { useGuiMode } from '../lib/guiMode'
import { useInitialMode } from '../lib/mode'
import { useShortcuts } from '../lib/useShortcuts'
import { useStore } from '../store'
import { meetingSummary } from '../types'

export function MeetingList() {
  const { status, meetings } = useStore()
  const navigate = useNavigate()
  const gui = useGuiMode()
  useInitialMode('normal')

  const sorted = useMemo(
    () => [...meetings].sort((a, b) => (a.startedAt > b.startedAt ? -1 : 1)),
    [meetings],
  )

  const openNew = useCallback(() => navigate('/meetings/new'), [navigate])
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
          <p className="text-sm text-neutral-600">まだ議事録がありません。</p>
          <p className="mt-1 text-xs text-neutral-500">
            会議が始まったら <kbd>R</kbd> で開く。書くのは決定・TODO・論点だけでいい。
          </p>
        </div>
      )}

      {sorted.length > 0 && (
        <ul className="divide-y divide-neutral-100 border-y border-neutral-100">
          {sorted.map((meeting) => {
            const openTodos = meeting.blocks.filter((b) => b.kind === 'todo' && !b.done).length
            return (
              <li key={meeting.id}>
                <Link
                  to={`/meetings/${meeting.id}`}
                  className="flex items-center gap-3 px-1 py-2.5 hover:bg-neutral-50"
                >
                  <span className="w-28 shrink-0 text-xs text-neutral-500">
                    {formatDateTime(meeting.startedAt)}
                  </span>
                  <span className="flex-1 truncate text-sm text-neutral-900">
                    {meeting.title || '(無題)'}
                  </span>
                  {openTodos > 0 && (
                    <span className="rounded bg-blue-50 px-1.5 py-0.5 text-xs font-medium whitespace-nowrap text-blue-700">
                      TODO {openTodos}
                    </span>
                  )}
                  <span className="shrink-0 text-xs text-neutral-400">
                    {meetingSummary(meeting)}
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
