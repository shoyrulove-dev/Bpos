'use client'

import { useState } from 'react'
import { Plus, Calendar, Tag, Loader2, Truck, ShoppingBag, Percent, DollarSign, Gift, Package2 } from 'lucide-react'
import { usePromotions, useCreatePromotion } from '@/hooks/use-data'
import { cn, formatDate, formatNumber, PROMOTION_TYPE_LABEL, PROMOTION_TYPE_COLOR } from '@/lib/utils'
import type { Promotion, PromotionStatus, PromotionType } from '@/types'

const TABS: { value: PromotionStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'Tất cả' },
  { value: 'active', label: 'Đang diễn ra' },
  { value: 'upcoming', label: 'Sắp diễn ra' },
  { value: 'ended', label: 'Đã kết thúc' },
]

const statusColor: Record<string, string> = {
  active: 'badge-green', upcoming: 'badge-blue', ended: 'badge-gray',
}
const statusLabel: Record<string, string> = {
  active: 'Đang diễn ra', upcoming: 'Sắp diễn ra', ended: 'Đã kết thúc',
}

const TYPE_ICONS: Record<string, React.ReactNode> = {
  discount_percent: <Percent className="w-4 h-4" />,
  discount_amount: <DollarSign className="w-4 h-4" />,
  free_item: <Gift className="w-4 h-4" />,
  combo: <Package2 className="w-4 h-4" />,
  order_tiered_discount: <ShoppingBag className="w-4 h-4" />,
  shipping_discount: <Truck className="w-4 h-4" />,
}

const emptyForm = {
  name: '', description: '', code: '',
  type: 'discount_percent' as PromotionType,
  startAt: '', endAt: '',
  quantity: '', maxPerUser: '',
  allowCombine: false,
  discountType: 'percent', discountValue: '',
  brandId: '',
}

