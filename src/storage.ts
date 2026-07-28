import { invoke } from '@tauri-apps/api/core'
import type { Memo, Task } from './types'

/** ディスクに置くファイルの形。バックアップJSONと同じ構造にしてある */
export interface PersistedData {
  app: 'tool'
  version: 1
  tasks: Task[]
  memos: Memo[]
}

export const EMPTY_DATA: PersistedData = { app: 'tool', version: 1, tasks: [], memos: [] }

/** %APPDATA%\jp.temmie0232.tool\data.json を読む。未作成なら空データ */
export async function loadData(): Promise<PersistedData> {
  const raw = await invoke<string | null>('load_data')
  if (!raw) return EMPTY_DATA
  const parsed = JSON.parse(raw) as Partial<PersistedData>
  return {
    app: 'tool',
    version: 1,
    tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
    memos: Array.isArray(parsed.memos) ? parsed.memos : [],
  }
}

export async function saveData(tasks: Task[], memos: Memo[]): Promise<void> {
  const data: PersistedData = { app: 'tool', version: 1, tasks, memos }
  await invoke('save_data', { contents: JSON.stringify(data, null, 2) })
}

export function dataFilePath(): Promise<string> {
  return invoke<string>('data_file_path')
}

export function writeTextFile(path: string, contents: string): Promise<void> {
  return invoke('write_text_file', { path, contents })
}

export function readTextFile(path: string): Promise<string> {
  return invoke<string>('read_text_file', { path })
}
