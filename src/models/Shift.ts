import mongoose, { Schema, Document } from 'mongoose'

export interface IShift extends Document {
  hubId: mongoose.Types.ObjectId
  brandId: mongoose.Types.ObjectId
  openedById: mongoose.Types.ObjectId
  closedById?: mongoose.Types.ObjectId
  openedAt: Date
  closedAt?: Date
  openCash: number
  closeCash?: number
  status: 'open' | 'closed'
  note?: string
  // Cached stats khi đóng ca
  orderCount?: number
  revenue?: number
  discount?: number
  platformFee?: number
}

const ShiftSchema = new Schema<IShift>({
  hubId:      { type: Schema.Types.ObjectId, ref: 'Hub', required: true },
  brandId:    { type: Schema.Types.ObjectId, ref: 'Brand', required: true },
  openedById: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  closedById: { type: Schema.Types.ObjectId, ref: 'User' },
  openedAt:   { type: Date, required: true, default: Date.now },
  closedAt:   { type: Date },
  openCash:   { type: Number, required: true, default: 0 },
  closeCash:  { type: Number },
  status:     { type: String, enum: ['open', 'closed'], default: 'open' },
  note:       { type: String },
  orderCount: { type: Number },
  revenue:    { type: Number },
  discount:   { type: Number },
  platformFee:{ type: Number },
}, { timestamps: true })

ShiftSchema.index({ hubId: 1, status: 1 })
ShiftSchema.index({ brandId: 1, openedAt: -1 })

export default mongoose.models.Shift || mongoose.model<IShift>('Shift', ShiftSchema)
