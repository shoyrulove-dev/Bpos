// ============================================================
// BPOS – Global TypeScript Types
// ============================================================

export type Role = 'admin' | 'brand_manager' | 'hub_manager' | 'cashier'

export type ActiveStatus = 'active' | 'inactive'

// ---- Auth ----
export interface AuthUser {
  id: string
  name: string
  email: string
  role: Role
  avatar?: string
}

// ---- Brand ----
export type BrandType = 'fnb' | 'retail' | 'service' | 'other'

export interface Brand {
  _id: string
  name: string
  phone: string
  type: BrandType
  address: string
  note?: string
  logo?: string
  status: ActiveStatus
  createdAt: string
  updatedAt: string
}

// ---- Hub (Điểm bán) ----
export type ServicePackage = 'basic' | 'standard' | 'premium'

export interface Hub {
  _id: string
  code: string
  name: string
  address: string
  brandId: string
  brandName?: string
  linkedChannels: string[]
  servicePackage: ServicePackage
  status: ActiveStatus
  createdAt: string
  updatedAt: string
}

// ---- Staff (Nhân viên) ----
export interface StaffPermission {
  brandId?: string
  hubId?: string
  role: 'brand_manager' | 'hub_manager' | 'cashier'
}

export interface Staff {
  _id: string
  name: string
  email: string
  phone: string
  role: Role
  brandId?: string
  brandName?: string
  hubId?: string
  hubName?: string
  avatar?: string
  permissions: StaffPermission[]
  status: ActiveStatus
  createdAt: string
  updatedAt: string
}

// ---- Product ----
export type ProductType = 'raw_material' | 'semi_product' | 'finished_product' | 'goods'

export interface ProductIngredient {
  productId?: string
  name: string
  quantity: number
  unit: string
}

export interface Product {
  _id: string
  name: string
  code: string
  barcode?: string
  description?: string
  category: string
  type: ProductType
  unit: string
  brandId: string
  brandName?: string
  allowSell: boolean
  saleStatus: 'selling' | 'stopped' | 'draft'
  status: ActiveStatus
  price?: number
  costPrice?: number
  image?: string
  supplier?: string
  weight?: number
  height?: number
  length?: number
  ingredients: ProductIngredient[]
  createdAt: string
  updatedAt: string
}

// ---- Menu (Thực đơn) ----
export interface MenuOptionItem {
  productId?: string
  name: string
  price: number
  isDefault?: boolean
}

export interface MenuOptionGroup {
  _id?: string
  name: string
  isRequired: boolean
  minSelect: number
  maxSelect: number
  items: MenuOptionItem[]
}

export interface Menu {
  _id: string
  name: string
  description?: string
  brandId: string
  brandName?: string
  productIds: string[]
  channelIds: string[]
  optionGroups: MenuOptionGroup[]
  status: ActiveStatus
  createdAt: string
  updatedAt: string
}

// ---- Sync Log (Lịch sử đồng bộ) ----
export type SyncType = 'product' | 'menu' | 'channel' | 'order'
export type SyncStatus = 'success' | 'failed' | 'pending'

export interface SyncLog {
  _id: string
  type: SyncType
  status: SyncStatus
  content: string
  source?: string
  brandId?: string
  createdAt: string
}

// ---- Promotion (Khuyến mãi) ----
export type PromotionType =
  | 'discount_percent'
  | 'discount_amount'
  | 'free_item'
  | 'combo'
  | 'order_tiered_discount'
  | 'shipping_discount'
export type PromotionStatus = 'active' | 'upcoming' | 'ended'

export interface PromotionTier {
  minOrderValue: number
  discountType: 'percent' | 'amount'
  discountValue: number
  maxDiscount?: number
  shippingType?: 'discount' | 'flat_price' | 'freeship'
  flatPrice?: number
  region?: string
}

