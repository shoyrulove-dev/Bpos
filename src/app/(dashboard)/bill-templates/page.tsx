'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Edit, Eye, FileText, Plus, Printer, Sparkles, ToggleLeft, ToggleRight } from 'lucide-react'
import { useBillTemplates, useCreateBillTemplate, useUpdateBillTemplate } from '@/hooks/use-data'
import { loadOrderAlertSettings } from '@/lib/order-alerts'
import { isBridgePrintingEnabled, LOCAL_PRINTER_BRIDGE_ORIGIN } from '@/lib/local-printer'
import { buildDemoPrintTemplateContext, buildPrintTemplateContext, getDefaultTemplateContent, getTemplateTypeForPaperSize, PRINT_TEMPLATE_VARIABLES, renderPrintTemplateHtml } from '@/lib/print-template'
import { cn } from '@/lib/utils'
import type { BillSize, BillTemplate, BillType } from '@/types'

type TemplateFormState = {
  name: string
  type: BillType
  size: BillSize
  isActive: boolean
  templateContent: string
  brandId: string
}

const sizeColor: Record<BillSize, string> = {
  A4: 'badge-blue',
  A5: 'badge-blue',
  '80mm': 'badge-orange',
  '58mm': 'badge-yellow',
}

const typeLabel: Record<BillType, string> = {
  order: 'In đơn theo mẫu',
  delivery: 'Phiếu giao hàng',
  receipt: 'Mẫu tự động in',
  label: 'Mẫu tem 58mm',
}

function createFormState(type: BillType = 'receipt', size?: BillSize): TemplateFormState {
  const resolvedSize = size ?? (type === 'label' ? '58mm' : '80mm')
  const demoType = type === 'label' ? 'label' : type === 'delivery' ? 'delivery' : 'receipt'

  return {
    name: type === 'label' ? 'Tem bếp 58mm' : type === 'delivery' ? 'Phiếu giao hàng' : 'Phiếu tự động in 80mm',
    type,
    size: resolvedSize,
    isActive: true,
    templateContent: getDefaultTemplateContent(demoType),
    brandId: '',
  }
}

function getTemplateGuide(type: BillType, size: BillSize) {
  if (type === 'label' || size === '58mm') return 'Nút In phiếu tem sẽ dùng mẫu này khi in 58mm.'
  if (type === 'delivery') return 'Dùng cho phiếu giao hàng hoặc phiếu tài xế.'
  return 'Auto print và In đơn 80mm sẽ ưu tiên mẫu receipt đang bật.'
}

const NOTO_MONO_FONT_LINK = '<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Mono:wght@400;700&display=swap" rel="stylesheet">'

