'use client'

import { useState } from 'react'
import { Plus, Search, Building2, Phone, MapPin, Tag, Edit, Trash2, Loader2 } from 'lucide-react'
import { useBrands, useCreateBrand, useUpdateBrand, useDeleteBrand } from '@/hooks/use-brands'
import { useDebounce } from '@/hooks/use-debounce'
import { cn, BRAND_TYPE_LABEL } from '@/lib/utils'
import type { Brand } from '@/types'

const brandTypeOptions = [
  { value: '', label: 'Tất cả loại' },
  { value: 'fnb', label: 'F&B' },
  { value: 'retail', label: 'Bán lẻ' },
  { value: 'service', label: 'Dịch vụ' },
  { value: 'other', label: 'Khác' },
]

const emptyForm = { name: '', phone: '', type: 'fnb', address: '', note: '', logo: '', status: 'active' }

function BrandLogoCard({ name, logo }: { name: string; logo?: string }) {
  const [hasError, setHasError] = useState(false)
  const showImage = Boolean(logo) && !hasError

  return (
    <div className="relative aspect-[16/9] w-full overflow-hidden rounded-2xl border border-gray-100 bg-gradient-to-br from-primary-50 via-white to-orange-50">
      {showImage ? (
        <img
          src={logo}
          alt={name}
          className="h-full w-full object-contain p-4"
          onError={() => setHasError(true)}
        />
      ) : (
        <div className="flex h-full items-center justify-center text-5xl font-bold text-primary-600">
          {name.charAt(0)}
        </div>
      )}
    </div>
  )
}

export default function BrandsPage() {
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editBrand, setEditBrand] = useState<Brand | null>(null)
  const [form, setForm] = useState(emptyForm)

  const dq = useDebounce(search)
  const { data: brands = [], isLoading, error } = useBrands({ q: dq, type: typeFilter })
  const createMutation = useCreateBrand()
  const updateMutation = useUpdateBrand()
  const deleteMutation = useDeleteBrand()
  const saving = createMutation.isPending || updateMutation.isPending

  const filtered = brands

  const openCreate = () => {
    setEditBrand(null)
    setForm(emptyForm)
    setShowForm(true)
  }

  const openEdit = (b: Brand) => {
    setEditBrand(b)
    setForm({ name: b.name, phone: b.phone, type: b.type, address: b.address, note: b.note ?? '', logo: b.logo ?? '', status: b.status })
    setShowForm(true)
  }

  const handleSave = async () => {
    if (!form.name || !form.phone || !form.address) return
    if (editBrand) {
      await updateMutation.mutateAsync({ id: editBrand._id, ...form })
    } else {
      await createMutation.mutateAsync(form)
    }
    setShowForm(false)
  }

  const handleDelete = async (id: string) => {
    if (confirm('Xóa thương hiệu này?')) {
      await deleteMutation.mutateAsync(id)
    }
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Thương hiệu</h1>
          <p className="page-subtitle">{isLoading ? '...' : `${brands.length} thương hiệu`}</p>
        </div>
        <button onClick={openCreate} className="btn-primary">
          <Plus className="w-4 h-4" /> Thêm thương hiệu
        </button>
      </div>

      {/* Filters */}
      <div className="card card-body">
        <div className="filter-bar">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input className="input pl-9" placeholder="Tìm thương hiệu..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <select className="input w-44" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
            {brandTypeOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      </div>

      {/* States */}
      {isLoading && <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary-400" /></div>}
      {error && <div className="card card-body text-red-600 text-sm">Lỗi: {(error as Error).message}</div>}

      {/* Grid */}
      {!isLoading && brands.length === 0 ? (
        <div className="empty-state card">
          <Building2 className="w-12 h-12 mb-3" />
          <p className="font-medium">Không tìm thấy thương hiệu</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {brands.map((brand: Brand) => (
            <div key={brand._id} className="card p-5 hover:shadow-md transition-shadow group">
              <div className="relative mb-4">
                <BrandLogoCard name={brand.name} logo={brand.logo} />
                <div className="absolute right-3 top-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => openEdit(brand)} className="btn-ghost btn-sm p-1.5">
                    <Edit className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => handleDelete(brand._id)} className="btn-ghost btn-sm p-1.5 text-red-500 hover:bg-red-50">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <h3 className="font-semibold text-gray-900 mb-1">{brand.name}</h3>

              <div className="space-y-1.5 mt-3">
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <Tag className="w-3 h-3" />
                  {BRAND_TYPE_LABEL[brand.type]}
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <Phone className="w-3 h-3" />
                  {brand.phone}
                </div>
                <div className="flex items-start gap-2 text-xs text-gray-500">
                  <MapPin className="w-3 h-3 mt-0.5 flex-shrink-0" />
                  <span className="line-clamp-2">{brand.address}</span>
                </div>
              </div>

              <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between">
                <span className={cn('badge', brand.status === 'active' ? 'badge-green' : 'badge-red')}>
                  {brand.status === 'active' ? 'Hoạt động' : 'Ngừng hoạt động'}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-semibold text-gray-900">{editBrand ? 'Cập nhật thương hiệu' : 'Thêm thương hiệu'}</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
            </div>
            <div className="p-6 space-y-4">
              <div className="form-group">
                <label className="label">Tên thương hiệu *</label>
                <input className="input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Vd: Trà Sữa Phúc Long" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="form-group">
                  <label className="label">Số điện thoại *</label>
                  <input className="input" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="028-3822-3456" />
                </div>
                <div className="form-group">
                  <label className="label">Loại thương hiệu</label>
                  <select className="input" value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
                    <option value="fnb">F&B</option>
                    <option value="retail">Bán lẻ</option>
                    <option value="service">Dịch vụ</option>
                    <option value="other">Khác</option>
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label className="label">Địa chỉ *</label>
                <input className="input" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} placeholder="123 Nguyễn Huệ, Q.1..." />
              </div>
              <div className="form-group">
                <label className="label">Logo (URL hình ảnh)</label>
                <input className="input" value={form.logo} onChange={e => setForm({ ...form, logo: e.target.value })} placeholder="https://..." />
                {form.logo && (
                  <div className="mt-2 flex items-center gap-2">
                    <img src={form.logo} alt="preview" className="h-14 w-14 rounded-xl border object-contain bg-white p-1" onError={e => (e.currentTarget.style.display = 'none')} />
                    <span className="text-xs text-gray-400">Preview</span>
                  </div>
                )}
              </div>
              <div className="form-group">
                <label className="label">Ghi chú</label>
                <textarea className="input" rows={2} value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} placeholder="Ghi chú thêm..." />
              </div>
              <div className="form-group">
                <label className="label">Trạng thái</label>
                <select className="input" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                  <option value="active">Hoạt động</option>
                  <option value="inactive">Ngừng hoạt động</option>
                </select>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
              <button onClick={() => setShowForm(false)} className="btn-outline">Hủy</button>
              <button onClick={handleSave} disabled={saving} className="btn-primary">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />} Lưu
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
