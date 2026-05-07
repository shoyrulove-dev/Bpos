'use client'

import { useState } from 'react'
import { Plus, Clock, X, Loader2, TrendingUp } from 'lucide-react'
import { useShifts, useOpenShift, useCloseShift } from '@/hooks/use-data'
import { cn, formatCurrency, formatDate, SHIFT_STATUS_LABEL } from '@/lib/utils'
import type { Shift } from '@/types'

const SHIFT_STATUS_COLOR: Record<string, string> = {
  open: 'badge-green',
  closed: 'badge-gray',
}

const emptyOpenForm = { hubId: '', brandId: '', openCash: '', note: '' }
const emptyCloseForm = { closeCash: '', note: '' }

export default function ShiftsPage() {
  const [statusFilter, setStatusFilter] = useState('')
  const [showOpenModal, setShowOpenModal] = useState(false)
  const [showCloseModal, setShowCloseModal] = useState(false)
  const [closingShift, setClosingShift] = useState<Shift | null>(null)
  const [openForm, setOpenForm] = useState(emptyOpenForm)
  const [closeForm, setCloseForm] = useState(emptyCloseForm)

  const { data, isLoading } = useShifts({ status: statusFilter || undefined })
  const shifts = (Array.isArray(data) ? data : data?.shifts ?? []) as Shift[]
  const openShiftMutation = useOpenShift()
  const closeShiftMutation = useCloseShift()

  const handleOpenShift = async () => {
    if (!openForm.hubId || !openForm.openCash) return
    await openShiftMutation.mutateAsync({
      hubId: openForm.hubId,
      brandId: openForm.brandId || undefined,
      openCash: Number(openForm.openCash),
      note: openForm.note || undefined,
    })
    setShowOpenModal(false)
    setOpenForm(emptyOpenForm)
  }

  const handleCloseShift = async () => {
    if (!closingShift || !closeForm.closeCash) return
    await closeShiftMutation.mutateAsync({
      id: closingShift._id,
      action: 'close',
      closeCash: Number(closeForm.closeCash),
      note: closeForm.note || undefined,
    })
    setShowCloseModal(false)
    setCloseForm(emptyCloseForm)
    setClosingShift(null)
  }

  const startClose = (shift: Shift) => {
    setClosingShift(shift)
    setCloseForm(emptyCloseForm)
    setShowCloseModal(true)
  }

  const openCount = shifts.filter(s => s.status === 'open').length

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div>
          <h1 className="page-title">Ca bán hàng</h1>
          <p className="page-subtitle">{isLoading ? '...' : `${shifts.length} ca — ${openCount} đang mở`}</p>
        </div>
        <button onClick={() => { setOpenForm(emptyOpenForm); setShowOpenModal(true) }} className="btn-primary">
          <Plus className="w-4 h-4" /> Mở ca mới
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center">
              <Clock className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <div className="text-sm text-gray-500">Ca đang mở</div>
              <div className="text-2xl font-bold text-gray-900">{openCount}</div>
            </div>
          </div>
        </div>
        <div className="card p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center">
              <Clock className="w-5 h-5 text-gray-500" />
            </div>
            <div>
              <div className="text-sm text-gray-500">Ca đã đóng</div>
              <div className="text-2xl font-bold text-gray-900">{shifts.filter(s => s.status === 'closed').length}</div>
            </div>
          </div>
        </div>
        <div className="card p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-orange-500" />
            </div>
            <div>
              <div className="text-sm text-gray-500">Doanh thu hôm nay</div>
              <div className="text-2xl font-bold text-gray-900">
                {formatCurrency(shifts.filter(s => {
                  const d = new Date(s.openedAt)
                  const now = new Date()
                  return d.toDateString() === now.toDateString()
                }).reduce((sum, s) => sum + (s.revenue ?? 0), 0))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Filter */}
      <div className="flex gap-2">
        {[{ value: '', label: 'Tất cả' }, { value: 'open', label: 'Đang mở' }, { value: 'closed', label: 'Đã đóng' }].map(opt => (
          <button key={opt.value} onClick={() => setStatusFilter(opt.value)}
            className={cn('px-4 py-2 rounded-lg text-sm font-medium transition-all border', statusFilter === opt.value ? 'bg-primary-500 text-white border-primary-500' : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50')}>
            {opt.label}
          </button>
        ))}
      </div>

      <div className="card">
        {isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-7 h-7 animate-spin text-primary-400" /></div>
        ) : (
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>Cửa hàng</th>
                  <th>Người mở ca</th>
                  <th>Mở ca lúc</th>
                  <th>Đóng ca lúc</th>
                  <th>Tiền đầu ca</th>
                  <th>Tiền cuối ca</th>
                  <th>Đơn hàng</th>
                  <th>Doanh thu</th>
                  <th>Trạng thái</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {shifts.length === 0 ? (
                  <tr><td colSpan={10} className="text-center py-12 text-gray-400">Chưa có ca bán hàng nào</td></tr>
                ) : shifts.map(shift => (
                  <tr key={shift._id}>
                    <td>
                      <div className="font-medium text-gray-900 text-sm">{shift.hubName || shift.hubId}</div>
                      {shift.brandName && <div className="text-xs text-gray-400">{shift.brandName}</div>}
                    </td>
                    <td className="text-sm text-gray-600">{shift.openedByName || shift.openedById}</td>
                    <td className="text-xs text-gray-500">{formatDate(shift.openedAt, 'dd/MM/yyyy HH:mm')}</td>
                    <td className="text-xs text-gray-500">{shift.closedAt ? formatDate(shift.closedAt, 'dd/MM/yyyy HH:mm') : '—'}</td>
                    <td className="text-sm">{formatCurrency(shift.openCash)}</td>
                    <td className="text-sm">{shift.closeCash != null ? formatCurrency(shift.closeCash) : '—'}</td>
                    <td className="text-sm font-medium text-center">{shift.orderCount ?? '—'}</td>
                    <td className="text-sm font-semibold">{shift.revenue != null ? formatCurrency(shift.revenue) : '—'}</td>
                    <td>
                      <span className={cn('badge', SHIFT_STATUS_COLOR[shift.status])}>
                        {SHIFT_STATUS_LABEL[shift.status]}
                      </span>
                    </td>
                    <td>
                      {shift.status === 'open' && (
                        <button onClick={() => startClose(shift)} className="btn-outline btn-sm text-xs px-2 py-1">
                          Đóng ca
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Open Shift Modal */}
      {showOpenModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-semibold text-gray-900">Mở ca bán hàng</h2>
              <button onClick={() => setShowOpenModal(false)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="label">ID Cửa hàng (Hub) *</label>
                <input className="input" value={openForm.hubId} onChange={e => setOpenForm({ ...openForm, hubId: e.target.value })} placeholder="hub_001" />
              </div>
              <div>
                <label className="label">ID Thương hiệu</label>
                <input className="input" value={openForm.brandId} onChange={e => setOpenForm({ ...openForm, brandId: e.target.value })} placeholder="Tùy chọn" />
              </div>
              <div>
                <label className="label">Tiền mặt đầu ca (VND) *</label>
                <input type="number" className="input" value={openForm.openCash} onChange={e => setOpenForm({ ...openForm, openCash: e.target.value })} placeholder="500000" />
              </div>
              <div>
                <label className="label">Ghi chú</label>
                <textarea className="input resize-none" rows={2} value={openForm.note} onChange={e => setOpenForm({ ...openForm, note: e.target.value })} placeholder="Ghi chú ca làm việc..." />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
              <button onClick={() => setShowOpenModal(false)} className="btn-outline">Hủy</button>
              <button onClick={handleOpenShift} disabled={openShiftMutation.isPending} className="btn-primary min-w-[80px]">
                {openShiftMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Mở ca'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Close Shift Modal */}
      {showCloseModal && closingShift && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-semibold text-gray-900">Đóng ca bán hàng</h2>
              <button onClick={() => setShowCloseModal(false)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="p-4 bg-gray-50 rounded-xl space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Cửa hàng</span>
                  <span className="font-medium">{closingShift.hubName || closingShift.hubId}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Mở ca lúc</span>
                  <span>{formatDate(closingShift.openedAt, 'dd/MM/yyyy HH:mm')}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Tiền đầu ca</span>
                  <span className="font-semibold">{formatCurrency(closingShift.openCash)}</span>
                </div>
              </div>
              <div>
                <label className="label">Tiền mặt cuối ca (VND) *</label>
                <input type="number" className="input" value={closeForm.closeCash} onChange={e => setCloseForm({ ...closeForm, closeCash: e.target.value })} placeholder="1200000" />
              </div>
              <div>
                <label className="label">Ghi chú</label>
                <textarea className="input resize-none" rows={2} value={closeForm.note} onChange={e => setCloseForm({ ...closeForm, note: e.target.value })} placeholder="Ghi chú khi đóng ca..." />
              </div>
              <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl text-xs text-blue-700">
                Hệ thống sẽ tự động tổng hợp doanh thu và số đơn hàng trong ca này.
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
              <button onClick={() => setShowCloseModal(false)} className="btn-outline">Hủy</button>
              <button onClick={handleCloseShift} disabled={closeShiftMutation.isPending} className="btn-primary min-w-[80px]">
                {closeShiftMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Đóng ca'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
