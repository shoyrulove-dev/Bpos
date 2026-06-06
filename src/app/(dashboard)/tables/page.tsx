'use client'

import { useMemo, useState } from 'react'
import { useSession } from 'next-auth/react'
import { Edit, Grid3X3, List, Loader2, Plus, Trash2, Users } from 'lucide-react'
import { useCreateTable, useDeleteTable, useTables, useUpdateTable } from '@/hooks/use-data'
import { DAP_DA_DUNG_PLANTS, DAP_DA_DUNG_TABLE_SPOTS, getTableLayoutKey } from '@/lib/table-layouts'
import { canCancelReservedTable, canDeleteTable } from '@/lib/table-permissions'
import { cn, TABLE_STATUS_COLOR, TABLE_STATUS_LABEL } from '@/lib/utils'
import type { Table, TableStatus } from '@/types'

const STATUS_OPTS: { value: TableStatus; label: string }[] = [
  { value: 'available', label: 'Trống' },
  { value: 'occupied', label: 'Đang dùng' },
  { value: 'reserved', label: 'Đặt trước' },
  { value: 'cleaning', label: 'Đang dọn' },
]

const TABLE_STATUS_BG: Record<TableStatus, string> = {
  available: 'border-emerald-300 bg-emerald-100/90 text-emerald-950',
  occupied: 'border-rose-300 bg-rose-100/90 text-rose-950',
  reserved: 'border-sky-300 bg-sky-100/90 text-sky-950',
  cleaning: 'border-amber-300 bg-amber-100/90 text-amber-950',
}

const emptyForm = { name: '', zone: 'Bãi sỏi', capacity: '4', hubId: '', brandId: '', note: '' }

