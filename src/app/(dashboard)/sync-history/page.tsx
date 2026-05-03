'use client'

import { mockSyncLogs } from '@/lib/mock-data'
import { cn, formatDate } from '@/lib/utils'
import { RefreshCw, CheckCircle, XCircle, Clock } from 'lucide-react'

const typeLabel: Record<string, string> = { product: 'Sản phẩm', menu: 'Thực đơn', channel: 'Kênh bán', order: 'Đơn hàng' }
const sourceLabel: Record<string, string> = { shopee: 'Shopee', grab: 'GrabFood', xanh_sm: 'Xanh SM', be: 'Be' }

export default function SyncHistoryPage() {
  const logs = mockSyncLogs

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div>
          <h1 className="page-title">Lịch sử đồng bộ</h1>
          <p className="page-subtitle">Theo dõi trạng thái đồng bộ dữ liệu</p>
        </div>
        <button className="btn-outline"><RefreshCw className="w-4 h-4" /> Làm mới</button>
      </div>

      <div className="card">
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>Thời gian</th>
                <th>Loại</th>
                <th>Nguồn</th>
                <th>Nội dung</th>
                <th>Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {logs.map(log => (
                <tr key={log._id}>
                  <td className="text-sm text-gray-500 whitespace-nowrap">{formatDate(log.createdAt)}</td>
                  <td>
                    <span className="badge badge-blue">{typeLabel[log.type]}</span>
                  </td>
                  <td>
                    {log.source && <span className="text-sm font-medium text-gray-700">{sourceLabel[log.source] || log.source}</span>}
                  </td>
                  <td className="text-sm text-gray-700 max-w-[300px]">{log.content}</td>
                  <td>
                    <span className={cn(
                      'inline-flex items-center gap-1 badge',
                      log.status === 'success' ? 'badge-green' : log.status === 'failed' ? 'badge-red' : 'badge-yellow'
                    )}>
                      {log.status === 'success' ? <CheckCircle className="w-3 h-3" /> : log.status === 'failed' ? <XCircle className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                      {log.status === 'success' ? 'Thành công' : log.status === 'failed' ? 'Thất bại' : 'Đang xử lý'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
