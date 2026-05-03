'use client'

import { useState } from 'react'
import { Plus, Search, Upload, Download, Edit, Trash2, Loader2 } from 'lucide-react'
import { useProducts, useCreateProduct, useUpdateProduct, useDeleteProduct } from '@/hooks/use-products'
import { useDebounce } from '@/hooks/use-debounce'
import { cn, formatCurrency } from '@/lib/utils'
import type { Product } from '@/types'

const saleStatusLabel: Record<string, string> = { selling: 'Đang bán', stopped: 'Ngừng bán', draft: 'Nháp' }
const saleStatusColor: Record<string, string> = { selling: 'badge-green', stopped: 'badge-red', draft: 'badge-gray' }
const typeLabel: Record<string, string> = { single: 'Đơn lẻ', combo: 'Combo', topping: 'Topping' }
const emptyForm = { name: '', code: '', category: '', type: 'single', unit: 'Cái', saleStatus: 'selling', status: 'active', price: '', brandId: '' }

export default function ProductsPage() {
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [saleFilter, setSaleFilter] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editProduct, setEditProduct] = useState<Product | null>(null)
  const [form, setForm] = useState(emptyForm)

  const dq = useDebounce(search)
  const { data: rawProducts = [], isLoading } = useProducts({ q: dq, type: typeFilter, saleStatus: saleFilter })
  const products = rawProducts as Product[]
  const filtered = products
  const createMutation = useCreateProduct()
  const updateMutation = useUpdateProduct()
  const deleteMutation = useDeleteProduct()
  const saving = createMutation.isPending || updateMutation.isPending

  const openCreate = () => {
    setEditProduct(null)
    setForm(emptyForm)
    setShowForm(true)
  }

  const openEdit = (p: Product) => {
    setEditProduct(p)
    setForm({ name: p.name, code: p.code, category: p.category, type: p.type, unit: p.unit, saleStatus: p.saleStatus, status: p.status, price: String(p.price ?? ''), brandId: p.brandId })
    setShowForm(true)
  }

  const handleSave = async () => {
    if (!form.name || !form.code) return
    const productData = { ...form, price: form.price ? Number(form.price) : undefined }
    if (editProduct) {
      await updateMutation.mutateAsync({ id: editProduct._id, ...productData })
    } else {
      await createMutation.mutateAsync(productData)
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
          <p className="page-subtitle">{products.length} sản phẩm</p>
        </div>
        <div className="flex gap-2">
          <button className="btn-outline btn-sm"><Upload className="w-4 h-4" /> Import</button>
          <button className="btn-outline btn-sm"><Download className="w-4 h-4" /> Export</button>
          <button onClick={openCreate} className="btn-primary"><Plus className="w-4 h-4" /> Thêm sản phẩm</button>
        </div>
      </div>

      <div className="card card-body">
        <div className="filter-bar">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input className="input pl-9" placeholder="Tìm sản phẩm..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <select className="input w-36" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
            <option value="">Tất cả loại</option>
            <option value="single">Đơn lẻ</option>
            <option value="combo">Combo</option>
            <option value="topping">Topping</option>
          </select>
          <select className="input w-36" value={saleFilter} onChange={e => setSaleFilter(e.target.value)}>
            <option value="">Trạng thái bán</option>
            <option value="selling">Đang bán</option>
            <option value="stopped">Ngừng bán</option>
            <option value="draft">Nháp</option>
          </select>
        </div>
      </div>

      <div className="card">
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>Sản phẩm</th>
                <th>Mã</th>
                <th>Danh mục</th>
                <th>Loại</th>
                <th>Đơn vị</th>
                <th>Giá</th>
                <th>Trạng thái bán</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-10 text-gray-400">Không tìm thấy sản phẩm</td></tr>
              ) : filtered.map(product => (
                <tr key={product._id}>
                  <td>
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-orange-50 flex items-center justify-center text-orange-500 font-bold text-sm flex-shrink-0">
                        {product.name.charAt(0)}
                      </div>
                      <span className="font-medium text-gray-900">{product.name}</span>
                    </div>
                  </td>
                  <td><span className="font-mono text-sm text-gray-500">{product.code}</span></td>
                  <td><span className="text-sm text-gray-500">{product.category}</span></td>
                  <td><span className="badge badge-blue">{typeLabel[product.type]}</span></td>
                  <td><span className="text-sm text-gray-500">{product.unit}</span></td>
                  <td><span className="font-semibold text-gray-900">{product.price ? formatCurrency(product.price) : '-'}</span></td>
                  <td><span className={cn('badge', saleStatusColor[product.saleStatus])}>{saleStatusLabel[product.saleStatus]}</span></td>
                  <td>
                    <div className="flex gap-1">
                      <button onClick={() => openEdit(product)} className="btn-ghost btn-sm p-1.5"><Edit className="w-3.5 h-3.5" /></button>
                      <button onClick={() => handleDelete(product._id)} className="btn-ghost btn-sm p-1.5 text-red-500 hover:bg-red-50"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-semibold text-gray-900">{editProduct ? 'Cập nhật sản phẩm' : 'Thêm sản phẩm'}</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
            </div>
            <div className="p-6 space-y-4">
              <div className="form-group">
                <label className="label">Tên sản phẩm *</label>
                <input className="input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Trà Sữa Trân Châu" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="form-group">
                  <label className="label">Mã sản phẩm *</label>
                  <input className="input uppercase" value={form.code} onChange={e => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="TS-001" />
                </div>
                <div className="form-group">
                  <label className="label">Danh mục</label>
                  <input className="input" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} placeholder="Trà Sữa" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="form-group">
                  <label className="label">Loại</label>
                  <select className="input" value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
                    <option value="single">Đơn lẻ</option>
                    <option value="combo">Combo</option>
                    <option value="topping">Topping</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="label">Đơn vị</label>
                  <input className="input" value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} placeholder="Ly" />
                </div>
                <div className="form-group">
                  <label className="label">Giá (VND)</label>
                  <input type="number" className="input" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} placeholder="55000" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="form-group">
                  <label className="label">Trạng thái bán</label>
                  <select className="input" value={form.saleStatus} onChange={e => setForm({ ...form, saleStatus: e.target.value })}>
                    <option value="selling">Đang bán</option>
                    <option value="stopped">Ngừng bán</option>
                    <option value="draft">Nháp</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="label">Trạng thái</label>
                  <select className="input" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                    <option value="active">Hoạt động</option>
                    <option value="inactive">Ngừng</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
              <button onClick={() => setShowForm(false)} className="btn-outline">Hủy</button>
              <button onClick={handleSave} className="btn-primary">Lưu</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
