/**
 * キーボードだけで一周するための判定を1か所に集める。
 * 「いまこの要素は文字を打つ場所か」で、モード(移動/入力)の振る舞いが全部決まる。
 */

/** クリックで操作する入力欄。文字は打たない(スペースやEnterは素の動作に任せる) */
const NON_TEXT_INPUT_TYPES = new Set([
  'checkbox',
  'radio',
  'button',
  'submit',
  'reset',
  'file',
  'image',
])

/**
 * 矢印キーやスペースだけで中身が変わってしまう入力欄。
 * readOnly が効かないものもあるので、移動中は素のキーを一切通さない。
 */
const STEP_INPUT_TYPES = new Set([
  'date',
  'datetime-local',
  'month',
  'week',
  'time',
  'number',
  'range',
  'color',
])

/**
 * 文字を打ち込む欄。移動中は readOnly にする。
 * readOnly にするのが要点で、これがないと日本語入力が勝手に変換を始めてしまう
 * (keydown を preventDefault してもIMEは止まらない)。
 */
export function isTextEntry(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  if (target instanceof HTMLTextAreaElement) return true
  if (target instanceof HTMLInputElement) {
    return !NON_TEXT_INPUT_TYPES.has(target.type) && !STEP_INPUT_TYPES.has(target.type)
  }
  return false
}

/**
 * 改行が入る欄。素の Enter を改行に使えるのはここだけ。
 * 1行の欄で素の Enter を殺すと、打鍵が死ぬうえ form の既定動作で保存が走る
 */
export function isMultilineEntry(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target instanceof HTMLTextAreaElement || target.isContentEditable
}

/** 選択肢と日付。readOnly では守れないので、移動中はキー自体を通さない */
export function isStepControl(target: EventTarget | null): boolean {
  if (target instanceof HTMLSelectElement) return true
  return target instanceof HTMLInputElement && STEP_INPUT_TYPES.has(target.type)
}

/** 入力モードに入れる要素 */
export function isEditable(target: EventTarget | null): boolean {
  return isTextEntry(target) || isStepControl(target)
}

/** 日本語入力の変換中のキーは、ショートカットとして扱わない */
export function isComposing(e: KeyboardEvent | { isComposing: boolean; keyCode: number }): boolean {
  return e.isComposing || e.keyCode === 229
}

/**
 * j/k で回る「行」。画面にある押せるものは全部ここに入れる。
 * 1つでも漏れるとそこへ辿り着けず、マウスに手が伸びることになる。
 */
const SPOT_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'textarea:not([disabled])',
  'select:not([disabled])',
  'summary',
  'audio[controls]',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

interface SpotOptions {
  /**
   * j/k で辿る列。`data-secondary` の中を飛ばす。
   * 期限のチップや行ごとの削除まで1つずつ辿らせると、j を連打する時間が積み上がる。
   * 飛ばしたものは Tab と札(f)で届くので、行けなくなるものは無い。
   */
  primaryOnly?: boolean
  /** 札(f)用。画面に映っていないものに札を出しても読めない */
  inViewport?: boolean
}

/** 上から下へ、実際に見えているものだけを並べる */
export function spotsIn(root: ParentNode, options: SpotOptions = {}): HTMLElement[] {
  const height = window.innerHeight
  const width = window.innerWidth
  return Array.from(root.querySelectorAll<HTMLElement>(SPOT_SELECTOR)).filter((el) => {
    // 折りたたみの中や type=hidden は飛ばす。focusしても何も起きないため
    if (el.getClientRects().length === 0 || el.tabIndex === -1) return false
    if (options.primaryOnly && el.closest('[data-secondary]')) return false
    if (options.inViewport) {
      const r = el.getBoundingClientRect()
      if (r.bottom <= 0 || r.top >= height || r.right <= 0 || r.left >= width) return false
    }
    return true
  })
}

/**
 * 札(f)に使うキー。ホームポジションから順に並べる。
 * 指を動かさずに済む順にしておくと、狙いが「見る→押す」の1動作になる。
 */
const HINT_ALPHABET = 'asdfghjkl;qwertyuiop'

/**
 * n個ぶんの札を作る。
 * 足りなくなったら後ろのキーを2文字目の入口に回す。
 * どの札も他の札の頭にならないので、打ち終わった時点で必ず1つに決まる。
 */
export function makeHintLabels(n: number): string[] {
  const keys = HINT_ALPHABET.split('')
  const k = keys.length
  if (n <= 0) return []
  if (n <= k) return keys.slice(0, n)

  let heads = 1
  while (heads < k && k - heads + heads * k < n) heads++
  const labels = keys.slice(0, k - heads)
  for (const head of keys.slice(k - heads)) {
    for (const tail of keys) {
      if (labels.length >= n) break
      labels.push(head + tail)
    }
  }
  return labels
}

/**
 * キャレットの直前の1文字が `char` なら消す。消せたら true。
 *
 * `jj` で入力を抜けるときに使う。1打目の j は普通に入ってしまうので、
 * 2打目でそれを取り消す(先読みで1打目を待たせると、通常の入力が遅れて気持ち悪くなる)。
 *
 * 値を書き換えたあと input イベントを流すのが要点。
 * 画面側は controlled component なので、これを見ないと state が古い値のまま残る。
 */
export function removeCharBefore(
  el: HTMLInputElement | HTMLTextAreaElement,
  char: string,
): boolean {
  const at = el.selectionStart
  // 選択範囲があるとき・先頭にいるとき・直前が別の文字のときは触らない
  if (at === null || at === 0 || at !== el.selectionEnd) return false
  if (el.value[at - 1] !== char) return false
  el.setRangeText('', at - 1, at, 'end')
  el.dispatchEvent(new Event('input', { bubbles: true }))
  return true
}

/**
 * 入力欄の末尾へキャレットを置く。
 * focus() だけだと先頭に付くので、既に書いてある文の頭に打ち込んでしまう。
 */
export function moveCaretToEnd(el: HTMLElement): void {
  if (!(el instanceof HTMLInputElement) && !(el instanceof HTMLTextAreaElement)) return
  try {
    if (el.selectionStart === null) return
    const end = el.value.length
    el.setSelectionRange(end, end)
  } catch {
    // 日付欄などは選択位置を持たない。触らなくてよい
  }
}
