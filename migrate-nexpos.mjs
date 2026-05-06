/**
 * Migration: import products & bill templates from nexpos.io into bpos MongoDB
 */
import mongoose from 'mongoose'
import https from 'https'

const MONGODB_URI = 'mongodb+srv://shoyrulove_db_user:OkquZfzPtai8EWEQ@cluster0.v6acr3t.mongodb.net/?appName=Cluster0'
const NEXPOS_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjE3ODA2OTA1NjAsImlhdCI6MTc3ODA5ODU2MCwidXNlcm5hbWUiOiJrZXRvYW5AdGFrb2dyb3VwLmNvbS52biJ9.PnwSL1oJzia35VyCdUbBEruAm2yYamU2wZHI8An3fdY'
const NEXPOS_API = 'https://saas-api.nexpos.io/v1'

// Nexpos brand IDs → bpos brand IDs
const BRAND_MAP = {
  '69d86f176edc6507a844e3e5': '69fb3e6c437c76011e8088c8', // Đậu Má Mix
  '69d86ef02879bc535d44e3c1': '69fb3eb9437c76011e8088da', // Gà Nướng Ò Ó O
}

const BRAND_LOGOS = {
  '69fb3e6c437c76011e8088c8': 'https://storage.googleapis.com/nexpos-images/images/dmm.jpg-8a6d70ffeddcb94163c31f6c8a1ebb49.jpg',
  '69fb3eb9437c76011e8088da': 'https://storage.googleapis.com/nexpos-images/images/g%C3%A0%20n%C6%B0%E1%BB%9Bng.jpeg-abe82725193dc2621813638caaae1ba8.jpg'
}

const ProductSchema = new mongoose.Schema({
  name: String, code: { type: String, unique: true }, barcode: String,
  category: String, type: { type: String, default: 'finished_product' },
  unit: { type: String, default: 'Cái' }, brandId: mongoose.Schema.Types.ObjectId,
  price: Number, costPrice: Number, description: String,
  saleStatus: { type: String, default: 'selling' }, status: { type: String, default: 'active' },
  allowSell: { type: Boolean, default: true }, weight: Number, height: Number, length: Number, image: String,
}, { timestamps: true })

const BillTemplateSchema = new mongoose.Schema({
  name: String, type: { type: String, default: 'order' }, size: { type: String, default: '80mm' },
  brandId: mongoose.Schema.Types.ObjectId, isActive: { type: Boolean, default: true },
  templateContent: { type: String, default: '' },
}, { timestamps: true })

const BrandSchema = new mongoose.Schema({
  name: String, phone: String, type: String, address: String, note: String, logo: String,
  status: { type: String, default: 'active' },
}, { timestamps: true })

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      headers: { 'x-access-token': NEXPOS_TOKEN, 'x-nexpos-language': 'vi', 'user-agent': 'Node.js' }
    }, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        try { resolve(JSON.parse(data)) }
        catch { reject(new Error(`Invalid JSON from ${url}: ${data.substring(0, 200)}`)) }
      })
    })
    req.on('error', reject)
    req.end()
  })
}

async function fetchAllProducts(nexposBrandId) {
  let all = [], pageNum = 1
  while (true) {
    const d = await fetchJSON(`${NEXPOS_API}/brand-service/brands/${nexposBrandId}/core-products?page=${pageNum}&limit=100`)
    if (!d.success) break
    all = all.concat(d.data || [])
    if (!d.hasNextPage) break
    pageNum++
  }
  return all
}

async function fetchBillTemplates(nexposBrandId) {
  const d = await fetchJSON(`${NEXPOS_API}/brand-service/brands/${nexposBrandId}/bills`)
  return d.data || []
}

function mapProductType(t) {
  if (t === 'thanh_pham') return 'finished_product'
  if (t === 'nguyen_lieu') return 'raw_material'
  if (t === 'ban_thanh_pham') return 'semi_product'
  return 'goods'
}
function mapBillSize(s) { return s >= 500 ? 'A4' : s >= 200 ? 'A5' : s >= 76 ? '80mm' : '58mm' }
function mapBillType(t) { return t === 'bill_for_complete' ? 'receipt' : t === 'bill_for_order' ? 'order' : 'delivery' }

async function main() {
  await mongoose.connect(MONGODB_URI)
  console.log('Connected to MongoDB ✓')

  const Product = mongoose.models.Product || mongoose.model('Product', ProductSchema)
  const BillTemplate = mongoose.models.BillTemplate || mongoose.model('BillTemplate', BillTemplateSchema)
  const Brand = mongoose.models.Brand || mongoose.model('Brand', BrandSchema)

  console.log('\n--- Updating brand logos ---')
  for (const [bposId, logo] of Object.entries(BRAND_LOGOS)) {
    await Brand.findByIdAndUpdate(bposId, { logo })
    console.log(`  Logo updated for ${bposId}`)
  }

  console.log('\n--- Migrating products ---')
  let inserted = 0, skipped = 0
  for (const [nexposId, bposId] of Object.entries(BRAND_MAP)) {
    const products = await fetchAllProducts(nexposId)
    console.log(`  Fetched ${products.length} products for brand ${nexposId}`)
    for (const p of products) {
      try {
        const r = await Product.updateOne(
          { code: p.code },
          { $setOnInsert: {
            name: p.name, code: p.code, barcode: p.bar_code || '',
            category: p.category || 'Khác',
            type: mapProductType(p.type),
            unit: p.unit || 'Cái', brandId: new mongoose.Types.ObjectId(bposId),
            price: p.sale_price || 0, costPrice: p.price || 0,
            description: p.description === '#REF!' ? '' : (p.description || ''),
            allowSell: p.available_for_sale !== false,
            status: p.status || 'active',
            saleStatus: p.available_for_sale !== false ? 'selling' : 'stopped',
            weight: p.weight || 0, height: p.height || 0, length: p.length || 0,
            image: (Array.isArray(p.images) && p.images[0]) ? p.images[0] : '',
          }},
          { upsert: true }
        )
        if (r.upsertedCount > 0) inserted++
        else skipped++
      } catch (e) {
        console.warn(`  Skip ${p.code}: ${e.message}`)
        skipped++
      }
    }
  }
  console.log(`Products: ${inserted} inserted, ${skipped} skipped ✓`)

  console.log('\n--- Migrating bill templates ---')
  let btInserted = 0
  for (const [nexposId, bposId] of Object.entries(BRAND_MAP)) {
    const templates = await fetchBillTemplates(nexposId)
    for (const t of templates) {
      const exists = await BillTemplate.findOne({ name: t.name, brandId: new mongoose.Types.ObjectId(bposId) })
      if (!exists) {
        await BillTemplate.create({
          name: t.name, isActive: true,
          type: mapBillType(t.bill_type),
          size: mapBillSize(t.bill_size),
          brandId: new mongoose.Types.ObjectId(bposId),
          templateContent: t.content_html || '',
        })
        btInserted++
        console.log(`  Created: ${t.name}`)
      } else {
        console.log(`  Skip existing: ${t.name}`)
      }
    }
  }
  console.log(`Bill templates: ${btInserted} created ✓`)
  console.log('\n✅ Migration complete!')
  await mongoose.disconnect()
}

main().catch(err => { console.error('Migration failed:', err); process.exit(1) })
