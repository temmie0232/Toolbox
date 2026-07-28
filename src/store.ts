import { useSyncExternalStore } from 'react'
import { newId, now } from './lib/id'
import { loadData, saveData } from './storage'
import { EMPTY_SUBMIT_CHECK, type Memo, type MemoType, type Task } from './types'

export interface StoreState {
  status: 'loading' | 'ready' | 'error'
  error?: string
  /** ファイル書き込みの失敗。画面上部のバナーで知らせ、再試行できるようにする */
  saveError?: string
  tasks: Task[]
  memos: Memo[]
  /** 最後にJSONバックアップを書き出した日時。長く空くと歯車に印を出す */
  lastBackupAt?: string
}

let state: StoreState = { status: 'loading', tasks: [], memos: [] }
const listeners = new Set<() => void>()

function set(patch: Partial<StoreState>): void {
  state = { ...state, ...patch }
  for (const listener of listeners) listener()
}

function subscribe(callback: () => void): () => void {
  listeners.add(callback)
  return () => {
    listeners.delete(callback)
  }
}

export function useStore(): StoreState {
  return useSyncExternalStore(subscribe, () => state)
}

/**
 * ファイル書き込みは1本の列に並べる。
 * 並行して走らせると、古いスナップショットが後から着地して直前の変更を消してしまう。
 */
let saveChain: Promise<unknown> = Promise.resolve()

function queueSave(): Promise<void> {
  // 実行時点の最新stateを書くので、連続操作は自然にまとめられる
  const run = saveChain.then(() => saveData(state.tasks, state.memos, state.lastBackupAt))
  // 失敗は画面のどこにいても見えるように、グローバルに記録する
  // (自動保存化により、画面遷移後に失敗が返ってくることがあるため)
  saveChain = run.then(
    () => {
      if (state.saveError) set({ saveError: undefined })
    },
    (e) => {
      set({ saveError: e instanceof Error ? e.message : String(e) })
    },
  )
  return run
}

/** 保存失敗バナーからの再試行 */
export function retrySave(): Promise<void> {
  return queueSave()
}

export function getSaveError(): string | undefined {
  return state.saveError
}

type Draft = { tasks: Task[]; memos: Memo[] }

/**
 * 変更は必ずこれを通す。最新のstateから次のstateを作り、先にメモリを更新してから書き込む。
 * 「読んで → awaitして → 書き戻す」をやると、その隙間に入った操作が消える。
 */
async function commit(update: (draft: Draft) => Partial<Draft>): Promise<void> {
  const next = update({ tasks: state.tasks, memos: state.memos })
  set({ tasks: next.tasks ?? state.tasks, memos: next.memos ?? state.memos })
  await queueSave()
}

let initialized = false

export async function initStore(): Promise<void> {
  if (initialized) return
  initialized = true
  await reload()
}

export async function reload(): Promise<void> {
  try {
    const data = await loadData()
    set({
      status: 'ready',
      error: undefined,
      tasks: data.tasks,
      memos: data.memos,
      lastBackupAt: data.lastBackupAt,
    })
  } catch (e) {
    set({ status: 'error', error: e instanceof Error ? e.message : String(e) })
  }
}

// ---- タスク ----

export type NewTaskInput = Pick<Task, 'title' | 'purpose' | 'deliverable'> & {
  deadline?: string
  questionTexts?: string[]
}

export async function createTask(input: NewTaskInput): Promise<Task> {
  const timestamp = now()
  const task: Task = {
    id: newId(),
    title: input.title.trim(),
    purpose: input.purpose,
    deliverable: input.deliverable,
    deadline: input.deadline || undefined,
    questions: (input.questionTexts ?? [])
      .map((text) => text.trim())
      .filter(Boolean)
      .map((text) => ({ id: newId(), text, resolved: false })),
    status: 'received',
    submitCheck: { ...EMPTY_SUBMIT_CHECK },
    createdAt: timestamp,
    updatedAt: timestamp,
  }
  await commit(({ tasks }) => ({ tasks: [...tasks, task] }))
  return task
}

