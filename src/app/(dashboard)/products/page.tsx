'use client'

import { useState } from 'react'
import { Plus, Search, Upload, Download, Edit, Trash2, Loader2, FlaskConical } from 'lucide-react'
import { useProducts, useCreateProduct, useUpdateProduct, useDeleteProduct } from '@/hooks/use-products'
import { useDebounce } from '@/hooks/use-debounce'
import { cn, formatCurrency, PRODUCT_TYPE_LABEL, PRODUCT_TYPE_COLOR } from '@/lib/utils'
import type { Product } from '@/types'

const saleStatusLabel: Record<string, string> = { selling: 'Đang bán', stopped: 'Ngừng bán', draft: 'Nháp' }
const saleStatusColor: Record<string, string> = { selling: 'badge-green', stopped: 'badge-red', draft: 'badge-gray' }

const emptyForm = {
  name: '', code: '', barcode: '', description: '', category: '',
  type: 'finished_product', unit: 'Cái', allowSell: true,
  saleStatus: 'selling', status: 'active',
  price: '', costPrice: '', supplier: '',
  weight: '', height: '', length: '',
  brandId: '',
}

const TYPE_ICONS: Record<string, string> = {
  raw_material: '🌾',
  semi_product: '⚗️',
  finished_product: '🍽️',
  goods: '📦',
}

