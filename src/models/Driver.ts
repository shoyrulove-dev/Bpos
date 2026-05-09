import mongoose, { Schema, Document } from 'mongoose'

export interface IDriver extends Document {
  name: string
  phone: string
  platform: string
  lastSeenAt: Date
}

const DriverSchema = new Schema<IDriver>({
  name:        { type: String, required: true, trim: true },
  phone:       { type: String, required: true, trim: true },
  platform:    { type: String, required: true, trim: true },
  lastSeenAt:  { type: Date, default: Date.now },
}, { timestamps: true })

DriverSchema.index({ phone: 1, platform: 1 }, { unique: true })
DriverSchema.index({ platform: 1 })

export default mongoose.models.Driver || mongoose.model<IDriver>('Driver', DriverSchema)
