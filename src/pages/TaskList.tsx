import { useMemo, useRef } from 'react'
import { Link } from 'react-router-dom'
import { ConfirmBadge, StatusBadge } from '../components/Badges'
import { daysUntil, deadlineLabel } from '../lib/date'
import { useShortcuts } from '../lib/useShortcuts'
import { useStore } from '../store'
import { needsConfirmation, type Task } from '../types'

/** 期限順(未定は末尾)。同じ期限なら作成が古い方を上に */
function byDeadline(a: Task, b: Task): number {
  if (a.deadline && b.deadline) {
    if (a.deadline !== b.deadline) return a.deadline < b.deadline ? -1 : 1
  } else if (a.deadline) {
    return -1
  } else if (b.deadline) {
    return 1
  }
  return a.createdAt < b.createdAt ? -1 : 1
}

export function TaskList() {
  const { status, tasks } = useStore()
  const rowRefs = useRef<(HTMLAnchorElement | null)[]>([])

  const { open, done } = useMemo(() => {
    const open = tasks.filter((t) => t.status !== 'done').sort(byDeadline)
    const done = tasks
      .filter((t) => t.status === 'done')
      .sort((a, b) => (a.updatedAt > b.updatedAt ? -1 : 1))
    return { open, done }
  }, [tasks])

  const ordered = useMemo(() => [...open, ...done], [open, done])

  const moveFocus = useMemo(
    () => (delta: number) => {
      const rows = rowRefs.current.filter(Boolean) as HTMLAnchorElement[]
      if (rows.length === 0) return
      const current = rows.indexOf(document.activeElement as HTMLAnchorElement)
      const next = current === -1 ? 0 : Math.min(rows.length - 1, Math.max(0, current + delta))
      rows[next]?.focus()
    },
    [],
  )

  const shortcuts = useMemo(
    () => ({
      ArrowDown: () => moveFocus(1),
      ArrowUp: () => moveFocus(-1),
      j: () => moveFocus(1),
      k: () => moveFocus(-1),
    }),
    [moveFocus],
  )
  useShortcuts(shortcuts)

  rowRefs.current = []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-neutral-900">タスク</h1>
        <div className="flex gap-2">
          <Link to="/tasks/new" className="btn-primary">
            + タスク <kbd className="border-blue-500 bg-blue-500 text-blue-50">n</kbd>
          </Link>
          <Link to="/memos/new" className="btn-ghost">
            + メモ <kbd>m</kbd>
          </Link>
        </div>
      </div>

      {status === 'loading' && <p className="text-sm text-neutral-500">読み込み中…</p>}

      {status === 'ready' && ordered.length === 0 && (
        <div className="rounded-lg border border-dashed border-neutral-300 px-6 py-12 text-center">
          <p className="text-sm text-neutral-600">まだタスクがありません。</p>
          <p className="mt-1 text-xs text-neutral-500">
            タスクを振られたら、席に戻ってすぐ <kbd>n</kbd> で4つの箱を埋める。
          </p>
        </div>
      )}

      {open.length > 0 && (
        <ul className="divide-y divide-neutral-100 border-y border-neutral-100">
          {open.map((task, i) => (
            <TaskRow
              key={task.id}
              task={task}
              ref={(el) => {
                rowRefs.current[i] = el
              }}
            />
          ))}
        </ul>
      )}

      {done.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer text-sm text-neutral-500 hover:text-neutral-800">
            完了 {done.length}件
          </summary>
          <ul className="mt-2 divide-y divide-neutral-100 border-y border-neutral-100">
            {done.map((task, i) => (
              <TaskRow
                key={task.id}
                task={task}
                ref={(el) => {
                  rowRefs.current[open.length + i] = el
                }}
              />
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}

interface TaskRowProps {
  task: Task
  ref: (el: HTMLAnchorElement | null) => void
}

function TaskRow({ task, ref }: TaskRowProps) {
  const unresolved = task.questions.filter((q) => !q.resolved).length
  const overdue = task.deadline !== undefined && task.status !== 'done' && daysUntil(task.deadline) < 0

  return (
    <li>
      <Link
        ref={ref}
        to={`/tasks/${task.id}`}
        className="flex items-center gap-3 px-1 py-2.5 hover:bg-neutral-50"
      >
        <span
          className={`w-20 shrink-0 text-xs ${overdue ? 'font-medium text-red-600' : 'text-neutral-500'}`}
        >
          {deadlineLabel(task.deadline)}
        </span>
        <span
          className={`flex-1 truncate text-sm ${task.status === 'done' ? 'text-neutral-400' : 'text-neutral-900'}`}
        >
          {task.title || '(無題)'}
        </span>
        {needsConfirmation(task) && <ConfirmBadge count={unresolved} />}
        <StatusBadge status={task.status} />
      </Link>
    </li>
  )
}
