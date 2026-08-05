interface Group {
  title: string
  items: { keys: string[]; label: string }[]
}

export const SHORTCUT_GROUPS: Group[] = [
  {
    title: '狙って一撃(慣れるとこれが主役)',
    items: [
      { keys: ['f'], label: '画面の押せるもの全部に札。札を打つとそこを押す' },
      { keys: ['Shift', 'F'], label: '同じく札。押さずにそこへ移るだけ' },
      { keys: ['/'], label: '名前で絞って、どこからでも直接開く' },
      { keys: ['Ctrl', 'O'], label: '来た道を戻る(Ctrl+Iで進む)' },
    ],
  },
  {
    title: 'モード切替(ここが基本)',
    items: [
      { keys: ['i'], label: 'いまいる箱に書き始める(入力へ)' },
      { keys: ['Enter'], label: '箱なら書き始める / それ以外は押す' },
      { keys: ['Esc'], label: '書くのをやめる(移動へ)。画面は動かない' },
      { keys: ['j', 'k'], label: '同じく移動へ(素早く続けて。日本語入力中は Esc)' },
      { keys: ['Esc', 'Esc'], label: '移動中のEscで、その画面を出る' },
    ],
  },
  {
    title: '移動中(-- 移動 --)',
    items: [
      { keys: ['j', 'k'], label: '主なものを上下に辿る(↑↓でも可)' },
      { keys: ['3', 'j'], label: '数字を先に打つと回数(3行下へ)' },
      { keys: ['g g'], label: '先頭へ(Shift+g で末尾 / 5G で5番目)' },
      { keys: ['Tab'], label: '細かいもの含めて次へ(札でも届く)' },
      { keys: ['Space'], label: 'チェックの入 / 切' },
      { keys: ['o'], label: 'その画面の新規作成(一覧で)' },
    ],
  },
  {
    title: 'タスク一覧で直接(開かずに済ませる)',
    items: [
      { keys: ['x'], label: '乗っている行を完了 ⇄ 作業中' },
      { keys: ['Ctrl', '1〜4'], label: '乗っている行のステータス' },
      { keys: ['Enter'], label: '行を開く' },
    ],
  },
  {
    title: '画面切替(小文字=一覧 / 大文字=新規)',
    items: [
      { keys: ['t', 'Shift', 'T'], label: 'タスク' },
      { keys: ['m', 'Shift', 'M'], label: 'メモ' },
      { keys: ['r', 'Shift', 'R'], label: '議事録' },
      { keys: ['s', 'Shift', 'S'], label: 'ブレスト' },
      { keys: [','], label: '設定と行き来する' },
    ],
  },
  {
    title: '入力中(-- 入力 --)でも効くもの',
    items: [
      { keys: ['Ctrl', 'Enter'], label: '即保存(編集画面は自動保存)' },
      { keys: ['Enter'], label: '次の箱へ(メモ・タスク。議事録は行の確定)' },
      { keys: ['Shift', 'Enter'], label: '改行' },
      { keys: ['Ctrl', '1〜4'], label: 'ステータス(タスク詳細)' },
      { keys: ['Ctrl', '1〜3'], label: 'テンプレ(メモ) / 種別(議事録)' },
      { keys: ['Ctrl', 'V'], label: 'スクリーンショットをその行に貼る(メモ)' },
      { keys: ['Tab'], label: '次の箱へ移動' },
    ],
  },
  {
    title: '各画面(移動中)',
    items: [
      { keys: ['a'], label: '追加欄へ入って書き始める' },
      { keys: ['c'], label: '未解決の疑問点を確認用にコピー(タスク詳細)' },
      { keys: ['h'], label: '一覧へ戻る(Escでも可)' },
      { keys: ['Esc'], label: '打ちかけを消す → もう一度で一覧へ(議事録/ブレスト)' },
    ],
  },
  {
    title: '札(f)の中',
    items: [
      { keys: ['a〜p'], label: '札を打つ。決まった瞬間に飛ぶ' },
      { keys: ['Backspace'], label: '1文字戻す' },
      { keys: ['Esc'], label: 'やめる(打ち間違いでも自動でやめる)' },
    ],
  },
  {
    title: '議事録の録音',
    items: [
      { keys: ['Ctrl', 'E'], label: '録音の開始 / 一時停止・再開' },
      { keys: ['Ctrl', 'Shift', 'E'], label: '録音を終える(確定)' },
      { keys: ['Ctrl', 'Shift', 'M'], label: 'マイクの入 / 切(録音中も可)' },
      { keys: ['Enter'], label: '入力中の行を確定して追加' },
    ],
  },
  {
    title: 'ウィンドウ',
    items: [
      { keys: ['Ctrl', 'Alt', 'T'], label: '呼び出す / 隠す(他アプリからでも)' },
      { keys: ['Ctrl', 'Alt', 'P'], label: '常に前面に置く / やめる' },
      { keys: ['Ctrl', 'M'], label: '最小化' },
      { keys: ['Alt', 'F4'], label: '隠す(終了はしない)' },
      { keys: ['ダブルクリック'], label: '上のバーで、設定と行き来する' },
    ],
  },
]

/** ショートカットのカンペ。ヘルプと設定画面の両方から使う */
export function ShortcutList() {
  return (
    <div className="space-y-4">
      <p className="rounded-md bg-neutral-50 px-3 py-2 text-xs leading-relaxed text-neutral-600">
        vim と同じ2モード。左下に出ているのがいまのモード。
        <br />
        <strong>-- 移動 --</strong> は箱が読み取り専用で、1文字のキーが全部ショートカットになる。
        <strong>-- 入力 --</strong> は箱に文字が入り、抜けるのは <kbd>Esc</kbd>。
        <span className="text-neutral-500">
          {' '}
          Escで画面が閉じるのは移動中だけなので、書いている途中に戻されることはない。
        </span>
        <br />
        <span className="text-neutral-500">
          速くしたいなら <kbd>j</kbd> <kbd>k</kbd> で近づくのをやめて、<kbd>f</kbd>(札)と{' '}
          <kbd>/</kbd>(絞り込み)を使う。どちらも対象が何個あっても打鍵数が変わらない。
        </span>
      </p>
      <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
        {SHORTCUT_GROUPS.map((group) => (
          <section key={group.title}>
            <h3 className="mb-1.5 text-xs font-medium text-neutral-400">{group.title}</h3>
            <ul className="space-y-1.5">
              {group.items.map((s) => (
                <li key={s.label} className="flex items-center justify-between gap-4 text-sm">
                  <span className="text-neutral-700">{s.label}</span>
                  <span className="flex shrink-0 gap-1">
                    {s.keys.map((k, i) => (
                      <kbd key={`${k}-${i}`}>{k}</kbd>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  )
}