function openTemplatePrintWindow(content: string, type: BillType, size: BillSize) {
  const templateType = type === 'label' ? 'label' : type === 'delivery' ? 'delivery' : getTemplateTypeForPaperSize(size)
  const context = buildDemoPrintTemplateContext(templateType)
  const html = renderPrintTemplateHtml(content, context, [
    { name: 'Trà sữa trân châu', quantity: 2, price: 35000, total: 70000, note: 'Ít đá' },
    { name: 'Cơm sườn trứng', quantity: 1, price: 70000, total: 70000, note: 'Thêm nước mắm' },
  ])
  const paperWidth = size === '58mm' ? '58mm' : size === 'A4' ? '210mm' : size === 'A5' ? '148mm' : '80mm'
  const printWindow = window.open('', '_blank', 'width=520,height=760')
  if (!printWindow) return

  printWindow.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Preview</title>${NOTO_MONO_FONT_LINK}<style>
    *{box-sizing:border-box}body{margin:0;background:#ebe7df;padding:20px;display:flex;flex-direction:column;align-items:center;gap:16px;font-family:Arial,sans-serif}
    .toolbar{display:flex;gap:10px}.toolbar button{border:0;border-radius:999px;padding:10px 18px;font-weight:700;cursor:pointer}.print{background:#111827;color:#fff}.close{background:#fff;color:#111827;border:1px solid #d1d5db}
    .paper{width:${paperWidth};max-width:100%;background:#fff;box-shadow:0 18px 50px rgba(15,23,42,.16);padding:12px;font-family:'Noto Sans Mono','Courier New',monospace;font-size:12px;line-height:1.35;border-radius:10px}
    .tpl-line{white-space:pre-wrap;word-break:break-word}.tpl-center{text-align:center}.tpl-strong{font-weight:800;letter-spacing:.04em}.tpl-divider{border-top:1px dashed #111;margin:6px 0}.tpl-indent{padding-left:12px}
    @media print{body{background:#fff;padding:0}.toolbar{display:none}.paper{box-shadow:none;border-radius:0;padding:4mm}@page{size:${paperWidth};margin:4mm}}
  </style></head><body><div class="toolbar"><button class="print" onclick="window.print()">In thử</button><button class="close" onclick="window.close()">Đóng</button></div><div class="paper">${html}</div></body></html>`)
  printWindow.document.close()
}

async function printTemplateWithBridgeFallback(content: string, type: BillType, size: BillSize) {
  const bridgeType = type === 'label' ? 'label' as const : 'receipt' as const
  if (isBridgePrintingEnabled(bridgeType)) {
    try {
      const demoOrder = {
        source: 'grab', externalOrderId: 'DEMO-TEMPLATE', shortId: 'DEMO',
        customerName: 'Khách Test', customerPhone: '0901234567',
        items: [
          { name: 'Trà sữa trân châu', quantity: 2, price: 35000, total: 70000, note: 'Ít đá' },
          { name: 'Cơm sườn trứng', quantity: 1, price: 70000, total: 70000, note: '' },
        ],
        subtotal: 140000, discount: 0, total: 140000, note: 'In thử từ Hóa đơn mẫu', rawPayload: {},
      }
      const res = await fetch(`${LOCAL_PRINTER_BRIDGE_ORIGIN}/print-order?type=${bridgeType}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: bridgeType, order: demoOrder }),
        signal: AbortSignal.timeout(5000),
      })
      const data = await res.json() as { ok?: boolean }
      if (data.ok) return
    } catch { /* bridge không có hoặc lỗi → dùng popup */ }
  }
  openTemplatePrintWindow(content, type, size)
}

