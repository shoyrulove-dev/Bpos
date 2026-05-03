import mongoose, { Schema, Document } from 'mongoose'

export interface IBrand extends Document {
  name: string
  phone: string
  type: 'fnb' | 'retail' | 'service' | 'other'
  address: string
  note?: string
  logo?: string
  status: 'active' | 'inactive'
}

const BrandSchema = new Schema<IBrand>({
  name:    { type: String, required: true, trim: true },
  phone:   { type: String, required: true },
  type:    { type: String, enum: ['fnb', 'retail', 'service', 'other'], default: 'fnb' },
  address: { type: String, required: true },
  note:    { type: String },
  logo:    { type: String },
  status:  { type: String, enum: ['active', 'inactive'], default: 'active' },
}, { timestamps: true })

export default mongoose.models.Brand || mongoose.model<IBrand>('Brand', BrandSchema)
