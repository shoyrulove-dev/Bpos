'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Plus, Edit, Eye, FileText, ToggleLeft, ToggleRight, Printer } from 'lucide-react'
import { useBillTemplates, useCreateBillTemplate, useUpdateBillTemplate } from '@/hooks/use-data'
import { cn } from '@/lib/utils'
import { loadOrderAlertSettings } from '@/lib/order-alerts'
import type { BillTemplate } from '@/types'

const TEMPLATE_VARS = ['{{.BillName}}', '{{.SiteName}}', '{{.OrderSource}}', '{{.ShortOrderID}}', '{{.CurrentTime}}', '{{.OrderCreatedAt}}', '{{.OrderDeliveryAt}}', '{{.CustomerName}}', '{{.DeliveryAddress}}']
const sizeColor: Record<string, string> = { A4: 'badge-blue', A5: 'badge-blue', '80mm': 'badge-orange', '58mm': 'badge-yellow' }
const typeLabel: Record<string, string> = { order: 'Đơn hàng', delivery: 'Giao hàng', receipt: 'Biên lai' }

const SAMPLE_DATA: Record<string, string> = {
  BillName: 'HÓA ĐƠN ĐẶT HÀNG',
  SiteName: 'Cửa hàng Demo',
  OrderSource: 'GrabFood',
  ShortOrderID: 'GF-2026-001',
  CurrentTime: new Date().toLocaleString('vi-VN'),
  OrderCreatedAt: new Date().toLocaleString('vi-VN'),
  OrderDeliveryAt: new Date(Date.now() + 30 * 60000).toLocaleString('vi-VN'),
  CustomerName: 'Nguyễn Văn A',
  DeliveryAddress: '123 Đường Lê Lợi, Q.1, TP.HCM',
}

