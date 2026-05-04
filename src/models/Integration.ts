import mongoose, { Schema, Document } from 'mongoose'

export interface IIntegration extends Document {
  provider: 'shopee' | 'grab' | 'xanh_sm' | 'be'
  brandId: mongoose.Types.ObjectId
  hubId?: mongoose.Types.ObjectId
  externalStoreId?: string
  externalStoreName?: string
  credentials: Record<string, string>
  isActive: boolean
  lastSyncAt?: Date
  syncStatus?: 'idle' | 'syncing' | 'success' | 'error'
  syncError?: string
  createdBy: mongoose.Types.ObjectId
}

const IntegrationSchema = new Schema<IIntegration>({
  provider:          { type: String, enum: ['shopee', 'grab', 'xanh_sm', 'be'], required: true },
  brandId:           { type: Schema.Types.ObjectId, ref: 'Brand', required: true },
  hubId:             { type: Schema.Types.ObjectId, ref: 'Hub' },
  externalStoreId:   { type: String },
  externalStoreName: { type: String },
  credentials:       { type: Map, of: String, select: false },
  isActive:          { type: Boolean, default: true },
  lastSyncAt:        { type: Date },
  syncStatus:        { type: String, enum: ['idle', 'syncing', 'success', 'error'], default: 'idle' },
  syncError:         { type: String },
  createdBy:         { type: Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true })

export default mongoose.models.Integration || mongoose.model<IIntegration>('Integration', IntegrationSchema)
