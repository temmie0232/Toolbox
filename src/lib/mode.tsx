import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  isComposing,
  isEditable,
  isStepControl,
  isTextEntry,
  moveCaretToEnd,
  removeCharBefore,
  spotsIn,
} from './keys'

/**
 * jk で入力を抜けるときの、j と k の間隔の上限。
 *
 * `jj` にはできない。開始と終了が同じ文字だと、**本文として打った j** が
 * 1打目の役を奪ってしまう(「xyzj」と打ってから jj すると、本文の j が消えて
 * 残った1打が移動モードの j になる)。観測できる情報が本文の j と脱出の j で
 * 完全に同じなので、先読みにしても解けない(vim の inoremap jj <Esc> も同じ)。
 * 終了を k にすると、保留中の j は常に最後のものに上書きされ、曖昧さが消える。
 */
const ESCAPE_WINDOW_MS = 300

/**
 * vim と同じ2モード。
 *
 * - normal(移動): 入力欄は readOnly。単キーのショートカットがどこにいても効く
 * - insert(入力): その欄に文字が入る。単キーは効かず、Esc で normal に戻る
 *
 * 肝は **Esc が画面を閉じないこと**。入力から抜けるだけで、いた場所に留まる。
 * 「入力から抜けられず、抜けるには最初の画面まで戻るしかない」を無くすための仕組み。
 */
export type Mode = 'normal' | 'insert'

interface ModeActions {
  /**
   * 入力モードに入る。
   * el を渡すとそこへフォーカスしてから入る(省略時はいまフォーカスしている欄)。
   * caret='keep' はマウスで押した位置を保つとき用。
   */
  enterInsert: (el?: HTMLElement | null, caret?: 'end' | 'keep') => void
  exitInsert: () => void
  /**
   * Esc を一時的に自分のものにする。戻り値を呼ぶと返す。
   * 重ねられる(最後に取ったものが受ける)。
   */
  claimEscape: (handler: () => void) => () => void
}

const NOOP_ACTIONS: ModeActions = {
  enterInsert: () => {},
  exitInsert: () => {},
  claimEscape: () => () => {},
}

// mode と操作を別のコンテキストに分ける。
// 1つにすると、モードが変わるたびに操作の参照も変わってしまい、
// useMemo/useEffect の依存に入れられなくなる
const ModeStateContext = createContext<Mode>('normal')
const ModeActionsContext = createContext<ModeActions>(NOOP_ACTIONS)

export function useMode(): Mode {
  return useContext(ModeStateContext)
}

export function useModeActions(): ModeActions {
  return useContext(ModeActionsContext)
}

/** 画面の中で最初に文字を打てる欄 */
function firstEditable(): HTMLElement | null {
  return spotsIn(document).find((el) => isEditable(el)) ?? null
}

