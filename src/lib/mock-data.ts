import type { Brand, Hub, Channel, Order, BillTemplate, SyncLog, Shipment, EInvoiceConnection, DashboardStats } from '@/types'

// ============================================================
// BRANDS
// ============================================================
export const mockBrands: Brand[] = [
  {
    _id: 'brand-1',
    name: 'TrÃ  Sá»¯a PhÃºc Long',
    phone: '028-3822-3456',
    type: 'fnb',
    address: '123 Nguyá»…n Huá»‡, P. Báº¿n NghÃ©, Q.1, TP.HCM',
    note: 'ThÆ°Æ¡ng hiá»‡u trÃ  sá»¯a hÃ ng Ä‘áº§u Viá»‡t Nam',
    logo: '',
    status: 'active',
    createdAt: '2024-01-15T08:00:00Z',
    updatedAt: '2024-06-01T10:00:00Z',
  },
  {
    _id: 'brand-2',
    name: 'Pizza 4P\'s',
    phone: '028-3822-7979',
    type: 'fnb',
    address: '8 ThÃ¡i VÄƒn Lung, P. Báº¿n NghÃ©, Q.1, TP.HCM',
    note: 'NhÃ  hÃ ng pizza Nháº­t Báº£n',
    logo: '',
    status: 'active',
    createdAt: '2024-02-10T08:00:00Z',
    updatedAt: '2024-06-15T09:00:00Z',
  },
  {
    _id: 'brand-3',
    name: 'BÃºn BÃ² Huáº¿ Æ i',
    phone: '0903-123-456',
    type: 'fnb',
    address: '45 LÃª Lá»£i, Q. Háº£i ChÃ¢u, ÄÃ  Náºµng',
    note: 'Äáº·c sáº£n miá»n Trung',
    logo: '',
    status: 'active',
    createdAt: '2024-03-01T08:00:00Z',
    updatedAt: '2024-05-20T11:00:00Z',
  },
  {
    _id: 'brand-4',
    name: 'CÆ¡m Táº¥m Kiá»u Giang',
    phone: '0912-345-678',
    type: 'fnb',
    address: '78 VÃµ VÄƒn Kiá»‡t, Q.1, TP.HCM',
    note: 'CÆ¡m táº¥m truyá»n thá»‘ng SÃ i GÃ²n',
    status: 'inactive',
    createdAt: '2024-01-20T08:00:00Z',
    updatedAt: '2024-04-10T12:00:00Z',
  },
]

// ============================================================
// HUBS (Äiá»ƒm bÃ¡n)
// ============================================================
export const mockHubs: Hub[] = [
  {
    _id: 'hub-1',
    code: 'PL-Q1-001',
    name: 'PhÃºc Long Nguyá»…n Huá»‡',
    address: '123 Nguyá»…n Huá»‡, P. Báº¿n NghÃ©, Q.1, TP.HCM',
    brandId: 'brand-1',
    brandName: 'TrÃ  Sá»¯a PhÃºc Long',
    linkedChannels: ['chan-1', 'chan-2'],
    servicePackage: 'premium',
    status: 'active',
    createdAt: '2024-01-20T08:00:00Z',
    updatedAt: '2024-06-01T10:00:00Z',
  },
  {
    _id: 'hub-2',
    code: 'PL-Q7-001',
    name: 'PhÃºc Long PhÃº Má»¹ HÆ°ng',
    address: '10 TÃ¢n PhÃº, P. TÃ¢n Phong, Q.7, TP.HCM',
    brandId: 'brand-1',
    brandName: 'TrÃ  Sá»¯a PhÃºc Long',
    linkedChannels: ['chan-3'],
    servicePackage: 'standard',
    status: 'active',
    createdAt: '2024-02-05T08:00:00Z',
    updatedAt: '2024-05-30T10:00:00Z',
  },
  {
    _id: 'hub-3',
    code: 'PP-Q1-001',
    name: 'Pizza 4P\'s LÃª ThÃ¡nh TÃ´n',
    address: '8 ThÃ¡i VÄƒn Lung, Q.1, TP.HCM',
    brandId: 'brand-2',
    brandName: 'Pizza 4P\'s',
    linkedChannels: ['chan-4'],
    servicePackage: 'premium',
    status: 'active',
    createdAt: '2024-02-15T08:00:00Z',
    updatedAt: '2024-06-10T09:00:00Z',
  },
  {
    _id: 'hub-4',
    code: 'BB-DN-001',
    name: 'BÃºn BÃ² Huáº¿ Æ i - Háº£i ChÃ¢u',
    address: '45 LÃª Lá»£i, Q. Háº£i ChÃ¢u, ÄÃ  Náºµng',
    brandId: 'brand-3',
    brandName: 'BÃºn BÃ² Huáº¿ Æ i',
    linkedChannels: [],
    servicePackage: 'basic',
    status: 'active',
    createdAt: '2024-03-05T08:00:00Z',
    updatedAt: '2024-05-15T11:00:00Z',
  },
]

