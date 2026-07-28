import { open, save } from '@tauri-apps/plugin-dialog'
import { readTextFile, writeTextFile } from '../storage'
import {
  TASK_STATUS_ORDER,
  type BackupFile,
  type Memo,
  type MemoType,
  type Task,
  type TaskStatus,
} from '../types'

export function backupFileName(date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  const stamp = `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}-${p(date.getHours())}${p(date.getMinutes())}`
  return `tool-backup-${stamp}.json`
}

/** 保存ダイアログを出してJSONを書き出す。キャンセルされたら null */
export async function exportBackup(tasks: Task[], memos: Memo[]): Promise<string | null> {
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
  }
  await writeTextFile(path, JSON.stringify(data, null, 2))
  return path
}

/** 開くダイアログを出してJSONを読む。キャンセルされたら null */
export async function pickBackup(): Promise<{ path: string; tasks: Task[]; memos: Memo[] } | null> {
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
  return value === 'soraamekasa' || value === 'free'
}

/**
 * 読み込んだJSONを検証して正規化する。
 * 壊れたファイルで既存データを吹き飛ばさないよう、ここで弾く。
 */
export function parseBackup(text: string): { tasks: Task[]; memos: Memo[] } {
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
      body: typeof m.body === 'string' ? m.body : undefined,
      createdAt: str(m.createdAt, new Date().toISOString()),
      updatedAt: str(m.updatedAt, str(m.createdAt, new Date().toISOString())),
    }
  })

  return { tasks, memos }
}
