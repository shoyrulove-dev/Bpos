import mongoose, { Schema, Document } from 'mongoose'

export interface IInventory extends Document {
  productId: mongoose.Types.ObjectId
  productName?: string
  productCode?: string
  hubId: mongoose.Types.ObjectId
  hubName?: string
  brandId: mongoose.Types.ObjectId
  quantity: number
  minQuantity: number
  maxQuantity?: number
  unit: string
  lastMovementAt?: Date
}

const InventorySchema = new Schema<IInventory>({
  productId:      { type: Schema.Types.ObjectId, ref: 'Product', required: true },
  hubId:          { type: Schema.Types.ObjectId, ref: 'Hub', required: true },
  brandId:        { type: Schema.Types.ObjectId, ref: 'Brand', required: true },
  quantity:       { type: Number, default: 0 },
  minQuantity:    { type: Number, default: 0 },
  maxQuantity:    { type: Number },
  unit:           { type: String, default: 'Cái' },
  lastMovementAt: { type: Date },
}, { timestamps: true })

InventorySchema.index({ productId: 1, hubId: 1 }, { unique: true })
InventorySchema.index({ brandId: 1, quantity: 1 })
InventorySchema.index({ hubId: 1 })

export default mongoose.models.Inventory || mongoose.model<IInventory>('Inventory', InventorySchema)
