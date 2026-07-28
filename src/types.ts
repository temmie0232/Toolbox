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

export type MemoType = 'soraamekasa' | 'conclusion' | 'free'

export const MEMO_TYPE_LABEL: Record<MemoType, string> = {
  soraamekasa: '空雨傘',
  conclusion: '結論ファースト',
  free: '自由',
}

/** 結論ファーストの根拠は3つに固定する。増やすと結局まとまらないため */
export const REASON_COUNT = 3

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
  /** 結論ファースト: 結論1行 */
  conclusion?: string
  /** 結論ファースト: 根拠3つ */
  reasons?: string[]
  /** 自由メモ / 結論ファーストの肉付け */
  body?: string
  createdAt: string
  updatedAt: string
}

/**
 * 議事録のブロック。決定・TODO・論点の3種だけ。
 * 逐語録は書かない。発言を全部追おうとすると追いつかなくなるため。
 */
export type MinuteKind = 'decision' | 'todo' | 'issue'

export const MINUTE_KIND_LABEL: Record<MinuteKind, string> = {
  decision: '決定',
  todo: 'TODO',
  issue: '論点',
}

export const MINUTE_KIND_ORDER: MinuteKind[] = ['decision', 'todo', 'issue']

export interface MinuteBlock {
  id: string
  kind: MinuteKind
  text: string
  /** TODO: 担当 */
  assignee?: string
  /** TODO: 期限(YYYY-MM-DD) */
  due?: string
  /** TODO: 完了したか / 論点: 決着したか */
  done?: boolean
  /** TODOから作ったタスクのid。二重に作らないための印 */
  taskId?: string
  /** 録音開始からの経過ミリ秒。録音していなければ undefined */
  offsetMs?: number
  createdAt: string
}

export interface Recording {
  /** 音声ファイル名(録音フォルダ内) */
  fileName: string
  /** 録音を開始した時刻 */
  startedAt: string
  durationMs?: number
  mimeType: string
}

export interface Meeting {
  id: string
  title: string
  /** 会議の日時(ISO) */
  startedAt: string
  /** 参加者。個人用なので自由記述でよい */
  participants: string
  blocks: MinuteBlock[]
  recording?: Recording
  createdAt: string
  updatedAt: string
}

/**
 * ブレスト。批判を止めて量を出すための箱。
 * 出し切ってからKJ法でグループにまとめる、という順序を画面で強制する。
 */
export interface BrainCard {
  id: string
  text: string
  /** まとめたグループ名。未分類は undefined */
  group?: string
  createdAt: string
}

export interface Brainstorm {
  id: string
  theme: string
  /** 制限時間(分) */
  limitMinutes: number
  /** 計測を始めた時刻。押すまでは undefined */
  startedAt?: string
  cards: BrainCard[]
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
  /** v0.1のバックアップには無い */
  meetings?: Meeting[]
  brainstorms?: Brainstorm[]
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

/** 一覧に出す議事録の1行要約 */
export function meetingSummary(meeting: Meeting): string {
  const counts = MINUTE_KIND_ORDER.map((kind) => {
    const n = meeting.blocks.filter((b) => b.kind === kind).length
    return n > 0 ? `${MINUTE_KIND_LABEL[kind]}${n}` : ''
  }).filter(Boolean)
  return counts.length > 0 ? counts.join(' / ') : '空'
}
