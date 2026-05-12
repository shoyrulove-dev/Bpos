'use client'

import { type ReactNode, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { buildPrintTemplateContext, getDefaultTemplateContent, getTemplateTypeForPaperSize, renderPrintTemplateHtml } from '@/lib/print-template'
import type { BillTemplate, Order } from '@/types'

type NamedRef = string | { _id?: string; name?: string } | null | undefined

type PrintableOrder = Omit<Order, 'brandId' | 'hubId' | 'channelId'> & {
  brandId?: NamedRef
  hubId?: NamedRef
  channelId?: NamedRef | { _id?: string; name?: string; source?: string }
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
  const [templateContent, setTemplateContent] = useState('')
  const [templateName, setTemplateName] = useState<string>('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const templateType = getTemplateTypeForPaperSize(paperSize)

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
    let cancelled = false

    const loadTemplate = async () => {
      const fallbackTemplate = getDefaultTemplateContent(templateType)

      try {
        const response = await fetch('/api/bill-templates')
        if (!response.ok) {
          if (!cancelled) setTemplateContent(fallbackTemplate)
          return
        }

        const templates = await response.json() as BillTemplate[]
        const activeTemplate = templates.find((template) => template.isActive && template.type === templateType && template.size === paperSize)
          ?? templates.find((template) => template.isActive && template.type === templateType)

        if (!cancelled) {
          setTemplateContent(activeTemplate?.templateContent?.trim() || fallbackTemplate)
          setTemplateName(activeTemplate?.name?.trim() || '')
        }
      } catch {
        if (!cancelled) {
          setTemplateContent(fallbackTemplate)
        }
      }
    }

    loadTemplate()

    return () => {
      cancelled = true
    }
  }, [paperSize, templateType])

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
      // Chờ font load xong trước khi in để tránh fallback sang Courier New
      const doPrint = () => {
        window.print()
        window.setTimeout(finishPrint, embedded ? 8_000 : 3_000)
      }
      if (document.fonts?.ready) {
        void document.fonts.ready.then(doPrint)
      } else {
        doPrint()
      }
    }, 200)

    window.addEventListener('afterprint', afterPrint)

    return () => {
      window.clearTimeout(triggerPrint)
      window.removeEventListener('afterprint', afterPrint)
    }
  }, [autoPrint, embedded, order, orderId])

  const renderedTemplate = useMemo(() => {
    if (!order) return null

    const context = buildPrintTemplateContext(order, {
      BillName: templateType === 'label' ? 'TEM IN BẾP' : 'PHIẾU LÀM MÓN',
    })

    return renderPrintTemplateHtml(
      templateContent || getDefaultTemplateContent(templateType),
      context,
      order.items,
    )
  }, [order, templateContent, templateType])

  if (loading) {
    return <ReceiptShell paperSize={paperSize}><div className="receipt-state">Đang tải phiếu in...</div></ReceiptShell>
  }

  if (!order || !renderedTemplate) {
    return <ReceiptShell paperSize={paperSize}><div className="receipt-state receipt-state-error">{error || 'Không tìm thấy đơn hàng'}</div></ReceiptShell>
  }

  return (
    <ReceiptShell paperSize={paperSize}>
      {!autoPrint && (
        <div className="receipt-template-badge">
          {templateName ? `Mẫu: ${templateName}` : 'Mẫu mặc định (chưa có mẫu active)'}
        </div>
      )}
      <div className="receipt-wrap receipt-template" dangerouslySetInnerHTML={{ __html: renderedTemplate }} />
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
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Mono:wght@400;700&display=swap');

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

        .receipt-template {
          font-family: 'Noto Sans Mono', 'Consolas', 'Courier New', monospace;
          font-size: 4.1mm;
          line-height: 1.32;
          white-space: normal;
        }

        .tpl-line {
          white-space: pre-wrap;
          word-break: break-word;
        }

        .tpl-center {
          text-align: center;
        }

        .tpl-strong {
          font-weight: 800;
          letter-spacing: 0.04em;
        }

        .tpl-divider {
          border-top: 0.35mm dashed #000000;
          margin: 1.5mm 0;
        }

        .tpl-indent {
          padding-left: 3mm;
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
          .receipt-template-badge {
            display: none;
          }
        }

        .receipt-template-badge {
          position: fixed;
          top: 5px;
          right: 5px;
          background: rgba(0,0,0,0.55);
          color: #fff;
          font-size: 10px;
          font-family: sans-serif;
          line-height: 1;
          padding: 3px 8px;
          border-radius: 6px;
          pointer-events: none;
          z-index: 9999;
          white-space: nowrap;
        }
      `}</style>
      {children}
    </>
  )
}
