/** ローカル時刻の今日を YYYY-MM-DD で返す */
export function today(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** 期限までの残り日数。今日なら0、過ぎていれば負 */
export function daysUntil(deadline: string): number {
  const [y, m, d] = deadline.split('-').map(Number)
  const target = new Date(y, m - 1, d).getTime()
  const [ty, tm, td] = today().split('-').map(Number)
  const base = new Date(ty, tm - 1, td).getTime()
  return Math.round((target - base) / 86_400_000)
}

/** 一覧に出す期限の見え方(今日/明日/n日前 …) */
export function deadlineLabel(deadline?: string): string {
  if (!deadline) return '期限未定'
  const diff = daysUntil(deadline)
  if (diff === 0) return '今日'
  if (diff === 1) return '明日'
  if (diff === -1) return '昨日'
  if (diff < 0) return `${-diff}日超過`
  if (diff <= 7) return `あと${diff}日`
  return deadline
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/** 今日からn日後を YYYY-MM-DD で返す */
export function fromToday(days: number): string {
  const [y, m, d] = today().split('-').map(Number)
  const t = new Date(y, m - 1, d + days)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}`
}

/** 直近の金曜(今日が金曜なら今日) */
export function nextFriday(): string {
  const [y, m, d] = today().split('-').map(Number)
  const day = new Date(y, m - 1, d).getDay()
  return fromToday((5 - day + 7) % 7)
}

/** タイムスタンプから「何日前か」(日付単位。今日なら0) */
export function daysSince(iso: string): number {
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return -daysUntil(`${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`)
}
