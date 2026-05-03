import mongoose, { Schema, Document } from 'mongoose'

export type MovementType = 'import' | 'export' | 'adjust' | 'consume' | 'transfer'

export interface IStockMovement extends Document {
  productId: mongoose.Types.ObjectId
  hubId: mongoose.Types.ObjectId
  brandId: mongoose.Types.ObjectId
  type: MovementType
  quantity: number
  beforeQty: number
  afterQty: number
  note?: string
  referenceId?: string
  createdById?: mongoose.Types.ObjectId
}

const StockMovementSchema = new Schema<IStockMovement>({
  productId:   { type: Schema.Types.ObjectId, ref: 'Product', required: true },
  hubId:       { type: Schema.Types.ObjectId, ref: 'Hub', required: true },
  brandId:     { type: Schema.Types.ObjectId, ref: 'Brand', required: true },
  type:        { type: String, enum: ['import', 'export', 'adjust', 'consume', 'transfer'], required: true },
  quantity:    { type: Number, required: true },
  beforeQty:   { type: Number, required: true },
  afterQty:    { type: Number, required: true },
  note:        { type: String },
  referenceId: { type: String },
  createdById: { type: Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true })

StockMovementSchema.index({ productId: 1, hubId: 1 })
StockMovementSchema.index({ brandId: 1, createdAt: -1 })
StockMovementSchema.index({ type: 1 })

export default mongoose.models.StockMovement || mongoose.model<IStockMovement>('StockMovement', StockMovementSchema)
