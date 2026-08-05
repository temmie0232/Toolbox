import { useCallback, useEffect, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ConfirmBadge, StatusBadge } from '../components/Badges'
import { GuiButton } from '../components/GuiButton'
import { daysUntil, deadlineLabel } from '../lib/date'
import { useGuiMode } from '../lib/guiMode'
import { useInitialMode } from '../lib/mode'
import { useNumberShortcuts, useShortcuts } from '../lib/useShortcuts'
import { updateTaskWith, useStore } from '../store'
import { TASK_STATUS_ORDER, needsConfirmation, type Task, type TaskStatus } from '../types'

/** 期限順(未定は末尾)。同じ期限なら作成が古い方を上に */
function byDeadline(a: Task, b: Task): number {
  if (a.deadline && b.deadline) {
    if (a.deadline !== b.deadline) return a.deadline < b.deadline ? -1 : 1
  } else if (a.deadline) {
    return -1
  } else if (b.deadline) {
    return 1
  }
  return a.createdAt < b.createdAt ? -1 : 1
}

export function TaskList() {
  const { status, tasks } = useStore()
  const navigate = useNavigate()
  const gui = useGuiMode()
  useInitialMode('normal')

  const { open, done } = useMemo(() => {
    const open = tasks.filter((t) => t.status !== 'done').sort(byDeadline)
    const done = tasks
      .filter((t) => t.status === 'done')
      .sort((a, b) => (a.updatedAt > b.updatedAt ? -1 : 1))
    return { open, done }
  }, [tasks])

  /**
   * いま乗っている行のタスクID。
   * 詳細を開いてステータスを変えて戻る往復が一番の無駄なので、一覧から直に触れるようにする。
   */
  const focusedTaskId = useCallback((): string | undefined => {
    const el = document.activeElement
    if (!(el instanceof HTMLElement)) return undefined
    return el.closest('[data-task-id]')?.getAttribute('data-task-id') ?? undefined
  }, [])

  // 書き込みの失敗は store が拾って上部のバナーに出す。ここで握り潰しても黙りはしない
  const write = (work: Promise<void>) => void work.catch(() => undefined)

  const openNew = useCallback(() => navigate('/tasks/new'), [navigate])

  // GUIモードの行ボタンとキーボードの両方から呼ぶので、対象のidを引数に取る形にしておく
  const applyStatus = useCallback(
    (id: string, next: TaskStatus) => write(updateTaskWith(id, () => ({ status: next }))),
    [],
  )
  const toggleDone = useCallback(
    (id: string) =>
      write(
        updateTaskWith(id, (t) => ({ status: t.status === 'done' ? 'in_progress' : 'done' })),
      ),
    [],
  )

  const setStatus = useCallback(
    (next: TaskStatus) => {
      const id = focusedTaskId()
      if (id) applyStatus(id, next)
    },
    [focusedTaskId, applyStatus],
  )

  const shortcuts = useMemo(
    () => ({
      o: openNew,
      // x: 完了 ⇄ 作業中 の行き来。一覧で片付ける動作は連打になるので1キーにする
      x: () => {
        const id = focusedTaskId()
        if (id) toggleDone(id)
      },
    }),
    [openNew, focusedTaskId, toggleDone],
  )
  useShortcuts(shortcuts)

  // Ctrl+1〜4 で、乗っている行のステータスを直接変える(詳細画面と同じ並び)
  const statusHandlers = useMemo(
    () => TASK_STATUS_ORDER.map((s) => () => setStatus(s)),
    [setStatus],
  )
  useNumberShortcuts(statusHandlers)

  // 詳細から戻ってきたら、さっき見ていた行にフォーカスを戻す(j/kで続きから動ける)
  useEffect(() => {
    if (status !== 'ready') return
    const id = sessionStorage.getItem('tool:lastTaskId')
    if (!id) return
    sessionStorage.removeItem('tool:lastTaskId')
    const row = document.querySelector<HTMLAnchorElement>(`a[data-task-id="${id}"]`)
    if (!row) return
    // 完了セクションの中にいるなら、開いてからフォーカスする
    if (row.offsetParent === null) {
      const details = row.closest('details')
      if (details) details.open = true
    }
    row.focus()
  }, [status])

  return (
    <div className="space-y-6">
      {gui && (
        <div className="flex justify-end">
          <GuiButton label="新規" hint="o" variant="primary" onClick={openNew} />
        </div>
      )}

      {status === 'loading' && <p className="text-sm text-neutral-500">読み込み中…</p>}

      {status === 'ready' && open.length === 0 && done.length === 0 && (
        <div className="rounded-lg border border-dashed border-neutral-300 px-6 py-12 text-center">
          <p className="text-sm text-neutral-600">まだタスクがありません。</p>
          <p className="mt-1 text-xs text-neutral-500">
            タスクを振られたら、席に戻ってすぐ <kbd>Shift</kbd> <kbd>T</kbd> で4つの箱を埋める。
          </p>
        </div>
      )}

      {open.length > 0 && (
        <ul className="divide-y divide-neutral-100 border-y border-neutral-100">
          {open.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              gui={gui}
              onToggleDone={toggleDone}
              onCycleStatus={(id) => applyStatus(id, nextTaskStatus(task.status))}
            />
          ))}
        </ul>
      )}

      {done.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer text-sm text-neutral-500 hover:text-neutral-800">
            完了 {done.length}件
          </summary>
          <ul className="mt-2 divide-y divide-neutral-100 border-y border-neutral-100">
            {done.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                gui={gui}
                onToggleDone={toggleDone}
                onCycleStatus={(id) => applyStatus(id, nextTaskStatus(task.status))}
              />
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}

/** Ctrl+1〜4 のマウス版。行のボタンは4つ並べず、1つ押すたびに次のステータスへ送る */
function nextTaskStatus(current: TaskStatus): TaskStatus {
  const i = TASK_STATUS_ORDER.indexOf(current)
  return TASK_STATUS_ORDER[(i + 1) % TASK_STATUS_ORDER.length]
}

interface TaskRowProps {
  task: Task
  gui: boolean
  onToggleDone: (id: string) => void
  onCycleStatus: (id: string) => void
}

function TaskRow({ task, gui, onToggleDone, onCycleStatus }: TaskRowProps) {
  const unresolved = task.questions.filter((q) => !q.resolved).length
  const diff = task.deadline !== undefined ? daysUntil(task.deadline) : null

  // 期限の近さで色を変える: 超過=赤 / 今日明日=琥珀 / それ以外=灰
  const deadlineClass =
    task.status === 'done' || diff === null
      ? 'text-neutral-400'
      : diff < 0
        ? 'font-medium text-red-600'
        : diff <= 1
          ? 'font-medium text-amber-700'
          : 'text-neutral-500'

  return (
    <li className="flex items-center">
      <Link
        to={`/tasks/${task.id}`}
        data-task-id={task.id}
        onClick={() => sessionStorage.setItem('tool:lastTaskId', task.id)}
        className="flex flex-1 items-center gap-3 px-1 py-2.5 hover:bg-neutral-50"
      >
        <span className={`w-20 shrink-0 text-xs ${deadlineClass}`}>
          {deadlineLabel(task.deadline)}
        </span>
        <span
          className={`flex-1 truncate text-sm ${task.status === 'done' ? 'text-neutral-400' : 'text-neutral-900'}`}
        >
          {task.title || '(無題)'}
        </span>
        {needsConfirmation(task) && <ConfirmBadge count={unresolved} />}
        <StatusBadge status={task.status} />
      </Link>
      {gui && (
        <span data-secondary className="flex shrink-0 items-center gap-1 pr-1">
          <GuiButton
            label={task.status === 'done' ? '↺' : '✓'}
            hint="x"
            onClick={() => onToggleDone(task.id)}
          />
          <GuiButton label="▾" hint="Ctrl+1〜4" onClick={() => onCycleStatus(task.id)} />
        </span>
      )}
    </li>
  )
}
