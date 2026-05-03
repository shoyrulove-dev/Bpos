import mongoose, { Schema, Document } from 'mongoose'

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
}, { timestamps: true })

CustomerSchema.index({ phone: 1, brandId: 1 }, { unique: true })
CustomerSchema.index({ brandId: 1, tier: 1 })
CustomerSchema.index({ totalSpend: -1 })

export default mongoose.models.Customer || mongoose.model<ICustomer>('Customer', CustomerSchema)
