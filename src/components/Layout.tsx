import { useEffect, useMemo, useRef, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { ShortcutSuspendContext, useShortcuts } from '../lib/useShortcuts'
import { ShortcutHelp } from './ShortcutHelp'

const NAV = [
  { to: '/', label: 'タスク', end: true },
  { to: '/memos', label: 'メモ', end: false },
]

export function Layout() {
  const navigate = useNavigate()
  const [helpOpen, setHelpOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const gearRef = useRef<HTMLButtonElement>(null)
  const firstItemRef = useRef<HTMLButtonElement>(null)
  const menuOpenRef = useRef(false)
  menuOpenRef.current = menuOpen

  // メニューを開いたら中へ、閉じたら歯車へフォーカスを戻す
  useEffect(() => {
    if (menuOpen) firstItemRef.current?.focus()
  }, [menuOpen])

  const closeMenu = () => {
    setMenuOpen(false)
    gearRef.current?.focus()
  }

  const openHelp = () => {
    setMenuOpen(false)
    setHelpOpen(true)
  }

  const shortcuts = useMemo(
    () => ({
      n: () => navigate('/tasks/new'),
      m: () => navigate('/memos/new'),
      t: () => navigate('/'),
      l: () => navigate('/memos'),
      b: () => navigate('/backup'),
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
    [navigate],
  )
  useShortcuts(shortcuts)

  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-neutral-200">
        <div className="mx-auto flex max-w-3xl items-center px-6 py-3">
          <nav className="flex gap-4">
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

          <div className="relative ml-auto">
            <button
              ref={gearRef}
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              className="flex size-7 items-center justify-center rounded-md text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
              aria-label="設定"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
            >
              <GearIcon />
            </button>

            {menuOpen && (
              <>
                {/* メニューの外側をクリックしたら閉じる */}
                <div className="fixed inset-0 z-30" onClick={closeMenu} role="presentation" />
                <div
                  className="absolute top-full right-0 z-40 mt-1 w-56 rounded-md border border-neutral-200 bg-white py-1 shadow-lg"
                  role="menu"
                >
                  <MenuItem ref={firstItemRef} onClick={openHelp} label="キーボードショートカット" hint="?" />
                  <MenuItem
                    onClick={() => {
                      setMenuOpen(false)
                      navigate('/backup')
                    }}
                    label="バックアップ"
                    hint="b"
                  />
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-8">
        {/* メニューやモーダルが開いている間は各画面のショートカット(特にEsc)を止める */}
        <ShortcutSuspendContext value={helpOpen || menuOpen}>
          <Outlet />
        </ShortcutSuspendContext>
      </main>

      {helpOpen && <ShortcutHelp onClose={() => setHelpOpen(false)} />}
    </div>
  )
}

interface MenuItemProps {
  label: string
  hint: string
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
      <kbd>{hint}</kbd>
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
      className="size-5"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}
