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