// ============================================================
// STAFFS (NhÃ¢n viÃªn)
// ============================================================
export const mockStaffs = [
  {
    _id: 'staff-1',
    name: 'Nguyá»…n VÄƒn An',
    email: 'admin@bpos.vn',
    phone: '0901-234-567',
    role: 'admin',
    brandId: 'brand-1',
    brandName: 'TrÃ  Sá»¯a PhÃºc Long',
    status: 'active',
    createdAt: '2024-01-01T08:00:00Z',
    updatedAt: '2024-06-01T10:00:00Z',
  },
  {
    _id: 'staff-2',
    name: 'Tráº§n Thá»‹ Báº£o',
    email: 'user@bpos.vn',
    phone: '0912-345-678',
    role: 'user',
    brandId: 'brand-1',
    brandName: 'TrÃ  Sá»¯a PhÃºc Long',
    hubId: 'hub-1',
    hubName: 'PhÃºc Long Nguyá»…n Huá»‡',
    status: 'active',
    createdAt: '2024-01-15T08:00:00Z',
    updatedAt: '2024-06-01T10:00:00Z',
  },
  {
    _id: 'staff-3',
    name: 'LÃª HoÃ ng CÆ°á»ng',
    email: 'cuong.le@bpos.vn',
    phone: '0923-456-789',
    role: 'user',
    brandId: 'brand-2',
    brandName: 'Pizza 4P\'s',
    hubId: 'hub-3',
    hubName: 'Pizza 4P\'s LÃª ThÃ¡nh TÃ´n',
    status: 'active',
    createdAt: '2024-02-20T08:00:00Z',
    updatedAt: '2024-05-30T10:00:00Z',
  },
  {
    _id: 'staff-4',
    name: 'Pháº¡m Thá»‹ Dung',
    email: 'dung.pham@bpos.vn',
    phone: '0934-567-890',
    role: 'user',
    brandId: 'brand-3',
    brandName: 'BÃºn BÃ² Huáº¿ Æ i',
    status: 'inactive',
    createdAt: '2024-03-10T08:00:00Z',
    updatedAt: '2024-04-15T11:00:00Z',
  },
]

