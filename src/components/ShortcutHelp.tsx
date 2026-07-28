import { useEffect, useRef } from 'react'

interface Group {
  title: string
  items: { keys: string[]; label: string }[]
}

const GROUPS: Group[] = [
  {
    title: '一覧',
    items: [
      { keys: ['j', 'k'], label: '行を移動(↑↓でも可)' },
      { keys: ['g g'], label: '先頭へ' },
      { keys: ['Shift', 'g'], label: '末尾へ' },
      { keys: ['Enter'], label: '選択中の行を開く' },
      { keys: ['o'], label: 'その画面の新規作成' },
    ],
  },
  {
    title: '画面切替',
    items: [
      { keys: ['t'], label: 'タスク一覧' },
      { keys: ['l'], label: 'メモ一覧' },
      { keys: ['r'], label: '議事録一覧' },
      { keys: ['s'], label: 'ブレスト一覧' },
      { keys: ['n'], label: '新しいタスク' },
      { keys: ['m'], label: '新しいメモ' },
      { keys: ['Shift', 'R'], label: '新しい議事録' },
      { keys: ['Shift', 'S'], label: '新しいブレスト' },
      { keys: [','], label: '設定(バックアップもここ)' },
    ],
  },
  {
    title: 'ウィンドウ',
    items: [
      { keys: ['Ctrl', 'Alt', 'T'], label: '呼び出す / 隠す(他アプリからでも)' },
      { keys: ['Ctrl', 'Alt', 'P'], label: '常に前面に置く / やめる' },
      { keys: ['Ctrl', 'M'], label: '最小化' },
      { keys: ['Alt', 'F4'], label: '隠す(終了はしない)' },
    ],
  },
  {
    title: 'タスク詳細',
    items: [
      { keys: ['1', '4'], label: 'ステータス変更(受領〜完了)' },
      { keys: ['a'], label: '疑問点の追加欄へ' },
      { keys: ['c'], label: '未解決の疑問点を確認用にコピー' },
      { keys: ['h'], label: '一覧へ戻る(Escでも可)' },
    ],
  },
  {
    title: 'メモ編集',
    items: [
      { keys: ['1', '3'], label: 'テンプレ切替(空雨傘 / 結論ファースト / 自由)' },
      { keys: ['h'], label: '戻る(Escでも可)' },
    ],
  },
  {
    title: '議事録',
    items: [
      { keys: ['Enter'], label: '入力中の行を確定して追加' },
      { keys: ['Ctrl', '1〜3'], label: '決定 / TODO / 論点 を切替(入力欄で)' },
      { keys: ['Ctrl', 'E'], label: '録音の開始 / 一時停止・再開' },
      { keys: ['Ctrl', 'Shift', 'E'], label: '録音を終える(確定)' },
      { keys: ['Ctrl', 'Shift', 'M'], label: 'マイクの入 / 切(録音中も可)' },
      { keys: ['a'], label: '入力欄へ戻る' },
      { keys: ['Esc'], label: '入力を消す → もう一度で一覧へ' },
    ],
  },
  {
    title: 'ブレスト',
    items: [
      { keys: ['Enter'], label: 'カードを追加' },
      { keys: ['a'], label: '入力欄へ戻る' },
      { keys: ['Esc'], label: '入力を消す → もう一度で一覧へ' },
    ],
  },
  {
    title: '入力',
    items: [
      { keys: ['Tab'], label: '次の箱へ移動' },
      { keys: ['Ctrl', 'Enter'], label: '即保存(編集画面は自動保存)' },
      { keys: ['Esc'], label: '戻る / 閉じる(新規作成では取消)' },
    ],
  },
]

export function ShortcutHelp({ onClose }: { onClose: () => void }) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)

  // 開いたら閉じるボタンへ、閉じたら元いた場所へフォーカスを戻す
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    closeRef.current?.focus()
    return () => previous?.focus()
  }, [])

  // Tabがモーダルの外へ抜けないようにする
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'Tab') return
    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>('button')
    if (!focusable || focusable.length === 0) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    const current = document.activeElement
    // 本文クリックなどでフォーカスが枠内の要素から外れていたら、まず先頭へ戻す
    if (!Array.from(focusable).includes(current as HTMLElement)) {
      e.preventDefault()
      first.focus()
      return
    }
    if (e.shiftKey && current === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && current === last) {
      e.preventDefault()
      first.focus()
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 p-4"
      onClick={onClose}
      onKeyDown={onKeyDown}
      role="presentation"
    >
      <div
        ref={dialogRef}
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="キーボードショートカット"
      >
        <h2 className="mb-3 text-sm font-semibold text-neutral-900">キーボードショートカット</h2>
        <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
          {GROUPS.map((group) => (
            <section key={group.title}>
              <h3 className="mb-1.5 text-xs font-medium text-neutral-400">{group.title}</h3>
              <ul className="space-y-1.5">
                {group.items.map((s) => (
                  <li key={s.label} className="flex items-center justify-between gap-4 text-sm">
                    <span className="text-neutral-700">{s.label}</span>
                    <span className="flex shrink-0 gap-1">
                      {s.keys.map((k) => (
                        <kbd key={k}>{k}</kbd>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
        <button
          ref={closeRef}
          type="button"
          className="btn-ghost mt-4 w-full justify-center"
          onClick={onClose}
        >
          閉じる
        </button>
      </div>
    </div>
  )
}
