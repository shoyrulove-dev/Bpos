import mongoose, { Schema, Document } from 'mongoose'

const IngredientSchema = new Schema({
  productId: { type: Schema.Types.ObjectId, ref: 'Product' },
  name:      { type: String, required: true },
  quantity:  { type: Number, required: true, default: 1 },
  unit:      { type: String, default: 'Cái' },
}, { _id: false })

export interface IProduct extends Document {
  name: string
  code: string
  barcode?: string
  description?: string
  category: string
  // raw_material: Nguyên vật liệu | semi_product: Bán thành phẩm
  // finished_product: Thành phẩm | goods: Hàng hóa
  type: 'raw_material' | 'semi_product' | 'finished_product' | 'goods'
  unit: string
  brandId: mongoose.Types.ObjectId
  allowSell: boolean
  saleStatus: 'selling' | 'stopped' | 'draft'
  status: 'active' | 'inactive'
  price?: number
  costPrice?: number
  image?: string
  supplier?: string
  weight?: number
  height?: number
  length?: number
  ingredients: unknown[]
}

const ProductSchema = new Schema<IProduct>({
  name:        { type: String, required: true, trim: true },
  code:        { type: String, required: true },
  barcode:     { type: String },
  description: { type: String },
  category:    { type: String, required: true },
  type:        { type: String, enum: ['raw_material', 'semi_product', 'finished_product', 'goods'], default: 'finished_product' },
  unit:        { type: String, default: 'Cái' },
  brandId:     { type: Schema.Types.ObjectId, ref: 'Brand', required: true },
  allowSell:   { type: Boolean, default: true },
  saleStatus:  { type: String, enum: ['selling', 'stopped', 'draft'], default: 'selling' },
  status:      { type: String, enum: ['active', 'inactive'], default: 'active' },
  price:       { type: Number },
  costPrice:   { type: Number },
  image:       { type: String },
  supplier:    { type: String },
  weight:      { type: Number },
  height:      { type: Number },
  length:      { type: Number },
  ingredients: [IngredientSchema],
}, { timestamps: true })

ProductSchema.index({ brandId: 1, saleStatus: 1 })
ProductSchema.index({ code: 1, brandId: 1 })

export default mongoose.models.Product || mongoose.model<IProduct>('Product', ProductSchema)