// ============================================================
// PRODUCTS
// ============================================================
export const mockProducts = [
  {
    _id: 'prod-1',
    name: 'TrÃ  Sá»¯a TrÃ¢n ChÃ¢u HoÃ ng Kim',
    code: 'TS-001',
    category: 'TrÃ  Sá»¯a',
    type: 'single',
    unit: 'Ly',
    brandId: 'brand-1',
    brandName: 'TrÃ  Sá»¯a PhÃºc Long',
    saleStatus: 'selling',
    status: 'active',
    price: 55000,
    createdAt: '2024-01-20T08:00:00Z',
    updatedAt: '2024-06-01T10:00:00Z',
  },
  {
    _id: 'prod-2',
    name: 'CÃ  PhÃª Sá»¯a ÄÃ¡',
    code: 'CF-001',
    category: 'CÃ  PhÃª',
    type: 'single',
    unit: 'Ly',
    brandId: 'brand-1',
    brandName: 'TrÃ  Sá»¯a PhÃºc Long',
    saleStatus: 'selling',
    status: 'active',
    price: 35000,
    createdAt: '2024-01-20T08:00:00Z',
    updatedAt: '2024-06-01T10:00:00Z',
  },
  {
    _id: 'prod-3',
    name: 'Combo TrÃ  Sá»¯a 2 Ly',
    code: 'CB-001',
    category: 'Combo',
    type: 'combo',
    unit: 'Set',
    brandId: 'brand-1',
    brandName: 'TrÃ  Sá»¯a PhÃºc Long',
    saleStatus: 'selling',
    status: 'active',
    price: 99000,
    createdAt: '2024-02-01T08:00:00Z',
    updatedAt: '2024-06-01T10:00:00Z',
  },
  {
    _id: 'prod-4',
    name: 'Pizza Margherita',
    code: 'PZ-001',
    category: 'Pizza',
    type: 'single',
    unit: 'CÃ¡i',
    brandId: 'brand-2',
    brandName: 'Pizza 4P\'s',
    saleStatus: 'selling',
    status: 'active',
    price: 189000,
    createdAt: '2024-02-15T08:00:00Z',
    updatedAt: '2024-06-10T09:00:00Z',
  },
  {
    _id: 'prod-5',
    name: 'Pizza Salmon',
    code: 'PZ-002',
    category: 'Pizza',
    type: 'single',
    unit: 'CÃ¡i',
    brandId: 'brand-2',
    brandName: 'Pizza 4P\'s',
    saleStatus: 'selling',
    status: 'active',
    price: 285000,
    createdAt: '2024-02-15T08:00:00Z',
    updatedAt: '2024-06-10T09:00:00Z',
  },
  {
    _id: 'prod-6',
    name: 'BÃºn BÃ² Huáº¿ Ä‘áº·c biá»‡t',
    code: 'BB-001',
    category: 'BÃºn',
    type: 'single',
    unit: 'TÃ´',
    brandId: 'brand-3',
    brandName: 'BÃºn BÃ² Huáº¿ Æ i',
    saleStatus: 'selling',
    status: 'active',
    price: 65000,
    createdAt: '2024-03-05T08:00:00Z',
    updatedAt: '2024-05-15T11:00:00Z',
  },
]

// ============================================================
// MENUS (Thá»±c Ä‘Æ¡n)
// ============================================================
export const mockMenus = [
  {
    _id: 'menu-1',
    name: 'Menu ChÃ­nh - PhÃºc Long',
    description: 'Thá»±c Ä‘Æ¡n chÃ­nh cho táº¥t cáº£ Ä‘iá»ƒm bÃ¡n PhÃºc Long',
    brandId: 'brand-1',
    brandName: 'TrÃ  Sá»¯a PhÃºc Long',
    productIds: ['prod-1', 'prod-2', 'prod-3'],
    status: 'active',
    createdAt: '2024-01-25T08:00:00Z',
    updatedAt: '2024-06-01T10:00:00Z',
  },
  {
    _id: 'menu-2',
    name: 'Menu Shopee - PhÃºc Long',
    description: 'Thá»±c Ä‘Æ¡n dÃ nh riÃªng cho kÃªnh Shopee Food',
    brandId: 'brand-1',
    brandName: 'TrÃ  Sá»¯a PhÃºc Long',
    productIds: ['prod-1', 'prod-2'],
    status: 'active',
    createdAt: '2024-02-10T08:00:00Z',
    updatedAt: '2024-05-30T10:00:00Z',
  },
  {
    _id: 'menu-3',
    name: 'Menu Pizza 4P\'s',
    description: 'Thá»±c Ä‘Æ¡n Ä‘áº§y Ä‘á»§ cá»§a Pizza 4P\'s',
    brandId: 'brand-2',
    brandName: 'Pizza 4P\'s',
    productIds: ['prod-4', 'prod-5'],
    status: 'active',
    createdAt: '2024-02-20T08:00:00Z',
    updatedAt: '2024-06-10T09:00:00Z',
  },
]

