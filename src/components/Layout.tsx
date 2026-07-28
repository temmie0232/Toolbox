import { getCurrentWindow } from '@tauri-apps/api/window'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { daysSince } from '../lib/date'
import { ShortcutSuspendContext, useShortcuts } from '../lib/useShortcuts'
import { flushAllEdits, getSaveError, hasBlockingDraft, retrySave, useStore } from '../store'
import { ShortcutHelp } from './ShortcutHelp'
import { openDataDir } from '../storage'

const NAV = [
  { to: '/', label: 'タスク', end: true },
  { to: '/memos', label: 'メモ', end: false },
]

/** バックアップがこれ以上空いたら歯車に印を出す */
const BACKUP_STALE_DAYS = 14

export function Layout() {
  const navigate = useNavigate()
  const { tasks, memos, lastBackupAt, saveError } = useStore()
  const [helpOpen, setHelpOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const gearRef = useRef<HTMLButtonElement>(null)
  const firstItemRef = useRef<HTMLButtonElement>(null)
  const menuOpenRef = useRef(false)
  menuOpenRef.current = menuOpen

  const hasData = tasks.length + memos.length > 0
  const rawAge = lastBackupAt ? daysSince(lastBackupAt) : null
  // 壊れた日時でNaNになったら「未実施」として扱う(印が永久に消える方向に倒さない)
  const backupAge = rawAge !== null && Number.isFinite(rawAge) ? rawAge : null
  const backupStale = hasData && (backupAge === null || backupAge > BACKUP_STALE_DAYS)

  // Alt+F4・タスクバーからの終了・シャットダウンでも、書きかけの自動保存を流し切ってから閉じる。
  // ×ボタンも close() を呼ぶだけにして、全ての終了経路をここに集約する
  useEffect(() => {
    const win = getCurrentWindow()
    const unlisten = win.onCloseRequested(async (event) => {
      await flushAllEdits()
      // 書き込みに失敗しているなら閉じない(閉じたらデータが消えるため)。
      // バナーから再試行するか、バックアップを書き出してから閉じてもらう
      if (getSaveError()) event.preventDefault()
    })
    return () => {
      void unlisten.then((f) => f())
    }
  }, [])

  // メニューを開いたら中へ、閉じたら歯車へフォーカスを戻す
  useEffect(() => {
    if (menuOpen) firstItemRef.current?.focus()
  }, [menuOpen])

  const closeMenu = () => {
    setMenuOpen(false)
    gearRef.current?.focus()
  }

  /** 画面切替。新規作成フォームに書きかけがあるときは飛ばない(Escで取消してから) */
  const go = useCallback(
    (path: string) => {
      if (hasBlockingDraft()) return
      setMenuOpen(false)
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
      b: () => go('/backup'),
      '?': () => {
        setMenuOpen(false)
        setHelpOpen(true)
      },
      // メニューが開いていればそれを閉じる。次のEscでヘルプ、という順に畳む
      Escape: () => {
        if (menuOpenRef.current) {
          setMenuOpen(false)
          gearRef.current?.focus()
        } else {
          setHelpOpen(false)
        }
      },
    }),
    [go],
  )
  useShortcuts(shortcuts)

  return (
    <div className="min-h-screen bg-white">
      {/* ボーダレスウィンドウなので、ここがタイトルバーを兼ねる(空き部分でドラッグ移動) */}
      <header data-tauri-drag-region className="border-b border-neutral-200 select-none">
        <div data-tauri-drag-region className="flex h-10 items-stretch">
          <nav className="flex items-center gap-4 pl-5">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `text-sm ${isActive ? 'font-medium text-neutral-900' : 'text-neutral-500 hover:text-neutral-900'}`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div data-tauri-drag-region className="flex-1" />

          <div className="relative flex items-center">
            <button
              ref={gearRef}
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              className="relative flex h-10 w-11 items-center justify-center text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
              aria-label="設定"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
            >
              <GearIcon />
              {backupStale && (
                <span
                  className="absolute top-1.5 right-2 size-2 rounded-full bg-amber-500"
                  title="バックアップが空いています"
                />
              )}
            </button>

            {menuOpen && (
              <>
                {/* メニューの外側をクリックしたら閉じる */}
                <div className="fixed inset-0 z-30" onClick={closeMenu} role="presentation" />
                <div
                  className="absolute top-full right-0 z-40 mt-1 w-64 rounded-md border border-neutral-200 bg-white py-1 shadow-lg"
                  role="menu"
                >
                  <MenuItem
                    ref={firstItemRef}
                    onClick={() => {
                      setMenuOpen(false)
                      setHelpOpen(true)
                    }}
                    label="キーボードショートカット"
                    hint="?"
                  />
                  <MenuItem
                    onClick={() => {
                      setMenuOpen(false)
                      navigate('/backup')
                    }}
                    label="バックアップ"
                    hint="b"
                  />
                  <MenuItem
                    onClick={() => {
                      setMenuOpen(false)
                      void openDataDir()
                    }}
                    label="データの場所を開く"
                  />
                  <div className="mt-1 border-t border-neutral-100 px-3 pt-1.5 pb-1">
                    <span className={`text-xs ${backupStale ? 'text-amber-700' : 'text-neutral-400'}`}>
                      最終バックアップ:{' '}
                      {backupAge === null
                        ? 'まだ'
                        : backupAge === 0
                          ? '今日'
                          : backupAge === 1
                            ? '昨日'
                            : `${backupAge}日前`}
                    </span>
                  </div>
                </div>
              </>
            )}
          </div>

          <WindowControls />
        </div>
      </header>

      {saveError && (
        <div className="flex items-center justify-between gap-4 border-b border-red-200 bg-red-50 px-6 py-2">
          <span className="text-sm text-red-700">
            保存に失敗しています: {saveError} — 入力はメモリ上に残っています。再試行するか、バックアップを書き出してください。
          </span>
          <button type="button" className="btn-danger shrink-0" onClick={() => void retrySave()}>
            再試行
          </button>
        </div>
      )}

      <main className="mx-auto max-w-3xl px-6 py-6">
        {/* メニューやモーダルが開いている間は各画面のショートカット(特にEsc)を止める */}
        <ShortcutSuspendContext value={helpOpen || menuOpen}>
          <Outlet />
        </ShortcutSuspendContext>
      </main>

      {helpOpen && <ShortcutHelp onClose={() => setHelpOpen(false)} />}
    </div>
  )
}

