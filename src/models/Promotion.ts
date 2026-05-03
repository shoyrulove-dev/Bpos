import mongoose, { Schema, Document } from 'mongoose'

export interface IPromotion extends Document {
  name: string
  type: 'discount_percent' | 'discount_amount' | 'free_item' | 'combo'
  brandId: mongoose.Types.ObjectId
  startAt: Date
  endAt: Date
  quantity?: number
  usedCount: number
  status: 'active' | 'upcoming' | 'ended'
}

const PromotionSchema = new Schema<IPromotion>({
  name:      { type: String, required: true },
  type:      { type: String, enum: ['discount_percent', 'discount_amount', 'free_item', 'combo'], required: true },
  brandId:   { type: Schema.Types.ObjectId, ref: 'Brand', required: true },
  startAt:   { type: Date, required: true },
  endAt:     { type: Date, required: true },
  quantity:  { type: Number },
  usedCount: { type: Number, default: 0 },
  status:    { type: String, enum: ['active', 'upcoming', 'ended'], default: 'upcoming' },
}, { timestamps: true })

export default mongoose.models.Promotion || mongoose.model<IPromotion>('Promotion', PromotionSchema)