// ============================================================
// CHANNELS (KÃªnh bÃ¡n)
// ============================================================
export const mockChannels: Channel[] = [
  {
    _id: 'chan-1',
    name: 'Shopee Food - PhÃºc Long Q1',
    source: 'shopee',
    externalStoreId: 'SPE-12345',
    externalStoreName: 'PhÃºc Long Nguyá»…n Huá»‡ (Shopee)',
    brandId: 'brand-1',
    brandName: 'TrÃ  Sá»¯a PhÃºc Long',
    hubId: 'hub-1',
    hubName: 'PhÃºc Long Nguyá»…n Huá»‡',
    isPageActive: true,
    isStoreOpen: true,
    isManualConfirm: false,
    autoInvoice: false,
    status: 'active',
    connectedAt: '2024-02-01T08:00:00Z',
    createdAt: '2024-02-01T08:00:00Z',
    updatedAt: '2024-06-01T10:00:00Z',
  },
  {
    _id: 'chan-2',
    name: 'GrabFood - PhÃºc Long Q1',
    source: 'grab',
    externalStoreId: 'GRAB-67890',
    externalStoreName: 'PhÃºc Long Nguyá»…n Huá»‡ (Grab)',
    brandId: 'brand-1',
    brandName: 'TrÃ  Sá»¯a PhÃºc Long',
    hubId: 'hub-1',
    hubName: 'PhÃºc Long Nguyá»…n Huá»‡',
    isPageActive: true,
    isStoreOpen: true,
    isManualConfirm: true,
    autoInvoice: false,
    status: 'active',
    connectedAt: '2024-02-05T08:00:00Z',
    createdAt: '2024-02-05T08:00:00Z',
    updatedAt: '2024-06-01T10:00:00Z',
  },
  {
    _id: 'chan-3',
    name: 'Shopee Food - PhÃºc Long Q7',
    source: 'shopee',
    externalStoreId: 'SPE-24680',
    externalStoreName: 'PhÃºc Long PMH (Shopee)',
    brandId: 'brand-1',
    brandName: 'TrÃ  Sá»¯a PhÃºc Long',
    hubId: 'hub-2',
    hubName: 'PhÃºc Long PhÃº Má»¹ HÆ°ng',
    isPageActive: true,
    isStoreOpen: false,
    isManualConfirm: false,
    autoInvoice: true,
    status: 'active',
    connectedAt: '2024-03-01T08:00:00Z',
    createdAt: '2024-03-01T08:00:00Z',
    updatedAt: '2024-06-01T10:00:00Z',
  },
  {
    _id: 'chan-4',
    name: 'Xanh SM - Pizza 4P\'s',
    source: 'xanh_sm',
    externalStoreId: 'XSM-11111',
    externalStoreName: '4P\'s LÃª ThÃ¡nh TÃ´n',
    brandId: 'brand-2',
    brandName: 'Pizza 4P\'s',
    hubId: 'hub-3',
    hubName: 'Pizza 4P\'s LÃª ThÃ¡nh TÃ´n',
    isPageActive: true,
    isStoreOpen: true,
    isManualConfirm: false,
    autoInvoice: false,
    status: 'active',
    connectedAt: '2024-04-01T08:00:00Z',
    createdAt: '2024-04-01T08:00:00Z',
    updatedAt: '2024-06-10T09:00:00Z',
  },
]

