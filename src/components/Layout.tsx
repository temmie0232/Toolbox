import { listen } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { ShortcutSuspendContext, useShortcuts } from '../lib/useShortcuts'
import { hideWindow, quitApp, setAlwaysOnTop } from '../storage'
import { flushAllEdits, getSaveError, hasBlockingDraft, retrySave, useStore } from '../store'
import { ShortcutHelp } from './ShortcutHelp'

const PIN_KEY = 'tool:pinned'

export function Layout() {
  const navigate = useNavigate()
  const location = useLocation()
  const { saveError } = useStore()
  const [helpOpen, setHelpOpen] = useState(false)

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

  /** 前回、前面固定したまま終了していたら起動時に戻す(切り替えはCtrl+Alt+P) */
  useEffect(() => {
    if (localStorage.getItem(PIN_KEY) === '1') void setAlwaysOnTop(true)
    const unlisten = listen<boolean>('pin-changed', (event) => {
      localStorage.setItem(PIN_KEY, event.payload ? '1' : '0')
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

  // 設定から戻る先を覚えておく。行って帰ってこられるようにするため
  const backPathRef = useRef('/')
  useEffect(() => {
    if (location.pathname !== '/settings') {
      backPathRef.current = location.pathname + location.search
    }
  }, [location])

  /** 上のバーのダブルクリック。設定(ショートカットのカンペ込み)と行き来する */
  const toggleSettings = useCallback(() => {
    if (location.pathname === '/settings') go(backPathRef.current || '/')
    else go('/settings')
  }, [location.pathname, go])

  const shortcuts = useMemo(
    () => ({
      n: () => go('/tasks/new'),
      m: () => go('/memos/new'),
      t: () => go('/'),
      l: () => go('/memos'),
      r: () => go('/meetings'),
      R: () => go('/meetings/new'),
      s: () => go('/brainstorms'),
      S: () => go('/brainstorms/new'),
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
        ウィンドウを動かすための取っ手。この灰色の横棒を掴むと移動できる。
        スクロールしても常に上に残るよう固定する。
        data-tauri-drag-region は使わない。あれはダブルクリックが最大化に
        固定されていて、こちらの用途(設定への行き来)に差し替えられないため
      */}
      <div className="sticky top-0 z-20 flex justify-center bg-white pt-2 pb-1 select-none">
        <div
          className="cursor-grab px-6 py-1.5 active:cursor-grabbing"
          title="掴むと移動 / ダブルクリックで設定とショートカット"
          onMouseDown={(e) => {
            if (e.button !== 0) return
            // 2回目の押下はドラッグを始めない(そのままダブルクリックとして扱う)
            if (e.detail >= 2) return
            void getCurrentWindow().startDragging()
          }}
          onDoubleClick={toggleSettings}
        >
          <div className="pointer-events-none h-1 w-10 rounded-full bg-neutral-300" />
        </div>
      </div>

      {saveError && (
        <div className="flex items-center justify-between gap-4 border-y border-red-200 bg-red-50 px-6 py-2">
          <span className="text-sm text-red-700">
            保存に失敗しています: {saveError} —
            入力はメモリ上に残っています。再試行するか、バックアップを書き出してください。
          </span>
          <button type="button" className="btn-danger shrink-0" onClick={() => void retrySave()}>
            再試行
          </button>
        </div>
      )}

      <main className="mx-auto max-w-3xl px-6 pt-2 pb-6">
        {/* ヘルプが開いている間は各画面のショートカット(特にEsc)を止める */}
        <ShortcutSuspendContext value={helpOpen}>
          <Outlet />
        </ShortcutSuspendContext>
      </main>

      {helpOpen && <ShortcutHelp onClose={() => setHelpOpen(false)} />}
    </div>
  )
}
