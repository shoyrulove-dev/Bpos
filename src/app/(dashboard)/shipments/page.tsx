'use client'

import { mockShipments } from '@/lib/mock-data'
import { cn, formatDate } from '@/lib/utils'
import { SHIPMENT_STATUS_LABEL } from '@/lib/utils'
import { Truck, Phone } from 'lucide-react'

const statusColor: Record<string, string> = {
  assigned: 'badge-blue',
  picked_up: 'badge-yellow',
  delivering: 'badge-orange',
  delivered: 'badge-green',
  failed: 'badge-red',
}

export default function ShipmentsPage() {
  const shipments = mockShipments

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div>
          <h1 className="page-title">Vận đơn</h1>
          <p className="page-subtitle">Theo dõi trạng thái giao hàng</p>
        </div>
      </div>

      <div className="card">
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>Mã vận đơn</th>
                <th>Đơn hàng</th>
                <th>Đơn vị vận chuyển</th>
                <th>Tài xế</th>
                <th>Thời gian lấy hàng</th>
                <th>Thời gian giao</th>
                <th>Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {shipments.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-10 text-gray-400">Không có vận đơn</td></tr>
              ) : shipments.map(ship => (
                <tr key={ship._id}>
                  <td><span className="font-mono text-sm text-primary-600">{ship.trackingCode}</span></td>
                  <td><span className="font-mono text-sm font-medium">{ship.shortOrderId}</span></td>
                  <td>
                    <div className="flex items-center gap-1.5">
                      <Truck className="w-4 h-4 text-gray-400" />
                      <span className="text-sm text-gray-700">{ship.carrierName}</span>
                    </div>
                  </td>
                  <td>
                    <p className="font-medium text-gray-900">{ship.driverName}</p>
                    {ship.driverPhone && (
                      <div className="flex items-center gap-1 text-xs text-gray-400">
                        <Phone className="w-3 h-3" />{ship.driverPhone}
                      </div>
                    )}
                    {ship.vehiclePlate && (
                      <p className="font-mono text-xs text-gray-400">{ship.vehiclePlate}</p>
                    )}
                  </td>
                  <td className="text-sm text-gray-500">{ship.pickupAt ? formatDate(ship.pickupAt) : '—'}</td>
                  <td className="text-sm text-gray-500">{ship.deliveredAt ? formatDate(ship.deliveredAt) : '—'}</td>
                  <td>
                    <span className={cn('badge', statusColor[ship.status])}>
                      {SHIPMENT_STATUS_LABEL[ship.status]}
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
