import mongoose, { Schema, Document } from 'mongoose'

export interface IHub extends Document {
  code: string
  name: string
  address: string
  brandId: mongoose.Types.ObjectId
  linkedChannels: mongoose.Types.ObjectId[]
  servicePackage: 'basic' | 'standard' | 'premium'
  status: 'active' | 'inactive'
}

const HubSchema = new Schema<IHub>({
  code:           { type: String, required: true, unique: true, uppercase: true },
  name:           { type: String, required: true, trim: true },
  address:        { type: String, required: true },
  brandId:        { type: Schema.Types.ObjectId, ref: 'Brand', required: true },
  linkedChannels: [{ type: Schema.Types.ObjectId, ref: 'Channel' }],
  servicePackage: { type: String, enum: ['basic', 'standard', 'premium'], default: 'basic' },
  status:         { type: String, enum: ['active', 'inactive'], default: 'active' },
}, { timestamps: true })

export default mongoose.models.Hub || mongoose.model<IHub>('Hub', HubSchema)
