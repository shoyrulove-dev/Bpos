import mongoose, { Schema, Document } from 'mongoose'

export interface ITable extends Document {
  name: string
  zone: string
  capacity: number
  hubId: mongoose.Types.ObjectId
  brandId: mongoose.Types.ObjectId
  status: 'available' | 'occupied' | 'reserved' | 'cleaning'
  currentOrderId?: mongoose.Types.ObjectId
  qrToken?: string
  note?: string
}

const TableSchema = new Schema<ITable>({
  name:           { type: String, required: true },
  zone:           { type: String, required: true, default: 'Tầng 1' },
  capacity:       { type: Number, default: 4 },
  hubId:          { type: Schema.Types.ObjectId, ref: 'Hub', required: true },
  brandId:        { type: Schema.Types.ObjectId, ref: 'Brand', required: true },
  status:         { type: String, enum: ['available', 'occupied', 'reserved', 'cleaning'], default: 'available' },
  currentOrderId: { type: Schema.Types.ObjectId, ref: 'Order' },
  qrToken:        { type: String },
  note:           { type: String },
}, { timestamps: true })

TableSchema.index({ hubId: 1, zone: 1 })
TableSchema.index({ brandId: 1, status: 1 })

export default mongoose.models.Table || mongoose.model<ITable>('Table', TableSchema)
