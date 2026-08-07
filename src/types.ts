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

/** 報告の種類。30%時点の方向性確認と、終わったあとの結果報告では話す中身が違う */
export type ReportKind = 'progress' | 'final'

export const REPORT_KIND_LABEL: Record<ReportKind, string> = {
  progress: '中間報告',
  final: '完了報告',
}

/**
 * 上司への報告1回分。箱を上から埋めると、そのまま報告で話す順になる。
 * 空の箱は「まだ考えていない死角」として見せるのが役目なので、
 * 該当が無い箱には「なし」と書いて空欄と区別する。
 * 種類を切り替えても書いた中身は消さない(メモのテンプレ切替と同じ)。
 */
export interface Report {
  id: string
  kind: ReportKind
  /** 結論1行。中間=いまどこまで来たか / 完了=どうなったか */
  conclusion: string
  /** 結果。できているもの・どこを見れば確認できるか */
  result: string
  /** これからの方針(中間でのみ表示) */
  plan: string
  /** 指示に無かった自分の判断とその理由。黙って仕様と違うことをした事故を防ぐ */
  decisions: string
  /** 確認した範囲。テスト・チェックをどこまでやったか(完了でのみ表示) */
  verified: string
  /** 残課題・懸念。言いそびれて後で発覚するのを防ぐ */
  concerns: string
  /** 相手にしてほしいこと。報告したのに何も進まないのを防ぐ */
  requests: string
  createdAt: string
  updatedAt: string
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
  /** 上司への報告の下書き(30%確認〜完了まで複数積める)。後から足したので古いデータには無い */
  reports?: Report[]
  /**
   * 作業メモ。メモを1件立てるほどでもない走り書き(経緯・作業ログ)をタスクに直接残す。
   * 整理された思考(空雨傘・結論ファースト)や画像は、従来どおり紐付きメモの役目。
   * 後から足したので古いデータには無い
   */
  notes?: string
  createdAt: string
  updatedAt: string
}

/**
 * 概念の理解度。チェックボックスの自己申告にすると「わかった気」で錯覚するので、
 * 「説明できる」へは自分の言葉の説明(explanation)が書けているときだけ上げられる。
 * その判定は canExplain が持つ。
 */
export type ConceptStatus = 'captured' | 'fuzzy' | 'explainable'

export const CONCEPT_STATUS_LABEL: Record<ConceptStatus, string> = {
  captured: '未着手',
  fuzzy: 'ふわっと',
  explainable: '説明できる',
}

export const CONCEPT_STATUS_ORDER: ConceptStatus[] = ['captured', 'fuzzy', 'explainable']

/**
 * わからない概念1つ分の受信箱。AI駆動で成果物だけが先に進み、
 * 「知らないものの塊」が積み上がる(理解負債)のを、まず見える化して止める。
 * 作業中は名前だけ放り込み、すきま時間に説明の箱を自分の言葉で埋める。
 */
export interface Concept {
  id: string
  /** 概念の名前。例: 総合テスト */
  name: string
  /** 出どころ。どのタスクで出てきたか(任意) */
  taskId?: string
  /** 30秒説明。上司に「これ何?」と聞かれたときに言う1行 */
  briefing: string
  /** 自分の言葉での説明。ここが埋まらない = まだ理解していない(Feynman法) */
  explanation: string
  /** まだ分からない点。次にAIに聞くことリストになる */
  gaps: string
  status: ConceptStatus
  createdAt: string
  updatedAt: string
}

/** 「説明できる」に上げてよいか。自分の言葉の説明が書けているかで判定する */
export function canExplain(concept: Pick<Concept, 'explanation'>): boolean {
  return concept.explanation.trim().length > 0
}

/**
 * タスクに紐付いた、まだ説明できない概念。報告前の死角として見せる。
 * status だけでなく説明の中身も見る — 「説明できる」に上げたあと説明を消した概念を、
 * 一番危ないやつとして取りこぼさないため
 */
export function unexplainedConcepts(concepts: Concept[], taskId: string): Concept[] {
  return concepts.filter(
    (c) => c.taskId === taskId && (c.status !== 'explainable' || !canExplain(c)),
  )
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

/** JSON書き出し/読み込み(F5)の形式 */
export interface BackupFile {
  app: 'tool'
  version: 1
  exportedAt: string
  tasks: Task[]
  memos: Memo[]
  /** v0.1のバックアップには無い */
  meetings?: Meeting[]
  /** 概念より前のバックアップには無い */
  concepts?: Concept[]
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

/** 一覧と削除確認に出す報告の1行要約 */
export function reportSummary(report: Report): string {
  return report.conclusion || '(結論未記入)'
}

/** 一覧に出す議事録の1行要約 */
export function meetingSummary(meeting: Meeting): string {
  const counts = MINUTE_KIND_ORDER.map((kind) => {
    const n = meeting.blocks.filter((b) => b.kind === kind).length
    return n > 0 ? `${MINUTE_KIND_LABEL[kind]}${n}` : ''
  }).filter(Boolean)
  return counts.length > 0 ? counts.join(' / ') : '空'
}
