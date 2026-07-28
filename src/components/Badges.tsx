import { TASK_STATUS_LABEL, type TaskStatus } from '../types'

const STATUS_STYLE: Record<TaskStatus, string> = {
  received: 'bg-neutral-100 text-neutral-700',
  in_progress: 'bg-blue-50 text-blue-700',
  draft_reviewed: 'bg-emerald-50 text-emerald-700',
  done: 'bg-neutral-100 text-neutral-400',
}

export function StatusBadge({ status }: { status: TaskStatus }) {
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-xs font-medium whitespace-nowrap ${STATUS_STYLE[status]}`}
    >
      {TASK_STATUS_LABEL[status]}
    </span>
  )
}

/** 未解決の疑問が残っているタスクに出す */
export function ConfirmBadge({ count }: { count: number }) {
  return (
    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium whitespace-nowrap text-amber-800">
      要確認 {count}
    </span>
  )
}
