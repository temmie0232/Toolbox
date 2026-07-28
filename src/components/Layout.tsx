import { useMemo, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { ShortcutSuspendContext, useShortcuts } from '../lib/useShortcuts'
import { ShortcutHelp } from './ShortcutHelp'

const NAV = [
  { to: '/', label: 'タスク', end: true },
  { to: '/memos', label: 'メモ', end: false },
  { to: '/backup', label: 'バックアップ', end: false },
]

export function Layout() {
  const navigate = useNavigate()
  const [helpOpen, setHelpOpen] = useState(false)

  const shortcuts = useMemo(
    () => ({
      n: () => navigate('/tasks/new'),
      m: () => navigate('/memos/new'),
      t: () => navigate('/'),
      l: () => navigate('/memos'),
      b: () => navigate('/backup'),
      '?': () => setHelpOpen(true),
      // ヘルプを閉じるEscはここだけが受ける。画面側のEscはモーダル表示中は止まっている
      Escape: () => setHelpOpen(false),
    }),
    [navigate],
  )
  useShortcuts(shortcuts)

  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-neutral-200">
        <div className="mx-auto flex max-w-3xl items-center gap-6 px-6 py-3">
          <span className="text-sm font-semibold tracking-tight text-neutral-900">ツール</span>
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
          <button
            type="button"
            onClick={() => setHelpOpen(true)}
            className="ml-auto text-xs text-neutral-400 hover:text-neutral-700"
            title="キーボードショートカット"
          >
            <kbd>?</kbd> ショートカット
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-8">
        {/* モーダル表示中は各画面のショートカット(特にEsc)を止める */}
        <ShortcutSuspendContext value={helpOpen}>
          <Outlet />
        </ShortcutSuspendContext>
      </main>

      {helpOpen && <ShortcutHelp onClose={() => setHelpOpen(false)} />}
    </div>
  )
}
