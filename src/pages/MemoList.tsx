import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { formatDateTime } from '../lib/date'
import { memoSummary } from '../lib/memoSummary'
import { useListNav } from '../lib/useListNav'
import { useShortcuts } from '../lib/useShortcuts'
import { useStore } from '../store'

export function MemoList() {
  const { status, memos, tasks } = useStore()
  const navigate = useNavigate()
  const { setRow, nav } = useListNav()

  const sorted = useMemo(
    () => [...memos].sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1)),
    [memos],
  )
  const taskTitle = useMemo(() => {
    const map = new Map(tasks.map((t) => [t.id, t.title || '(無題)']))
    return (id?: string) => (id ? (map.get(id) ?? '') : '')
  }, [tasks])

  const shortcuts = useMemo(() => ({ ...nav, o: () => navigate('/memos/new') }), [nav, navigate])
  useShortcuts(shortcuts)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-neutral-900">メモ</h1>
        <Link to="/memos/new" className="btn-primary">
          + メモ <kbd className="border-blue-500 bg-blue-500 text-blue-50">m</kbd>
        </Link>
      </div>

      {status === 'loading' && <p className="text-sm text-neutral-500">読み込み中…</p>}

      {status === 'ready' && sorted.length === 0 && (
        <div className="rounded-lg border border-dashed border-neutral-300 px-6 py-12 text-center">
          <p className="text-sm text-neutral-600">まだメモがありません。</p>
          <p className="mt-1 text-xs text-neutral-500">
            考えが散らかったら <kbd>m</kbd> で空・雨・傘の3枠に放り込む。
          </p>
        </div>
      )}

      {sorted.length > 0 && (
        <ul className="divide-y divide-neutral-100 border-y border-neutral-100">
          {sorted.map((memo, i) => (
            <li key={memo.id}>
              <Link
                ref={setRow(i)}
                to={`/memos/${memo.id}`}
                className="flex items-center gap-3 px-1 py-2.5 hover:bg-neutral-50"
              >
                <span className="w-16 shrink-0 text-xs text-neutral-500">
                  {memo.type === 'soraamekasa' ? '空雨傘' : '自由'}
                </span>
                <span className="flex-1 truncate text-sm text-neutral-900">
                  {memoSummary(memo)}
                </span>
                {memo.taskId && (
                  <span className="max-w-40 truncate rounded bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-600">
                    {taskTitle(memo.taskId)}
                  </span>
                )}
                <span className="shrink-0 text-xs text-neutral-400">
                  {formatDateTime(memo.createdAt)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
