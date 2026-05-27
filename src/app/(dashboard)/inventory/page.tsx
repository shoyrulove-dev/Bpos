'use client'

import { useState } from 'react'
import { Plus, Search, AlertTriangle, ArrowDown, ArrowUp, RefreshCw, Loader2, History } from 'lucide-react'
import { useInventory, useCreateInventory, useInventoryMovement, useStockMovements } from '@/hooks/use-data'
import { useDebounce } from '@/hooks/use-debounce'
import { cn, formatDate, MOVEMENT_TYPE_LABEL, MOVEMENT_TYPE_COLOR } from '@/lib/utils'
import type { Inventory, StockMovement, MovementType } from '@/types'

const MOVEMENT_ICONS: Record<string, React.ReactNode> = {
  import: <ArrowDown className="w-4 h-4 text-green-600" />,
  export: <ArrowUp className="w-4 h-4 text-red-500" />,
  adjust: <RefreshCw className="w-4 h-4 text-blue-500" />,
  consume: <ArrowUp className="w-4 h-4 text-orange-500" />,
  transfer: <RefreshCw className="w-4 h-4 text-purple-500" />,
}

const emptyMoveForm = { type: 'import' as MovementType, quantity: '', note: '' }

export default function InventoryPage() {
  const [search, setSearch] = useState('')
  const [lowStockOnly, setLowStockOnly] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [showMove, setShowMove] = useState<Inventory | null>(null)
  const [showHistory, setShowHistory] = useState<Inventory | null>(null)
  const [addForm, setAddForm] = useState({ productId: '', hubId: '', brandId: '', minQuantity: '', maxQuantity: '' })
  const [moveForm, setMoveForm] = useState(emptyMoveForm)

  const dq = useDebounce(search)
  const { data: rawInv = [], isLoading } = useInventory({ lowStock: lowStockOnly })
  const inventory = rawInv as Inventory[]
  const filtered = inventory.filter(i =>
    !dq || (i.productName || '').toLowerCase().includes(dq.toLowerCase()) || (i.productCode || '').toLowerCase().includes(dq.toLowerCase())
  )

  const { data: rawMoves = [] } = useStockMovements({ productId: showHistory?.productId, hubId: showHistory?.hubId })
  const movements = rawMoves as StockMovement[]

  const createMutation = useCreateInventory()
  const moveMutation = useInventoryMovement()

  const lowStockItems = inventory.filter(i => i.quantity <= i.minQuantity)

  const handleMove = async () => {
    if (!showMove || !moveForm.quantity) return
    await moveMutation.mutateAsync({ id: showMove._id, type: moveForm.type, quantity: Number(moveForm.quantity), note: moveForm.note })
    setShowMove(null)
    setMoveForm(emptyMoveForm)
  }

  const getStockLevel = (inv: Inventory) => {
    if (inv.quantity <= 0) return 'empty'
    if (inv.quantity <= inv.minQuantity) return 'low'
    if (inv.maxQuantity && inv.quantity >= inv.maxQuantity * 0.9) return 'high'
    return 'ok'
  }

  const stockLevelColor: Record<string, string> = {
    empty: 'text-red-600 font-bold',
    low: 'text-orange-500 font-bold',
    ok: 'text-gray-900 font-semibold',
    high: 'text-blue-600 font-semibold',
  }

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div>
          <h1 className="page-title">Quản lý tồn kho</h1>
          <p className="page-subtitle">{isLoading ? '...' : `${inventory.length} sản phẩm — ${lowStockItems.length} cảnh báo tồn thấp`}</p>
        </div>
        <button onClick={() => { setAddForm({ productId: '', hubId: '', brandId: '', minQuantity: '', maxQuantity: '' }); setShowAdd(true) }} className="btn-primary">
          <Plus className="w-4 h-4" /> Thêm tồn kho
        </button>
      </div>

      {/* Alert */}
      {lowStockItems.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <div className="font-medium text-amber-800 text-sm">{lowStockItems.length} sản phẩm sắp hết hàng</div>
            <div className="text-xs text-amber-700 mt-0.5">{lowStockItems.slice(0, 3).map(i => i.productName).join(', ')}{lowStockItems.length > 3 ? ` và ${lowStockItems.length - 3} sản phẩm khác` : ''}</div>
          </div>
          <button onClick={() => setLowStockOnly(true)} className="ml-auto text-xs text-amber-700 underline">Xem tất cả</button>
        </div>
      )}

      {/* Filters */}
      <div className="filter-bar">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input className="input pl-9" placeholder="Tìm theo tên, mã sản phẩm..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={lowStockOnly} onChange={e => setLowStockOnly(e.target.checked)} className="w-4 h-4 accent-amber-500" />
          <span className="text-sm text-gray-600">Chỉ tồn thấp</span>
        </label>
      </div>

      <div className="card">
        {isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-7 h-7 animate-spin text-primary-400" /></div>
        ) : (
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>Sản phẩm</th>
                  <th>Cửa hàng</th>
                  <th className="text-right">Tồn kho</th>
                  <th className="text-right">Tối thiểu</th>
                  <th className="text-right">Tối đa</th>
                  <th>Cập nhật cuối</th>
                  <th>Tình trạng</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={8} className="text-center py-12 text-gray-400">Không có dữ liệu tồn kho</td></tr>
                ) : filtered.map(inv => {
                  const level = getStockLevel(inv)
                  return (
                    <tr key={inv._id}>
                      <td>
                        <div className="font-medium text-gray-900 text-sm">{inv.productName || inv.productId}</div>
                        <div className="text-xs font-mono text-gray-400">{inv.productCode}</div>
                      </td>
                      <td className="text-sm text-gray-500">{inv.hubName || inv.hubId}</td>
                      <td className="text-right">
                        <span className={cn('text-lg', stockLevelColor[level])}>{inv.quantity}</span>
                        <span className="text-xs text-gray-400 ml-1">{inv.unit}</span>
                      </td>
                      <td className="text-right text-sm text-gray-500">{inv.minQuantity}</td>
                      <td className="text-right text-sm text-gray-500">{inv.maxQuantity ?? '—'}</td>
                      <td className="text-xs text-gray-400">{inv.lastMovementAt ? formatDate(inv.lastMovementAt, 'dd/MM HH:mm') : '—'}</td>
                      <td>
                        {level === 'empty' && <span className="badge bg-red-100 text-red-700">Hết hàng</span>}
                        {level === 'low' && <span className="badge bg-amber-100 text-amber-700">⚠ Sắp hết</span>}
                        {level === 'ok' && <span className="badge badge-green">Đủ hàng</span>}
                        {level === 'high' && <span className="badge badge-blue">Đầy kho</span>}
                      </td>
                      <td>
                        <div className="flex gap-1">
                          <button onClick={() => { setShowMove(inv); setMoveForm(emptyMoveForm) }} className="btn-outline btn-sm text-xs px-2">
                            Nhập/Xuất
                          </button>
                          <button onClick={() => setShowHistory(inv)} className="btn-ghost btn-sm p-1.5" title="Lịch sử">
                            <History className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Inventory Modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90dvh] flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
              <h2 className="font-semibold text-gray-900">Thêm theo dõi tồn kho</h2>
              <button onClick={() => setShowAdd(false)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400">&times;</button>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto flex-1">
              <div>
                <label className="label">ID Sản phẩm *</label>
                <input className="input font-mono" value={addForm.productId} onChange={e => setAddForm({ ...addForm, productId: e.target.value })} placeholder="Product ObjectId..." />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">ID Cửa hàng *</label>
                  <input className="input font-mono" value={addForm.hubId} onChange={e => setAddForm({ ...addForm, hubId: e.target.value })} />
                </div>
                <div>
                  <label className="label">ID Thương hiệu *</label>
                  <input className="input font-mono" value={addForm.brandId} onChange={e => setAddForm({ ...addForm, brandId: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Tồn tối thiểu</label>
                  <input type="number" className="input" value={addForm.minQuantity} onChange={e => setAddForm({ ...addForm, minQuantity: e.target.value })} placeholder="10" />
                </div>
                <div>
                  <label className="label">Tồn tối đa</label>
                  <input type="number" className="input" value={addForm.maxQuantity} onChange={e => setAddForm({ ...addForm, maxQuantity: e.target.value })} placeholder="500" />
                </div>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
              <button onClick={() => setShowAdd(false)} className="btn-outline">Hủy</button>
              <button onClick={async () => {
                await createMutation.mutateAsync({ productId: addForm.productId, hubId: addForm.hubId, brandId: addForm.brandId, minQuantity: Number(addForm.minQuantity) || 0, maxQuantity: addForm.maxQuantity ? Number(addForm.maxQuantity) : undefined })
                setShowAdd(false)
              }} disabled={createMutation.isPending} className="btn-primary">
                {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Thêm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Movement Modal */}
      {showMove && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90dvh] flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
              <h2 className="font-semibold text-gray-900">Nhập / Xuất kho</h2>
              <button onClick={() => setShowMove(null)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400">&times;</button>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto flex-1">
              <div className="p-3 bg-gray-50 rounded-xl flex items-center gap-3">
                <div>
                  <div className="font-medium text-sm">{showMove.productName}</div>
                  <div className="text-xs text-gray-500">Tồn hiện tại: <strong>{showMove.quantity} {showMove.unit}</strong></div>
                </div>
              </div>
              <div>
                <label className="label mb-2">Loại thao tác</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['import', 'export', 'adjust'] as MovementType[]).map(t => (
                    <button key={t} type="button" onClick={() => setMoveForm({ ...moveForm, type: t })}
                      className={cn('p-2 rounded-xl border-2 text-center text-xs font-medium transition-all flex flex-col items-center gap-1', moveForm.type === t ? 'border-primary-400 bg-primary-50 text-primary-700' : 'border-gray-200 text-gray-600')}>
                      {MOVEMENT_ICONS[t]}
                      {MOVEMENT_TYPE_LABEL[t]}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="label">Số lượng {moveForm.type === 'adjust' ? '(đặt về)' : ''} *</label>
                <input type="number" className="input" value={moveForm.quantity} onChange={e => setMoveForm({ ...moveForm, quantity: e.target.value })} placeholder="0" />
              </div>
              <div>
                <label className="label">Ghi chú</label>
                <input className="input" value={moveForm.note} onChange={e => setMoveForm({ ...moveForm, note: e.target.value })} placeholder="Nhập kho từ nhà cung cấp ABC..." />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
              <button onClick={() => setShowMove(null)} className="btn-outline">Hủy</button>
              <button onClick={handleMove} disabled={moveMutation.isPending} className="btn-primary">
                {moveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Xác nhận'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* History Modal */}
      {showHistory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
              <h2 className="font-semibold text-gray-900">Lịch sử biến động — {showHistory.productName}</h2>
              <button onClick={() => setShowHistory(null)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400">&times;</button>
            </div>
            <div className="overflow-y-auto flex-1 p-2">
              <table className="table">
                <thead>
                  <tr><th>Thời gian</th><th>Loại</th><th className="text-right">Trước</th><th className="text-right">Sau</th><th className="text-right">Thay đổi</th><th>Ghi chú</th></tr>
                </thead>
                <tbody>
                  {movements.length === 0 ? (
                    <tr><td colSpan={6} className="text-center py-8 text-gray-400">Chưa có lịch sử</td></tr>
                  ) : movements.map((m) => (
                    <tr key={m._id}>
                      <td className="text-xs text-gray-500">{formatDate(m.createdAt, 'dd/MM HH:mm')}</td>
                      <td><span className={cn('badge text-xs', MOVEMENT_TYPE_COLOR[m.type])}>{MOVEMENT_TYPE_LABEL[m.type]}</span></td>
                      <td className="text-right text-sm">{m.beforeQty}</td>
                      <td className="text-right text-sm font-semibold">{m.afterQty}</td>
                      <td className={cn('text-right text-sm font-bold', m.quantity >= 0 ? 'text-green-600' : 'text-red-500')}>
                        {m.quantity >= 0 ? '+' : ''}{m.quantity}
                      </td>
                      <td className="text-xs text-gray-500">{m.note || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
