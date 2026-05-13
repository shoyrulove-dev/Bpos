'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Plus, Link as LinkIcon, Unlink, Building2, Printer } from 'lucide-react'
import { useEInvoices, useCreateEInvoice } from '@/hooks/use-data'
import { cn, formatDate } from '@/lib/utils'
import { loadOrderAlertSettings } from '@/lib/order-alerts'
import type { EInvoiceConnection } from '@/types'

const PROVIDERS = [
  { value: 'viettel', label: 'Viettel-S', color: 'bg-red-100 text-red-700' },
  { value: 'vnpt', label: 'VNPT', color: 'bg-blue-100 text-blue-700' },
  { value: 'misa', label: 'MISA', color: 'bg-orange-100 text-orange-700' },
  { value: 'bkav', label: 'BKAV', color: 'bg-green-100 text-green-700' },
  { value: 'other', label: 'Khác', color: 'bg-gray-100 text-gray-700' },
]

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function textToReceiptHtml(content: string): string {
  return content.split('\n').map(line => {
    const t = line.trim()
    if (t.match(/^={3,}/)) return `<div style="text-align:center;font-weight:bold;letter-spacing:1px">${escapeHtml(t)}</div>`
    if (t.match(/^-{3,}$/) || t === '---') return `<hr style="border:none;border-top:1px dashed #999;margin:3px 0"/>`
    if (/\d/.test(t) && /^\s/.test(line)) return `<div style="text-align:right">${escapeHtml(t)}</div>`
    return `<div>${escapeHtml(t) || '\u00a0'}</div>`
  }).join('')
}

