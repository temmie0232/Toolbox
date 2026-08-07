import { useCallback, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { DeletePrompt } from '../components/DeletePrompt'
import { GuiButton } from '../components/GuiButton'
import { formatDateTime } from '../lib/date'
import { useGuiMode } from '../lib/guiMode'
import { memoImageFiles } from '../lib/memoImages'
import { memoSummary } from '../lib/memoSummary'
import { useInitialMode } from '../lib/mode'
import { focusedItemId, useDeleteCommand } from '../lib/useDeleteCommand'
import { useShortcuts } from '../lib/useShortcuts'
import { removeMemo, useStore } from '../store'
import { MEMO_TYPE_LABEL } from '../types'

export function MemoList() {
  const { status, memos, tasks } = useStore()
  const navigate = useNavigate()
  const gui = useGuiMode()
  useInitialMode('normal')

  const sorted = useMemo(
    () => [...memos].sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1)),
    [memos],
  )
  const taskTitle = useMemo(() => {
    const map = new Map(tasks.map((t) => [t.id, t.title || '(無題)']))
    return (id?: string) => (id ? (map.get(id) ?? '') : '')
  }, [tasks])

  const openNew = useCallback(() => navigate('/memos/new'), [navigate])

  // d で乗っている行を消す(1回目は確認)
  const del = useDeleteCommand({
    resolve: () => {
      const memo = memos.find((m) => m.id === focusedItemId())
      if (!memo) return undefined
      return {
        id: memo.id,
        kind: 'メモ',
        name: memoSummary(memo),
        note: memoImageFiles(memo).length > 0 ? '貼った画像も消えます' : undefined,
      }
    },
    remove: (target) => removeMemo(target.id),
    emptyHint: '消すメモの行に乗ってから d(j / k で乗る)',
  })

  const shortcuts = useMemo(() => ({ o: openNew, d: del.press }), [openNew, del.press])
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
          <p className="text-sm text-neutral-600">まだメモがありません。</p>
          <p className="mt-1 text-xs text-neutral-500">
            考えが散らかったら <kbd>Shift</kbd> <kbd>M</kbd> で空・雨・傘の3枠に放り込む。
          </p>
        </div>
      )}

      {sorted.length > 0 && (
        <ul className="divide-y divide-neutral-100 border-y border-neutral-100">
          {sorted.map((memo) => (
            <li key={memo.id}>
              <Link
                to={`/memos/${memo.id}`}
                data-item-id={memo.id}
                className="flex items-center gap-3 px-1 py-2.5 hover:bg-neutral-50"
              >
                <span className="w-24 shrink-0 text-xs text-neutral-500">
                  {MEMO_TYPE_LABEL[memo.type]}
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

      <DeletePrompt {...del} />
    </div>
  )
}
