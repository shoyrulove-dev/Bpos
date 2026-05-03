import mongoose, { Schema, Document } from 'mongoose'

const TierSchema = new Schema({
  minOrderValue:  { type: Number, required: true },
  discountType:   { type: String, enum: ['percent', 'amount'], default: 'amount' },
  discountValue:  { type: Number, required: true },
  maxDiscount:    { type: Number },
  // for shipping tiers
  shippingType:   { type: String, enum: ['discount', 'flat_price', 'freeship'] },
  flatPrice:      { type: Number },
  region:         { type: String },
}, { _id: false })

export interface IPromotion extends Document {
  name: string
  description?: string
  code?: string
  // discount_percent: Giảm % danh sách sản phẩm
  // discount_amount: Giảm cố định danh sách sản phẩm
  // free_item: Tặng sản phẩm theo đơn
  // combo: Giảm giá khi mua đủ số lượng
  // order_tiered_discount: Giảm giá theo tổng giá trị đơn
  // shipping_discount: Giảm phí vận chuyển
  type: 'discount_percent' | 'discount_amount' | 'free_item' | 'combo' | 'order_tiered_discount' | 'shipping_discount'
  brandId: mongoose.Types.ObjectId
  startAt: Date
  endAt: Date
  quantity?: number
  usedCount: number
  maxPerUser?: number
  allowCombine: boolean
  status: 'active' | 'upcoming' | 'ended'
  // Simple discount fields (for discount_percent / discount_amount)
  discountType?: 'percent' | 'amount'
  discountValue?: number
  applicableProducts?: mongoose.Types.ObjectId[]
  // Tiered rules (for order_tiered_discount / shipping_discount / free_item)
  tiers?: unknown[]
  // Combo rules
  buyProducts?: mongoose.Types.ObjectId[]
  buyQuantity?: number
  getProducts?: mongoose.Types.ObjectId[]
  getDiscountType?: 'percent' | 'amount' | 'flat'
  getDiscountValue?: number
  applicableChannels?: mongoose.Types.ObjectId[]
}

const PromotionSchema = new Schema<IPromotion>({
  name:               { type: String, required: true },
  description:        { type: String },
  code:               { type: String },
  type:               { type: String, enum: ['discount_percent', 'discount_amount', 'free_item', 'combo', 'order_tiered_discount', 'shipping_discount'], required: true },
  brandId:            { type: Schema.Types.ObjectId, ref: 'Brand', required: true },
  startAt:            { type: Date, required: true },
  endAt:              { type: Date, required: true },
  quantity:           { type: Number },
  usedCount:          { type: Number, default: 0 },
  maxPerUser:         { type: Number },
  allowCombine:       { type: Boolean, default: false },
  status:             { type: String, enum: ['active', 'upcoming', 'ended'], default: 'upcoming' },
  discountType:       { type: String, enum: ['percent', 'amount'] },
  discountValue:      { type: Number },
  applicableProducts: [{ type: Schema.Types.ObjectId, ref: 'Product' }],
  tiers:              [TierSchema],
  buyProducts:        [{ type: Schema.Types.ObjectId, ref: 'Product' }],
  buyQuantity:        { type: Number },
  getProducts:        [{ type: Schema.Types.ObjectId, ref: 'Product' }],
  getDiscountType:    { type: String, enum: ['percent', 'amount', 'flat'] },
  getDiscountValue:   { type: Number },
  applicableChannels: [{ type: Schema.Types.ObjectId, ref: 'Channel' }],
}, { timestamps: true })

PromotionSchema.index({ brandId: 1, status: 1 })

export default mongoose.models.Promotion || mongoose.model<IPromotion>('Promotion', PromotionSchema)