function openTestPrint(printerSize: string) {
  const w = ({ A4: '210mm', A5: '148mm', '80mm': '80mm', '58mm': '58mm' } as Record<string, string>)[printerSize] ?? '80mm'
  const pw = window.open('', '_blank', 'width=480,height=700')
  if (!pw) return
  const now = new Date().toLocaleString('vi-VN')
  const content = `=== IN THỬ HÓA ĐƠN ĐIỆN TỬ ===\nCửa hàng Demo\nMST: 0123456789\n---\nSố HĐ: DEMO-2026-001\nNgày: ${now}\n---\nKhách hàng: Nguyễn Văn A\nMặt hàng: Sản phẩm demo x1  100,000đ\n---\n   Tổng cộng: 100,000đ\n   VAT 10%: 10,000đ\n   Thực thu: 110,000đ\n=== CẢM ƠN QUÝ KHÁCH ===`
  pw.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    *{box-sizing:border-box}body{margin:0;background:#e5e5e5;display:flex;flex-direction:column;align-items:center;padding:20px;min-height:100vh}
    .paper{background:#fff;width:${w};max-width:100%;padding:10px;font-family:'Courier New',monospace;font-size:11px;line-height:1.6;box-shadow:0 2px 12px rgba(0,0,0,.18);border-radius:2px;word-break:break-word}
    .toolbar{display:flex;gap:8px;margin-bottom:14px}.toolbar button{padding:6px 18px;border:none;border-radius:6px;cursor:pointer;font-size:13px;font-weight:600}
    .btn-print{background:#f97316;color:#fff}.btn-close{background:#e5e7eb;color:#374151}
    @media print{body{background:#fff;padding:0}.toolbar{display:none}.paper{box-shadow:none;padding:4mm}@page{size:${w};margin:4mm}}
  </style></head><body>
    <div class="toolbar"><button class="btn-print" onclick="window.print()">&#128424; In</button><button class="btn-close" onclick="window.close()">&#x2715; Đóng</button></div>
    <div class="paper">${textToReceiptHtml(content)}</div>
  </body></html>`)
  pw.document.close()
}

export default function EInvoicesPage() {
  const { data: rawConns = [], isLoading } = useEInvoices()
  const connections = rawConns as EInvoiceConnection[]
  const createMutation = useCreateEInvoice()
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ provider: 'viettel', taxCode: '', username: '', password: '', brandId: '' })
  const [printerName, setPrinterName] = useState('')
  const [printerSize, setPrinterSize] = useState('80mm')

  useEffect(() => {
    const s = loadOrderAlertSettings()
    setPrinterName(s.printerName)
    setPrinterSize(s.printerPaperSize)
  }, [])

  const handleConnect = async () => {
    if (!form.taxCode || !form.username) return
    await createMutation.mutateAsync(form)
    setShowForm(false)
    setForm({ provider: 'viettel', taxCode: '', username: '', password: '', brandId: '' })
  }

  const providerInfo = (value: string) => PROVIDERS.find(p => p.value === value)

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div><h1 className="page-title">Hóa đơn điện tử</h1><p className="page-subtitle">Kết nối nhà cung cấp HĐĐT</p></div>
        <button onClick={() => setShowForm(true)} className="btn-primary"><Plus className="w-4 h-4" /> Thêm kết nối</button>
      </div>

      {/* Printer bar */}
      <div className="card px-4 py-3 flex items-center gap-3 flex-wrap">
        <Printer className="h-4 w-4 text-gray-400 flex-shrink-0" />
        <span className="text-sm text-gray-700 font-medium">{printerName || 'Chưa cấu hình máy in'}</span>
        <span className="badge badge-gray">{printerSize}</span>
        <div className="flex-1" />
        <button onClick={() => openTestPrint(printerSize)} className="btn-outline btn-sm gap-1.5">
          <Printer className="h-3.5 w-3.5" /> In thử
        </button>
        <Link href="/settings" className="btn-ghost btn-sm text-gray-500 text-xs">Cài đặt máy in →</Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {connections.map(conn => {
          const prov = providerInfo(conn.provider)
          return (
            <div key={conn._id} className="card p-5">
              <div className="flex items-start justify-between mb-3">
                <span className={cn('text-sm font-bold px-3 py-1.5 rounded-lg', prov?.color)}>
                  {prov?.label}
                </span>
                <div className="flex gap-1">
                  <button className={cn('btn-ghost btn-sm p-1.5', conn.isConnected ? 'text-green-500' : 'text-gray-400')}>
                    {conn.isConnected ? <LinkIcon className="w-4 h-4" /> : <Unlink className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-1.5 text-sm text-gray-700 mt-2">
                <Building2 className="w-3.5 h-3.5 text-gray-400" />
                <span>{conn.brandName}</span>
              </div>
              <p className="text-xs text-gray-400 mt-1">MST: <span className="font-mono font-medium">{conn.taxCode}</span></p>
              <p className="text-xs text-gray-400">Tài khoản: <span className="font-medium">{conn.username}</span></p>
              <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between">
                <span className={cn('badge', conn.isConnected ? 'badge-green' : 'badge-red')}>
                  {conn.isConnected ? 'Đã kết nối' : 'Ngắt kết nối'}
                </span>
                <span className="text-xs text-gray-400">{conn.connectedAt ? formatDate(conn.connectedAt, 'dd/MM/yyyy') : '—'}</span>
              </div>
            </div>
          )
        })}

        {/* Add card */}
        <button onClick={() => setShowForm(true)} className="border-2 border-dashed border-gray-200 rounded-2xl p-5 flex flex-col items-center justify-center gap-2 text-gray-400 hover:border-primary-300 hover:text-primary-500 transition-colors min-h-[180px]">
          <Plus className="w-8 h-8" />
          <span className="text-sm font-medium">Thêm kết nối mới</span>
        </button>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90dvh] flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
              <h2 className="font-semibold text-gray-900">Thêm kết nối HĐĐT</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto flex-1">
              <div className="form-group">
                <label className="label">Nhà cung cấp</label>
                <select className="input" value={form.provider} onChange={e => setForm({ ...form, provider: e.target.value })}>
                  {PROVIDERS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="label">Mã số thuế</label>
                <input className="input font-mono" value={form.taxCode} onChange={e => setForm({ ...form, taxCode: e.target.value })} placeholder="0123456789" />
              </div>
              <div className="form-group">
                <label className="label">Tên đăng nhập</label>
                <input className="input" value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} placeholder="username" />
              </div>
              <div className="form-group">
                <label className="label">Mật khẩu</label>
                <input type="password" className="input" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder="••••••" />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3 shrink-0">
              <button onClick={() => setShowForm(false)} className="btn-outline">Hủy</button>
              <button onClick={handleConnect} className="btn-primary">Kết nối</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