// ============================================================
// ORDERS (ÄÆ¡n hÃ ng)
// ============================================================
export const mockOrders: Order[] = [
  {
    _id: 'order-1',
    shortId: 'ORD-001',
    source: 'shopee',
    externalOrderId: 'SPE-2024-001',
    brandId: 'brand-1',
    brandName: 'TrÃ  Sá»¯a PhÃºc Long',
    hubId: 'hub-1',
    hubName: 'PhÃºc Long Nguyá»…n Huá»‡',
    channelId: 'chan-1',
    channelName: 'Shopee Food - PhÃºc Long Q1',
    customerName: 'Nguyá»…n Thá»‹ Mai',
    customerPhone: '0901-111-222',
    items: [
      { name: 'TrÃ  Sá»¯a TrÃ¢n ChÃ¢u HoÃ ng Kim', quantity: 2, price: 55000, total: 110000 },
      { name: 'CÃ  PhÃª Sá»¯a ÄÃ¡', quantity: 1, price: 35000, total: 35000 },
    ],
    subtotal: 145000,
    discount: 20000,
    total: 125000,
    platformFee: 12500,
    paymentMethod: 'online',
    deliveryInfo: { address: '45 Äinh TiÃªn HoÃ ng, Q.1, TP.HCM' },
    driverInfo: { name: 'Tráº§n VÄƒn Nam', phone: '0909-123-456', vehiclePlate: '51B-12345' },
    status: 'delivering',
    placedAt: '2024-06-20T10:30:00Z',
    createdAt: '2024-06-20T10:30:00Z',
    updatedAt: '2024-06-20T10:45:00Z',
  },
  {
    _id: 'order-2',
    shortId: 'ORD-002',
    source: 'grab',
    externalOrderId: 'GRAB-2024-456',
    brandId: 'brand-1',
    brandName: 'TrÃ  Sá»¯a PhÃºc Long',
    hubId: 'hub-1',
    hubName: 'PhÃºc Long Nguyá»…n Huá»‡',
    channelId: 'chan-2',
    channelName: 'GrabFood - PhÃºc Long Q1',
    customerName: 'LÃª VÄƒn BÃ¬nh',
    customerPhone: '0912-222-333',
    items: [
      { name: 'Combo TrÃ  Sá»¯a 2 Ly', quantity: 1, price: 99000, total: 99000 },
    ],
    subtotal: 99000,
    discount: 0,
    total: 99000,
    platformFee: 9900,
    paymentMethod: 'cash',
    deliveryInfo: { address: '100 LÃ½ Tá»± Trá»ng, Q.1, TP.HCM' },
    driverInfo: { name: 'Pháº¡m Thá»‹ Lan', phone: '0898-234-567', vehiclePlate: '51F-67890' },
    status: 'waiting_confirm',
    placedAt: '2024-06-20T11:00:00Z',
    createdAt: '2024-06-20T11:00:00Z',
    updatedAt: '2024-06-20T11:00:00Z',
  },
  {
    _id: 'order-3',
    shortId: 'ORD-003',
    source: 'xanh_sm',
    externalOrderId: 'XSM-2024-789',
    brandId: 'brand-2',
    brandName: 'Pizza 4P\'s',
    hubId: 'hub-3',
    hubName: 'Pizza 4P\'s LÃª ThÃ¡nh TÃ´n',
    channelId: 'chan-4',
    channelName: 'Xanh SM - Pizza 4P\'s',
    customerName: 'HoÃ ng Minh ChÃ¢u',
    customerPhone: '0923-333-444',
    items: [
      { name: 'Pizza Margherita', quantity: 1, price: 189000, total: 189000 },
      { name: 'Pizza Salmon', quantity: 1, price: 285000, total: 285000 },
    ],
    subtotal: 474000,
    discount: 50000,
    total: 424000,
    platformFee: 42400,
    paymentMethod: 'online',
    deliveryInfo: { address: '20 Hai BÃ  TrÆ°ng, Q.1, TP.HCM' },
    status: 'completed',
    placedAt: '2024-06-20T08:00:00Z',
    deliveredAt: '2024-06-20T09:15:00Z',
    createdAt: '2024-06-20T08:00:00Z',
    updatedAt: '2024-06-20T09:15:00Z',
  },
  {
    _id: 'order-4',
    shortId: 'ORD-004',
    source: 'be',
    externalOrderId: 'BE-2024-321',
    brandId: 'brand-1',
    brandName: 'TrÃ  Sá»¯a PhÃºc Long',
    hubId: 'hub-2',
    hubName: 'PhÃºc Long PhÃº Má»¹ HÆ°ng',
    channelId: 'chan-3',
    channelName: 'Shopee Food - PhÃºc Long Q7',
    customerName: 'VÅ© Thá»‹ Hoa',
    customerPhone: '0934-444-555',
    items: [
      { name: 'TrÃ  Sá»¯a TrÃ¢n ChÃ¢u HoÃ ng Kim', quantity: 3, price: 55000, total: 165000 },
    ],
    subtotal: 165000,
    discount: 15000,
    total: 150000,
    platformFee: 15000,
    paymentMethod: 'online',
    deliveryInfo: { address: '10 TÃ¢n PhÃº, Q.7, TP.HCM' },
    status: 'waiting_pickup',
    placedAt: '2024-06-20T12:00:00Z',
    createdAt: '2024-06-20T12:00:00Z',
    updatedAt: '2024-06-20T12:05:00Z',
  },
  {
    _id: 'order-5',
    shortId: 'ORD-005',
    source: 'shopee',
    externalOrderId: 'SPE-2024-002',
    brandId: 'brand-1',
    brandName: 'TrÃ  Sá»¯a PhÃºc Long',
    hubId: 'hub-1',
    hubName: 'PhÃºc Long Nguyá»…n Huá»‡',
    channelId: 'chan-1',
    channelName: 'Shopee Food - PhÃºc Long Q1',
    customerName: 'Äáº·ng VÄƒn KiÃªn',
    customerPhone: '0945-555-666',
    items: [
      { name: 'CÃ  PhÃª Sá»¯a ÄÃ¡', quantity: 2, price: 35000, total: 70000 },
    ],
    subtotal: 70000,
    discount: 0,
    total: 70000,
    platformFee: 7000,
    paymentMethod: 'cash',
    deliveryInfo: { address: '55 BÃ¹i Viá»‡n, Q.1, TP.HCM' },
    status: 'cancelled',
    cancelReason: 'KhÃ¡ch hÃ ng há»§y Ä‘Æ¡n',
    placedAt: '2024-06-20T09:00:00Z',
    cancelledAt: '2024-06-20T09:05:00Z',
    createdAt: '2024-06-20T09:00:00Z',
    updatedAt: '2024-06-20T09:05:00Z',
  },
  {
    _id: 'order-6',
    shortId: 'ORD-006',
    source: 'grab',
    externalOrderId: 'GRAB-2024-789',
    brandId: 'brand-2',
    brandName: 'Pizza 4P\'s',
    hubId: 'hub-3',
    hubName: 'Pizza 4P\'s LÃª ThÃ¡nh TÃ´n',
    channelId: 'chan-4',
    channelName: 'Xanh SM - Pizza 4P\'s',
    customerName: 'TrÆ°Æ¡ng Thá»‹ Ngá»c',
    customerPhone: '0956-666-777',
    items: [
      { name: 'Pizza Margherita', quantity: 2, price: 189000, total: 378000 },
    ],
    subtotal: 378000,
    discount: 30000,
    total: 348000,
    platformFee: 34800,
    paymentMethod: 'online',
    deliveryInfo: { address: '77 Nguyá»…n Du, Q.1, TP.HCM' },
    driverInfo: { name: 'BÃ¹i VÄƒn Tuáº¥n', phone: '0967-789-012', vehiclePlate: '51K-11111' },
    status: 'delivering',
    placedAt: '2024-06-20T13:00:00Z',
    createdAt: '2024-06-20T13:00:00Z',
    updatedAt: '2024-06-20T13:15:00Z',
  },
]

