// Short "time ago" label for a "last synced" / "last updated" style indicator —
// not a general-purpose i18n formatter, just coarse enough to spot a stale sync
// at a glance (seconds/minutes/hours/days, then falls back to a date).
export function formatRelativeTime(iso: string | undefined): string {
  if (!iso) return 'never'
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return 'never'

  const diffMs = Date.now() - then
  if (diffMs < 0) return 'just now'

  const sec = Math.floor(diffMs / 1000)
  if (sec < 45) return 'just now'

  const min = Math.floor(sec / 60)
  if (min < 60) return `${min} minute${min === 1 ? '' : 's'} ago`

  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr} hour${hr === 1 ? '' : 's'} ago`

  const day = Math.floor(hr / 24)
  if (day < 30) return `${day} day${day === 1 ? '' : 's'} ago`

  const month = Math.floor(day / 30)
  if (month < 12) return `${month} month${month === 1 ? '' : 's'} ago`

  const year = Math.floor(month / 12)
  return `${year} year${year === 1 ? '' : 's'} ago`
}
