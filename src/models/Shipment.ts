import mongoose, { Schema, Document } from 'mongoose'

export interface IShipment extends Document {
  orderId: mongoose.Types.ObjectId
  trackingCode?: string
  carrierName?: string
  driverName?: string
  driverPhone?: string
  vehiclePlate?: string
  status: 'assigned' | 'picked_up' | 'delivering' | 'delivered' | 'failed'
  pickupAt?: Date
  deliveredAt?: Date
}

const ShipmentSchema = new Schema<IShipment>({
  orderId:      { type: Schema.Types.ObjectId, ref: 'Order', required: true },
  trackingCode: { type: String },
  carrierName:  { type: String },
  driverName:   { type: String },
  driverPhone:  { type: String },
  vehiclePlate: { type: String },
  status:       { type: String, enum: ['assigned', 'picked_up', 'delivering', 'delivered', 'failed'], default: 'assigned' },
  pickupAt:     { type: Date },
  deliveredAt:  { type: Date },
}, { timestamps: true })

export default mongoose.models.Shipment || mongoose.model<IShipment>('Shipment', ShipmentSchema)