// ============================================================
// PROMOTIONS
// ============================================================
export const mockPromotions = [
  {
    _id: 'promo-1',
    name: 'Giáº£m 20% Cuá»‘i Tuáº§n',
    type: 'discount_percent',
    brandId: 'brand-1',
    brandName: 'TrÃ  Sá»¯a PhÃºc Long',
    startAt: '2024-06-15T00:00:00Z',
    endAt: '2024-06-30T23:59:59Z',
    quantity: 500,
    usedCount: 234,
    status: 'active',
    createdAt: '2024-06-10T08:00:00Z',
    updatedAt: '2024-06-20T10:00:00Z',
  },
  {
    _id: 'promo-2',
    name: 'Mua 1 Táº·ng 1 CÃ  PhÃª',
    type: 'free_item',
    brandId: 'brand-1',
    brandName: 'TrÃ  Sá»¯a PhÃºc Long',
    startAt: '2024-07-01T00:00:00Z',
    endAt: '2024-07-07T23:59:59Z',
    quantity: 200,
    usedCount: 0,
    status: 'upcoming',
    createdAt: '2024-06-18T08:00:00Z',
    updatedAt: '2024-06-18T08:00:00Z',
  },
  {
    _id: 'promo-3',
    name: 'Flash Sale -30% Pizza',
    type: 'discount_percent',
    brandId: 'brand-2',
    brandName: 'Pizza 4P\'s',
    startAt: '2024-05-01T00:00:00Z',
    endAt: '2024-05-31T23:59:59Z',
    quantity: 300,
    usedCount: 300,
    status: 'ended',
    createdAt: '2024-04-25T08:00:00Z',
    updatedAt: '2024-06-01T00:00:00Z',
  },
]