function fillSampleData(content: string) {
  let filled = content
  for (const [key, val] of Object.entries(SAMPLE_DATA)) {
    filled = filled.replace(new RegExp(`\\{\\{\\s*\\.?${key}\\s*\\}\\}`, 'g'), val)
  }
  return filled
}

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function openTestPrint(content: string, size: string) {
  const widthMap: Record<string, string> = { A4: '210mm', A5: '148mm', '80mm': '80mm', '58mm': '58mm' }
  const w = widthMap[size] ?? '80mm'
  const pw = window.open('', '_blank', 'width=420,height=640')
  if (!pw) return
  pw.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    body{margin:0;padding:8px;width:${w};font-family:monospace;font-size:11px;line-height:1.5}
    pre{white-space:pre-wrap;word-break:break-word;margin:0}
    @media print{@page{size:${w};margin:4mm}}
  </style></head><body><pre>${escapeHtml(fillSampleData(content))}</pre></body></html>`)
  pw.document.close()
  pw.onload = () => { pw.print(); pw.close() }
}

export default function BillTemplatesPage() {
  const { data: rawTemplates = [], isLoading } = useBillTemplates()
  const templates = rawTemplates as BillTemplate[]
  const createMutation = useCreateBillTemplate()
  const updateMutation = useUpdateBillTemplate()
  const [showForm, setShowForm] = useState(false)
  const [editTpl, setEditTpl] = useState<BillTemplate | null>(null)
  const [form, setForm] = useState({ name: '', type: 'order', size: '80mm', isActive: true, templateContent: '', brandId: '' })
  const [preview, setPreview] = useState<BillTemplate | null>(null)
  const [printerName, setPrinterName] = useState('')
  const [printerSize, setPrinterSize] = useState('80mm')
  const saving = createMutation.isPending || updateMutation.isPending

  useEffect(() => {
    const s = loadOrderAlertSettings()
    setPrinterName(s.printerName)
    setPrinterSize(s.printerPaperSize)
  }, [])

  const openEdit = (t: BillTemplate) => {
    setEditTpl(t)
    setForm({ name: t.name, type: t.type, size: t.size, isActive: t.isActive, templateContent: t.templateContent, brandId: t.brandId ?? '' })
    setShowForm(true)
    setPreview(null)
  }

  const handleSave = async () => {
    if (!form.name) return
    if (editTpl) {
      await updateMutation.mutateAsync({ id: editTpl._id, ...form })
    } else {
      await createMutation.mutateAsync(form)
    }
    setShowForm(false)
  }

  const toggleActive = (tpl: BillTemplate) => updateMutation.mutate({ id: tpl._id, isActive: !tpl.isActive })

  const insertVar = (v: string) => setForm(prev => ({ ...prev, templateContent: prev.templateContent + v }))

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div>
          <h1 className="page-title">Hóa đơn mẫu</h1>
          <p className="page-subtitle">{isLoading ? '...' : `${templates.length} mẫu hóa đơn`}</p>
        </div>
        <button onClick={() => { setEditTpl(null); setForm({ name: '', type: 'order', size: '80mm', isActive: true, templateContent: '', brandId: '' }); setShowForm(true) }} className="btn-primary">
          <Plus className="w-4 h-4" /> Tạo mẫu mới
        </button>
      </div>

      {/* Printer bar */}
      <div className="card px-4 py-3 flex items-center gap-3 flex-wrap">
        <Printer className="h-4 w-4 text-gray-400 flex-shrink-0" />
        <span className="text-sm text-gray-700 font-medium">{printerName || 'Chưa cấu hình máy in'}</span>
        <span className="badge badge-gray">{printerSize}</span>
        <div className="flex-1" />
        <button
          onClick={() => openTestPrint('=== IN THỬ ===\n{{.BillName}}\n{{.SiteName}}\n---\nĐơn: {{.ShortOrderID}}\nKhách: {{.CustomerName}}\nĐịa chỉ: {{.DeliveryAddress}}\n---\nNgày: {{.CurrentTime}}\n=== CẢM ƠN QUÝ KHÁCH ===', printerSize)}
          className="btn-outline btn-sm gap-1.5"
        >
          <Printer className="h-3.5 w-3.5" /> In thử
        </button>
        <Link href="/settings" className="btn-ghost btn-sm text-gray-500 text-xs">Cài đặt máy in →</Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {templates.map(tpl => (
          <div key={tpl._id} className="card p-5 hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between mb-3">
              <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center">
                <FileText className="w-5 h-5 text-gray-500" />
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => openEdit(tpl)} className="btn-ghost btn-sm p-1.5"><Edit className="w-3.5 h-3.5" /></button>
                <button onClick={() => setPreview(tpl)} className="btn-ghost btn-sm p-1.5"><Eye className="w-3.5 h-3.5" /></button>
                <button onClick={() => openTestPrint(tpl.templateContent, tpl.size)} className="btn-ghost btn-sm p-1.5" title="In thử"><Printer className="w-3.5 h-3.5" /></button>
                <button onClick={() => toggleActive(tpl)} className={cn('btn-ghost btn-sm p-1.5', tpl.isActive ? 'text-green-500' : 'text-gray-400')}>
                  {tpl.isActive ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <h3 className="font-semibold text-gray-900">{tpl.name}</h3>
            <div className="flex gap-2 mt-2">
              <span className="badge badge-gray">{typeLabel[tpl.type]}</span>
              <span className={cn('badge', sizeColor[tpl.size])}>{tpl.size}</span>
              <span className={cn('badge', tpl.isActive ? 'badge-green' : 'badge-red')}>
                {tpl.isActive ? 'Kích hoạt' : 'Tắt'}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Edit Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-semibold text-gray-900">{editTpl ? 'Chỉnh sửa hóa đơn mẫu' : 'Tạo hóa đơn mẫu'}</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-3 form-group">
                  <label className="label">Tên hóa đơn</label>
                  <input className="input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Hóa đơn 80mm" />
                </div>
                <div className="form-group">
                  <label className="label">Loại</label>
                  <select className="input" value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
                    <option value="order">Đơn hàng</option>
                    <option value="delivery">Giao hàng</option>
                    <option value="receipt">Biên lai</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="label">Kích thước</label>
                  <select className="input" value={form.size} onChange={e => setForm({ ...form, size: e.target.value })}>
                    <option value="A4">A4</option>
                    <option value="A5">A5</option>
                    <option value="80mm">80mm</option>
                    <option value="58mm">58mm</option>
                  </select>
                </div>
                <div className="form-group flex items-end">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={form.isActive} onChange={e => setForm({ ...form, isActive: e.target.checked })} className="rounded" />
                    <span className="text-sm font-medium text-gray-700">Kích hoạt</span>
                  </label>
                </div>
              </div>

              {/* Variables helper */}
              <div>
                <p className="label">Biến template (click để chèn)</p>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {TEMPLATE_VARS.map(v => (
                    <button key={v} onClick={() => insertVar(v)} className="text-xs bg-orange-50 text-orange-600 px-2 py-1 rounded font-mono hover:bg-orange-100 transition-colors">
                      {v}
                    </button>
                  ))}
                </div>
              </div>

              <div className="form-group">
                <label className="label">Nội dung template</label>
                <textarea
                  className="input font-mono text-xs"
                  rows={12}
                  value={form.templateContent}
                  onChange={e => setForm({ ...form, templateContent: e.target.value })}
                  placeholder="Nhập nội dung template hóa đơn..."
                />
              </div>
            </div>
            <div className="sticky bottom-0 bg-white px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
              <button onClick={() => setShowForm(false)} className="btn-outline">Hủy</button>
              <button onClick={handleSave} className="btn-primary">Lưu</button>
            </div>
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-semibold text-gray-900">Xem trước: {preview.name}</h2>
              <button onClick={() => setPreview(null)} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
            </div>
            <div className="p-6">
              <pre className="text-xs font-mono bg-gray-50 rounded-lg p-4 whitespace-pre-wrap overflow-x-auto max-h-80 overflow-y-auto">
                {fillSampleData(preview.templateContent)}
              </pre>
            </div>
            <div className="px-6 pb-5 flex justify-end gap-2">
              <button onClick={() => openTestPrint(preview.templateContent, preview.size)} className="btn-outline gap-1.5">
                <Printer className="h-4 w-4" /> In thử
              </button>
              <button onClick={() => setPreview(null)} className="btn-primary">Đóng</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