export default function TablesPage() {
  const { data: session } = useSession()
  const sessionRole = (session?.user as { role?: string } | undefined)?.role ?? null
  const canDeleteTables = canDeleteTable(sessionRole)

  const [viewMode, setViewMode] = useState<'map' | 'list'>('map')
  const [zoneFilter, setZoneFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState<TableStatus | ''>('')
  const [showForm, setShowForm] = useState(false)
  const [editTable, setEditTable] = useState<Table | null>(null)
  const [form, setForm] = useState<Record<string, unknown>>(emptyForm)
  const [changeStatus, setChangeStatus] = useState<Table | null>(null)

  const { data: rawTables = [], isLoading } = useTables()
  const tables = rawTables as Table[]
  const createMutation = useCreateTable()
  const updateMutation = useUpdateTable()
  const deleteMutation = useDeleteTable()
  const saving = createMutation.isPending || updateMutation.isPending

  const zones = Array.from(new Set(tables.map((table) => table.zone))).sort()
  const filtered = tables.filter((table) =>
    (!zoneFilter || table.zone === zoneFilter) &&
    (!statusFilter || table.status === statusFilter),
  )

  const tableSpotMap = useMemo(
    () => new Map(DAP_DA_DUNG_TABLE_SPOTS.map((spot) => [spot.key, spot])),
    [],
  )

  const positionedTables = useMemo(() => {
    const items = filtered.map((table) => ({
      table,
      spot: tableSpotMap.get(getTableLayoutKey(table.name)),
    }))

    return {
      mapped: items.filter((item) => item.spot),
      unmapped: items.filter((item) => !item.spot).map((item) => item.table),
    }
  }, [filtered, tableSpotMap])

  const counts: Record<TableStatus, number> = {
    available: 0,
    occupied: 0,
    reserved: 0,
    cleaning: 0,
  }
  tables.forEach((table) => {
    counts[table.status] += 1
  })

  const openCreate = () => {
    setEditTable(null)
    setForm(emptyForm)
    setShowForm(true)
  }

  const openEdit = (table: Table) => {
    setEditTable(table)
    setForm({
      name: table.name,
      zone: table.zone,
      capacity: String(table.capacity),
      hubId: table.hubId,
      brandId: table.brandId,
      note: table.note || '',
    })
    setShowForm(true)
  }

  const handleSave = async () => {
    if (!form.name || !form.hubId || !form.brandId) return
    const payload = { ...form, capacity: Number(form.capacity) || 4 }
    if (editTable) {
      await updateMutation.mutateAsync({ id: editTable._id, ...payload })
    } else {
      await createMutation.mutateAsync(payload)
    }
    setShowForm(false)
  }

  const handleDelete = async (table: Table) => {
    if (!canDeleteTables) return
    if (!confirm(`Xóa bàn ${table.name}?`)) return
    await deleteMutation.mutateAsync(table._id)
  }

  const handleStatusChange = async (status: TableStatus) => {
    if (!changeStatus) return
    await updateMutation.mutateAsync({ id: changeStatus._id, status })
    setChangeStatus(null)
  }

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div>
          <h1 className="page-title">Bản đồ bàn - Đập Đá Dựng</h1>
          <p className="page-subtitle">
            {tables.length} bàn, ưu tiên hiển thị đúng sơ đồ quán và khóa quyền hủy bàn cho nhân viên.
          </p>
        </div>
        <div className="flex gap-2">
          <div className="flex overflow-hidden rounded-lg border border-gray-200">
            <button
              onClick={() => setViewMode('map')}
              className={cn('px-3 py-1.5', viewMode === 'map' ? 'bg-gray-100' : 'bg-white hover:bg-gray-50')}
            >
              <Grid3X3 className="h-4 w-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={cn('border-l border-gray-200 px-3 py-1.5', viewMode === 'list' ? 'bg-gray-100' : 'bg-white hover:bg-gray-50')}
            >
              <List className="h-4 w-4" />
            </button>
          </div>
          <button onClick={openCreate} className="btn-primary">
            <Plus className="h-4 w-4" /> Thêm bàn
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {STATUS_OPTS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setStatusFilter(statusFilter === opt.value ? '' : opt.value)}
            className={cn('card p-4 text-left transition-all hover:shadow-md', statusFilter === opt.value ? 'ring-2 ring-primary-400' : '')}
          >
            <div className={cn('text-2xl font-bold', opt.value === 'available' ? 'text-emerald-600' : opt.value === 'occupied' ? 'text-rose-500' : opt.value === 'reserved' ? 'text-sky-600' : 'text-amber-600')}>
              {counts[opt.value]}
            </div>
            <div className="mt-0.5 text-xs text-gray-500">{opt.label}</div>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setZoneFilter('')}
          className={cn('rounded-lg border px-3 py-1.5 text-sm transition-all', !zoneFilter ? 'border-primary-500 bg-primary-500 text-white' : 'border-gray-200 bg-white text-gray-500')}
        >
          Tất cả
        </button>
        {zones.map((zone) => (
          <button
            key={zone}
            onClick={() => setZoneFilter(zoneFilter === zone ? '' : zone)}
            className={cn('rounded-lg border px-3 py-1.5 text-sm transition-all', zoneFilter === zone ? 'border-primary-500 bg-primary-500 text-white' : 'border-gray-200 bg-white text-gray-500')}
          >
            {zone}
          </button>
        ))}
      </div>

      {!canDeleteTables && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Nhân viên vẫn được chuyển trạng thái bàn, nhưng không được hủy bàn đặt trước hoặc xóa bàn.
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-7 w-7 animate-spin text-primary-400" />
        </div>
      ) : viewMode === 'map' ? (
        <div className="space-y-4">
          <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Sơ đồ quán</h2>
                <p className="text-sm text-slate-500">Bấm vào từng bàn để cập nhật trạng thái theo vận hành thực tế.</p>
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                {STATUS_OPTS.map((opt) => (
                  <span key={opt.value} className={cn('badge', TABLE_STATUS_COLOR[opt.value])}>
                    {TABLE_STATUS_LABEL[opt.value]}
                  </span>
                ))}
              </div>
            </div>

            <div className="p-4">
              <div
                className="relative overflow-hidden rounded-[26px] border border-slate-200"
                style={{
                  aspectRatio: '16 / 10',
                  background: 'linear-gradient(180deg, #5dc8e8 0%, #7ed1eb 26%, #9e373f 26%, #9e373f 64%, #245f37 64%, #245f37 100%)',
                }}
              >
                <div
                  className="absolute inset-x-0 top-0 h-[26%]"
                  style={{
                    background: 'radial-gradient(circle at 20% 20%, rgba(255,255,255,0.28), transparent 24%), radial-gradient(circle at 70% 10%, rgba(255,255,255,0.18), transparent 20%), linear-gradient(180deg, rgba(255,255,255,0.12), transparent)',
                  }}
                />

                <div className="absolute left-[1.2%] top-[12%] text-[1.7vw] font-black uppercase tracking-[0.08em] text-white drop-shadow md:text-[1.2rem]">
                  Đập Đá Dựng
                </div>
                <div className="absolute right-[8%] top-[10%] text-[1.7vw] font-black uppercase tracking-[0.08em] text-white drop-shadow md:text-[1.2rem]">
                  Sông Dinh
                </div>

                <div className="absolute left-[14%] top-[17%] h-[23%] w-[64%] rounded-t-md border-[3px] border-stone-600 bg-stone-200/95 shadow-[inset_0_0_0_2px_rgba(255,255,255,0.18)]" />
                <div
                  className="absolute left-[38%] top-[8%] h-[13%] w-[22%] shadow-lg"
                  style={{
                    background: 'linear-gradient(180deg, #6f4a33, #3f2a1b)',
                    clipPath: 'polygon(18% 0, 82% 0, 100% 100%, 0 100%)',
                  }}
                />
                <div className="absolute left-[43%] top-[10.8%] text-[1.55vw] font-black uppercase tracking-[0.08em] text-white md:text-[1.35rem]">
                  Sân khấu
                </div>
                <div className="absolute left-[45%] top-[18.5%] text-[1.35vw] font-bold uppercase tracking-[0.05em] text-stone-900 md:text-[1.05rem]">
                  Bãi sỏi
                </div>

                <div className="absolute left-[14%] top-[40%] h-[33%] w-[62%] bg-slate-600/95" />
                <div className="absolute left-[70%] top-[40%] h-[24%] w-[6%] bg-slate-600/95" />
                <div className="absolute left-[76%] top-[40%] h-[24%] w-[24%] bg-[#9a313a]" />
                <div className="absolute left-[76%] top-[52%] h-[12%] w-[24%] border-y-[3px] border-stone-500 bg-stone-200/95" />
                <div className="absolute left-[76%] top-[64%] h-[22%] w-[14%] border-r border-stone-700 bg-[#9a313a]" />
                <div className="absolute left-[90%] top-[64%] h-[36%] w-[10%] bg-slate-600/95" />
                <div className="absolute left-[30%] top-[73.5%] h-[16%] w-[18%] rounded-t-2xl bg-[#9a313a]" />
                <div className="absolute left-[53%] top-[73.5%] h-[18%] w-[19%] rounded-t-[2rem] bg-[#9a313a]" />

                <div className="absolute left-[52.2%] top-[30.4%] h-[11%] w-[5%] border-x-2 border-stone-600 bg-stone-200/95" />
                <div className="absolute left-[52.2%] top-[74%] h-[18%] w-[5.4%] border-x-2 border-stone-600 bg-stone-200/95" />
                <div
                  className="absolute left-[52.4%] top-[41%] h-[11px] w-[5%]"
                  style={{ background: 'repeating-linear-gradient(to bottom, #8b8b8b 0, #8b8b8b 2px, transparent 2px, transparent 9px)' }}
                />
                <div
                  className="absolute left-[52.4%] top-[76%] h-[16%] w-[5%]"
                  style={{ background: 'repeating-linear-gradient(to bottom, #8b8b8b 0, #8b8b8b 2px, transparent 2px, transparent 10px)' }}
                />

                <div className="absolute left-[82.5%] top-[54.8%] text-[3vw] font-black uppercase tracking-[0.12em] text-white md:text-[3rem]">
                  WC
                </div>
                <div className="absolute left-[78%] top-[72%] text-center text-[1.4vw] font-black uppercase leading-tight text-white md:text-[1.2rem]">
                  Thu ngân
                  <br />
                  và nội bộ
                </div>
                <div className="absolute left-[36%] top-[90.2%] text-center text-[1.4vw] font-black uppercase leading-tight text-white md:text-[1.2rem]">
                  Nhân viên
                  <br />
                  hướng dẫn
                </div>
                <div className="absolute left-[63.5%] top-[91%] text-[1.5vw] font-black uppercase tracking-[0.08em] text-white md:text-[1.25rem]">
                  Lối vào
                </div>

                <div className="absolute left-[48.4%] top-[61%] text-[2.2vw] font-black text-white md:text-[1.5rem]">← →</div>
                <div className="absolute left-[57.4%] top-[61%] text-[2.2vw] font-black text-white md:text-[1.5rem]">→</div>
                <div className="absolute left-[66%] top-[61%] text-[2.2vw] font-black text-white md:text-[1.5rem]">└ →</div>
                <div className="absolute left-[67%] top-[46%] text-[2.2vw] font-black text-white md:text-[1.5rem]">↑</div>
                <div className="absolute left-[67%] top-[56%] text-[2.2vw] font-black text-white md:text-[1.5rem]">↑</div>
                <div className="absolute left-[46%] top-[68.2%] text-[2.2vw] font-black text-white md:text-[1.5rem]">↑</div>
                <div className="absolute left-[47.8%] top-[79.4%] text-[2.2vw] font-black text-white md:text-[1.5rem]">↔</div>
                <div className="absolute left-[47.8%] top-[87.2%] text-[2.2vw] font-black text-white md:text-[1.5rem]">↑</div>
                <div className="absolute left-[37.8%] top-[91.4%] text-[2.2vw] font-black text-white md:text-[1.5rem]">←</div>
                <div className="absolute left-[56.8%] top-[91.4%] text-[2.2vw] font-black text-white md:text-[1.5rem]">←</div>
                <div className="absolute left-[73.4%] top-[91.4%] text-[2.2vw] font-black text-white md:text-[1.5rem]">←</div>
                <div className="absolute left-[90.8%] top-[91.4%] text-[2.2vw] font-black text-white md:text-[1.5rem]">↑</div>

                {DAP_DA_DUNG_PLANTS.map((plant, index) => (
                  <div
                    key={`${plant.x}-${plant.y}-${index}`}
                    className="absolute rounded-full border-2 border-emerald-800/35 shadow-[0_10px_18px_rgba(0,0,0,0.16)]"
                    style={{
                      background: 'radial-gradient(circle at 35% 35%, #9ce679 0, #68b45e 42%, #2f6b3d 78%, #1f4b28 100%)',
                      left: `${plant.x}%`,
                      top: `${plant.y}%`,
                      width: `${plant.size}%`,
                      height: `${plant.size}%`,
                    }}
                  />
                ))}

                {positionedTables.mapped.map(({ table, spot }) => (
                  <div
                    key={table._id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setChangeStatus(table)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        setChangeStatus(table)
                      }
                    }}
                    className={cn(
                      'absolute rounded-[14px] border-2 p-[4px] shadow-lg transition-transform hover:-translate-y-0.5',
                      table.status === 'reserved' ? 'ring-2 ring-sky-200' : '',
                    )}
                    style={{
                      background: 'linear-gradient(180deg, #7b5135, #3a2619)',
                      left: `${spot!.x}%`,
                      top: `${spot!.y}%`,
                      width: `${spot!.w}%`,
                      height: `${spot!.h}%`,
                    }}
                  >
                    <div className={cn('flex h-full flex-col justify-between rounded-[10px] border px-1 py-1 text-center', TABLE_STATUS_BG[table.status])}>
                      <div className="truncate text-[0.72rem] font-black uppercase leading-none">{table.name}</div>
                      <div className="text-[0.58rem] font-semibold uppercase tracking-[0.08em] opacity-80">
                        {TABLE_STATUS_LABEL[table.status]}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {positionedTables.unmapped.length > 0 && (
            <div className="card p-4">
              <h3 className="font-semibold text-gray-900">Bàn chưa gán vị trí trên sơ đồ</h3>
              <div className="mt-3 flex flex-wrap gap-2">
                {positionedTables.unmapped.map((table) => (
                  <button key={table._id} onClick={() => openEdit(table)} className="rounded-full border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50">
                    {table.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="card">
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>Tên bàn</th>
                  <th>Khu vực</th>
                  <th>Cửa hàng</th>
                  <th className="text-center">Sức chứa</th>
                  <th>Trạng thái</th>
                  <th>QR Token</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filtered.map((table) => (
                  <tr key={table._id}>
                    <td className="font-medium">{table.name}</td>
                    <td><span className="badge badge-gray">{table.zone}</span></td>
                    <td className="text-sm text-gray-500">{table.hubName || table.hubId}</td>
                    <td className="text-center">
                      <span className="flex items-center justify-center gap-1 text-sm">
                        <Users className="h-3.5 w-3.5 text-gray-400" />
                        {table.capacity}
                      </span>
                    </td>
                    <td><span className={cn('badge', TABLE_STATUS_COLOR[table.status])}>{TABLE_STATUS_LABEL[table.status]}</span></td>
                    <td><span className="font-mono text-xs text-gray-400">{table.qrToken?.substring(0, 8)}...</span></td>
                    <td>
                      <div className="flex gap-1">
                        <button onClick={() => setChangeStatus(table)} className="btn-outline btn-sm px-2 text-xs">
                          Đổi trạng thái
                        </button>
                        <button onClick={() => openEdit(table)} className="btn-ghost btn-sm p-1.5">
                          <Edit className="h-3.5 w-3.5" />
                        </button>
                        {canDeleteTables && (
                          <button onClick={() => void handleDelete(table)} className="btn-ghost btn-sm p-1.5 text-red-500">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-gray-400">Không có bàn nào</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="flex max-h-[90dvh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-6 py-4">
              <h2 className="font-semibold text-gray-900">{editTable ? 'Cập nhật bàn' : 'Thêm bàn mới'}</h2>
              <button onClick={() => setShowForm(false)} className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100">
                &times;
              </button>
            </div>
            <div className="flex-1 space-y-4 overflow-y-auto p-6">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Tên bàn *</label>
                  <input className="input" value={String(form.name || '')} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Bàn 01" />
                </div>
                <div>
                  <label className="label">Khu vực</label>
                  <input className="input" value={String(form.zone || '')} onChange={(event) => setForm({ ...form, zone: event.target.value })} placeholder="Bãi sỏi" />
                </div>
              </div>
              <div>
                <label className="label">Sức chứa (người)</label>
                <input type="number" className="input" value={String(form.capacity || '')} onChange={(event) => setForm({ ...form, capacity: event.target.value })} placeholder="4" />
              </div>
              <div>
                <label className="label">ID cửa hàng *</label>
                <input className="input font-mono" value={String(form.hubId || '')} onChange={(event) => setForm({ ...form, hubId: event.target.value })} />
              </div>
              <div>
                <label className="label">ID thương hiệu *</label>
                <input className="input font-mono" value={String(form.brandId || '')} onChange={(event) => setForm({ ...form, brandId: event.target.value })} />
              </div>
              <div>
                <label className="label">Ghi chú</label>
                <input className="input" value={String(form.note || '')} onChange={(event) => setForm({ ...form, note: event.target.value })} />
              </div>
            </div>
            <div className="flex shrink-0 justify-end gap-3 border-t border-gray-100 px-6 py-4">
              <button onClick={() => setShowForm(false)} className="btn-outline">Hủy</button>
              <button onClick={() => void handleSave()} disabled={saving} className="btn-primary min-w-[60px]">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Lưu'}
              </button>
            </div>
          </div>
        </div>
      )}

      {changeStatus && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xs rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="font-semibold">{changeStatus.name}</h3>
            <p className="mb-4 text-sm text-gray-500">{changeStatus.zone} - {changeStatus.capacity} người</p>
            <div className="grid grid-cols-2 gap-2">
              {STATUS_OPTS.map((opt) => {
                const allowed = canCancelReservedTable(sessionRole, changeStatus.status, opt.value)
                return (
                  <button
                    key={opt.value}
                    disabled={!allowed || updateMutation.isPending}
                    onClick={() => void handleStatusChange(opt.value)}
                    className={cn(
                      'rounded-xl border-2 p-3 text-sm font-medium transition-all',
                      changeStatus.status === opt.value ? 'border-primary-400 bg-primary-50 text-primary-700' : 'border-gray-200 hover:border-gray-300',
                      !allowed ? 'cursor-not-allowed opacity-45' : '',
                    )}
                  >
                    {opt.label}
                  </button>
                )
              })}
            </div>
            {!canCancelReservedTable(sessionRole, changeStatus.status, 'available') && (
              <p className="mt-3 text-xs text-amber-700">
                Bàn đang ở trạng thái đặt trước. Chỉ quản lý và admin mới được hủy bàn.
              </p>
            )}
            <div className="mt-3 flex gap-2">
              <button onClick={() => setChangeStatus(null)} className="btn-outline w-full">Đóng</button>
              {canDeleteTables && (
                <button onClick={() => void handleDelete(changeStatus)} className="btn-ghost text-red-500">
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