// ============================================================
// BILL TEMPLATES
// ============================================================
export const mockBillTemplates: BillTemplate[] = [
  {
    _id: 'bill-1',
    name: 'HÃ³a Ä‘Æ¡n 80mm Máº·c Ä‘á»‹nh',
    type: 'order',
    size: '80mm',
    isActive: true,
    templateContent: `===== {{.BillName}} =====
Cá»­a hÃ ng: {{.SiteName}}
KÃªnh bÃ¡n: {{.OrderSource}}
MÃ£ Ä‘Æ¡n: {{.ShortOrderID}}
Thá»i gian: {{.CurrentTime}}
--------------------------
KhÃ¡ch: {{.CustomerName}}
Äá»‹a chá»‰ giao: {{.DeliveryAddress}}
--------------------------
{{range .Items}}
{{.Name}} x{{.Qty}}  {{.Total}}
{{end}}
--------------------------
Tá»•ng: {{.Subtotal}}
Khuyáº¿n mÃ£i: -{{.Discount}}
THá»°C THU: {{.Total}}
==========================`,
    createdAt: '2024-01-15T08:00:00Z',
    updatedAt: '2024-06-01T10:00:00Z',
  },
  {
    _id: 'bill-2',
    name: 'Phiáº¿u Giao HÃ ng A5',
    type: 'delivery',
    size: 'A5',
    isActive: true,
    templateContent: `PHIáº¾U GIAO HÃ€NG
Cá»­a hÃ ng: {{.SiteName}}
MÃ£ Ä‘Æ¡n: {{.ShortOrderID}}
NgÃ y Ä‘áº·t: {{.OrderCreatedAt}}
Giao trÆ°á»›c: {{.OrderDeliveryAt}}
KhÃ¡ch hÃ ng: {{.CustomerName}}
Äá»‹a chá»‰: {{.DeliveryAddress}}`,
    createdAt: '2024-02-01T08:00:00Z',
    updatedAt: '2024-06-01T10:00:00Z',
  },
]

// ============================================================
// SYNC LOGS
// ============================================================
export const mockSyncLogs: SyncLog[] = [
  {
    _id: 'log-1',
    type: 'order',
    status: 'success',
    content: 'Äá»“ng bá»™ 15 Ä‘Æ¡n hÃ ng tá»« Shopee Food',
    source: 'shopee',
    brandId: 'brand-1',
    createdAt: '2024-06-20T10:00:00Z',
  },
  {
    _id: 'log-2',
    type: 'order',
    status: 'success',
    content: 'Äá»“ng bá»™ 8 Ä‘Æ¡n hÃ ng tá»« GrabFood',
    source: 'grab',
    brandId: 'brand-1',
    createdAt: '2024-06-20T10:05:00Z',
  },
  {
    _id: 'log-3',
    type: 'product',
    status: 'success',
    content: 'Äá»“ng bá»™ 23 sáº£n pháº©m lÃªn Shopee',
    source: 'shopee',
    brandId: 'brand-1',
    createdAt: '2024-06-20T09:00:00Z',
  },
  {
    _id: 'log-4',
    type: 'menu',
    status: 'failed',
    content: 'Lá»—i Ä‘á»“ng bá»™ thá»±c Ä‘Æ¡n lÃªn Xanh SM: timeout',
    source: 'xanh_sm',
    brandId: 'brand-2',
    createdAt: '2024-06-20T08:30:00Z',
  },
  {
    _id: 'log-5',
    type: 'channel',
    status: 'success',
    content: 'Káº¿t ná»‘i kÃªnh Be thÃ nh cÃ´ng',
    source: 'be',
    brandId: 'brand-1',
    createdAt: '2024-06-19T15:00:00Z',
  },
]

