'use client'

import { useEffect, useMemo, useState } from 'react'
import { Loader2, Plus, Trash2, X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useBrands } from '@/hooks/use-brands'
import { useHubs } from '@/hooks/use-hubs'
import { useCreateOrder } from '@/hooks/use-orders-channels'
import { formatCurrency } from '@/lib/utils'

type BrandOption = { _id: string; name: string }
type HubOption = { _id: string; name: string }

type DraftItem = {
  name: string
  quantity: number
  price: number
  note: string
}

const EMPTY_ITEM: DraftItem = {
  name: '',
  quantity: 1,
  price: 0,
  note: '',
}

export default function OrderCreateModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter()
  const [brandId, setBrandId] = useState('')
  const [hubId, setHubId] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [deliveryAddress, setDeliveryAddress] = useState('')
  const [note, setNote] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [discount, setDiscount] = useState(0)
  const [platformFee, setPlatformFee] = useState(0)
  const [items, setItems] = useState<DraftItem[]>([{ ...EMPTY_ITEM }])
  const [error, setError] = useState('')

  const { data: brandsData } = useBrands()
  const { data: hubsData } = useHubs({ brandId })
  const createOrder = useCreateOrder()

  const brands = useMemo(() => (brandsData ?? []) as BrandOption[], [brandsData])
  const hubs = useMemo(() => (hubsData ?? []) as HubOption[], [hubsData])

  useEffect(() => {
    if (open) setError('')
  }, [open])

  useEffect(() => {
    if (!brandId) {
      setHubId('')
      return
    }

    if (!hubs.some((hub) => hub._id === hubId)) {
      setHubId(hubs[0]?._id ?? '')
    }
  }, [brandId, hubId, hubs])

  const subtotal = useMemo(
    () => items.reduce((sum, item) => sum + Math.max(0, item.quantity) * Math.max(0, item.price), 0),
    [items]
  )
  const total = Math.max(0, subtotal - discount)
  const actualReceived = Math.max(0, total - platformFee)

  if (!open) return null

  const updateItem = (index: number, key: keyof DraftItem, value: string | number) => {
    setItems((current) => current.map((item, itemIndex) => (
      itemIndex === index
        ? { ...item, [key]: key === 'name' || key === 'note' ? String(value) : Number(value) }
        : item
    )))
  }

  const addItem = () => setItems((current) => [...current, { ...EMPTY_ITEM }])

  const removeItem = (index: number) => {
    setItems((current) => current.length === 1 ? current : current.filter((_, itemIndex) => itemIndex !== index))
  }

  const resetForm = () => {
    setBrandId('')
    setHubId('')
    setCustomerName('')
    setCustomerPhone('')
    setDeliveryAddress('')
    setNote('')
    setPaymentMethod('cash')
    setDiscount(0)
    setPlatformFee(0)
    setItems([{ ...EMPTY_ITEM }])
    setError('')
  }

  const handleSubmit = async () => {
    const normalizedItems = items
      .filter((item) => item.name.trim())
      .map((item) => ({
        name: item.name.trim(),
        quantity: Math.max(1, Number(item.quantity) || 1),
        price: Math.max(0, Number(item.price) || 0),
        total: Math.max(1, Number(item.quantity) || 1) * Math.max(0, Number(item.price) || 0),
        note: item.note.trim(),
      }))

    if (!brandId || !hubId) return setError('Cần chọn thương hiệu và điểm bán.')
    if (!customerName.trim()) return setError('Cần nhập tên khách hàng.')
    if (normalizedItems.length === 0) return setError('Cần có ít nhất một món hàng.')

    try {
      setError('')
      const computedSubtotal = normalizedItems.reduce((sum, item) => sum + item.total, 0)
      const created = await createOrder.mutateAsync({
        source: 'internal',
        brandId,
        hubId,
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        items: normalizedItems,
        subtotal: computedSubtotal,
        discount: Math.max(0, Number(discount) || 0),
        total: Math.max(0, computedSubtotal - Math.max(0, Number(discount) || 0)),
        platformFee: Math.max(0, Number(platformFee) || 0),
        paymentMethod,
        status: 'waiting_confirm',
        note: note.trim(),
        deliveryInfo: { address: deliveryAddress.trim() },
        driverInfo: { name: '', phone: '' },
      }) as { _id?: string }

      resetForm()
      onClose()

      if (created?._id) {
        router.push(`/orders/${created._id}`)
      } else {
        router.refresh()
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Không tạo được đơn hàng.')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
      <div className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-[28px] bg-white shadow-2xl">
        <div className="sticky top-0 flex items-center justify-between border-b border-gray-100 bg-white px-6 py-5">
          <div>
            <h2 className="text-xl font-semibold text-gray-950">Tạo đơn hàng mới</h2>
            <p className="mt-1 text-sm text-gray-500">Tạo nhanh đơn nội bộ với luồng nhập liệu gần giống màn hình Nexpos.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full border border-gray-200 p-2 text-gray-400 transition hover:text-gray-700">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid gap-6 px-6 py-6 xl:grid-cols-[minmax(0,1.4fr)_320px]">
          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="form-group">
                <span className="label">Thương hiệu</span>
                <select className="input" value={brandId} onChange={(event) => setBrandId(event.target.value)}>
                  <option value="">Chọn thương hiệu</option>
                  {brands.map((brand) => <option key={brand._id} value={brand._id}>{brand.name}</option>)}
                </select>
              </label>

              <label className="form-group">
                <span className="label">Điểm bán</span>
                <select className="input" value={hubId} onChange={(event) => setHubId(event.target.value)} disabled={!brandId}>
                  <option value="">Chọn điểm bán</option>
                  {hubs.map((hub) => <option key={hub._id} value={hub._id}>{hub.name}</option>)}
                </select>
              </label>

              <label className="form-group">
                <span className="label">Tên khách hàng</span>
                <input className="input" value={customerName} onChange={(event) => setCustomerName(event.target.value)} placeholder="Nguyễn Văn A" />
              </label>

              <label className="form-group">
                <span className="label">Số điện thoại</span>
                <input className="input" value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)} placeholder="09xxxxxxxx" />
              </label>

              <label className="form-group md:col-span-2">
                <span className="label">Địa chỉ giao hàng</span>
                <input className="input" value={deliveryAddress} onChange={(event) => setDeliveryAddress(event.target.value)} placeholder="Số nhà, đường, phường..." />
              </label>

              <label className="form-group">
                <span className="label">Thanh toán</span>
                <select className="input" value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}>
                  <option value="cash">Tiền mặt</option>
                  <option value="banking">Chuyển khoản</option>
                  <option value="other">Khác</option>
                </select>
              </label>

              <label className="form-group">
                <span className="label">Ghi chú đơn</span>
                <input className="input" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Ghi chú thêm cho ca bán hàng" />
              </label>
            </div>

            <div className="rounded-[24px] border border-gray-200 bg-gray-50 p-4">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold text-gray-950">Danh sách món</h3>
                  <p className="text-sm text-gray-500">Nhập trực tiếp món, số lượng và đơn giá.</p>
                </div>
                <button type="button" onClick={addItem} className="btn-outline h-10">
                  <Plus className="h-4 w-4" /> Thêm món
                </button>
              </div>

              <div className="space-y-3">
                {items.map((item, index) => (
                  <div key={index} className="grid gap-3 rounded-2xl border border-white bg-white p-3 md:grid-cols-[minmax(0,1.5fr)_120px_140px_auto]">
                    <div className="space-y-2">
                      <input className="input" value={item.name} onChange={(event) => updateItem(index, 'name', event.target.value)} placeholder="Tên món" />
                      <input className="input" value={item.note} onChange={(event) => updateItem(index, 'note', event.target.value)} placeholder="Ghi chú món" />
                    </div>

                    <input className="input" type="number" min="1" value={item.quantity} onChange={(event) => updateItem(index, 'quantity', event.target.value)} placeholder="SL" />
                    <input className="input" type="number" min="0" value={item.price} onChange={(event) => updateItem(index, 'price', event.target.value)} placeholder="Đơn giá" />

                    <div className="flex items-center justify-between gap-2 md:flex-col md:items-end">
                      <span className="text-sm font-semibold text-gray-900">{formatCurrency(Math.max(0, item.quantity) * Math.max(0, item.price))}</span>
                      <button type="button" onClick={() => removeItem(index)} className="rounded-xl border border-red-200 p-2 text-red-500 transition hover:bg-red-50">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-4 rounded-[24px] border border-gray-200 bg-gray-50 p-5">
            <h3 className="text-base font-semibold text-gray-950">Tổng kết đơn</h3>

            <label className="form-group">
              <span className="label">Giảm giá tổng đơn</span>
              <input className="input" type="number" min="0" value={discount} onChange={(event) => setDiscount(Number(event.target.value) || 0)} />
            </label>

            <label className="form-group">
              <span className="label">Chiết khấu sàn / phí nền tảng</span>
              <input className="input" type="number" min="0" value={platformFee} onChange={(event) => setPlatformFee(Number(event.target.value) || 0)} />
            </label>

            <div className="space-y-3 rounded-2xl bg-white p-4 text-sm">
              <div className="flex items-center justify-between text-gray-500"><span>Tạm tính</span><span className="font-medium text-gray-900">{formatCurrency(subtotal)}</span></div>
              <div className="flex items-center justify-between text-gray-500"><span>Giảm giá</span><span className="font-medium text-gray-900">-{formatCurrency(discount)}</span></div>
              <div className="flex items-center justify-between text-gray-500"><span>Doanh thu sau KM</span><span className="font-medium text-gray-900">{formatCurrency(total)}</span></div>
              <div className="flex items-center justify-between text-gray-500"><span>Chiết khấu sàn</span><span className="font-medium text-gray-900">-{formatCurrency(platformFee)}</span></div>
              <div className="flex items-center justify-between border-t border-gray-100 pt-3 text-base font-semibold text-gray-950"><span>Thực nhận</span><span>{formatCurrency(actualReceived)}</span></div>
            </div>

            {error && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

            <div className="flex gap-3">
              <button type="button" onClick={onClose} className="btn-outline flex-1">Hủy</button>
              <button type="button" onClick={handleSubmit} disabled={createOrder.isPending} className="btn-primary flex-1">
                {createOrder.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Tạo đơn
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
