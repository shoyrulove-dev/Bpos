import mongoose, { Schema, Document } from 'mongoose'

export type CustomerSource = 'grab' | 'be' | 'shopee' | 'xanh_sm' | 'internal' | 'other'

export interface ICustomer extends Document {
  phone: string
  name: string
  email?: string
  brandId: mongoose.Types.ObjectId
  brandName?: string
  points: number
  totalSpend: number
  orderCount: number
  tier: 'bronze' | 'silver' | 'gold' | 'platinum'
  note?: string
  status: 'active' | 'inactive'
  lastOrderAt?: Date
  source?: CustomerSource
  sources?: CustomerSource[]
}

const CustomerSchema = new Schema<ICustomer>({
  phone:       { type: String, required: true },
  name:        { type: String, required: true },
  email:       { type: String },
  brandId:     { type: Schema.Types.ObjectId, ref: 'Brand', required: true },
  points:      { type: Number, default: 0 },
  totalSpend:  { type: Number, default: 0 },
  orderCount:  { type: Number, default: 0 },
  tier:        { type: String, enum: ['bronze', 'silver', 'gold', 'platinum'], default: 'bronze' },
  note:        { type: String },
  status:      { type: String, enum: ['active', 'inactive'], default: 'active' },
  lastOrderAt: { type: Date },
  source:      { type: String, enum: ['grab', 'be', 'shopee', 'xanh_sm', 'internal', 'other'] },
  sources:     [{ type: String, enum: ['grab', 'be', 'shopee', 'xanh_sm', 'internal', 'other'] }],
}, { timestamps: true })

CustomerSchema.index({ phone: 1, brandId: 1 }, { unique: true })
CustomerSchema.index({ brandId: 1, tier: 1 })
CustomerSchema.index({ totalSpend: -1 })
CustomerSchema.index({ source: 1 })
CustomerSchema.index({ sources: 1 })

export default mongoose.models.Customer || mongoose.model<ICustomer>('Customer', CustomerSchema)
