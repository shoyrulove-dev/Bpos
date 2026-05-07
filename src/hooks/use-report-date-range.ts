'use client'

import { useState } from 'react'
import { createRelativeDateRange } from '@/lib/date-range'

export function useReportDateRange(defaultDays = 30) {
  const initialRange = createRelativeDateRange(defaultDays)
  const [fromDate, setFromDate] = useState(initialRange.fromDate)
  const [toDate, setToDate] = useState(initialRange.toDate)

  const setQuickRange = (days: number) => {
    const nextRange = createRelativeDateRange(days)
    setFromDate(nextRange.fromDate)
    setToDate(nextRange.toDate)
  }

  return {
    fromDate,
    toDate,
    setFromDate,
    setToDate,
    setQuickRange,
  }
}
