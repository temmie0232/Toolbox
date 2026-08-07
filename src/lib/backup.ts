import { open, save } from '@tauri-apps/plugin-dialog'
import { readTextFile, writeTextFile } from '../storage'
import {
  CONCEPT_STATUS_ORDER,
  MINUTE_KIND_ORDER,
  TASK_STATUS_ORDER,
  type BackupFile,
  type Concept,
  type ConceptStatus,
  type Meeting,
  type Memo,
  type MemoType,
  type MinuteBlock,
  type MinuteKind,
  type Report,
  type Task,
  type TaskStatus,
} from '../types'

export function backupFileName(date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  const stamp = `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}-${p(date.getHours())}${p(date.getMinutes())}`
  return `tool-backup-${stamp}.json`
}

/** 保存ダイアログを出してJSONを書き出す。キャンセルされたら null */
export async function exportBackup(
  tasks: Task[],
  memos: Memo[],
  meetings: Meeting[],
  concepts: Concept[],
): Promise<string | null> {
  const path = await save({
    title: 'バックアップの保存先',
    defaultPath: backupFileName(),
    filters: [{ name: 'JSON', extensions: ['json'] }],
  })
  if (!path) return null
  const data: BackupFile = {
    app: 'tool',
    version: 1,
    exportedAt: new Date().toISOString(),
    tasks,
    memos,
    meetings,
    concepts,
  }
  await writeTextFile(path, JSON.stringify(data, null, 2))
  return path
}

export interface PickedBackup {
  path: string
  tasks: Task[]
  memos: Memo[]
  meetings: Meeting[]
  concepts: Concept[]
}

/** 開くダイアログを出してJSONを読む。キャンセルされたら null */
export async function pickBackup(): Promise<PickedBackup | null> {
  const selected = await open({
    title: 'バックアップファイルを選ぶ',
    multiple: false,
    directory: false,
    filters: [{ name: 'JSON', extensions: ['json'] }],
  })
  if (!selected || Array.isArray(selected)) return null
  const text = await readTextFile(selected)
  return { path: selected, ...parseBackup(text) }
}

export class BackupParseError extends Error {}

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function bool(value: unknown): boolean {
  return value === true
}

function isStatus(value: unknown): value is TaskStatus {
  return typeof value === 'string' && (TASK_STATUS_ORDER as string[]).includes(value)
}

function isMemoType(value: unknown): value is MemoType {
  return value === 'soraamekasa' || value === 'conclusion' || value === 'free'
}

function isMinuteKind(value: unknown): value is MinuteKind {
  return typeof value === 'string' && (MINUTE_KIND_ORDER as string[]).includes(value)
}

function isConceptStatus(value: unknown): value is ConceptStatus {
  return typeof value === 'string' && (CONCEPT_STATUS_ORDER as string[]).includes(value)
}

function optionalStr(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined
}

/**
 * 読み込んだJSONを検証して正規化する。
 * 壊れたファイルで既存データを吹き飛ばさないよう、ここで弾く。
 */
