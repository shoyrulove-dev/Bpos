import { NextRequest, NextResponse } from 'next/server'
import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'
import { connectDB } from '@/lib/db'

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret')
  if (secret !== process.env.NEXTAUTH_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    await connectDB()

    const UserSchema = new mongoose.Schema({
      name: String,
      email: { type: String, unique: true },
      password: String,
      role: { type: String, enum: ['user', 'admin'], default: 'user' },
      status: { type: String, default: 'active' },
    }, { timestamps: true })

    const BrandSchema = new mongoose.Schema({
      name: String, phone: String, type: String,
      address: String, note: String,
      status: { type: String, default: 'active' },
    }, { timestamps: true })

    const User  = mongoose.models.User  || mongoose.model('User',  UserSchema)
    const Brand = mongoose.models.Brand || mongoose.model('Brand', BrandSchema)

    // Clear existing
    await User.deleteMany({})
    await Brand.deleteMany({})

    // Seed brands
    const brands = await Brand.insertMany([
      { name: 'Trà Sữa Phúc Long', phone: '19001234', type: 'fnb', address: 'TP. Hồ Chí Minh', note: 'Thương hiệu trà sữa nổi tiếng', status: 'active' },
      { name: "Pizza 4P's", phone: '19002345', type: 'fnb', address: 'Hà Nội', note: 'Pizza phong cách Nhật', status: 'active' },
      { name: 'Highlands Coffee', phone: '19003456', type: 'fnb', address: 'TP. Hồ Chí Minh', note: 'Chuỗi cà phê', status: 'active' },
      { name: 'FPT Shop', phone: '19004567', type: 'retail', address: 'Toàn quốc', note: 'Chuỗi bán lẻ công nghệ', status: 'active' },
    ])

    // Seed users
    const pw = await bcrypt.hash('123456', 10)
    const users = await User.insertMany([
      { name: 'Admin BPOS', email: 'admin@bpos.vn', password: pw, role: 'admin', status: 'active' },
      { name: 'Nhân viên Demo', email: 'user@bpos.vn', password: pw, role: 'user', status: 'active' },
    ])

    return NextResponse.json({
      success: true,
      message: 'Seed thành công!',
      brands: brands.length,
      users: users.length,
      accounts: [
        'admin@bpos.vn / 123456 (admin)',
        'user@bpos.vn / 123456 (user)',
      ],
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
