export type DateRangeSource = URLSearchParams | { fromDate?: string; toDate?: string }

export type DateRange = {
  from?: Date
  to?: Date
  fromDate: string
  toDate: string
}

function readRangeValue(source: DateRangeSource, key: 'fromDate' | 'toDate') {
  if (source instanceof URLSearchParams) return source.get(key) ?? ''
  return source[key] ?? ''
}

export function formatDateInput(date: Date) {
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return localDate.toISOString().slice(0, 10)
}

function parseDateBoundary(value: string, endOfDay: boolean) {
  if (!value) return undefined
  const date = new Date(`${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}`)
  if (Number.isNaN(date.getTime())) return undefined
  return date
}

export function createRelativeDateRange(days: number) {
  const to = new Date()
  const from = new Date()
  from.setDate(from.getDate() - days)
  from.setHours(0, 0, 0, 0)

  return {
    fromDate: formatDateInput(from),
    toDate: formatDateInput(to),
  }
}

export function resolveDateRange(source: DateRangeSource, options?: { defaultDays?: number | null }) {
  let fromDate = readRangeValue(source, 'fromDate')
  let toDate = readRangeValue(source, 'toDate')

  if (!fromDate && !toDate && typeof options?.defaultDays === 'number') {
    const fallback = createRelativeDateRange(options.defaultDays)
    fromDate = fallback.fromDate
    toDate = fallback.toDate
  }

  return {
    from: parseDateBoundary(fromDate, false),
    to: parseDateBoundary(toDate, true),
    fromDate,
    toDate,
  }
}

export function formatDateRangeLabel(fromDate: string, toDate: string) {
  if (!fromDate && !toDate) return 'Toàn thời gian'
  if (fromDate && toDate) return `${fromDate} đến ${toDate}`
  if (fromDate) return `Từ ${fromDate}`
  return `Đến ${toDate}`
}
