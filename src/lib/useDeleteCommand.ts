import { useCallback, useEffect, useRef, useState } from 'react'
import { useEscapeOwner } from './mode'

/**
 * `d` で1件消す。一覧は「乗っている行」、詳細は「その画面のもの」。
 *
 * **1回目は構えるだけで、2回目の `d` で消える**(vim の dd と同じ手つき)。
 * 消える前に必ず名前を画面に出す。単キーで消えるものを黙って実行すると、
 * 打ち間違いと取り違えの両方が取り返しの付かない形で出る。
 */

/** 消す対象1件。確認の文はここから組み立てる */
export interface DeleteTarget {
  id: string
  /** 「タスク」「メモ」など。何を消すのか取り違えないよう必ず出す */
  kind: string
  /** その1件の名前(タイトル・要約) */
  name: string
  /** 一緒に消えるもの / 残るもの。無ければ省く */
  note?: string
}

interface Options {
  /**
   * いま消せる1件。フォーカスから引く画面があるので、押された時点で評価する。
   * 決まらなければ undefined(一覧で行に乗っていないとき)
   */
  resolve: () => DeleteTarget | undefined
  /** 実際に消す。失敗の表示と画面遷移は呼び出し側に任せる */
  remove: (target: DeleteTarget) => void | Promise<void>
  /** いま消させない理由。録音中など。返した文字列をそのまま画面に出す */
  blocked?: () => string | undefined
  /** 対象が決まらないときに出す一言 */
  emptyHint?: string
}

/** 知らせを消すまでの時間。押したのに何も起きない、を作らないためだけの表示 */
const NOTICE_MS = 2500

export interface DeleteCommand {
  /** 構えている対象。null なら確認は出ていない */
  armed: DeleteTarget | null
  /** 対象が決まらなかった・いまは消せない、の一言 */
  notice: string | null
  /** `d`(とGUIの「削除」)。構える → 同じ対象でもう一度なら消す */
  press: () => void
  /** 構えている対象を消す。確認の「削除する」から呼ぶ */
  confirm: () => void
  /** やめる。Esc はこのフックが自分で取る */
  disarm: () => void
}

export function useDeleteCommand({ resolve, remove, blocked, emptyHint }: Options): DeleteCommand {
  const [armed, setArmed] = useState<DeleteTarget | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  // 押された瞬間の中身で動かしたいので、毎レンダー差し替える
  const latest = useRef({ resolve, remove, blocked, emptyHint })
  latest.current = { resolve, remove, blocked, emptyHint }

  // 連打の2打目は再描画を待たずに来ることがあるので、判定は ref で持つ
  const armedRef = useRef<DeleteTarget | null>(armed)
  const noticeTimer = useRef<number | undefined>(undefined)

  const setArmedNow = useCallback((next: DeleteTarget | null) => {
    armedRef.current = next
    setArmed(next)
  }, [])

  const showNotice = useCallback((text: string) => {
    setNotice(text)
    window.clearTimeout(noticeTimer.current)
    noticeTimer.current = window.setTimeout(() => setNotice(null), NOTICE_MS)
  }, [])

  useEffect(() => () => window.clearTimeout(noticeTimer.current), [])

  const disarm = useCallback(() => {
    setArmedNow(null)
    setNotice(null)
  }, [setArmedNow])

  const run = useCallback(
    (target: DeleteTarget) => {
      // 消えた行の位置に乗り直す。取っておくのは消す前(消した後では列が変わっている)
      const restoreFocus = focusRestorer()
      setArmedNow(null)
      setNotice(null)
      void Promise.resolve(latest.current.remove(target)).catch(() => undefined)
      restoreFocus?.()
    },
    [setArmedNow],
  )

  const confirm = useCallback(() => {
    const target = armedRef.current
    if (target) run(target)
  }, [run])

  const press = useCallback(() => {
    const why = latest.current.blocked?.()
    if (why) {
      setArmedNow(null)
      showNotice(why)
      return
    }
    const target = latest.current.resolve()
    if (!target) {
      setArmedNow(null)
      showNotice(latest.current.emptyHint ?? '消すものの上で押す(j / k で乗る)')
      return
    }
    // 構えたまま別のものへ移っていたら、消さずに構え直す。
    // 「Aで構える → j → d」で B が消えるのが一番まずい
    if (armedRef.current?.id === target.id) {
      run(target)
      return
    }
    setNotice(null)
    setArmedNow(target)
  }, [run, setArmedNow, showNotice])

  // 構えている間だけ Esc を取る。取らないと画面側の Esc(一覧へ戻る)と食い合う
  useEscapeOwner(armed !== null, disarm)

  /**
   * 構えたあとに別の行へ移ったら構えを解く。
   * 出しっぱなしの確認が、いま乗っている行とは別のものを指したままになるのを防ぐ。
   * 詳細画面は resolve がフォーカスを見ないので、ここでは解けない
   */
  useEffect(() => {
    if (!armed) return
    const onFocusIn = () => {
      if (latest.current.resolve()?.id !== armedRef.current?.id) {
        armedRef.current = null
        setArmed(null)
      }
    }
    window.addEventListener('focusin', onFocusIn)
    return () => window.removeEventListener('focusin', onFocusIn)
  }, [armed])

  return { armed, notice, press, confirm, disarm }
}

/**
 * 消した行の位置に乗り直すための後始末。消す前に呼んで、返ってきた関数を消した直後に呼ぶ。
 *
 * 続けて消せるようにするため。フォーカスが body に落ちると、次の `d` は対象を見失う。
 * 一覧の行(`data-item-id`)にいるときだけ働く(詳細画面では何もしない)。
 */
function focusRestorer(): (() => void) | null {
  const active = document.activeElement
  if (!(active instanceof HTMLElement)) return null
  const row = active.closest<HTMLElement>('[data-item-id]')
  if (!row) return null
  const rows = listRows()
  const index = rows.indexOf(row)
  if (index < 0) return null

  return () => {
    // 消えた行が画面から取れるのは次の描画のあと
    requestAnimationFrame(() => {
      const next = listRows()
      // 減っていないなら消えていない(失敗した等)。触らずに置く
      if (next.length === 0 || next.length >= rows.length) return
      const target = next[Math.min(index, next.length - 1)]
      target.focus({ preventScroll: true })
      target.scrollIntoView({ block: 'nearest' })
    })
  }
}

function listRows(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('[data-item-id]'))
}

/**
 * いま乗っている行のid。一覧の行に `data-item-id` を付けておく。
 * 行そのものだけでなく、行の中の細かいもの(期限チップ等)にいても同じ行として扱う
 */
export function focusedItemId(): string | undefined {
  const active = document.activeElement
  if (!(active instanceof HTMLElement)) return undefined
  return active.closest<HTMLElement>('[data-item-id]')?.dataset.itemId
}
