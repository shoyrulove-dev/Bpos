import mongoose, { Schema, Document } from 'mongoose'

export interface ISyncLog extends Document {
  type: 'product' | 'menu' | 'channel' | 'order'
  status: 'success' | 'failed' | 'pending'
  content: string
  source?: string
  brandId?: mongoose.Types.ObjectId
}

const SyncLogSchema = new Schema<ISyncLog>({
  type:    { type: String, enum: ['product', 'menu', 'channel', 'order'], required: true },
  status:  { type: String, enum: ['success', 'failed', 'pending'], default: 'pending' },
  content: { type: String, required: true },
  source:  { type: String },
  brandId: { type: Schema.Types.ObjectId, ref: 'Brand' },
}, { timestamps: true })

export default mongoose.models.SyncLog || mongoose.model<ISyncLog>('SyncLog', SyncLogSchema)
