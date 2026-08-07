import { REPORT_KIND_LABEL, type Report, type ReportKind } from '../types'

/** 報告の文章になる箱。id と日時以外の全部 */
export const REPORT_TEXT_KEYS = [
  'conclusion',
  'result',
  'plan',
  'decisions',
  'verified',
  'concerns',
  'requests',
] as const

export type ReportTextKey = (typeof REPORT_TEXT_KEYS)[number]
export type ReportValues = Record<ReportTextKey, string>

export interface ReportFieldDef {
  key: ReportTextKey
  label: string
  hint: string
  placeholder?: string
  /** 無ければ1行の箱(TextBox)。結論は1行に縛ることで結論ファーストを強制する */
  rows?: number
}

/**
 * 中間報告(30%確認)。「合っているか」を聞きに行く骨格。
 * 完了報告と同じ箱を使い回すもの(decisions等)もラベルは種類ごとに持つ。
 */
const PROGRESS_FIELDS: ReportFieldDef[] = [
  {
    key: 'conclusion',
    label: '結論',
    hint: '1行で。いまどこまで来ていて、何を確認したいか',
    placeholder: '例: 構成案までできた。この方向で進めてよいか確認したい',
  },
  {
    key: 'result',
    label: 'ここまでの結果',
    hint: 'できているもの。どこを見せるか',
    rows: 3,
  },
  {
    key: 'plan',
    label: 'これからの方針',
    hint: '残りをどう進めるつもりか',
    rows: 3,
  },
  {
    key: 'decisions',
    label: '自分で判断したこと',
    hint: '指示に無かった判断とその理由。無ければ「なし」と書く',
    rows: 3,
  },
  {
    key: 'concerns',
    label: '懸念・不安',
    hint: '言いそびれると後で大きくなるもの',
    rows: 2,
  },
  {
    key: 'requests',
    label: '確認したいこと',
    hint: '相手に判断してほしい点。未解決の疑問点が最初から入る',
    rows: 3,
  },
]

/** 完了報告。「終わった」を伝えて次へ進める骨格 */
const FINAL_FIELDS: ReportFieldDef[] = [
  {
    key: 'conclusion',
    label: '結論',
    hint: '1行で。「完了しました」+ どうなったか',
    placeholder: '例: 販促資料が完成。共有フォルダに置いた',
  },
  {
    key: 'result',
    label: '結果',
    hint: '成果物の場所と形。どこを見れば確認できるか',
    rows: 3,
  },
  {
    key: 'decisions',
    label: '自分で判断したこと',
    hint: '指示に無かった判断とその理由。無ければ「なし」と書く',
    rows: 3,
  },
  {
    key: 'verified',
    label: '確認した範囲',
    hint: 'テスト・チェックをどこまでやったか(やっていない範囲も)',
    rows: 3,
  },
  {
    key: 'concerns',
    label: '残課題・懸念',
    hint: '残っていること。無ければ「なし」と書く',
    rows: 2,
  },
  {
    key: 'requests',
    label: '相手への依頼',
    hint: 'してほしいこと + いつまでに(レビュー・承認・展開など)',
    rows: 2,
  },
]

/** その種類で埋めるべき箱を、報告で話す順に返す */
export function reportFields(kind: ReportKind): ReportFieldDef[] {
  return kind === 'final' ? FINAL_FIELDS : PROGRESS_FIELDS
}

export function emptyReportValues(): ReportValues {
  return {
    conclusion: '',
    result: '',
    plan: '',
    decisions: '',
    verified: '',
    concerns: '',
    requests: '',
  }
}

export function pickReportValues(report: Report): ReportValues {
  const values = emptyReportValues()
  for (const key of REPORT_TEXT_KEYS) values[key] = report[key]
  return values
}

/**
 * そのまま Teams やメールに貼れる形にする。
 * 空の箱は出さない(送る段では「なし」と書いた箱だけが残る)。
 */
export function formatReport(taskTitle: string, kind: ReportKind, values: ReportValues): string {
  const lines: string[] = [`【${REPORT_KIND_LABEL[kind]}】${taskTitle || '(無題)'}`]
  for (const field of reportFields(kind)) {
    const value = values[field.key].trim()
    if (!value) continue
    if (field.key === 'conclusion') lines.push(`結論: ${value}`)
    else lines.push('', `■ ${field.label}`, value)
  }
  return lines.join('\n')
}
