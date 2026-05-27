import mongoose, { Schema, Document } from 'mongoose'

const WorkingHourSchema = new Schema({
  day:      { type: Number, min: 0, max: 6 },
  open:     { type: String, default: '08:00' },
  close:    { type: String, default: '22:00' },
  isClosed: { type: Boolean, default: false },
}, { _id: false })

export interface IChannel extends Document {
  name: string
  source: 'shopee' | 'grab' | 'xanh_sm' | 'be' | 'internal' | 'other'
  externalStoreId?: string
  externalStoreName?: string
  brandId: mongoose.Types.ObjectId
  hubId?: mongoose.Types.ObjectId
  isPageActive: boolean
  isStoreOpen: boolean
  isManualConfirm: boolean
  autoInvoice: boolean
  workingHours?: unknown[]
  status: 'active' | 'inactive'
  connectedAt?: Date
  accessToken?: string
  refreshToken?: string
  // Scraper live status (pushed by scraper heartbeat)
  scraperPaused?: boolean
  scraperPausedUntil?: Date | null
  scraperLoggedIn?: boolean
  scraperLastSeen?: Date
  printerEnabled?: boolean
  printerReceiptEnabled?: boolean
  printerLabelEnabled?: boolean
}

const ChannelSchema = new Schema<IChannel>({
  name:              { type: String, required: true },
  source:            { type: String, enum: ['shopee', 'grab', 'xanh_sm', 'be', 'internal', 'other'], required: true },
  externalStoreId:   { type: String },
  externalStoreName: { type: String },
  brandId:           { type: Schema.Types.ObjectId, ref: 'Brand', required: true },
  hubId:             { type: Schema.Types.ObjectId, ref: 'Hub' },
  isPageActive:      { type: Boolean, default: true },
  isStoreOpen:       { type: Boolean, default: true },
  isManualConfirm:   { type: Boolean, default: false },
  autoInvoice:       { type: Boolean, default: false },
  workingHours:      [WorkingHourSchema],
  status:            { type: String, enum: ['active', 'inactive'], default: 'active' },
  connectedAt:       { type: Date },
  accessToken:       { type: String, select: false },
  refreshToken:      { type: String, select: false },
  scraperPaused:     { type: Boolean },
  scraperPausedUntil:{ type: Date },
  scraperLoggedIn:   { type: Boolean },
  scraperLastSeen:   { type: Date },
  printerEnabled:    { type: Boolean, default: true },
  printerReceiptEnabled: { type: Boolean, default: true },
  printerLabelEnabled:   { type: Boolean, default: true },
}, { timestamps: true })

export default mongoose.models.Channel || mongoose.model<IChannel>('Channel', ChannelSchema)
