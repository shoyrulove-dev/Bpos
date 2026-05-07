'use client'

import { type ReactNode, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { CHANNEL_SOURCE_LABEL, formatCurrency, formatDate } from '@/lib/utils'
import type { Order, OrderItem } from '@/types'

type NamedRef = string | { _id?: string; name?: string } | null | undefined

type PrintableOrder = Omit<Order, 'brandId' | 'hubId' | 'channelId'> & {
  brandId?: NamedRef
  hubId?: NamedRef
  channelId?: NamedRef | { _id?: string; name?: string; source?: string }
}

const SOURCE_PREFIX: Record<string, string> = {
  grab: 'GF',
  be: 'BE',
  shopee: 'SP',
  xanh_sm: 'XS',
  internal: 'NB',
  other: 'OD',
}

function getNamedValue(value: NamedRef, fallback?: string) {
  if (typeof value === 'string') return fallback ?? value
  if (value && typeof value === 'object' && typeof value.name === 'string') return value.name
  return fallback ?? ''
}

function formatReceiptDate(value: string, formatString: string) {
  try {
    return formatDate(value, formatString)
  } catch {
    return value
  }
}

function getReceiptCode(order: PrintableOrder) {
  const prefix = SOURCE_PREFIX[order.source] ?? 'OD'
  const digits = String(order.externalOrderId ?? order.shortId ?? '').replace(/\D/g, '')
  const suffix = digits.slice(-3) || order.shortId.replace(/[^A-Z0-9]/gi, '').slice(-3) || '001'
  return `${prefix}-${suffix}`
}

function getOrderNote(order: PrintableOrder) {
  return order.note || order.deliveryInfo?.note || ''
}

function getItemNote(item: OrderItem) {
  return item.note || ''
}

function getItemTotal(item: OrderItem) {
  return item.total > 0 ? item.total : item.quantity * item.price
}

export default function ReceiptPrintClient({ orderId }: { orderId: string }) {
  const searchParams = useSearchParams()
  const autoPrint = searchParams.get('autoprint') === '1'
  const embedded = searchParams.get('embedded') === '1'
  const paperSize = searchParams.get('paperSize') === '58mm'
    ? '58mm'
    : searchParams.get('paperSize') === 'A4'
    ? 'A4'
    : '80mm'

  const [order, setOrder] = useState<PrintableOrder | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    const loadOrder = async () => {
      try {
        setLoading(true)
        setError('')

        const response = await fetch(`/api/orders/${orderId}`)
        if (!response.ok) {
          throw new Error('Không tải được dữ liệu hóa đơn')
        }

        const data = await response.json() as PrintableOrder
        if (!cancelled) {
          setOrder(data)
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Không tải được dữ liệu hóa đơn')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    loadOrder()

    return () => {
      cancelled = true
    }
  }, [orderId])

  useEffect(() => {
    if (!error || !embedded || typeof window === 'undefined' || !window.parent) return
    window.parent.postMessage({ type: 'bpos-receipt-print-failed', orderId }, window.location.origin)
  }, [embedded, error, orderId])

  useEffect(() => {
    if (!order || !autoPrint) return

    let finalized = false

    const finishPrint = () => {
      if (finalized) return
      finalized = true

      if (embedded && window.parent) {
        window.parent.postMessage({ type: 'bpos-receipt-printed', orderId }, window.location.origin)
      }

      if (!embedded && window.opener) {
        window.close()
      }
    }

    const afterPrint = () => {
      window.setTimeout(finishPrint, 250)
    }

    const triggerPrint = window.setTimeout(() => {
      window.print()
      window.setTimeout(finishPrint, embedded ? 8_000 : 3_000)
    }, 350)

    window.addEventListener('afterprint', afterPrint)

    return () => {
      window.clearTimeout(triggerPrint)
      window.removeEventListener('afterprint', afterPrint)
    }
  }, [autoPrint, embedded, order, orderId])

  const viewModel = useMemo(() => {
    if (!order) return null

    return {
      brandName: order.brandName || getNamedValue(order.brandId, 'BPOS'),
      hubName: order.hubName || getNamedValue(order.hubId),
      sourceLabel: CHANNEL_SOURCE_LABEL[order.source] || 'Đơn hàng',
      receiptCode: getReceiptCode(order),
      note: getOrderNote(order),
      estimatedTime: order.deliveryInfo?.estimatedTime,
    }
  }, [order])

  if (loading) {
    return <ReceiptShell paperSize={paperSize}><div className="receipt-state">Đang tải phiếu in...</div></ReceiptShell>
  }

  if (!order || !viewModel) {
    return <ReceiptShell paperSize={paperSize}><div className="receipt-state receipt-state-error">{error || 'Không tìm thấy đơn hàng'}</div></ReceiptShell>
  }

  return (
    <ReceiptShell paperSize={paperSize}>
      <div className="receipt-wrap">
        <header className="receipt-header">
          <div className="receipt-title">PHIẾU LÀM MÓN</div>
          <div className="receipt-brand">{viewModel.brandName}</div>
          <div className="receipt-source">{viewModel.sourceLabel} - {viewModel.receiptCode}</div>
          <div className="receipt-meta">Thời gian đặt: {formatReceiptDate(order.placedAt, 'dd/MM/yyyy HH:mm:ss')}</div>
          {viewModel.estimatedTime && (
            <div className="receipt-meta">Thời gian giao dự kiến: {formatReceiptDate(viewModel.estimatedTime, 'dd/MM/yyyy HH:mm')}</div>
          )}
          <div className="receipt-customer">Tên KH: {order.customerName}</div>
          {viewModel.hubName && <div className="receipt-hub">Điểm bán: {viewModel.hubName}</div>}
        </header>

        <table className="receipt-table">
          <thead>
            <tr>
              <th>Tên món</th>
              <th>SL</th>
              <th>Giá</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((item, index) => (
              <tr key={`${item.name}-${index}`}>
                <td>
                  <div className="item-name">{item.name}</div>
                  {getItemNote(item) && <div className="item-note">Mô tả: {getItemNote(item)}</div>}
                </td>
                <td className="qty-col">{item.quantity}</td>
                <td className="price-col">{formatCurrency(getItemTotal(item))}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {viewModel.note && (
          <div className="receipt-note">Ghi chú đơn: {viewModel.note}</div>
        )}

        <footer className="receipt-footer">Cảm ơn quý khách!</footer>
      </div>
    </ReceiptShell>
  )
}

function ReceiptShell({ children, paperSize }: { children: ReactNode; paperSize: '80mm' | '58mm' | 'A4' }) {
  const layout = paperSize === '58mm'
    ? { pageSize: '58mm auto', bodyWidth: '58mm', wrapWidth: '50mm' }
    : paperSize === 'A4'
    ? { pageSize: '210mm auto', bodyWidth: '210mm', wrapWidth: '190mm' }
    : { pageSize: '80mm auto', bodyWidth: '80mm', wrapWidth: '72mm' }

  return (
    <>
      <style jsx global>{`
        @page {
          size: ${layout.pageSize};
          margin: 4mm;
        }

        html, body {
          margin: 0;
          padding: 0;
          background: #ffffff;
          color: #000000;
          font-family: Arial, Helvetica, sans-serif;
        }

        body {
          width: ${layout.bodyWidth};
        }

        .receipt-wrap {
          box-sizing: border-box;
          width: ${layout.wrapWidth};
          margin: 0 auto;
          padding: 2mm 0 4mm;
        }

        .receipt-header {
          text-align: center;
          margin-bottom: 3mm;
        }

        .receipt-title {
          font-size: 8.8mm;
          font-weight: 800;
          line-height: 1.05;
          margin-bottom: 1mm;
          text-transform: uppercase;
        }

        .receipt-brand {
          font-size: 6.4mm;
          font-weight: 800;
          line-height: 1.08;
        }

        .receipt-source,
        .receipt-meta,
        .receipt-customer,
        .receipt-hub {
          font-size: 4.25mm;
          font-weight: 700;
          line-height: 1.2;
          margin-top: 0.6mm;
        }

        .receipt-table {
          width: 100%;
          border-collapse: collapse;
          table-layout: fixed;
          margin-top: 2mm;
        }

        .receipt-table th,
        .receipt-table td {
          border: 0.3mm solid #000000;
          padding: 1.4mm;
          vertical-align: top;
        }

        .receipt-table th {
          font-size: 4.3mm;
          font-weight: 800;
          text-align: center;
        }

        .receipt-table th:first-child,
        .receipt-table td:first-child {
          width: 58%;
        }

        .receipt-table th:nth-child(2),
        .receipt-table td:nth-child(2) {
          width: 12%;
          text-align: center;
        }

        .receipt-table th:nth-child(3),
        .receipt-table td:nth-child(3) {
          width: 30%;
          text-align: right;
        }

        .item-name {
          font-size: 4.8mm;
          font-weight: 800;
          line-height: 1.15;
        }

        .item-note {
          margin-top: 1mm;
          font-size: 3.9mm;
          line-height: 1.2;
          white-space: pre-wrap;
        }

        .qty-col,
        .price-col {
          font-size: 4.4mm;
          font-weight: 700;
        }

        .receipt-note {
          margin-top: 3mm;
          font-size: 4.4mm;
          font-weight: 700;
          line-height: 1.25;
        }

        .receipt-footer {
          margin-top: 6mm;
          text-align: center;
          font-size: 4.5mm;
          font-weight: 800;
        }

        .receipt-state {
          padding: 24px;
          text-align: center;
          font-size: 15px;
        }

        .receipt-state-error {
          color: #b91c1c;
        }

        @media print {
          .receipt-state {
            padding: 0;
          }
        }
      `}</style>
      {children}
    </>
  )
}
