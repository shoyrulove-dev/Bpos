import mongoose, { Schema, Document } from 'mongoose'

const OptionItemSchema = new Schema({
  productId: { type: Schema.Types.ObjectId, ref: 'Product' },
  name:      { type: String, required: true },
  price:     { type: Number, default: 0 },
  isDefault: { type: Boolean, default: false },
}, { _id: false })

const OptionGroupSchema = new Schema({
  name:       { type: String, required: true },
  isRequired: { type: Boolean, default: false },
  minSelect:  { type: Number, default: 0 },
  maxSelect:  { type: Number, default: 1 },
  items:      [OptionItemSchema],
}, { _id: true })

export interface IMenu extends Document {
  name: string
  description?: string
  brandId: mongoose.Types.ObjectId
  productIds: mongoose.Types.ObjectId[]
  channelIds: mongoose.Types.ObjectId[]
  optionGroups: unknown[]
  status: 'active' | 'inactive'
}

const MenuSchema = new Schema<IMenu>({
  name:         { type: String, required: true, trim: true },
  description:  { type: String },
  brandId:      { type: Schema.Types.ObjectId, ref: 'Brand', required: true },
  productIds:   [{ type: Schema.Types.ObjectId, ref: 'Product' }],
  channelIds:   [{ type: Schema.Types.ObjectId, ref: 'Channel' }],
  optionGroups: [OptionGroupSchema],
  status:       { type: String, enum: ['active', 'inactive'], default: 'active' },
}, { timestamps: true })

export default mongoose.models.Menu || mongoose.model<IMenu>('Menu', MenuSchema)