// ============================================================
// SHIPMENTS
// ============================================================
export const mockShipments: Shipment[] = [
  {
    _id: 'ship-1',
    orderId: 'order-1',
    shortOrderId: 'ORD-001',
    trackingCode: 'TRK-001-2024',
    carrierName: 'Shopee Express',
    driverName: 'Tráº§n VÄƒn Nam',
    driverPhone: '0909-123-456',
    vehiclePlate: '51B-12345',
    status: 'delivering',
    pickupAt: '2024-06-20T10:45:00Z',
    createdAt: '2024-06-20T10:30:00Z',
    updatedAt: '2024-06-20T10:45:00Z',
  },
  {
    _id: 'ship-2',
    orderId: 'order-3',
    shortOrderId: 'ORD-003',
    trackingCode: 'TRK-002-2024',
    carrierName: 'Xanh SM',
    driverName: 'LÃª Thá»‹ Thu',
    driverPhone: '0876-543-210',
    vehiclePlate: '51G-22222',
    status: 'delivered',
    pickupAt: '2024-06-20T08:30:00Z',
    deliveredAt: '2024-06-20T09:15:00Z',
    createdAt: '2024-06-20T08:00:00Z',
    updatedAt: '2024-06-20T09:15:00Z',
  },
  {
    _id: 'ship-3',
    orderId: 'order-6',
    shortOrderId: 'ORD-006',
    trackingCode: 'TRK-003-2024',
    carrierName: 'GrabExpress',
    driverName: 'BÃ¹i VÄƒn Tuáº¥n',
    driverPhone: '0967-789-012',
    vehiclePlate: '51K-11111',
    status: 'picked_up',
    createdAt: '2024-06-20T13:00:00Z',
    updatedAt: '2024-06-20T13:15:00Z',
  },
]

// ============================================================
// E-INVOICE CONNECTIONS
// ============================================================
export const mockEInvoiceConnections: EInvoiceConnection[] = [
  {
    _id: 'einv-1',
    provider: 'viettel',
    brandId: 'brand-1',
    brandName: 'TrÃ  Sá»¯a PhÃºc Long',
    taxCode: '0123456789',
    username: 'phuclongviettel',
    isConnected: true,
    connectedAt: '2024-03-01T08:00:00Z',
    createdAt: '2024-03-01T08:00:00Z',
    updatedAt: '2024-06-01T10:00:00Z',
  },
  {
    _id: 'einv-2',
    provider: 'misa',
    brandId: 'brand-2',
    brandName: 'Pizza 4P\'s',
    taxCode: '9876543210',
    username: 'pizza4ps_misa',
    isConnected: false,
    createdAt: '2024-04-01T08:00:00Z',
    updatedAt: '2024-04-01T08:00:00Z',
  },
]

// ============================================================
// DASHBOARD STATS
// ============================================================
export const mockDashboardStats: DashboardStats = {
  totalOrders: 1842,
  totalRevenue: 256480000,
  totalBrands: 4,
  totalHubs: 8,
  ordersToday: 127,
  revenueToday: 18650000,
  pendingOrders: 12,
}

// ============================================================
// REVENUE CHART DATA (30 days)
// ============================================================
export const mockRevenueData = Array.from({ length: 30 }, (_, i) => {
  const date = new Date('2024-06-01')
  date.setDate(date.getDate() + i)
  const orders = Math.floor(Math.random() * 80) + 40
  const revenue = orders * (Math.floor(Math.random() * 100000) + 80000)
  const discount = Math.floor(revenue * 0.1)
  return {
    date: date.toISOString().split('T')[0],
    totalOrders: orders,
    revenueBeforeDiscount: revenue,
    revenueAfterDiscount: revenue - discount,
    actualRevenue: revenue - discount,
    platformFee: Math.floor(revenue * 0.05),
  }
})
