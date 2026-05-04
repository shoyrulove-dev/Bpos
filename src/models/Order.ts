import mongoose, { Schema, Document } from 'mongoose'

const OrderItemSchema = new Schema({
  productId: { type: Schema.Types.ObjectId, ref: 'Product' },
  name:      { type: String, required: true },
  quantity:  { type: Number, required: true },
  price:     { type: Number, required: true },
  total:     { type: Number, required: true },
  note:      { type: String },
}, { _id: false })

const DeliveryInfoSchema = new Schema({
  address:       { type: String },
  lat:           { type: Number },
  lng:           { type: Number },
  note:          { type: String },
  estimatedTime: { type: String },
}, { _id: false })

const DriverInfoSchema = new Schema({
  name:         { type: String },
  phone:        { type: String },
  vehiclePlate: { type: String },
  status:       { type: String },
}, { _id: false })

export interface IOrder extends Document {
  shortId: string
  source: string
  externalOrderId?: string
  brandId: mongoose.Types.ObjectId
  hubId?: mongoose.Types.ObjectId
  channelId?: mongoose.Types.ObjectId
  customerName: string
  customerPhone?: string
  items: unknown[]
  subtotal: number
  discount: number
  total: number
  platformFee?: number
  paymentMethod?: string
  deliveryInfo?: unknown
  driverInfo?: unknown
  status: string
  note?: string
  placedAt: Date
  deliveredAt?: Date
  cancelledAt?: Date
  cancelReason?: string
  rawPayload?: Record<string, unknown>
}

const OrderSchema = new Schema<IOrder>({
  shortId:        { type: String, required: true, unique: true },
  source:         { type: String, enum: ['shopee', 'grab', 'xanh_sm', 'be', 'internal', 'other'], required: true },
  externalOrderId:{ type: String },
  brandId:        { type: Schema.Types.ObjectId, ref: 'Brand', required: true },
  hubId:          { type: Schema.Types.ObjectId, ref: 'Hub' },
  channelId:      { type: Schema.Types.ObjectId, ref: 'Channel' },
  customerName:   { type: String, required: true },
  customerPhone:  { type: String },
  items:          [OrderItemSchema],
  subtotal:       { type: Number, required: true },
  discount:       { type: Number, default: 0 },
  total:          { type: Number, required: true },
  platformFee:    { type: Number, default: 0 },
  paymentMethod:  { type: String },
  deliveryInfo:   { type: DeliveryInfoSchema },
  driverInfo:     { type: DriverInfoSchema },
  status:         { type: String, enum: ['draft','pre_order','waiting_confirm','waiting_pickup','delivering','completed','cancelled'], default: 'waiting_confirm' },
  note:           { type: String },
  placedAt:       { type: Date, default: Date.now },
  deliveredAt:    { type: Date },
  cancelledAt:    { type: Date },
  cancelReason:   { type: String },
  rawPayload:     { type: Schema.Types.Mixed },
}, { timestamps: true })

OrderSchema.index({ brandId: 1, status: 1 })
OrderSchema.index({ source: 1 })
OrderSchema.index({ placedAt: -1 })
OrderSchema.index({ externalOrderId: 1, source: 1 }, { unique: true, sparse: true })

export default mongoose.models.Order || mongoose.model<IOrder>('Order', OrderSchema)
