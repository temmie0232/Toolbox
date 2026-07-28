import { useEffect, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ConfirmBadge, StatusBadge } from '../components/Badges'
import { daysUntil, deadlineLabel } from '../lib/date'
import { useListNav } from '../lib/useListNav'
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
  const navigate = useNavigate()
  const { setRow, nav } = useListNav()

  const { open, done } = useMemo(() => {
    const open = tasks.filter((t) => t.status !== 'done').sort(byDeadline)
    const done = tasks
      .filter((t) => t.status === 'done')
      .sort((a, b) => (a.updatedAt > b.updatedAt ? -1 : 1))
    return { open, done }
  }, [tasks])

  const shortcuts = useMemo(() => ({ ...nav, o: () => navigate('/tasks/new') }), [nav, navigate])
  useShortcuts(shortcuts)

  // 詳細から戻ってきたら、さっき見ていた行にフォーカスを戻す(j/kで続きから動ける)
  useEffect(() => {
    if (status !== 'ready') return
    const id = sessionStorage.getItem('tool:lastTaskId')
    if (!id) return
    sessionStorage.removeItem('tool:lastTaskId')
    const row = document.querySelector<HTMLAnchorElement>(`a[data-task-id="${id}"]`)
    if (!row) return
    // 完了セクションの中にいるなら、開いてからフォーカスする
    if (row.offsetParent === null) {
      const details = row.closest('details')
      if (details) details.open = true
    }
    row.focus()
  }, [status])

  return (
    <div className="space-y-6">
      {status === 'loading' && <p className="text-sm text-neutral-500">読み込み中…</p>}

      {status === 'ready' && open.length === 0 && done.length === 0 && (
        <div className="rounded-lg border border-dashed border-neutral-300 px-6 py-12 text-center">
          <p className="text-sm text-neutral-600">まだタスクがありません。</p>
          <p className="mt-1 text-xs text-neutral-500">
            タスクを振られたら、席に戻ってすぐ <kbd>Shift</kbd> <kbd>T</kbd> で4つの箱を埋める。
          </p>
        </div>
      )}

      {open.length > 0 && (
        <ul className="divide-y divide-neutral-100 border-y border-neutral-100">
          {open.map((task, i) => (
            <TaskRow key={task.id} task={task} ref={setRow(i)} />
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
              <TaskRow key={task.id} task={task} ref={setRow(open.length + i)} />
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
  const diff = task.deadline !== undefined ? daysUntil(task.deadline) : null

  // 期限の近さで色を変える: 超過=赤 / 今日明日=琥珀 / それ以外=灰
  const deadlineClass =
    task.status === 'done' || diff === null
      ? 'text-neutral-400'
      : diff < 0
        ? 'font-medium text-red-600'
        : diff <= 1
          ? 'font-medium text-amber-700'
          : 'text-neutral-500'

  return (
    <li>
      <Link
        ref={ref}
        to={`/tasks/${task.id}`}
        data-task-id={task.id}
        onClick={() => sessionStorage.setItem('tool:lastTaskId', task.id)}
        className="flex items-center gap-3 px-1 py-2.5 hover:bg-neutral-50"
      >
        <span className={`w-20 shrink-0 text-xs ${deadlineClass}`}>
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
