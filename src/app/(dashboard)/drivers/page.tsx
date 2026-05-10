'use client'

import { useEffect, useState } from 'react'
import { Search, Truck, Loader2, Download, ChevronLeft, ChevronRight } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useDebounce } from '@/hooks/use-debounce'
import { formatDate } from '@/lib/utils'

const PLATFORM_LABELS: Record<string, string> = {
  grab: 'Grab',
  be: 'Be',
  shopee: 'ShopeeFood',
  xanh_sm: 'Xanh SM',
  internal: 'Nội bộ',
}

const PLATFORM_COLORS: Record<string, string> = {
  grab: 'bg-[#e9fff5] text-[#00b14f] ring-[#b7efd0]',
  be: 'bg-[#fff7cc] text-[#111111] ring-[#f5dd74]',
  shopee: 'bg-[#fff1eb] text-[#ee4d2d] ring-[#ffd0c4]',
  xanh_sm: 'bg-[#e8fbf9] text-[#00a79d] ring-[#b8ece6]',
  internal: 'bg-[#eef2ff] text-[#334155] ring-[#dbe3f5]',
}

interface Driver {
  _id: string
  name: string
  phone: string
  platform: string
  visitCount: number
  lastSeenAt: string
}

function getReturningDriverLabel(visitCount: number) {
  if (visitCount <= 1) return null
  return `Tài xế quen x${visitCount}`
}

const PLATFORM_OPTIONS = [
  { value: '', label: 'Tất cả sàn' },
  { value: 'grab', label: 'Grab' },
  { value: 'be', label: 'Be' },
  { value: 'shopee', label: 'ShopeeFood' },
  { value: 'xanh_sm', label: 'Xanh SM' },
]

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100, 200, 500]

export default function DriversPage() {
  const [search, setSearch] = useState('')
  const [platformFilter, setPlatformFilter] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const dq = useDebounce(search)

  const params = new URLSearchParams()
  if (dq) params.set('q', dq)
  if (platformFilter) params.set('platform', platformFilter)

  const { data: drivers = [], isLoading } = useQuery<Driver[]>({
    queryKey: ['drivers', dq, platformFilter],
    queryFn: async () => {
      const r = await fetch(`/api/drivers?${params.toString()}`)
      if (!r.ok) throw new Error('Lỗi tải dữ liệu')
      return r.json()
    },
    staleTime: 30_000,
  })

  const platformCounts = drivers.reduce((acc, d) => {
    acc[d.platform] = (acc[d.platform] ?? 0) + 1
    return acc
  }, {} as Record<string, number>)

  useEffect(() => {
    setPage(1)
  }, [dq, platformFilter, pageSize])

  const totalPages = Math.max(1, Math.ceil(drivers.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const paginatedDrivers = drivers.slice((safePage - 1) * pageSize, safePage * pageSize)
  const startItem = drivers.length === 0 ? 0 : (safePage - 1) * pageSize + 1
  const endItem = Math.min(drivers.length, safePage * pageSize)

  const renderPagination = (position: 'top' | 'bottom') => (
    <div className={`flex flex-col gap-3 border-gray-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between ${position === 'top' ? 'border-b' : 'border-t'}`}>
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <span>Hiển thị</span>
        <select
          className="input h-9 w-24"
          value={pageSize}
          onChange={event => setPageSize(Number(event.target.value))}
        >
          {PAGE_SIZE_OPTIONS.map(option => <option key={option} value={option}>{option}</option>)}
        </select>
        <span>dòng</span>
        <span className="text-gray-400">|</span>
        <span>{startItem}-{endItem} / {drivers.length}</span>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setPage(current => Math.max(1, current - 1))}
          disabled={safePage <= 1}
          className="btn-outline h-9 px-3 text-sm disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ChevronLeft className="w-4 h-4" /> Trước
        </button>
        <div className="min-w-[88px] text-center text-sm font-medium text-gray-600">
          Trang {safePage}/{totalPages}
        </div>
        <button
          type="button"
          onClick={() => setPage(current => Math.min(totalPages, current + 1))}
          disabled={safePage >= totalPages}
          className="btn-outline h-9 px-3 text-sm disabled:cursor-not-allowed disabled:opacity-50"
        >
          Sau <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  )

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div>
          <h1 className="page-title">Dữ liệu tài xế</h1>
          <p className="page-subtitle">{isLoading ? '...' : `${drivers.length} tài xế`}</p>
        </div>
        <button
          onClick={() => {
            const p = new URLSearchParams()
            if (dq) p.set('q', dq)
            if (platformFilter) p.set('platform', platformFilter)
            p.set('export', 'csv')
            window.location.href = `/api/drivers?${p.toString()}`
          }}
          className="btn-outline h-9 text-sm"
        >
          <Download className="w-4 h-4" /> Xuất Excel
        </button>
      </div>

      {/* Platform summary */}
      {!isLoading && Object.keys(platformCounts).length > 0 && (
        <div className="flex flex-wrap gap-2">
          {Object.entries(platformCounts).map(([platform, count]) => (
            <button
              key={platform}
              type="button"
              onClick={() => setPlatformFilter(p => p === platform ? '' : platform)}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ring-1 ${PLATFORM_COLORS[platform] ?? 'bg-gray-100 text-gray-600 ring-gray-200'} ${platformFilter === platform ? 'ring-2' : ''}`}
            >
              {PLATFORM_LABELS[platform] ?? platform} <span className="opacity-70">({count})</span>
            </button>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="card card-body">
        <div className="filter-bar">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input className="input pl-9" placeholder="Tìm tên, số điện thoại..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <select className="input w-44" value={platformFilter} onChange={e => setPlatformFilter(e.target.value)}>
            {PLATFORM_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      </div>

      {/* States */}
      {isLoading && <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary-400" /></div>}

      {!isLoading && drivers.length === 0 ? (
        <div className="empty-state card">
          <Truck className="w-12 h-12 mb-3" />
          <p className="font-medium">Chưa có dữ liệu tài xế</p>
          <p className="text-sm text-gray-500 mt-1">Dữ liệu tài xế được tự động ghi nhận khi đồng bộ đơn hàng.</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          {renderPagination('top')}
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="px-4 py-3 text-left font-medium text-gray-600">Tên tài xế</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Số điện thoại</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Sàn</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Số lần gặp</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Lần gần nhất</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {paginatedDrivers.map((driver) => (
                <tr key={driver._id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{driver.name}</div>
                    {getReturningDriverLabel(driver.visitCount) && (
                      <div className="mt-1 inline-flex items-center rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-700 ring-1 ring-sky-200">
                        {getReturningDriverLabel(driver.visitCount)}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{driver.phone}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${PLATFORM_COLORS[driver.platform] ?? 'bg-gray-100 text-gray-600 ring-gray-200'}`}>
                      {PLATFORM_LABELS[driver.platform] ?? driver.platform}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm font-medium text-gray-700">{driver.visitCount ?? 0}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{driver.lastSeenAt ? formatDate(driver.lastSeenAt) : '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {renderPagination('bottom')}
        </div>
      )}
    </div>
  )
}
