import { listen } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import { daysSince } from '../lib/date'
import { ShortcutSuspendContext, useShortcuts } from '../lib/useShortcuts'
import { hideWindow, quitApp } from '../storage'
import { flushAllEdits, getSaveError, hasBlockingDraft, retrySave, useStore } from '../store'
import { ShortcutHelp } from './ShortcutHelp'

/** バックアップがこれ以上空いたら印を出す */
const BACKUP_STALE_DAYS = 14

export function Layout() {
  const navigate = useNavigate()
  const { tasks, memos, lastBackupAt, saveError } = useStore()
  const [helpOpen, setHelpOpen] = useState(false)

  const hasData = tasks.length + memos.length > 0
  const rawAge = lastBackupAt ? daysSince(lastBackupAt) : null
  // 壊れた日時でNaNになったら「未実施」として扱う(印が永久に消える方向に倒さない)
  const backupAge = rawAge !== null && Number.isFinite(rawAge) ? rawAge : null
  const backupStale = hasData && (backupAge === null || backupAge > BACKUP_STALE_DAYS)

  /**
   * 常駐アプリなので、閉じる操作(Alt+F4・タスクバー)では終了せずに隠す。
   * 隠す前に書きかけの自動保存を流し切る。
   */
  useEffect(() => {
    const win = getCurrentWindow()
    const unlisten = win.onCloseRequested(async (event) => {
      event.preventDefault()
      await flushAllEdits()
      // 保存できていないなら隠さない。バナーに気づかないまま放置されるのを防ぐ
      if (!getSaveError()) await hideWindow()
    })
    return () => {
      void unlisten.then((f) => f())
    }
  }, [])

  /** トレイの「終了」。保存を済ませてからプロセスを落とす */
  useEffect(() => {
    const unlisten = listen('app-quit', async () => {
      await flushAllEdits()
      if (getSaveError()) {
        // 保存に失敗している間は終了させない(未保存のまま消えるため)
        await getCurrentWindow().show()
        return
      }
      await quitApp()
    })
    return () => {
      void unlisten.then((f) => f())
    }
  }, [])

  /** Ctrl+M で最小化(ボタンを置かない代わり) */
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'm' && e.ctrlKey && !e.altKey && !e.shiftKey) {
        e.preventDefault()
        void getCurrentWindow().minimize()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  /** 画面切替。新規作成フォームに書きかけがあるときは飛ばない(Escで取消してから) */
  const go = useCallback(
    (path: string) => {
      if (hasBlockingDraft()) return
      setHelpOpen(false)
      navigate(path)
    },
    [navigate],
  )

  const shortcuts = useMemo(
    () => ({
      n: () => go('/tasks/new'),
      m: () => go('/memos/new'),
      t: () => go('/'),
      l: () => go('/memos'),
      b: () => go('/settings'),
      ',': () => go('/settings'),
      '?': () => setHelpOpen(true),
      Escape: () => setHelpOpen(false),
    }),
    [go],
  )
  useShortcuts(shortcuts)

  return (
    <div className="min-h-screen bg-white">
      {/*
        ボーダレスなので、この細いバーがタイトルバーの代わり。
        掴んでウィンドウを動かす以外の役目は持たせない
      */}
      <header
        data-tauri-drag-region
        className="flex h-7 items-center justify-end border-b border-neutral-100 px-3 select-none"
      >
        {backupStale && (
          <span
            data-tauri-drag-region
            className="flex items-center gap-1.5 text-[11px] text-amber-600"
            title="バックアップが空いています(, で設定へ)"
          >
            <span className="size-1.5 rounded-full bg-amber-500" />
            バックアップ未実施
          </span>
        )}
      </header>

      {saveError && (
        <div className="flex items-center justify-between gap-4 border-b border-red-200 bg-red-50 px-6 py-2">
          <span className="text-sm text-red-700">
            保存に失敗しています: {saveError} —
            入力はメモリ上に残っています。再試行するか、バックアップを書き出してください。
          </span>
          <button type="button" className="btn-danger shrink-0" onClick={() => void retrySave()}>
            再試行
          </button>
        </div>
      )}

      <main className="mx-auto max-w-3xl px-6 py-5">
        {/* ヘルプが開いている間は各画面のショートカット(特にEsc)を止める */}
        <ShortcutSuspendContext value={helpOpen}>
          <Outlet />
        </ShortcutSuspendContext>
      </main>

      {helpOpen && <ShortcutHelp onClose={() => setHelpOpen(false)} />}
    </div>
  )
}