/** 最小化 / 最大化 / 閉じる */
function WindowControls() {
  const win = getCurrentWindow()
  return (
    <div className="flex items-stretch">
      <button
        type="button"
        onClick={() => void win.minimize()}
        className="flex w-11 items-center justify-center text-neutral-500 hover:bg-neutral-100"
        aria-label="最小化"
      >
        <svg viewBox="0 0 10 10" className="size-2.5" aria-hidden="true">
          <line x1="0" y1="5" x2="10" y2="5" stroke="currentColor" strokeWidth="1" />
        </svg>
      </button>
      <button
        type="button"
        onClick={() => void win.toggleMaximize()}
        className="flex w-11 items-center justify-center text-neutral-500 hover:bg-neutral-100"
        aria-label="最大化 / 元に戻す"
      >
        <svg viewBox="0 0 10 10" className="size-2.5" aria-hidden="true">
          <rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" strokeWidth="1" />
        </svg>
      </button>
      <button
        type="button"
        // close() は close-requested を発火させるので、Layoutの終了ハンドラ
        // (flushAllEdits)がAlt+F4と同じ経路で必ず通る
        onClick={() => void win.close()}
        className="flex w-11 items-center justify-center text-neutral-500 hover:bg-red-600 hover:text-white"
        aria-label="閉じる"
      >
        <svg viewBox="0 0 10 10" className="size-2.5" aria-hidden="true">
          <line x1="0" y1="0" x2="10" y2="10" stroke="currentColor" strokeWidth="1" />
          <line x1="10" y1="0" x2="0" y2="10" stroke="currentColor" strokeWidth="1" />
        </svg>
      </button>
    </div>
  )
}

interface MenuItemProps {
  label: string
  hint?: string
  onClick: () => void
  ref?: React.Ref<HTMLButtonElement>
}

function MenuItem({ label, hint, onClick, ref }: MenuItemProps) {
  return (
    <button
      ref={ref}
      type="button"
      role="menuitem"
      onClick={onClick}
      className="flex w-full items-center justify-between gap-4 px-3 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-50"
    >
      {label}
      {hint && <kbd>{hint}</kbd>}
    </button>
  )
}

function GearIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-4.5"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}
