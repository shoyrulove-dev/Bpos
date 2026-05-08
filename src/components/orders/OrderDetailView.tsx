'use client'

import Link from 'next/link'
import { ArrowLeft, Loader2, MapPin, Phone, Printer, RefreshCw, Truck } from 'lucide-react'
import { useOrder } from '@/hooks/use-orders-channels'
import { buildReceiptPrintUrl } from '@/lib/order-alerts'
import { CHANNEL_SOURCE_COLOR, CHANNEL_SOURCE_LABEL, cn, formatCurrency, formatDate, ORDER_STATUS_COLOR, ORDER_STATUS_LABEL, PAYMENT_METHOD_LABEL } from '@/lib/utils'
import type { Order } from '@/types'

function openPrintWindow(url: string) {
  window.open(url, '_blank', 'noopener,noreferrer,width=430,height=900')
}

function formatMaybeDate(value?: string) {
  if (!value) return '-'
  try {
    return formatDate(value)
  } catch {
    return value
  }
}

export default function OrderDetailView({ orderId }: { orderId: string }) {
  const { data, isLoading, error, refetch, isRefetching } = useOrder(orderId)
  const order = (data as Order | undefined) ?? null

  if (isLoading) {
    return <div className="flex min-h-[50vh] items-center justify-center rounded-[28px] border border-gray-200 bg-white"><div className="flex items-center gap-3 text-gray-500"><Loader2 className="h-5 w-5 animate-spin" /> Đang tải chi tiết đơn hàng...</div></div>
  }

  if (!order) {
    return <div className="rounded-[28px] border border-red-200 bg-red-50 px-6 py-10 text-red-700">{error instanceof Error ? error.message : 'Không tìm thấy đơn hàng.'}</div>
  }

  const actualReceived = Math.max(0, order.total - (order.platformFee ?? 0))
  const totalItems = order.items.reduce((sum, item) => sum + Number(item.quantity || 0), 0)

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[28px] border border-gray-200 bg-white px-6 py-5">
        <div className="flex items-start gap-4">
          <Link href="/orders" className="mt-1 rounded-full border border-gray-200 p-2 text-gray-500 transition hover:text-gray-900"><ArrowLeft className="h-5 w-5" /></Link>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className={cn('badge', ORDER_STATUS_COLOR[order.status])}>{ORDER_STATUS_LABEL[order.status]}</span>
              <span className={cn('badge', CHANNEL_SOURCE_COLOR[order.source])}>{CHANNEL_SOURCE_LABEL[order.source]}</span>
            </div>
            <h1 className="mt-2 text-[32px] font-semibold leading-none text-gray-950">{order.shortId}</h1>
            {order.externalOrderId && <p className="mt-1 font-mono text-sm text-gray-500">Ref code: {order.externalOrderId}</p>}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => refetch()} className="btn-outline h-11" disabled={isRefetching}><RefreshCw className={cn('h-4 w-4', isRefetching && 'animate-spin')} /> Làm mới</button>
          <button type="button" onClick={() => openPrintWindow(buildReceiptPrintUrl(order._id, { autoprint: true, paperSize: '80mm' }))} className="btn-outline h-11"><Printer className="h-4 w-4" /> In đơn</button>
          <button type="button" onClick={() => openPrintWindow(buildReceiptPrintUrl(order._id, { autoprint: true, paperSize: '58mm' }))} className="btn-outline h-11"><Printer className="h-4 w-4" /> In phiếu tem</button>
          <button type="button" onClick={() => openPrintWindow(buildReceiptPrintUrl(order._id, { autoprint: false, paperSize: '80mm' }))} className="btn-outline h-11"><Printer className="h-4 w-4" /> In đơn qua dialog</button>
        </div>
      </div>

      <div className="grid gap-4 rounded-[28px] border border-gray-200 bg-white p-6 md:grid-cols-2 xl:grid-cols-5">
        <div><p className="text-sm text-gray-400">Site bán hàng</p><p className="mt-2 text-lg font-semibold text-gray-950">{order.brandName || '-'}</p><p className="mt-1 text-base text-gray-600">{order.channelName || CHANNEL_SOURCE_LABEL[order.source]}</p></div>
        <div><p className="text-sm text-gray-400">Hub bán hàng</p><p className="mt-2 text-lg font-semibold text-gray-950">{order.hubName || '-'}</p></div>
        <div><p className="text-sm text-gray-400">Khách đặt lúc</p><p className="mt-2 text-lg font-semibold text-gray-950">{formatMaybeDate(order.placedAt)}</p></div>
        <div><p className="text-sm text-gray-400">Thời gian lấy hàng</p><p className="mt-2 text-lg font-semibold text-gray-950">{formatMaybeDate(order.deliveredAt)}</p></div>
        <div><p className="text-sm text-gray-400">Thực nhận</p><p className="mt-2 text-lg font-semibold text-emerald-600">{formatCurrency(actualReceived)}</p></div>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <div className="rounded-[28px] border border-gray-200 bg-white p-6">
          <h2 className="text-[22px] font-semibold text-gray-950">Thông tin khách hàng</h2>
          <div className="mt-6 grid gap-5 md:grid-cols-2">
            <div><p className="text-sm text-gray-400">Tên khách hàng</p><p className="mt-2 text-[28px] font-medium text-gray-900">{order.customerName}</p></div>
            <div><p className="text-sm text-gray-400">Điện thoại</p><p className="mt-2 text-[28px] font-medium text-gray-900">{order.customerPhone || '-'}</p></div>
            <div className="md:col-span-2"><p className="text-sm text-gray-400">Địa chỉ</p><p className="mt-2 text-lg text-gray-700">{order.deliveryInfo?.address || '-'}</p></div>
          </div>
        </div>

        <div className="rounded-[28px] border border-gray-200 bg-white p-6">
          <h2 className="text-[22px] font-semibold text-gray-950">Thông tin vận chuyển</h2>
          <div className="mt-6 grid gap-5 md:grid-cols-2">
            <div><p className="text-sm text-gray-400">Người giao</p><p className="mt-2 text-[28px] font-medium uppercase leading-tight text-gray-900">{order.driverInfo?.name || '-'}</p></div>
            <div><p className="text-sm text-gray-400">Số điện thoại</p><p className="mt-2 text-[28px] font-medium text-gray-900">{order.driverInfo?.phone || '-'}</p></div>
            <div><p className="text-sm text-gray-400">Biển số xe</p><p className="mt-2 text-lg text-gray-700">{order.driverInfo?.vehiclePlate || '-'}</p></div>
            <div><p className="text-sm text-gray-400">Ghi chú giao hàng</p><p className="mt-2 text-lg text-gray-700">{order.deliveryInfo?.note || order.note || '-'}</p></div>
          </div>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.8fr)_340px]">
        <div className="rounded-[28px] border border-gray-200 bg-white p-6">
          <div className="flex items-center justify-between gap-3"><h2 className="text-[22px] font-semibold text-gray-950">Thông tin đơn hàng</h2><span className="text-sm text-gray-500">{totalItems} món</span></div>
          <div className="mt-5 overflow-hidden rounded-[24px] border border-gray-200">
            <table className="w-full text-left">
              <thead className="bg-gray-100 text-gray-500"><tr><th className="px-5 py-4 font-medium">Sản phẩm</th><th className="px-4 py-4 text-center font-medium">Số lượng</th><th className="px-4 py-4 text-right font-medium">Giá gốc</th><th className="px-4 py-4 text-right font-medium">Thành tiền</th></tr></thead>
              <tbody>
                {order.items.map((item, index) => (
                  <tr key={`${item.name}-${index}`} className="border-t border-gray-100 align-top">
                    <td className="px-5 py-4"><p className="text-2xl font-medium text-gray-950">{item.name}</p>{item.note && <p className="mt-2 text-base text-gray-500">{item.note}</p>}</td>
                    <td className="px-4 py-4 text-center text-2xl font-medium text-gray-900">{item.quantity}</td>
                    <td className="px-4 py-4 text-right text-2xl text-gray-700">{formatCurrency(item.price)}</td>
                    <td className="px-4 py-4 text-right text-2xl font-semibold text-gray-950">{formatCurrency(item.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {(order.deliveryInfo?.address || order.deliveryInfo?.note) && (
            <div className="mt-5 flex items-start gap-3 rounded-2xl bg-gray-50 px-4 py-4 text-gray-700"><MapPin className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary-500" /><div>{order.deliveryInfo?.address && <p>{order.deliveryInfo.address}</p>}{order.deliveryInfo?.note && <p className="mt-1 text-sm text-gray-500">{order.deliveryInfo.note}</p>}</div></div>
          )}
        </div>

        <div className="rounded-[28px] border border-gray-200 bg-white p-6">
          <div className="space-y-4 text-lg text-gray-500">
            <div className="flex items-center justify-between gap-3"><span>Tiền hàng</span><span className="font-medium text-gray-900">{formatCurrency(order.subtotal)}</span></div>
            <div className="flex items-center justify-between gap-3"><span>Giảm giá sản phẩm</span><span className="font-medium text-gray-900">0 đ</span></div>
            <div className="flex items-center justify-between gap-3"><span>Giảm giá tổng đơn (ĐH + VC)</span><span className="font-medium text-gray-900">-{formatCurrency(order.discount)}</span></div>
            <div className="flex items-center justify-between gap-3"><span>Chiết khấu (CK) sàn</span><span className="font-medium text-gray-900">-{formatCurrency(order.platformFee ?? 0)}</span></div>
            <div className="flex items-center justify-between gap-3"><span>Doanh thu sau KM</span><span className="font-medium text-gray-900">{formatCurrency(order.total)}</span></div>
            <div className="flex items-center justify-between gap-3"><span>Khấu trừ thuế</span><span className="font-medium text-gray-900">0 đ</span></div>
          </div>

          <div className="mt-6 border-t border-gray-200 pt-5"><div className="flex items-center justify-between gap-3 text-[28px] font-semibold text-gray-950"><span>Thực nhận từ sàn</span><span>{formatCurrency(actualReceived)}</span></div></div>
          <div className="mt-6 rounded-2xl bg-gray-50 p-4 text-sm text-gray-600"><p className="font-medium text-gray-900">Phương thức thanh toán</p><p className="mt-2">{PAYMENT_METHOD_LABEL[order.paymentMethod || 'other'] || order.paymentMethod || 'Khác'}</p></div>
          <div className="mt-4 rounded-2xl bg-gray-50 p-4 text-sm text-gray-600">
            <div className="flex items-start gap-3"><Phone className="mt-0.5 h-4 w-4 flex-shrink-0 text-gray-400" /><div><p className="font-medium text-gray-900">Liên hệ giao nhận</p><p className="mt-1">{order.driverInfo?.phone || order.customerPhone || '-'}</p></div></div>
            <div className="mt-4 flex items-start gap-3"><Truck className="mt-0.5 h-4 w-4 flex-shrink-0 text-gray-400" /><div><p className="font-medium text-gray-900">Tài xế</p><p className="mt-1">{order.driverInfo?.name || 'Chưa có thông tin'}</p></div></div>
          </div>
        </div>
      </div>
    </div>
  )
}