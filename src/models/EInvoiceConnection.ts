import mongoose, { Schema, Document } from 'mongoose'

export interface IEInvoiceConnection extends Document {
  provider: 'viettel' | 'vnpt' | 'misa' | 'bkav' | 'other'
  brandId: mongoose.Types.ObjectId
  taxCode?: string
  username?: string
  isConnected: boolean
  connectedAt?: Date
}

const EInvoiceConnectionSchema = new Schema<IEInvoiceConnection>({
  provider:    { type: String, enum: ['viettel', 'vnpt', 'misa', 'bkav', 'other'], required: true },
  brandId:     { type: Schema.Types.ObjectId, ref: 'Brand', required: true },
  taxCode:     { type: String },
  username:    { type: String },
  isConnected: { type: Boolean, default: false },
  connectedAt: { type: Date },
}, { timestamps: true })

export default mongoose.models.EInvoiceConnection || mongoose.model<IEInvoiceConnection>('EInvoiceConnection', EInvoiceConnectionSchema)
