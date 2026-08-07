import {
  CONCEPT_STATUS_LABEL,
  TASK_STATUS_LABEL,
  type ConceptStatus,
  type TaskStatus,
} from '../types'

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

const CONCEPT_STATUS_STYLE: Record<ConceptStatus, string> = {
  // 「知らないまま」が一番危ない状態なので、未着手を一番目立たせる
  captured: 'bg-red-50 text-red-700',
  fuzzy: 'bg-amber-50 text-amber-700',
  explainable: 'bg-neutral-100 text-neutral-400',
}

/** 概念の理解度。一覧・タスク詳細の両方で使う */
export function ConceptStatusChip({ status }: { status: ConceptStatus }) {
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-xs font-medium whitespace-nowrap ${CONCEPT_STATUS_STYLE[status]}`}
    >
      {CONCEPT_STATUS_LABEL[status]}
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
