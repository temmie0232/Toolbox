export interface NavItem {
  /** 一覧へのキー(小文字) */
  key: string
  /** 新規作成へのキー(大文字) */
  upperKey: string
  path: string
  newPath: string
  label: string
  match: (pathname: string) => boolean
}

interface NavTabsProps {
  items: NavItem[]
  pathname: string
  go: (path: string) => void
  onSettings: () => void
  settingsActive: boolean
  onHelp: () => void
  onBack: () => void
  onForward: () => void
  onMinimize: () => void
  /** 札(f)やQuickJump(/)が出ている間は押せなくする。裏の画面が変わると札が別物を指すため */
  disabled: boolean
}

/**
 * GUIモードの画面遷移タブ。既存キー(t/T/m/M/r/R/s/S/,/?/Ctrl+O/Ctrl+I/Ctrl+M)の写しでしかない。
 *
 * `data-secondary` + `tabIndex={-1}` を必ず両方付ける。
 * `spotsIn`(lib/keys.ts)は `tabIndex === -1` を無条件で弾くので、
 * このタブは j/k・Tab・札(f)のどこにも一切現れない(GuiButton と同じ理屈)。
 * `onMouseDown` で `preventDefault` し、クリックで入力欄からフォーカスが奪われて
 * 入力モードが落ちる事故を防ぐ(lib/mode.tsx の見張り)。
 */
export function NavTabs({
  items,
  pathname,
  go,
  onSettings,
  settingsActive,
  onHelp,
  onBack,
  onForward,
  onMinimize,
  disabled,
}: NavTabsProps) {
  const tabClass = (active: boolean) =>
    `rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
      active
        ? 'bg-neutral-900 text-white'
        : 'border border-neutral-300 text-neutral-600 hover:bg-neutral-50'
    }`

  return (
    <div
      data-secondary
      className={`mx-auto flex max-w-3xl flex-wrap items-center justify-center gap-1 px-6 pb-1 ${
        disabled ? 'pointer-events-none opacity-50' : ''
      }`}
    >
      {items.map((item) => {
        const active = !settingsActive && item.match(pathname)
        return (
          <span key={item.path} className="flex items-center gap-0.5">
            <button
              type="button"
              tabIndex={-1}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => go(item.path)}
              aria-current={active ? 'page' : undefined}
              title={`${item.label}(${item.key})`}
              className={tabClass(active)}
            >
              {item.label}
            </button>
            <button
              type="button"
              tabIndex={-1}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => go(item.newPath)}
              title={`新規(${item.upperKey})`}
              className="rounded-md px-1.5 py-1 text-xs text-neutral-400 hover:bg-neutral-50 hover:text-neutral-700"
            >
              +
            </button>
          </span>
        )
      })}

      <span className="mx-1 h-4 w-px bg-neutral-200" />

      <button
        type="button"
        tabIndex={-1}
        onMouseDown={(e) => e.preventDefault()}
        onClick={onBack}
        title="来た道を戻る(Ctrl+O)"
        className="rounded-md px-1.5 py-1 text-xs text-neutral-500 hover:bg-neutral-50"
      >
        ←
      </button>
      <button
        type="button"
        tabIndex={-1}
        onMouseDown={(e) => e.preventDefault()}
        onClick={onForward}
        title="進む(Ctrl+I)"
        className="rounded-md px-1.5 py-1 text-xs text-neutral-500 hover:bg-neutral-50"
      >
        →
      </button>
      <button
        type="button"
        tabIndex={-1}
        onMouseDown={(e) => e.preventDefault()}
        onClick={onHelp}
        title="ショートカット一覧(?)"
        className="rounded-md px-1.5 py-1 text-xs text-neutral-500 hover:bg-neutral-50"
      >
        ?
      </button>
      <button
        type="button"
        tabIndex={-1}
        onMouseDown={(e) => e.preventDefault()}
        onClick={onSettings}
        aria-current={settingsActive ? 'page' : undefined}
        title="設定(,)"
        className={tabClass(settingsActive)}
      >
        設定
      </button>
      <button
        type="button"
        tabIndex={-1}
        onMouseDown={(e) => e.preventDefault()}
        onClick={onMinimize}
        title="最小化(Ctrl+M)"
        className="rounded-md px-1.5 py-1 text-xs text-neutral-500 hover:bg-neutral-50"
      >
        最小化
      </button>
    </div>
  )
}