export default function BillTemplatesPage() {
  const { data: rawTemplates = [], isLoading } = useBillTemplates()
  const templates = rawTemplates as BillTemplate[]
  const createMutation = useCreateBillTemplate()
  const updateMutation = useUpdateBillTemplate()
  const [showForm, setShowForm] = useState(false)
  const [editTemplate, setEditTemplate] = useState<BillTemplate | null>(null)
  const [previewTemplate, setPreviewTemplate] = useState<BillTemplate | null>(null)
  const [form, setForm] = useState<TemplateFormState>(createFormState())
  const [testOrderId, setTestOrderId] = useState('')
  const [loadingTestOrder, setLoadingTestOrder] = useState(false)
  const [printerName, setPrinterName] = useState('')
  const [printerSize, setPrinterSize] = useState<BillSize>('80mm')
  const saving = createMutation.isPending || updateMutation.isPending

  useEffect(() => {
    const settings = loadOrderAlertSettings()
    setPrinterName(settings.printerName)
    setPrinterSize(settings.printerPaperSize)
  }, [])

  const livePreviewHtml = useMemo(() => {
    const previewType = form.type === 'label' ? 'label' : form.type === 'delivery' ? 'delivery' : getTemplateTypeForPaperSize(form.size)
    return renderPrintTemplateHtml(form.templateContent, buildDemoPrintTemplateContext(previewType), [
      { name: 'Trà sữa trân châu', quantity: 2, price: 35000, total: 70000, note: 'Ít đá' },
      { name: 'Cơm sườn trứng', quantity: 1, price: 70000, total: 70000, note: 'Thêm nước mắm' },
    ])
  }, [form])

  const openCreate = (type: BillType = 'receipt', size?: BillSize) => {
    setEditTemplate(null)
    setForm(createFormState(type, size))
    setShowForm(true)
  }

  const openEdit = (template: BillTemplate) => {
    setEditTemplate(template)
    setForm({
      name: template.name,
      type: template.type,
      size: template.size,
      isActive: template.isActive,
      templateContent: template.templateContent,
      brandId: template.brandId ?? '',
    })
    setShowForm(true)
  }

  const handleSave = async () => {
    if (!form.name.trim()) return

    if (editTemplate) {
      await updateMutation.mutateAsync({ id: editTemplate._id, ...form })
    } else {
      await createMutation.mutateAsync(form)
    }

    setShowForm(false)
  }

  const toggleActive = (template: BillTemplate) => updateMutation.mutate({ id: template._id, isActive: !template.isActive })

  const insertVariable = (token: string) => setForm((current) => ({ ...current, templateContent: `${current.templateContent}${current.templateContent.endsWith('\n') || !current.templateContent ? '' : '\n'}${token}` }))

  const openRealOrderPrintWindow = async (orderId: string, content: string, type: BillType, size: BillSize) => {
    const id = orderId.trim()
    if (!id) return
    setLoadingTestOrder(true)
    try {
      const res = await fetch(`/api/orders/${encodeURIComponent(id)}`)
      if (!res.ok) { alert('Không tìm thấy đơn. Kiểm tra lại ID đơn.'); return }
      const order = await res.json() as import('@/types').Order
      const templateType = type === 'label' ? 'label' : type === 'delivery' ? 'delivery' : getTemplateTypeForPaperSize(size)
      const context = buildPrintTemplateContext(order, {
        BillName: templateType === 'label' ? 'TEM IN BẾP' : templateType === 'delivery' ? 'PHIẾU GIAO HÀNG' : 'PHIẾU LÀM MÓN',
      })
      const html = renderPrintTemplateHtml(content, context, order.items ?? [])
      const paperWidth = size === '58mm' ? '58mm' : size === 'A4' ? '210mm' : size === 'A5' ? '148mm' : '80mm'
      const printWindow = window.open('', '_blank', 'width=520,height=760')
      if (!printWindow) return
      printWindow.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>In thử (đơn thật)</title><link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Mono:wght@400;700&display=swap" rel="stylesheet"><style>
    *{box-sizing:border-box}body{margin:0;background:#ebe7df;padding:20px;display:flex;flex-direction:column;align-items:center;gap:16px;font-family:Arial,sans-serif}
    .toolbar{display:flex;gap:10px}.toolbar button{border:0;border-radius:999px;padding:10px 18px;font-weight:700;cursor:pointer}.print{background:#111827;color:#fff}.close{background:#fff;color:#111827;border:1px solid #d1d5db}
    .paper{width:${paperWidth};max-width:100%;background:#fff;box-shadow:0 18px 50px rgba(15,23,42,.16);padding:12px;font-family:'Noto Sans Mono','Courier New',monospace;font-size:12px;line-height:1.35;border-radius:10px}
    .tpl-line{white-space:pre-wrap;word-break:break-word}.tpl-center{text-align:center}.tpl-strong{font-weight:800;letter-spacing:.04em}.tpl-divider{border-top:1px dashed #111;margin:6px 0}.tpl-indent{padding-left:12px}
    @media print{body{background:#fff;padding:0}.toolbar{display:none}.paper{box-shadow:none;border-radius:0;padding:4mm}@page{size:${paperWidth};margin:4mm}}
  </style></head><body><div class="toolbar"><button class="print" onclick="window.print()">In thử</button><button class="close" onclick="window.close()">Đóng</button></div><div class="paper">${html}</div></body></html>`)
      printWindow.document.close()
    } catch { alert('Lỗi khi tải đơn hàng.') } finally { setLoadingTestOrder(false) }
  }

  const handleTypeChange = (nextType: BillType) => {
    const nextSize: BillSize = nextType === 'label' ? '58mm' : form.size === '58mm' ? '80mm' : form.size
    setForm((current) => ({
      ...current,
      type: nextType,
      size: nextSize,
      templateContent: current.templateContent.trim() ? current.templateContent : createFormState(nextType, nextSize).templateContent,
    }))
  }

  const recommendedTemplates = [
    { title: 'Mẫu tự động in', subtitle: 'Dùng cho auto print và In đơn 80mm', type: 'receipt' as BillType, size: '80mm' as BillSize },
    { title: 'Mẫu tem bếp', subtitle: 'Dùng cho nút In phiếu tem 58mm', type: 'label' as BillType, size: '58mm' as BillSize },
  ]

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div>
          <h1 className="page-title">Hóa đơn mẫu và tem in</h1>
          <p className="page-subtitle">{isLoading ? 'Đang tải...' : `${templates.length} mẫu đang có`} · Preview trong trang này và auto print dùng cùng renderer.</p>
        </div>
        <button onClick={() => openCreate('receipt', '80mm')} className="btn-primary">
          <Plus className="w-4 h-4" /> Tạo mẫu mới
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {recommendedTemplates.map((item) => (
          <div key={item.title} className="card p-5 flex items-start gap-4">
            <div className="w-11 h-11 rounded-2xl bg-orange-50 text-orange-600 flex items-center justify-center flex-shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-semibold text-gray-900">{item.title}</h2>
                <span className={cn('badge', sizeColor[item.size])}>{item.size}</span>
                <span className="badge badge-gray">{typeLabel[item.type]}</span>
              </div>
              <p className="text-sm text-gray-500 mt-1">{item.subtitle}</p>
              <p className="text-xs text-gray-400 mt-2">{getTemplateGuide(item.type, item.size)}</p>
            </div>
            <button onClick={() => openCreate(item.type, item.size)} className="btn-outline btn-sm whitespace-nowrap">Mở editor</button>
          </div>
        ))}
      </div>

      <div className="card px-4 py-3 flex items-center gap-3 flex-wrap">
        <Printer className="h-4 w-4 text-gray-400 flex-shrink-0" />
        <span className="text-sm text-gray-700 font-medium">{printerName || 'Chưa cấu hình máy in'}</span>
        <span className="badge badge-gray">Auto print hiện tại: {printerSize}</span>
        <div className="flex-1" />
        <button onClick={() => void printTemplateWithBridgeFallback(getDefaultTemplateContent(getTemplateTypeForPaperSize(printerSize)), getTemplateTypeForPaperSize(printerSize), printerSize)} className="btn-outline btn-sm gap-1.5">
          <Printer className="h-3.5 w-3.5" /> In thử renderer chung
        </button>
        <Link href="/settings" className="btn-ghost btn-sm text-gray-500 text-xs">Cài đặt máy in →</Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {templates.map((template) => (
          <div key={template._id} className="card p-5 hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between mb-3">
              <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center">
                <FileText className="w-5 h-5 text-gray-500" />
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => openEdit(template)} className="btn-ghost btn-sm p-1.5"><Edit className="w-3.5 h-3.5" /></button>
                <button onClick={() => setPreviewTemplate(template)} className="btn-ghost btn-sm p-1.5"><Eye className="w-3.5 h-3.5" /></button>
                <button onClick={() => void printTemplateWithBridgeFallback(template.templateContent, template.type, template.size)} className="btn-ghost btn-sm p-1.5" title="In thử"><Printer className="w-3.5 h-3.5" /></button>
                <button onClick={() => toggleActive(template)} className={cn('btn-ghost btn-sm p-1.5', template.isActive ? 'text-green-500' : 'text-gray-400')}>
                  {template.isActive ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <h3 className="font-semibold text-gray-900">{template.name}</h3>
            <div className="flex gap-2 mt-2 flex-wrap">
              <span className="badge badge-gray">{typeLabel[template.type]}</span>
              <span className={cn('badge', sizeColor[template.size])}>{template.size}</span>
              <span className={cn('badge', template.isActive ? 'badge-green' : 'badge-red')}>{template.isActive ? 'Kích hoạt' : 'Tắt'}</span>
            </div>
            <p className="mt-3 text-xs text-gray-500 line-clamp-3">{getTemplateGuide(template.type, template.size)}</p>
          </div>
        ))}
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/55 p-4 overflow-y-auto">
          <div className="max-w-7xl mx-auto bg-white rounded-[28px] shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">{editTemplate ? 'Sửa mẫu in' : 'Tạo mẫu in mới'}</h2>
                <p className="text-sm text-gray-500 mt-1">Editor text bên trái, preview live bên phải. {getTemplateGuide(form.type, form.size)}</p>
              </div>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-[1.15fr_0.85fr] min-h-[75vh]">
              <div className="p-6 space-y-5 border-r border-gray-100">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <div className="md:col-span-4 form-group">
                    <label className="label">Tên mẫu</label>
                    <input className="input" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Ví dụ: Phiếu tự động in 80mm" />
                  </div>
                  <div className="form-group md:col-span-2">
                    <label className="label">Loại mẫu</label>
                    <select className="input" value={form.type} onChange={(event) => handleTypeChange(event.target.value as BillType)}>
                      <option value="receipt">Mẫu tự động in</option>
                      <option value="label">Mẫu tem 58mm</option>
                      <option value="delivery">Phiếu giao hàng</option>
                      <option value="order">In đơn theo mẫu</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="label">Khổ giấy</label>
                    <select className="input" value={form.size} onChange={(event) => setForm({ ...form, size: event.target.value as BillSize })}>
                      <option value="A4">A4</option>
                      <option value="A5">A5</option>
                      <option value="80mm">80mm</option>
                      <option value="58mm">58mm</option>
                    </select>
                  </div>
                  <div className="form-group flex items-end">
                    <label className="flex items-center gap-2 cursor-pointer min-h-11">
                      <input type="checkbox" checked={form.isActive} onChange={(event) => setForm({ ...form, isActive: event.target.checked })} className="rounded" />
                      <span className="text-sm font-medium text-gray-700">Kích hoạt</span>
                    </label>
                  </div>
                </div>

                <div className="rounded-2xl border border-orange-100 bg-orange-50/60 p-4">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">Biến template</p>
                      <p className="text-xs text-gray-500 mt-1">Click để chèn vào editor text. Hỗ trợ {'{{range .Items}} ... {{end}}'} cho danh sách món.</p>
                    </div>
                    <button onClick={() => setForm((current) => ({ ...current, templateContent: getDefaultTemplateContent(form.type === 'label' ? 'label' : form.type === 'delivery' ? 'delivery' : 'receipt') }))} className="btn-outline btn-sm whitespace-nowrap">Nạp mẫu gợi ý</button>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {PRINT_TEMPLATE_VARIABLES.map((item) => (
                      <button key={item.token} onClick={() => insertVariable(item.token)} className="text-xs bg-white text-orange-700 px-2.5 py-1.5 rounded-lg font-mono border border-orange-200 hover:bg-orange-100 transition-colors" title={`${item.label}: ${item.example}`}>
                        {item.token}
                      </button>
                    ))}
                    <button onClick={() => insertVariable('{{range .Items}}\n{{.Name}} x{{.Qty}}\n  {{.Total}}\n{{.NoteLine}}\n{{end}}')} className="text-xs bg-white text-orange-700 px-2.5 py-1.5 rounded-lg font-mono border border-orange-200 hover:bg-orange-100 transition-colors">
                      {'{{range .Items}} ... {{end}}'}
                    </button>
                  </div>
                </div>

                <div className="form-group">
                  <label className="label">Nội dung text template</label>
                  <textarea className="input min-h-[420px] resize-y font-mono text-[12px] leading-6" value={form.templateContent} onChange={(event) => setForm({ ...form, templateContent: event.target.value })} placeholder="Nhập nội dung template..." />
                </div>
              </div>

              <div className="bg-[#f6f1e8] p-6 xl:sticky xl:top-0 xl:max-h-[85vh] overflow-y-auto">
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">Preview live</p>
                    <p className="text-xs text-gray-500 mt-1">Đây là renderer thật đang được dùng cho preview và trang in.</p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <button onClick={() => void printTemplateWithBridgeFallback(form.templateContent, form.type, form.size)} className="btn-primary btn-sm gap-1.5 whitespace-nowrap">
                      <Printer className="h-3.5 w-3.5" /> In thử demo
                    </button>
                    <div className="flex items-center gap-1.5">
                      <input
                        className="input h-7 text-xs w-[160px] px-2"
                        placeholder="ID đơn để in thật..."
                        value={testOrderId}
                        onChange={(e) => setTestOrderId(e.target.value)}
                      />
                      <button
                        onClick={() => void openRealOrderPrintWindow(testOrderId, form.templateContent, form.type, form.size)}
                        disabled={!testOrderId.trim() || loadingTestOrder}
                        className="btn-outline btn-sm gap-1 whitespace-nowrap disabled:opacity-50"
                      >
                        <Printer className="h-3 w-3" /> {loadingTestOrder ? 'Đang tải...' : 'Đơn thật'}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="rounded-[24px] border border-black/5 bg-white shadow-[0_20px_45px_rgba(15,23,42,0.10)] p-5">
                  <div className="mb-3 flex items-center gap-2 text-[11px] text-gray-500 uppercase tracking-[0.22em]">
                    <span>{typeLabel[form.type]}</span>
                    <span>•</span>
                    <span>{form.size}</span>
                  </div>
                  <div className="mx-auto bg-white text-black font-mono text-xs leading-5" style={{ width: form.size === '58mm' ? '58mm' : form.size === 'A4' ? '210mm' : form.size === 'A5' ? '148mm' : '80mm', maxWidth: '100%', padding: '10px' }} dangerouslySetInnerHTML={{ __html: livePreviewHtml }} />
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
              <button onClick={() => setShowForm(false)} className="btn-outline">Hủy</button>
              <button onClick={handleSave} className="btn-primary" disabled={saving}>{saving ? 'Đang lưu...' : 'Lưu mẫu'}</button>
            </div>
          </div>
        </div>
      )}

      {previewTemplate && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 bg-black/50 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl my-auto">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white rounded-t-2xl z-10">
              <div>
                <h2 className="font-semibold text-gray-900">Xem nhanh: {previewTemplate.name}</h2>
                <p className="text-xs text-gray-500 mt-1">{getTemplateGuide(previewTemplate.type, previewTemplate.size)}</p>
              </div>
              <button onClick={() => setPreviewTemplate(null)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
            </div>
            <div className="p-6 bg-[#f6f1e8] overflow-y-auto max-h-[65vh]">
              <div className="bg-white rounded-2xl shadow-sm p-4">
                <div className="mx-auto font-mono text-xs leading-5" style={{ width: previewTemplate.size === '58mm' ? '58mm' : previewTemplate.size === 'A4' ? '210mm' : previewTemplate.size === 'A5' ? '148mm' : '80mm', maxWidth: '100%' }} dangerouslySetInnerHTML={{ __html: renderPrintTemplateHtml(previewTemplate.templateContent, buildDemoPrintTemplateContext(previewTemplate.type === 'label' ? 'label' : previewTemplate.type === 'delivery' ? 'delivery' : 'receipt'), [
                  { name: 'Trà sữa trân châu', quantity: 2, price: 35000, total: 70000, note: 'Ít đá' },
                  { name: 'Cơm sườn trứng', quantity: 1, price: 70000, total: 70000 },
                ]) }} />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2 sticky bottom-0 bg-white rounded-b-2xl">
              <button onClick={() => void printTemplateWithBridgeFallback(previewTemplate.templateContent, previewTemplate.type, previewTemplate.size)} className="btn-outline gap-1.5">
                <Printer className="h-4 w-4" /> In thử
              </button>
              <button onClick={() => setPreviewTemplate(null)} className="btn-primary">Đóng</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
