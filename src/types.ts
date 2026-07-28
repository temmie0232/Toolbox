/** タスクの進み具合。「要確認」はここに入れず、未解決 question の有無から自動判定する */
export type TaskStatus = 'received' | 'in_progress' | 'draft_reviewed' | 'done'

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  received: '受領',
  in_progress: '作業中',
  draft_reviewed: '30%確認済',
  done: '完了',
}

export const TASK_STATUS_ORDER: TaskStatus[] = [
  'received',
  'in_progress',
  'draft_reviewed',
  'done',
]

export interface Question {
  id: string
  text: string
  resolved: boolean
}

/** 提出前3問 */
export interface SubmitCheck {
  /** 目的に答えているか */
  answersPurpose: boolean
  /** 結論は10秒で見つかるか */
  conclusionIn10s: boolean
  /** 相手の次アクションが明確か */
  nextActionClear: boolean
}

export interface Task {
  id: string
  title: string
  /** 目的: 何のため */
  purpose: string
  /** 完成形: どんな形で出す */
  deliverable: string
  /** 期限(YYYY-MM-DD)。未定も許可 */
  deadline?: string
  questions: Question[]
  status: TaskStatus
  submitCheck: SubmitCheck
  createdAt: string
  updatedAt: string
}

export type MemoType = 'soraamekasa' | 'free'

export interface Memo {
  id: string
  /** 任意でタスクに紐付け */
  taskId?: string
  type: MemoType
  /** 空: 事実 */
  fact?: string
  /** 雨: 解釈 */
  interpretation?: string
  /** 傘: 行動 */
  action?: string
  /** 自由メモ用 */
  body?: string
  createdAt: string
  updatedAt: string
}

/** JSON書き出し/読み込み(F5)の形式 */
export interface BackupFile {
  app: 'tool'
  version: 1
  exportedAt: string
  tasks: Task[]
  memos: Memo[]
}

export const EMPTY_SUBMIT_CHECK: SubmitCheck = {
  answersPurpose: false,
  conclusionIn10s: false,
  nextActionClear: false,
}

/** 未解決の疑問が1件でもあれば「要確認」 */
export function needsConfirmation(task: Task): boolean {
  return task.questions.some((q) => !q.resolved)
}
