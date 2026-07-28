import type { Memo } from '../types'

/** 一覧に出す1行要約。そのテンプレで一番言いたいところを拾う */
export function memoSummary(memo: Memo): string {
  const candidates =
    memo.type === 'soraamekasa'
      ? [memo.fact, memo.interpretation, memo.action]
      : memo.type === 'conclusion'
        ? [memo.conclusion, memo.reasons?.find(Boolean), memo.body]
        : [memo.body, memo.fact, memo.conclusion]
  const text = candidates.find((v) => v && v.trim())
  return (text?.trim() || '(空)').split('\n')[0]
}