export function parseBackup(text: string): {
  tasks: Task[]
  memos: Memo[]
  meetings: Meeting[]
  concepts: Concept[]
} {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new BackupParseError('JSONとして読めませんでした')
  }
  if (typeof raw !== 'object' || raw === null) {
    throw new BackupParseError('中身がバックアップの形式ではありません')
  }
  const data = raw as Partial<BackupFile>
  if (!Array.isArray(data.tasks) || !Array.isArray(data.memos)) {
    throw new BackupParseError('tasks / memos が見つかりません')
  }

  const tasks: Task[] = data.tasks.map((item, index) => {
    const t = item as Partial<Task>
    if (typeof t.id !== 'string') {
      throw new BackupParseError(`${index + 1}件目のタスクにidがありません`)
    }
    return {
      id: t.id,
      title: str(t.title, '(無題)'),
      purpose: str(t.purpose),
      deliverable: str(t.deliverable),
      deadline: typeof t.deadline === 'string' && t.deadline ? t.deadline : undefined,
      questions: Array.isArray(t.questions)
        ? t.questions
            .filter((q): q is Task['questions'][number] => typeof q?.id === 'string')
            .map((q) => ({ id: q.id, text: str(q.text), resolved: bool(q.resolved) }))
        : [],
      status: isStatus(t.status) ? t.status : 'received',
      submitCheck: {
        answersPurpose: bool(t.submitCheck?.answersPurpose),
        conclusionIn10s: bool(t.submitCheck?.conclusionIn10s),
        nextActionClear: bool(t.submitCheck?.nextActionClear),
      },
      // 報告は後から足した項目なので、無いバックアップも受け付ける
      reports: Array.isArray(t.reports)
        ? t.reports
            .filter((r): r is Report => typeof (r as Partial<Report>)?.id === 'string')
            .map((r) => ({
              id: r.id,
              kind: r.kind === 'final' ? 'final' : 'progress',
              conclusion: str(r.conclusion),
              result: str(r.result),
              plan: str(r.plan),
              decisions: str(r.decisions),
              verified: str(r.verified),
              concerns: str(r.concerns),
              requests: str(r.requests),
              createdAt: str(r.createdAt, new Date().toISOString()),
              updatedAt: str(r.updatedAt, str(r.createdAt, new Date().toISOString())),
            }))
        : undefined,
      notes: optionalStr(t.notes),
      createdAt: str(t.createdAt, new Date().toISOString()),
      updatedAt: str(t.updatedAt, str(t.createdAt, new Date().toISOString())),
    }
  })

  const taskIds = new Set(tasks.map((t) => t.id))

  const memos: Memo[] = data.memos.map((item, index) => {
    const m = item as Partial<Memo>
    if (typeof m.id !== 'string') {
      throw new BackupParseError(`${index + 1}件目のメモにidがありません`)
    }
    return {
      id: m.id,
      // 存在しないタスクへの紐付けは落とす
      taskId: typeof m.taskId === 'string' && taskIds.has(m.taskId) ? m.taskId : undefined,
      type: isMemoType(m.type) ? m.type : 'free',
      fact: typeof m.fact === 'string' ? m.fact : undefined,
      interpretation: typeof m.interpretation === 'string' ? m.interpretation : undefined,
      action: typeof m.action === 'string' ? m.action : undefined,
      conclusion: typeof m.conclusion === 'string' ? m.conclusion : undefined,
      reasons: Array.isArray(m.reasons)
        ? m.reasons.filter((r): r is string => typeof r === 'string')
        : undefined,
      body: typeof m.body === 'string' ? m.body : undefined,
      createdAt: str(m.createdAt, new Date().toISOString()),
      updatedAt: str(m.updatedAt, str(m.createdAt, new Date().toISOString())),
    }
  })

  // 議事録は後から足した項目なので、無いバックアップも受け付ける
  const rawMeetings = Array.isArray(data.meetings) ? data.meetings : []
  const meetings: Meeting[] = rawMeetings.map((item, index) => {
    const m = item as Partial<Meeting>
    if (typeof m.id !== 'string') {
      throw new BackupParseError(`${index + 1}件目の議事録にidがありません`)
    }
    const blocks: MinuteBlock[] = Array.isArray(m.blocks)
      ? m.blocks
          .filter((b): b is MinuteBlock => typeof b?.id === 'string')
          .map((b) => ({
            id: b.id,
            kind: isMinuteKind(b.kind) ? b.kind : 'issue',
            text: str(b.text),
            assignee: optionalStr(b.assignee),
            due: optionalStr(b.due),
            done: bool(b.done),
            // 消えたタスクへの参照は落とす
            taskId:
              typeof b.taskId === 'string' && taskIds.has(b.taskId) ? b.taskId : undefined,
            offsetMs: typeof b.offsetMs === 'number' ? b.offsetMs : undefined,
            createdAt: str(b.createdAt, new Date().toISOString()),
          }))
      : []
    return {
      id: m.id,
      title: str(m.title, '(無題)'),
      startedAt: str(m.startedAt, str(m.createdAt, new Date().toISOString())),
      participants: str(m.participants),
      blocks,
      recording:
        m.recording && typeof m.recording.fileName === 'string'
          ? {
              fileName: m.recording.fileName,
              startedAt: str(m.recording.startedAt, new Date().toISOString()),
              durationMs:
                typeof m.recording.durationMs === 'number' ? m.recording.durationMs : undefined,
              mimeType: str(m.recording.mimeType, 'audio/webm'),
            }
          : undefined,
      createdAt: str(m.createdAt, new Date().toISOString()),
      updatedAt: str(m.updatedAt, str(m.createdAt, new Date().toISOString())),
    }
  })

  // 概念は後から足した項目なので、無いバックアップも受け付ける
  const rawConcepts = Array.isArray(data.concepts) ? data.concepts : []
  const concepts: Concept[] = rawConcepts.map((item, index) => {
    const c = item as Partial<Concept>
    if (typeof c.id !== 'string') {
      throw new BackupParseError(`${index + 1}件目の概念にidがありません`)
    }
    const explanation = str(c.explanation)
    const status = isConceptStatus(c.status) ? c.status : 'captured'
    return {
      id: c.id,
      name: str(c.name, '(無名)'),
      // 存在しないタスクへの紐付けは落とす
      taskId: typeof c.taskId === 'string' && taskIds.has(c.taskId) ? c.taskId : undefined,
      briefing: str(c.briefing),
      explanation,
      gaps: str(c.gaps),
      // 説明が無いのに「説明できる」は名乗らせない(手で書き換えられた値も届きうる)
      status: status === 'explainable' && !explanation.trim() ? 'fuzzy' : status,
      createdAt: str(c.createdAt, new Date().toISOString()),
      updatedAt: str(c.updatedAt, str(c.createdAt, new Date().toISOString())),
    }
  })

  // ブレストは廃止した。古いバックアップに brainstorms が入っていても読み飛ばす
  return { tasks, memos, meetings, concepts }
}
