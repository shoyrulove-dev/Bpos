'use client'

import { CalendarDays, Download } from 'lucide-react'
import { formatDateRangeLabel } from '@/lib/date-range'

const QUICK_RANGES = [7, 30, 90]

type ReportToolbarProps = {
  title: string
  subtitle: string
  fromDate: string
  toDate: string
  onFromDateChange: (value: string) => void
  onToDateChange: (value: string) => void
  onQuickRangeChange: (days: number) => void
  onExport: () => void
  exportLabel?: string
}

export default function ReportToolbar({
  title,
  subtitle,
  fromDate,
  toDate,
  onFromDateChange,
  onToDateChange,
  onQuickRangeChange,
  onExport,
  exportLabel = 'Xuất Excel',
}: ReportToolbarProps) {
  return (
    <div className="page-header gap-4">
      <div>
        <h1 className="page-title">{title}</h1>
        <p className="page-subtitle">{subtitle}</p>
        <p className="mt-1 text-xs text-gray-400">{formatDateRangeLabel(fromDate, toDate)}</p>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div className="flex items-center gap-1 rounded-xl border border-gray-200 bg-white p-1">
          {QUICK_RANGES.map((days) => (
            <button
              key={days}
              type="button"
              onClick={() => onQuickRangeChange(days)}
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-gray-600 transition hover:bg-gray-50"
            >
              {days} ngày
            </button>
          ))}
        </div>

        <label className="form-group min-w-[150px]">
          <span className="label flex items-center gap-1"><CalendarDays className="w-3.5 h-3.5" /> Từ ngày</span>
          <input type="date" className="input h-10" value={fromDate} onChange={(event) => onFromDateChange(event.target.value)} />
        </label>

        <label className="form-group min-w-[150px]">
          <span className="label">Đến ngày</span>
          <input type="date" className="input h-10" value={toDate} onChange={(event) => onToDateChange(event.target.value)} />
        </label>

        <button type="button" onClick={onExport} className="btn-outline h-10">
          <Download className="w-4 h-4" /> {exportLabel}
        </button>
      </div>
    </div>
  )
}