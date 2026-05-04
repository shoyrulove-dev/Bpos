import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/bpos'

// Minimal inline schemas for seeding
const UserSchema = new mongoose.Schema({
  name: String, email: { type: String, unique: true }, password: String,
  role: { type: String, enum: ['admin', 'brand_manager', 'hub_manager', 'cashier'], default: 'cashier' },
  status: { type: String, default: 'active' },
}, { timestamps: true })

const BrandSchema = new mongoose.Schema({
  name: String, phone: String, type: String, address: String, note: String, status: { type: String, default: 'active' }
}, { timestamps: true })

async function seed() {
  await mongoose.connect(MONGODB_URI)
  console.log('Connected to MongoDB:', MONGODB_URI)

  // Clear
  await mongoose.connection.collection('users').deleteMany({})
  await mongoose.connection.collection('brands').deleteMany({})
  console.log('Cleared existing data')

  const User = mongoose.models.User || mongoose.model('User', UserSchema)
  const Brand = mongoose.models.Brand || mongoose.model('Brand', BrandSchema)

  // Brands
  const brands = await Brand.insertMany([
    { name: 'Trà Sữa Phúc Long', phone: '19001234', type: 'fnb', address: 'TP. Hồ Chí Minh', note: 'Thương hiệu trà sữa nổi tiếng', status: 'active' },
    { name: 'Pizza 4P\'s', phone: '19002345', type: 'fnb', address: 'Hà Nội', note: 'Pizza phong cách Nhật', status: 'active' },
    { name: 'Highlands Coffee', phone: '19003456', type: 'fnb', address: 'TP. Hồ Chí Minh', note: 'Chuỗi cà phê', status: 'active' },
    { name: 'FPT Shop', phone: '19004567', type: 'retail', address: 'Toàn quốc', note: 'Chuỗi bán lẻ công nghệ', status: 'active' },
  ])
  console.log(`Seeded ${brands.length} brands`)

  // Users
  const pw = await bcrypt.hash('123456', 10)
  const users = await User.insertMany([
    { name: 'Admin BPOS', email: 'admin@bpos.vn', password: pw, role: 'admin', status: 'active' },
    { name: 'Nhân viên Demo', email: 'user@bpos.vn', password: pw, role: 'cashier', status: 'active' },
  ])
  console.log(`Seeded ${users.length} users`)
  console.log('\n✅ Seed complete!')
  console.log('  admin@bpos.vn / 123456  (admin role)')
  console.log('  user@bpos.vn  / 123456  (cashier role)')

  await mongoose.disconnect()
}

seed().catch(err => { console.error('Seed failed:', err); process.exit(1) })