export interface Promotion {
  _id: string
  name: string
  description?: string
  code?: string
  type: PromotionType
  brandId: string
  brandName?: string
  startAt: string
  endAt: string
  quantity?: number
  usedCount?: number
  maxPerUser?: number
  allowCombine: boolean
  status: PromotionStatus
  discountType?: 'percent' | 'amount'
  discountValue?: number
  applicableProducts?: string[]
  tiers?: PromotionTier[]
  buyProducts?: string[]
  buyQuantity?: number
  getProducts?: string[]
  getDiscountType?: 'percent' | 'amount' | 'flat'
  getDiscountValue?: number
  applicableChannels?: string[]
  createdAt: string
  updatedAt: string
}

// ---- Bill Template (Hóa đơn mẫu) ----
export type BillSize = 'A4' | 'A5' | '80mm' | '58mm'
export type BillType = 'order' | 'delivery' | 'receipt' | 'label'

export interface BillTemplate {
  _id: string
  name: string
  type: BillType
  size: BillSize
  isActive: boolean
  templateContent: string
  brandId?: string
  brandName?: string
  createdAt: string
  updatedAt: string
}

// ---- Channel (Kênh bán) ----
export type ChannelSource = 'shopee' | 'grab' | 'xanh_sm' | 'be' | 'internal' | 'other'

export interface Channel {
  _id: string
  name: string
  source: ChannelSource
  externalStoreId?: string
  externalStoreName?: string
  brandId: string
  brandName?: string
  hubId?: string
  hubName?: string
  isPageActive: boolean
  isStoreOpen: boolean
  isManualConfirm: boolean
  autoInvoice: boolean
  workingHours?: WorkingHour[]
  status: ActiveStatus
  connectedAt?: string
  createdAt: string
  updatedAt: string
}

export interface WorkingHour {
  day: 0 | 1 | 2 | 3 | 4 | 5 | 6 // 0 = Sun, 6 = Sat
  open: string  // "08:00"
  close: string // "22:00"
  isClosed: boolean
}

// ---- Order (Đơn hàng) ----
export type OrderStatus =
  | 'draft'
  | 'pre_order'
  | 'waiting_confirm'
  | 'waiting_pickup'
  | 'delivering'
  | 'completed'
  | 'cancelled'

export interface OrderItem {
  productId?: string
  name: string
  quantity: number
  price: number
  total: number
  note?: string
}

export interface DeliveryInfo {
  address?: string
  lat?: number
  lng?: number
  note?: string
  estimatedTime?: string
}

export interface DriverInfo {
  name?: string
  phone?: string
  vehiclePlate?: string
  status?: string
}

