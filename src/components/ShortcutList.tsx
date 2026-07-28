interface Group {
  title: string
  items: { keys: string[]; label: string }[]
}

export const SHORTCUT_GROUPS: Group[] = [
  {
    title: 'ウィンドウ',
    items: [
      { keys: ['Ctrl', 'Alt', 'T'], label: '呼び出す / 隠す(他アプリからでも)' },
      { keys: ['Ctrl', 'Alt', 'P'], label: '常に前面に置く / やめる' },
      { keys: ['Ctrl', 'M'], label: '最小化' },
      { keys: ['Alt', 'F4'], label: '隠す(終了はしない)' },
      { keys: ['ダブルクリック'], label: '上のバーで、この画面と行き来する' },
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
      { keys: [','], label: '設定(この画面)' },
    ],
  },
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

/** ショートカットのカンペ。ヘルプと設定画面の両方から使う */
export function ShortcutList() {
  return (
    <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
      {SHORTCUT_GROUPS.map((group) => (
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
  )
}