export default function PromotionsPage() {
  const [tab, setTab] = useState<PromotionStatus | 'all'>('all')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<Record<string, unknown>>(emptyForm)

  const { data: rawPromos = [], isLoading } = usePromotions()
  const createMutation = useCreatePromotion()
  const allPromos = rawPromos as Promotion[]
  const filtered = allPromos.filter((p: Promotion) => tab === 'all' || p.status === tab)

  const handleSave = async () => {
    if (!form.name || !form.startAt || !form.endAt) return
    const payload = {
      ...form,
      quantity: form.quantity ? Number(form.quantity) : undefined,
      maxPerUser: form.maxPerUser ? Number(form.maxPerUser) : undefined,
      discountValue: form.discountValue ? Number(form.discountValue) : undefined,
    }
    await createMutation.mutateAsync(payload)
    setShowForm(false)
    setForm(emptyForm)
  }

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div>
          <h1 className="page-title">Khuyến mãi</h1>
          <p className="page-subtitle">{isLoading ? '...' : `${allPromos.length} chương trình`}</p>
        </div>
        <button onClick={() => { setForm(emptyForm); setShowForm(true) }} className="btn-primary">
          <Plus className="w-4 h-4" /> Tạo khuyến mãi
        </button>
      </div>

      {/* Type summary cards */}
      <div className="grid grid-cols-3 lg:grid-cols-6 gap-3">
        {Object.entries(PROMOTION_TYPE_LABEL).map(([type, label]) => {
          const count = allPromos.filter(p => p.type === type).length
          return (
            <div key={type} className="card p-3 text-center">
              <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center mx-auto mb-2', PROMOTION_TYPE_COLOR[type])}>
                {TYPE_ICONS[type]}
              </div>
              <div className="text-xs text-gray-500 leading-tight">{label}</div>
              <div className="text-lg font-bold text-gray-900">{count}</div>
            </div>
          )
        })}
      </div>

      {/* Tabs */}
      <div className="flex gap-1">
        {TABS.map(t => (
          <button key={t.value} onClick={() => setTab(t.value)}
            className={cn('px-4 py-2 rounded-lg text-sm font-medium transition-all', tab === t.value ? 'bg-primary-500 text-white' : 'bg-white text-gray-500 hover:bg-gray-100 border border-gray-200')}>
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
                <th>Mã voucher</th>
                <th>Thương hiệu</th>
                <th>Thời gian</th>
                <th>Số lượng</th>
                <th>Kết hợp</th>
                <th>Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-12 text-gray-400">Không có khuyến mãi</td></tr>
              ) : filtered.map(promo => (
                <tr key={promo._id}>
                  <td>
                    <div className="flex items-center gap-2">
                      <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0', PROMOTION_TYPE_COLOR[promo.type])}>
                        {TYPE_ICONS[promo.type]}
                      </div>
                      <div>
                        <div className="font-medium text-gray-900 text-sm">{promo.name}</div>
                        {promo.description && <div className="text-xs text-gray-400">{promo.description}</div>}
                      </div>
                    </div>
                  </td>
                  <td><span className={cn('badge text-xs', PROMOTION_TYPE_COLOR[promo.type])}>{PROMOTION_TYPE_LABEL[promo.type]}</span></td>
                  <td>
                    {promo.code
                      ? <span className="font-mono text-xs bg-gray-100 px-2 py-0.5 rounded text-gray-700">{promo.code}</span>
                      : <span className="text-gray-400 text-xs">—</span>}
                  </td>
                  <td className="text-sm text-gray-500">{promo.brandName}</td>
                  <td>
                    <div className="flex items-center gap-1.5 text-xs text-gray-500">
                      <Calendar className="w-3 h-3" />
                      {formatDate(promo.startAt, 'dd/MM')} – {formatDate(promo.endAt, 'dd/MM/yyyy')}
                    </div>
                  </td>
                  <td>
                    {promo.quantity ? (
                      <div>
                        <div className="text-sm font-medium">{formatNumber(promo.quantity - (promo.usedCount ?? 0))} / {formatNumber(promo.quantity)}</div>
                        <div className="h-1 bg-gray-100 rounded mt-1 w-20">
                          <div className="h-full bg-primary-500 rounded" style={{ width: `${Math.min(100, ((promo.usedCount ?? 0) / promo.quantity) * 100)}%` }} />
                        </div>
                      </div>
                    ) : <span className="text-gray-400 text-xs">Không giới hạn</span>}
                  </td>
                  <td>
                    <span className={cn('badge', promo.allowCombine ? 'badge-green' : 'badge-gray')}>
                      {promo.allowCombine ? 'Cho phép' : 'Không'}
                    </span>
                  </td>
                  <td><span className={cn('badge', statusColor[promo.status])}>{statusLabel[promo.status]}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
              <h2 className="font-semibold text-gray-900">Tạo chương trình khuyến mãi</h2>
              <button onClick={() => setShowForm(false)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400">&times;</button>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto flex-1">
              <div>
                <label className="label mb-2">Loại khuyến mãi *</label>
                <div className="grid grid-cols-3 gap-2">
                  {Object.entries(PROMOTION_TYPE_LABEL).map(([type, label]) => (
                    <button key={type} type="button" onClick={() => setForm({ ...form, type })}
                      className={cn('p-3 rounded-xl border-2 text-center transition-all', form.type === type ? 'border-primary-400 bg-primary-50 text-primary-700' : 'border-gray-200 text-gray-600 hover:border-gray-300')}>
                      <div className="flex justify-center mb-1 text-sm">{TYPE_ICONS[type]}</div>
                      <div className="text-xs leading-tight font-medium">{label}</div>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="label">Tên khuyến mãi *</label>
                <input className="input" value={String(form.name || '')} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Flash sale -30% Gà Nướng" />
              </div>
              <div>
                <label className="label">Mô tả</label>
                <input className="input" value={String(form.description || '')} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Áp dụng thứ 2 đến thứ 6..." />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Mã voucher</label>
                  <input className="input font-mono uppercase" value={String(form.code || '')} onChange={e => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="GIANANG30" />
                </div>
                <div>
                  <label className="label">Giới hạn / người</label>
                  <input type="number" className="input" value={String(form.maxPerUser || '')} onChange={e => setForm({ ...form, maxPerUser: e.target.value })} placeholder="1" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Bắt đầu *</label>
                  <input type="datetime-local" className="input" value={String(form.startAt || '')} onChange={e => setForm({ ...form, startAt: e.target.value })} />
                </div>
                <div>
                  <label className="label">Kết thúc *</label>
                  <input type="datetime-local" className="input" value={String(form.endAt || '')} onChange={e => setForm({ ...form, endAt: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Tổng số lượng</label>
                  <input type="number" className="input" value={String(form.quantity || '')} onChange={e => setForm({ ...form, quantity: e.target.value })} placeholder="Không giới hạn" />
                </div>
                <div>
                  <label className="label">Loại giảm</label>
                  <select className="input" value={String(form.discountType || '')} onChange={e => setForm({ ...form, discountType: e.target.value })}>
                    <option value="percent">Phần trăm (%)</option>
                    <option value="amount">Số tiền (VND)</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="label">Giá trị giảm</label>
                <input type="number" className="input" value={String(form.discountValue || '')} onChange={e => setForm({ ...form, discountValue: e.target.value })} placeholder={form.discountType === 'percent' ? '30 (%)' : '50000 (VND)'} />
              </div>
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                <input type="checkbox" id="allowCombine" checked={Boolean(form.allowCombine)} onChange={e => setForm({ ...form, allowCombine: e.target.checked })} className="w-4 h-4 accent-primary-500" />
                <label htmlFor="allowCombine" className="text-sm font-medium text-gray-700 cursor-pointer">Cho phép kết hợp với các voucher khác</label>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3 flex-shrink-0">
              <button onClick={() => setShowForm(false)} className="btn-outline">Hủy</button>
              <button onClick={handleSave} disabled={createMutation.isPending} className="btn-primary min-w-[100px]">
                {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Tạo khuyến mãi'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
