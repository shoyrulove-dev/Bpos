import mongoose, { Schema, Document } from 'mongoose'

const PermissionSchema = new Schema({
  brandId: { type: Schema.Types.ObjectId, ref: 'Brand' },
  hubId:   { type: Schema.Types.ObjectId, ref: 'Hub' },
  // brand_manager: Quản lý thương hiệu | hub_manager: Quản lý cửa hàng | cashier: Thu ngân
  role:    { type: String, enum: ['brand_manager', 'hub_manager', 'cashier'], required: true },
}, { _id: false })

export interface IUser extends Document {
  name: string
  email: string
  password: string
  // admin: quản trị hệ thống | brand_manager: QL thương hiệu | hub_manager: QL cửa hàng | cashier: Thu ngân
  role: 'admin' | 'brand_manager' | 'hub_manager' | 'cashier'
  avatar?: string
  phone?: string
  brandId?: mongoose.Types.ObjectId
  permissions: unknown[]
  status: 'active' | 'inactive'
  createdAt: Date
  updatedAt: Date
}

const UserSchema = new Schema<IUser>({
  name:        { type: String, required: true, trim: true },
  email:       { type: String, required: true, unique: true, lowercase: true, trim: true },
  password:    { type: String, required: true, select: false },
  role:        { type: String, enum: ['admin', 'brand_manager', 'hub_manager', 'cashier'], default: 'cashier' },
  avatar:      { type: String },
  phone:       { type: String },
  brandId:     { type: Schema.Types.ObjectId, ref: 'Brand' },
  permissions: [PermissionSchema],
  status:      { type: String, enum: ['active', 'inactive'], default: 'active' },
}, { timestamps: true })

export default mongoose.models.User || mongoose.model<IUser>('User', UserSchema)
