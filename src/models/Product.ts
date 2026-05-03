import mongoose, { Schema, Document } from 'mongoose'

export interface IProduct extends Document {
  name: string
  code: string
  category: string
  type: 'single' | 'combo' | 'topping'
  unit: string
  brandId: mongoose.Types.ObjectId
  saleStatus: 'selling' | 'stopped' | 'draft'
  status: 'active' | 'inactive'
  price?: number
  image?: string
}

const ProductSchema = new Schema<IProduct>({
  name:       { type: String, required: true, trim: true },
  code:       { type: String, required: true },
  category:   { type: String, required: true },
  type:       { type: String, enum: ['single', 'combo', 'topping'], default: 'single' },
  unit:       { type: String, default: 'Cái' },
  brandId:    { type: Schema.Types.ObjectId, ref: 'Brand', required: true },
  saleStatus: { type: String, enum: ['selling', 'stopped', 'draft'], default: 'selling' },
  status:     { type: String, enum: ['active', 'inactive'], default: 'active' },
  price:      { type: Number },
  image:      { type: String },
}, { timestamps: true })

export default mongoose.models.Product || mongoose.model<IProduct>('Product', ProductSchema)
