import mongoose, { Schema, Document } from 'mongoose'

export interface IBillTemplate extends Document {
  name: string
  type: 'order' | 'delivery' | 'receipt'
  size: 'A4' | 'A5' | '80mm' | '58mm'
  isActive: boolean
  templateContent: string
  brandId?: mongoose.Types.ObjectId
}

const BillTemplateSchema = new Schema<IBillTemplate>({
  name:            { type: String, required: true },
  type:            { type: String, enum: ['order', 'delivery', 'receipt'], default: 'order' },
  size:            { type: String, enum: ['A4', 'A5', '80mm', '58mm'], default: '80mm' },
  isActive:        { type: Boolean, default: true },
  templateContent: { type: String, default: '' },
  brandId:         { type: Schema.Types.ObjectId, ref: 'Brand' },
}, { timestamps: true })

export default mongoose.models.BillTemplate || mongoose.model<IBillTemplate>('BillTemplate', BillTemplateSchema)
