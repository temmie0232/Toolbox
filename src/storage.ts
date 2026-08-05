import { invoke } from '@tauri-apps/api/core'
import type { Brainstorm, Meeting, Memo, Task } from './types'

/** ディスクに置くファイルの形。バックアップJSONと同じ構造 + アプリの運用メタ情報 */
export interface PersistedData {
  app: 'tool'
  version: 1
  tasks: Task[]
  memos: Memo[]
  meetings?: Meeting[]
  brainstorms?: Brainstorm[]
  meta?: {
    /** 最後にJSONバックアップを書き出した日時(放置検知に使う) */
    lastBackupAt?: string
  }
}

export interface LoadedData {
  tasks: Task[]
  memos: Memo[]
  meetings: Meeting[]
  brainstorms: Brainstorm[]
  lastBackupAt?: string
}

/** %APPDATA%\jp.temmie0232.tool\data.json を読む。未作成なら空データ */
export async function loadData(): Promise<LoadedData> {
  const raw = await invoke<string | null>('load_data')
  if (!raw) return { tasks: [], memos: [], meetings: [], brainstorms: [] }
  const parsed = JSON.parse(raw) as Partial<PersistedData>
  // ファイルはあるのに形が違う = 壊れている。空扱いにすると次の保存で
  // 上書きしてしまうので、ここで止める(エラー画面になり、UIは操作できない)
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !Array.isArray(parsed.tasks) ||
    !Array.isArray(parsed.memos)
  ) {
    throw new Error(
      'data.json の形式が壊れています。ファイルは書き換えずに残してあるので、' +
        '中身を確認するか、バックアップJSONから復元してください',
    )
  }
  return {
    tasks: parsed.tasks,
    memos: parsed.memos,
    // 議事録・ブレストは後から足したので、古いファイルには無い
    meetings: Array.isArray(parsed.meetings) ? parsed.meetings : [],
    brainstorms: Array.isArray(parsed.brainstorms) ? parsed.brainstorms : [],
    lastBackupAt:
      typeof parsed.meta?.lastBackupAt === 'string' ? parsed.meta.lastBackupAt : undefined,
  }
}

export async function saveData(
  tasks: Task[],
  memos: Memo[],
  meetings: Meeting[],
  brainstorms: Brainstorm[],
  lastBackupAt?: string,
): Promise<void> {
  const data: PersistedData = {
    app: 'tool',
    version: 1,
    tasks,
    memos,
    meetings,
    brainstorms,
    meta: lastBackupAt ? { lastBackupAt } : undefined,
  }
  await invoke('save_data', { contents: JSON.stringify(data, null, 2) })
}

export function dataFilePath(): Promise<string> {
  return invoke<string>('data_file_path')
}

/** データフォルダをエクスプローラーで開く */
export function openDataDir(): Promise<void> {
  return invoke('open_data_dir')
}

/** ウィンドウを隠す(常駐は続く) */
export function hideWindow(): Promise<void> {
  return invoke('hide_window')
}

/** 常駐ごと終了する */
export function quitApp(): Promise<void> {
  return invoke('quit_app')
}

/** 常に前面に置く / やめる(起動時の状態復元に使う。切り替えは Ctrl+Alt+P) */
export function setAlwaysOnTop(value: boolean): Promise<void> {
  return invoke('set_always_on_top', { value })
}

/** 録音ファイルを消す(議事録を削除したときに呼ぶ) */
export function deleteRecording(fileName: string): Promise<void> {
  return invoke('delete_recording', { fileName })
}

/**
 * メモに貼った画像を保存する。返るのは実際に使われたファイル名。
 * 本文にはこの名前を印として埋めるので、Rust側で名前が整えられた場合はそちらに合わせる
 */
export function saveImage(fileName: string, dataBase64: string): Promise<string> {
  return invoke<string>('save_image', { fileName, dataBase64 })
}

export function readImage(fileName: string): Promise<ArrayBuffer | number[]> {
  return invoke<ArrayBuffer | number[]>('read_image', { fileName })
}

export function deleteImage(fileName: string): Promise<void> {
  return invoke('delete_image', { fileName })
}

export function writeTextFile(path: string, contents: string): Promise<void> {
  return invoke('write_text_file', { path, contents })
}

export function readTextFile(path: string): Promise<string> {
  return invoke<string>('read_text_file', { path })
}
