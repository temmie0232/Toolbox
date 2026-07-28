import type { Memo } from '../types'

/** 一覧に出す1行要約。空雨傘は「空」が空でも雨・傘を拾う */
export function memoSummary(memo: Memo): string {
  const text =
    memo.type === 'soraamekasa'
      ? memo.fact || memo.interpretation || memo.action
      : memo.body || memo.fact || memo.interpretation || memo.action
  return (text?.trim() || '(空)').split('\n')[0]
}