export default function ProductsPage() {
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [saleFilter, setSaleFilter] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editProduct, setEditProduct] = useState<Product | null>(null)
  const [form, setForm] = useState<Record<string, unknown>>(emptyForm)
  const [activeTab, setActiveTab] = useState<'basic' | 'detail'>('basic')

  const dq = useDebounce(search)
  const { data: rawProducts = [], isLoading } = useProducts({ q: dq, type: typeFilter, saleStatus: saleFilter })
  const products = rawProducts as Product[]
  const createMutation = useCreateProduct()
  const updateMutation = useUpdateProduct()
  const deleteMutation = useDeleteProduct()
  const saving = createMutation.isPending || updateMutation.isPending

  const openCreate = () => {
    setEditProduct(null)
    setForm(emptyForm)
    setActiveTab('basic')
    setShowForm(true)
  }

  const openEdit = (p: Product) => {
    setEditProduct(p)
    setForm({
      name: p.name, code: p.code, barcode: p.barcode || '', description: p.description || '',
      category: p.category, type: p.type, unit: p.unit, allowSell: p.allowSell ?? true,
      saleStatus: p.saleStatus, status: p.status,
      price: String(p.price ?? ''), costPrice: String(p.costPrice ?? ''), supplier: p.supplier || '',
      weight: String(p.weight ?? ''), height: String(p.height ?? ''), length: String(p.length ?? ''),
      brandId: p.brandId,
    })
    setActiveTab('basic')
    setShowForm(true)
  }

  const handleSave = async () => {
    if (!form.name || !form.code) return
    const payload = {
      ...form,
      price: form.price ? Number(form.price) : undefined,
      costPrice: form.costPrice ? Number(form.costPrice) : undefined,
      weight: form.weight ? Number(form.weight) : undefined,
      height: form.height ? Number(form.height) : undefined,
      length: form.length ? Number(form.length) : undefined,
    }
    if (editProduct) {
      await updateMutation.mutateAsync({ id: editProduct._id, ...payload })
    } else {
      await createMutation.mutateAsync(payload)
    }
    setShowForm(false)
  }

  const handleDelete = async (id: string) => {
    if (confirm('Xóa sản phẩm này?')) deleteMutation.mutate(id)
  }

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div>
          <h1 className="page-title">Sản phẩm</h1>
          <p className="page-subtitle">{isLoading ? '...' : `${products.length} sản phẩm`}</p>
        </div>
        <div className="flex gap-2">
          <button className="btn-outline btn-sm gap-1.5"><Upload className="w-3.5 h-3.5" /> Import</button>
          <button className="btn-outline btn-sm gap-1.5"><Download className="w-3.5 h-3.5" /> Export</button>
          <button onClick={openCreate} className="btn-primary"><Plus className="w-4 h-4" /> Thêm sản phẩm</button>
        </div>
      </div>

      {/* Product type summary */}
      <div className="grid grid-cols-4 gap-3">
        {Object.entries(PRODUCT_TYPE_LABEL).map(([type, label]) => {
          const count = products.filter(p => p.type === type).length
          return (
            <button
              key={type}
              onClick={() => setTypeFilter(typeFilter === type ? '' : type)}
              className={cn('card p-4 text-left transition-all hover:shadow-md', typeFilter === type ? 'ring-2 ring-primary-400 bg-primary-50' : '')}
            >
              <div className="text-2xl mb-1">{TYPE_ICONS[type]}</div>
              <div className="text-xs text-gray-500 font-medium">{label}</div>
              <div className="text-xl font-bold text-gray-900 mt-0.5">{count}</div>
            </button>
          )
        })}
      </div>

      {/* Filters */}
      <div className="card card-body">
        <div className="filter-bar">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input className="input pl-9" placeholder="Tìm theo tên, mã sản phẩm..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <select className="input w-44" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
            <option value="">Tất cả phân loại</option>
            {Object.entries(PRODUCT_TYPE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <select className="input w-36" value={saleFilter} onChange={e => setSaleFilter(e.target.value)}>
            <option value="">Trạng thái bán</option>
            <option value="selling">Đang bán</option>
            <option value="stopped">Ngừng bán</option>
            <option value="draft">Nháp</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="card">
        {isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-7 h-7 animate-spin text-primary-400" /></div>
        ) : (
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>Sản phẩm</th>
                  <th>Mã SP</th>
                  <th>Phân loại</th>
                  <th>Danh mục</th>
                  <th>Giá vốn</th>
                  <th>Giá bán</th>
                  <th>Cho bán</th>
                  <th>Trạng thái</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {products.length === 0 ? (
                  <tr><td colSpan={9} className="text-center py-12 text-gray-400">Chưa có sản phẩm nào</td></tr>
                ) : products.map(p => (
                  <tr key={p._id}>
                    <td>
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-orange-50 flex items-center justify-center text-lg flex-shrink-0">
                          {TYPE_ICONS[p.type] || '📦'}
                        </div>
                        <div>
                          <div className="font-medium text-gray-900 text-sm">{p.name}</div>
                          {p.barcode && <div className="text-xs text-gray-400 font-mono">{p.barcode}</div>}
                        </div>
                      </div>
                    </td>
                    <td><span className="font-mono text-xs text-gray-500 bg-gray-50 px-2 py-0.5 rounded">{p.code}</span></td>
                    <td><span className={cn('badge text-xs', PRODUCT_TYPE_COLOR[p.type])}>{PRODUCT_TYPE_LABEL[p.type]}</span></td>
                    <td><span className="text-sm text-gray-500">{p.category}</span></td>
                    <td><span className="text-sm text-gray-500">{p.costPrice ? formatCurrency(p.costPrice) : '—'}</span></td>
                    <td><span className="font-semibold text-sm">{p.price ? formatCurrency(p.price) : '—'}</span></td>
                    <td><span className={cn('badge', p.allowSell ? 'badge-green' : 'badge-gray')}>{p.allowSell ? 'Có' : 'Không'}</span></td>
                    <td><span className={cn('badge', saleStatusColor[p.saleStatus])}>{saleStatusLabel[p.saleStatus]}</span></td>
                    <td>
                      <div className="flex gap-1">
                        <button onClick={() => openEdit(p)} className="btn-ghost btn-sm p-1.5"><Edit className="w-3.5 h-3.5" /></button>
                        <button onClick={() => handleDelete(p._id)} className="btn-ghost btn-sm p-1.5 text-red-500 hover:bg-red-50"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
              <h2 className="font-semibold text-gray-900">{editProduct ? 'Cập nhật sản phẩm' : 'Thêm sản phẩm mới'}</h2>
              <button onClick={() => setShowForm(false)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600">&times;</button>
            </div>
            <div className="px-6 pt-3 flex gap-1 border-b border-gray-100 flex-shrink-0">
              {(['basic', 'detail'] as const).map(tab => (
                <button key={tab} onClick={() => setActiveTab(tab)} className={cn('px-4 py-2 text-sm font-medium -mb-px border-b-2 transition-colors', activeTab === tab ? 'border-primary-500 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700')}>
                  {tab === 'basic' ? 'Thông tin cơ bản' : 'Chi tiết & Kích thước'}
                </button>
              ))}
            </div>
            <div className="p-6 space-y-4 overflow-y-auto flex-1">
              {activeTab === 'basic' && (
                <>
                  <div>
                    <label className="label mb-2">Phân loại *</label>
                    <div className="grid grid-cols-4 gap-2">
                      {Object.entries(PRODUCT_TYPE_LABEL).map(([type, label]) => (
                        <button key={type} type="button" onClick={() => setForm({ ...form, type })}
                          className={cn('p-3 rounded-xl border-2 text-center transition-all text-xs font-medium', form.type === type ? 'border-primary-400 bg-primary-50 text-primary-700' : 'border-gray-200 text-gray-600 hover:border-gray-300')}>
                          <div className="text-xl mb-1">{TYPE_ICONS[type]}</div>
                          <div className="leading-tight">{label}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                    <input type="checkbox" id="allowSell" checked={Boolean(form.allowSell)} onChange={e => setForm({ ...form, allowSell: e.target.checked })} className="w-4 h-4 accent-primary-500" />
                    <label htmlFor="allowSell" className="text-sm font-medium text-gray-700 cursor-pointer">Cho phép bán trực tiếp</label>
                  </div>
                  <div>
                    <label className="label">Tên sản phẩm *</label>
                    <input className="input" value={String(form.name || '')} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Gà Nướng Ngũ Vị" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="label">Mã sản phẩm *</label>
                      <input className="input" value={String(form.code || '')} onChange={e => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="GA-001" />
                    </div>
                    <div>
                      <label className="label">Mã vạch</label>
                      <input className="input font-mono" value={String(form.barcode || '')} onChange={e => setForm({ ...form, barcode: e.target.value })} placeholder="8936082140066" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="label">Danh mục</label>
                      <input className="input" value={String(form.category || '')} onChange={e => setForm({ ...form, category: e.target.value })} placeholder="Món Gà" />
                    </div>
                    <div>
                      <label className="label">Đơn vị tính</label>
                      <input className="input" value={String(form.unit || '')} onChange={e => setForm({ ...form, unit: e.target.value })} placeholder="Phần" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="label">Giá vốn (VND)</label>
                      <input type="number" className="input" value={String(form.costPrice || '')} onChange={e => setForm({ ...form, costPrice: e.target.value })} placeholder="35000" />
                    </div>
                    <div>
                      <label className="label">Giá bán (VND)</label>
                      <input type="number" className="input" value={String(form.price || '')} onChange={e => setForm({ ...form, price: e.target.value })} placeholder="65000" />
                    </div>
                  </div>
                  <div>
                    <label className="label">Mô tả</label>
                    <textarea className="input resize-none" rows={2} value={String(form.description || '')} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Mô tả chi tiết sản phẩm..." />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="label">Trạng thái bán</label>
                      <select className="input" value={String(form.saleStatus || '')} onChange={e => setForm({ ...form, saleStatus: e.target.value })}>
                        <option value="selling">Đang bán</option>
                        <option value="stopped">Ngừng bán</option>
                        <option value="draft">Nháp</option>
                      </select>
                    </div>
                    <div>
                      <label className="label">Trạng thái</label>
                      <select className="input" value={String(form.status || '')} onChange={e => setForm({ ...form, status: e.target.value })}>
                        <option value="active">Hoạt động</option>
                        <option value="inactive">Ngừng hoạt động</option>
                      </select>
                    </div>
                  </div>
                </>
              )}
              {activeTab === 'detail' && (
                <>
                  <div>
                    <label className="label">Nhà cung cấp</label>
                    <input className="input" value={String(form.supplier || '')} onChange={e => setForm({ ...form, supplier: e.target.value })} placeholder="Công ty TNHH ABC" />
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="label">Khối lượng (g)</label>
                      <input type="number" className="input" value={String(form.weight || '')} onChange={e => setForm({ ...form, weight: e.target.value })} placeholder="200" />
                    </div>
                    <div>
                      <label className="label">Chiều cao (mm)</label>
                      <input type="number" className="input" value={String(form.height || '')} onChange={e => setForm({ ...form, height: e.target.value })} placeholder="100" />
                    </div>
                    <div>
                      <label className="label">Chiều dài (mm)</label>
                      <input type="number" className="input" value={String(form.length || '')} onChange={e => setForm({ ...form, length: e.target.value })} placeholder="150" />
                    </div>
                  </div>
                  <div className="rounded-xl bg-blue-50 border border-blue-100 p-4">
                    <div className="flex items-center gap-2 text-blue-700 font-medium text-sm mb-1">
                      <FlaskConical className="w-4 h-4" /> Cấu hình thành phần (BOM)
                    </div>
                    <p className="text-xs text-blue-600">Cấu hình nguyên liệu cấu thành cho sản phẩm Thành phẩm để hệ thống tự động trừ tồn kho. Thiết lập sau khi tạo sản phẩm.</p>
                  </div>
                </>
              )}
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3 flex-shrink-0">
              <button onClick={() => setShowForm(false)} className="btn-outline">Hủy</button>
              <button onClick={handleSave} disabled={saving} className="btn-primary min-w-[80px]">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Lưu'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
