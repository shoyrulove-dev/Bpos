import mongoose, { Schema, Document } from 'mongoose'

export interface IMenu extends Document {
  name: string
  description?: string
  brandId: mongoose.Types.ObjectId
  productIds: mongoose.Types.ObjectId[]
  status: 'active' | 'inactive'
}

const MenuSchema = new Schema<IMenu>({
  name:        { type: String, required: true, trim: true },
  description: { type: String },
  brandId:     { type: Schema.Types.ObjectId, ref: 'Brand', required: true },
  productIds:  [{ type: Schema.Types.ObjectId, ref: 'Product' }],
  status:      { type: String, enum: ['active', 'inactive'], default: 'active' },
}, { timestamps: true })

export default mongoose.models.Menu || mongoose.model<IMenu>('Menu', MenuSchema)