export interface Order {
  _id: string
  shortId: string
  source: ChannelSource
  externalOrderId?: string
  brandId: string
  brandName?: string
  hubId?: string
  hubName?: string
  channelId?: string
  channelName?: string
  customerName: string
  customerPhone?: string
  items: OrderItem[]
  subtotal: number
  discount: number
  total: number
  platformFee?: number
  paymentMethod?: string
  deliveryInfo?: DeliveryInfo
  driverInfo?: DriverInfo
  status: OrderStatus
  note?: string
  placedAt: string
  deliveredAt?: string
  cancelledAt?: string
  cancelReason?: string
  rawPayload?: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

// ---- Shipment (Vận đơn) ----
export type ShipmentStatus = 'assigned' | 'picked_up' | 'delivering' | 'delivered' | 'failed'

export interface Shipment {
  _id: string
  orderId: string
  shortOrderId?: string
  trackingCode?: string
  carrierName?: string
  driverName?: string
  driverPhone?: string
  vehiclePlate?: string
  status: ShipmentStatus
  pickupAt?: string
  deliveredAt?: string
  createdAt: string
  updatedAt: string
}

// ---- E-Invoice Connection ----
export type EInvoiceProvider = 'viettel' | 'vnpt' | 'misa' | 'bkav' | 'other'

export interface EInvoiceConnection {
  _id: string
  provider: EInvoiceProvider
  brandId: string
  brandName?: string
  taxCode?: string
  username?: string
  isConnected: boolean
  connectedAt?: string
  createdAt: string
  updatedAt: string
}

// ---- Integration Provider (Adapter) ----
export interface NormalizedOrder {
  source: ChannelSource
  externalOrderId: string
  externalStoreId: string
  customerName: string
  customerPhone?: string
  items: OrderItem[]
  subtotal: number
  discount: number
  total: number
  platformFee?: number
  paymentMethod?: string
  deliveryInfo?: DeliveryInfo
  driverInfo?: DriverInfo
  orderStatus: OrderStatus
  placedAt: string
  deliveredAt?: string
  isNew?: boolean
  rawPayload: Record<string, unknown>
}

// ---- Shift (Ca bán hàng) ----
export type ShiftStatus = 'open' | 'closed'

export interface Shift {
  _id: string
  hubId: string
  hubName?: string
  brandId: string
  brandName?: string
  openedById: string
  openedByName?: string
  closedById?: string
  closedByName?: string
  openedAt: string
  closedAt?: string
  openCash: number
  closeCash?: number
  status: ShiftStatus
  note?: string
  orderCount?: number
  revenue?: number
  discount?: number
  platformFee?: number
  createdAt: string
  updatedAt: string
}

// ---- Report ----
export interface RevenueReport {
  date: string
  totalOrders: number
  revenueBeforeDiscount: number
  revenueAfterDiscount: number
  actualRevenue: number
  platformFee: number
}

export interface DashboardStats {
  totalOrders: number
  totalRevenue: number
  totalBrands: number
  totalHubs: number
  ordersToday: number
  revenueToday: number
  pendingOrders: number
}

// ---- Pagination ----
export interface PaginatedResult<T> {
  data: T[]
  total: number
  page: number
  limit: number
  totalPages: number
}

// ---- API Response ----
export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  message?: string
  error?: string
}

// ---- Customer (Loyalty) ----
export type LoyaltyTier = 'bronze' | 'silver' | 'gold' | 'platinum'

export interface Customer {
  _id: string
  phone: string
  name: string
  email?: string
  brandId: string
  brandName?: string
  source?: string
  sources?: string[]
  points: number
  totalSpend: number
  orderCount: number
  tier: LoyaltyTier
  note?: string
  status: ActiveStatus
  lastOrderAt?: string
  createdAt: string
  updatedAt: string
}

// ---- Table (Bàn / Khu vực) ----
export type TableStatus = 'available' | 'occupied' | 'reserved' | 'cleaning'

export interface Table {
  _id: string
  name: string
  zone: string
  capacity: number
  hubId: string
  hubName?: string
  brandId: string
  brandName?: string
  status: TableStatus
  currentOrderId?: string
  qrToken?: string
  note?: string
  createdAt: string
  updatedAt: string
}

// ---- Inventory (Tồn kho) ----
export interface Inventory {
  _id: string
  productId: string
  productName?: string
  productCode?: string
  hubId: string
  hubName?: string
  brandId: string
  brandName?: string
  quantity: number
  minQuantity: number
  maxQuantity?: number
  unit: string
  lastMovementAt?: string
  createdAt: string
  updatedAt: string
}

// ---- Stock Movement (Biến động kho) ----
export type MovementType = 'import' | 'export' | 'adjust' | 'consume' | 'transfer'

export interface StockMovement {
  _id: string
  productId: string
  productName?: string
  hubId: string
  hubName?: string
  brandId: string
  type: MovementType
  quantity: number
  beforeQty: number
  afterQty: number
  note?: string
  referenceId?: string
  createdById?: string
  createdByName?: string
  createdAt: string
  updatedAt: string
}

// ---- Payment Method ----
export type PaymentMethod = 'cash' | 'card' | 'momo' | 'zalopay' | 'vnpay' | 'banking' | 'other'