export function ModeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<Mode>('normal')
  const modeRef = useRef(mode)
  modeRef.current = mode

  const enterInsert = useCallback((el?: HTMLElement | null, caret: 'end' | 'keep' = 'end') => {
    const active = document.activeElement
    const target = el ?? (isEditable(active) ? (active as HTMLElement) : firstEditable())
    // 打てる欄がひとつも無い画面なら、移動モードのままにする
    // (入力モードなのに文字がどこにも入らない、が一番たちが悪い)
    if (!target) return
    if (caret === 'end') {
      if (target !== document.activeElement) target.focus()
      moveCaretToEnd(target)
    }
    setMode('insert')
  }, [])

  const exitInsert = useCallback(() => setMode('normal'), [])

  // 絞り込みや札(f)のような一時的な画面が Esc を奪う。最後に取ったものが受ける
  const escOwners = useRef<(() => void)[]>([])
  const claimEscape = useCallback((handler: () => void) => {
    escOwners.current = [...escOwners.current, handler]
    return () => {
      escOwners.current = escOwners.current.filter((h) => h !== handler)
    }
  }, [])

  const actions = useMemo<ModeActions>(
    () => ({ enterInsert, exitInsert, claimEscape }),
    [enterInsert, exitInsert, claimEscape],
  )

  /** いまどちらのモードかを見た目に出す(枠の色をCSSで切り替える) */
  useEffect(() => {
    document.documentElement.dataset.mode = mode
  }, [mode])

  /**
   * jk で入力を抜ける(Esc と同じ。手をホームポジションから動かさずに済む)。
   *
   * j は普通に入る。続けて k が来たときに、その j を消して抜ける。
   * 逆に j を先読みで待たせると、通常の入力が ESCAPE_WINDOW_MS ぶん遅れて使い物にならない。
   *
   * 消して戻せる場所(input / textarea)でだけ効かせる。
   * 選択肢の欄は j で選択そのものが動いてしまい、取り消せないため。
   */
  const pendingJ = useRef<{ at: number; el: Element } | null>(null)
  const handleEscapeChord = useCallback(
    (e: KeyboardEvent) => {
      // 変換中は e.key が 'Process' になるので、日本語入力中はそもそも当たらない。
      // 一時的な画面(絞り込み)が出ている間も触らない
      if (e.ctrlKey || e.altKey || e.metaKey || isComposing(e) || escOwners.current.length > 0) {
        pendingJ.current = null
        return
      }
      const el = document.activeElement
      const undoable =
        isTextEntry(el) && (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)
      if (!undoable) {
        pendingJ.current = null
        return
      }

      if (e.key === 'k') {
        const opener = pendingJ.current
        pendingJ.current = null
        if (
          opener &&
          opener.el === el &&
          e.timeStamp - opener.at <= ESCAPE_WINDOW_MS &&
          // j を戻せたときだけ抜ける。戻せないなら k はただの文字として入る
          removeCharBefore(el, 'j')
        ) {
          e.preventDefault()
          e.stopPropagation()
          exitInsert()
        }
        return
      }

      // 直前の j だけを覚える。本文の j で上書きされても、次の j が入り直すだけ
      pendingJ.current = e.key === 'j' ? { at: e.timeStamp, el } : null
    },
    [exitInsert],
  )

  // モードが変われば保留中の j は無効。持ち越すと Esc→i→k の並びで文字が消える
  useEffect(() => {
    pendingJ.current = null
  }, [mode])

  /**
   * Esc の受け止めと、移動中に値が化けるのを止める番。
   *
   * capture(先取り)で聞く。画面側の Esc は bubble で聞いているので、
   * 先取りしてここで止めない限り「入力を抜ける」と「画面を閉じる」が同時に起きてしまう。
   */
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // 変換中の Esc は変換の取消し。欄にそのまま渡す(1回目で変換、2回目で入力を抜ける)
      const plainEscape =
        e.key === 'Escape' && !isComposing(e) && !e.ctrlKey && !e.altKey && !e.metaKey

      // Esc を奪っている画面(絞り込み・札)があれば、そこが最優先で受ける
      if (plainEscape && escOwners.current.length > 0) {
        e.preventDefault()
        e.stopPropagation()
        escOwners.current[escOwners.current.length - 1]()
        return
      }

      if (modeRef.current === 'insert') {
        if (plainEscape) {
          e.preventDefault()
          e.stopPropagation()
          exitInsert()
          return
        }
        handleEscapeChord(e)
        return
      }

      // ---- ここから移動モード ----
      if (e.ctrlKey || e.altKey || e.metaKey) return
      if (e.key === 'Tab' || e.key === 'Escape') return
      // 選択肢・日付は readOnly が効かない。素のキーで中身が変わるのを止める
      // (preventDefault しても伝播は続くので、こちらのショートカットは動く)
      if (isStepControl(e.target)) {
        e.preventDefault()
        return
      }
      // readOnly でも Enter はフォームを送ってしまう
      if (e.key === 'Enter' && isTextEntry(e.target)) e.preventDefault()
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [exitInsert, handleEscapeChord])

  /** マウスで入力欄を触ったら入力モードにする。押した位置のキャレットはそのまま */
  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (isEditable(e.target)) enterInsert(e.target as HTMLElement, 'keep')
    }
    window.addEventListener('mousedown', onMouseDown, true)
    return () => window.removeEventListener('mousedown', onMouseDown, true)
  }, [enterInsert])

  /**
   * 「入力モードなのに、打てる欄にいない」を作らないための番。
   * 行の確定でボタンが消えた・Tabでボタンへ移った等でここに来る。
   * 放っておくと単キーもタイプも効かない詰み状態になる。
   */
  useEffect(() => {
    const settle = () => {
      if (modeRef.current === 'insert' && !isEditable(document.activeElement)) setMode('normal')
    }
    // フォーカスが消えた場合(要素ごと外れた等)は focusin が来ないので、次の描画で見る
    const onFocusOut = () => requestAnimationFrame(settle)
    window.addEventListener('focusin', settle)
    window.addEventListener('focusout', onFocusOut)
    return () => {
      window.removeEventListener('focusin', settle)
      window.removeEventListener('focusout', onFocusOut)
    }
  }, [])

  return (
    <ModeActionsContext value={actions}>
      <ModeStateContext value={mode}>{children}</ModeStateContext>
    </ModeActionsContext>
  )
}

/**
 * 開いている間、Esc を自分のものにする。
 * 絞り込みや札のような一時的な画面が「Escで閉じる」を確実に取るため。
 */
export function useEscapeOwner(active: boolean, handler: () => void): void {
  const { claimEscape } = useModeActions()
  const latest = useRef(handler)
  latest.current = handler

  useEffect(() => {
    if (!active) return
    return claimEscape(() => latest.current())
  }, [active, claimEscape])
}

/**
 * 入力モードを抜けた瞬間に一度だけ呼ぶ。
 * Esc は ModeProvider が先取りするので keydown が各欄まで届かない。
 * 「Escで書きかけを元に戻す」欄はこれで拾う。
 */
export function useOnExitInsert(handler: () => void): void {
  const mode = useMode()
  const previous = useRef(mode)
  // 発火時点の最新の中身で走らせたいので、毎レンダー差し替える
  const latest = useRef(handler)
  latest.current = handler

  useEffect(() => {
    const left = previous.current === 'insert' && mode === 'normal'
    previous.current = mode
    if (left) latest.current()
  }, [mode])
}

/**
 * その画面を開いた瞬間のモード。
 * 新規作成や議事録のように「開いた=打ちに来た」画面だけ入力から始める。
 * マウント時の1回だけ効く(あとから引数が変わっても切り替えない)。
 */
export function useInitialMode(mode: Mode): void {
  const { enterInsert, exitInsert } = useModeActions()
  const wanted = useRef(mode)
  wanted.current = mode

  useEffect(() => {
    if (wanted.current === 'insert') enterInsert()
    else exitInsert()
  }, [enterInsert, exitInsert])
}
