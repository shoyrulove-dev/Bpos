'use client'

import { useState } from 'react'
import { Plus, Calendar, Tag } from 'lucide-react'
import { mockPromotions } from '@/lib/mock-data'
import { cn, formatDate, PROMOTION_TYPE_LABEL, formatNumber } from '@/lib/utils'
import type { Promotion, PromotionStatus } from '@/types'

const TABS: { value: PromotionStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'Tất cả' },
  { value: 'active', label: 'Đang diễn ra' },
  { value: 'upcoming', label: 'Sắp diễn ra' },
  { value: 'ended', label: 'Đã kết thúc' },
]

const statusColor: Record<string, string> = {
  active: 'badge-green',
  upcoming: 'badge-blue',
  ended: 'badge-gray',
}
const statusLabel: Record<string, string> = {
  active: 'Đang diễn ra',
  upcoming: 'Sắp diễn ra',
  ended: 'Đã kết thúc',
}

export default function PromotionsPage() {
  const [tab, setTab] = useState<PromotionStatus | 'all'>('all')
  const [promotions] = useState<Promotion[]>(mockPromotions)
  const [showForm, setShowForm] = useState(false)

  const filtered = promotions.filter(p => tab === 'all' || p.status === tab)

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div>
          <h1 className="page-title">Khuyến mãi</h1>
          <p className="page-subtitle">{promotions.length} chương trình khuyến mãi</p>
        </div>
        <button onClick={() => setShowForm(true)} className="btn-primary">
          <Plus className="w-4 h-4" /> Tạo khuyến mãi
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1">
        {TABS.map(t => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={cn(
              'px-4 py-2 rounded-lg text-sm font-medium transition-all',
              tab === t.value ? 'bg-primary-500 text-white' : 'bg-white text-gray-500 hover:bg-gray-100 border border-gray-200'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="card">
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>Tên khuyến mãi</th>
                <th>Loại</th>
                <th>Thương hiệu</th>
                <th>Thời gian</th>
                <th>Số lượng</th>
                <th>Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-10 text-gray-400">Không có khuyến mãi</td></tr>
              ) : filtered.map(promo => (
                <tr key={promo._id}>
                  <td>
                    <div className="flex items-center gap-2">
                      <Tag className="w-4 h-4 text-primary-500" />
                      <span className="font-medium text-gray-900">{promo.name}</span>
                    </div>
                  </td>
                  <td><span className="badge badge-orange">{PROMOTION_TYPE_LABEL[promo.type]}</span></td>
                  <td className="text-sm text-gray-500">{promo.brandName}</td>
                  <td>
                    <div className="flex items-center gap-1.5 text-xs text-gray-500">
                      <Calendar className="w-3 h-3" />
                      {formatDate(promo.startAt, 'dd/MM/yyyy')} – {formatDate(promo.endAt, 'dd/MM/yyyy')}
                    </div>
                  </td>
                  <td>
                    {promo.quantity ? (
                      <div>
                        <div className="text-sm font-medium">{formatNumber(promo.quantity - (promo.usedCount ?? 0))} / {formatNumber(promo.quantity)}</div>
                        <div className="h-1 bg-gray-100 rounded mt-1">
                          <div className="h-full bg-primary-500 rounded" style={{ width: `${Math.min(100, ((promo.usedCount ?? 0) / promo.quantity) * 100)}%` }} />
                        </div>
                      </div>
                    ) : '—'}
                  </td>
                  <td><span className={cn('badge', statusColor[promo.status])}>{statusLabel[promo.status]}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-900">Tạo khuyến mãi</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
            </div>
            <div className="space-y-4">
              <div className="form-group">
                <label className="label">Tên khuyến mãi</label>
                <input className="input" placeholder="Flash sale -30%" />
              </div>
              <div className="form-group">
                <label className="label">Loại khuyến mãi</label>
                <select className="input">
                  <option value="discount_percent">Giảm %</option>
                  <option value="discount_amount">Giảm tiền</option>
                  <option value="free_item">Tặng món</option>
                  <option value="combo">Combo</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="form-group">
                  <label className="label">Bắt đầu</label>
                  <input type="date" className="input" />
                </div>
                <div className="form-group">
                  <label className="label">Kết thúc</label>
                  <input type="date" className="input" />
                </div>
              </div>
              <div className="form-group">
                <label className="label">Số lượng</label>
                <input type="number" className="input" placeholder="500" />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowForm(false)} className="btn-outline">Hủy</button>
              <button onClick={() => setShowForm(false)} className="btn-primary">Tạo khuyến mãi</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