export function updateTask(
  id: string,
  patch: Partial<Omit<Task, 'id' | 'createdAt'>>,
): Promise<void> {
  return updateTaskWith(id, () => patch)
}

/**
 * 直前のstateから差分を作る版。
 * チェックの付け外しのように「今の値」を元に更新するものは必ずこちらを使う
 * (画面が持っているtaskは1つ前のものかもしれないため)。
 */
export function updateTaskWith(
  id: string,
  makePatch: (task: Task) => Partial<Omit<Task, 'id' | 'createdAt'>>,
): Promise<void> {
  return commit(({ tasks }) => {
    const current = tasks.find((t) => t.id === id)
    if (!current) return {}
    const next: Task = { ...current, ...makePatch(current), updatedAt: now() }
    return { tasks: tasks.map((t) => (t.id === id ? next : t)) }
  })
}

export function removeTask(id: string): Promise<void> {
  // 紐付いていたメモは消さず、紐付けだけ外す
  return commit(({ tasks, memos }) => ({
    tasks: tasks.filter((t) => t.id !== id),
    memos: memos.map((m) => (m.taskId === id ? { ...m, taskId: undefined } : m)),
  }))
}

// ---- メモ ----

export type NewMemoInput = {
  type: MemoType
  taskId?: string
  fact?: string
  interpretation?: string
  action?: string
  body?: string
}

export async function createMemo(input: NewMemoInput): Promise<Memo> {
  const timestamp = now()
  const memo: Memo = {
    id: newId(),
    taskId: input.taskId || undefined,
    type: input.type,
    fact: input.fact,
    interpretation: input.interpretation,
    action: input.action,
    body: input.body,
    createdAt: timestamp,
    updatedAt: timestamp,
  }
  await commit(({ memos }) => ({ memos: [...memos, memo] }))
  return memo
}

export function updateMemo(
  id: string,
  patch: Partial<Omit<Memo, 'id' | 'createdAt'>>,
): Promise<void> {
  return commit(({ memos }) => {
    const current = memos.find((m) => m.id === id)
    if (!current) return {}
    const next: Memo = { ...current, ...patch, updatedAt: now() }
    return { memos: memos.map((m) => (m.id === id ? next : m)) }
  })
}

export function removeMemo(id: string): Promise<void> {
  return commit(({ memos }) => ({ memos: memos.filter((m) => m.id !== id) }))
}

// ---- バックアップ(F5)----

export function replaceAllData(tasks: Task[], memos: Memo[]): Promise<void> {
  return commit(() => ({ tasks, memos }))
}

export function clearAllData(): Promise<void> {
  return commit(() => ({ tasks: [], memos: [] }))
}

/** バックアップを書き出した(または読み込んだ)ことを記録する */
export function markBackedUp(): Promise<void> {
  set({ lastBackupAt: now() })
  return queueSave()
}

// ---- 閉じる前の書き残し回収 ----
// 編集画面は自動保存(0.7秒デバウンス)なので、×ボタンの瞬間に未書き込みが残りうる。
// 各編集画面がここにflushを登録し、ウィンドウを閉じる直前に呼び切る。

const pendingFlushes = new Set<() => Promise<unknown>>()

export function registerFlush(flush: () => Promise<unknown>): () => void {
  pendingFlushes.add(flush)
  return () => {
    pendingFlushes.delete(flush)
  }
}

export async function flushAllEdits(): Promise<void> {
  await Promise.all([...pendingFlushes].map((f) => f().catch(() => undefined)))
  await saveChain.catch(() => undefined)
}

// ---- 新規作成フォームの書きかけ検知 ----
// 新規作成は明示保存だが、書きかけ中に画面切替キーで飛ぶと入力が消える。
// フォームが「書きかけあり」を登録しておき、Layoutのナビゲーションはそれを見て止まる。

const draftGuards = new Set<() => boolean>()

export function registerDraftGuard(isDirty: () => boolean): () => void {
  draftGuards.add(isDirty)
  return () => {
    draftGuards.delete(isDirty)
  }
}

export function hasBlockingDraft(): boolean {
  return [...draftGuards].some((isDirty) => isDirty())
}
