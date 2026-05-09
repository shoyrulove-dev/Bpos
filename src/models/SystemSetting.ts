import mongoose, { Schema, Document } from 'mongoose'

export interface ISystemSetting extends Document {
  key: string
  orderAlertVoiceMessage: string
  orderAlertSoundRepeatCount: number
  createdAt: Date
  updatedAt: Date
}

const SystemSettingSchema = new Schema<ISystemSetting>({
  key: { type: String, required: true, unique: true, default: 'global' },
  orderAlertVoiceMessage: {
    type: String,
    default: 'Anh ơi. Mình có đơn hàng mới. Anh kiểm tra giúp em nhé.',
    trim: true,
  },
  orderAlertSoundRepeatCount: {
    type: Number,
    default: 3,
    min: 1,
    max: 10,
  },
}, { timestamps: true })

export default mongoose.models.SystemSetting || mongoose.model<ISystemSetting>('SystemSetting', SystemSettingSchema)