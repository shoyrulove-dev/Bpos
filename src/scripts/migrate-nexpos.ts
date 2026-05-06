/**
 * Migration script: import products & bill templates from nexpos.io into bpos MongoDB
 * Run with: npx tsx src/scripts/migrate-nexpos.ts
 */
import mongoose from 'mongoose'
import * as https from 'https'

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://shoyrulove_db_user:OkquZfzPtai8EWEQ@cluster0.v6acr3t.mongodb.net/?appName=Cluster0'
const NEXPOS_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjE3ODA2OTA1NjAsImlhdCI6MTc3ODA5ODU2MCwidXNlcm5hbWUiOiJrZXRvYW5AdGFrb2dyb3VwLmNvbS52biJ9.PnwSL1oJzia35VyCdUbBEruAm2yYamU2wZHI8An3fdY'
const NEXPOS_API = 'https://saas-api.nexpos.io/v1'

// Nexpos brand IDs → bpos brand IDs
const BRAND_MAP: Record<string, string> = {
  '69d86f176edc6507a844e3e5': '69fb3e6c437c76011e8088c8', // Đậu Má Mix
  '69d86ef02879bc535d44e3c1': '69fb3eb9437c76011e8088da', // Gà Nướng Ò Ó O
}

// Minimal mongoose schemas
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

async function fetchJSON(url: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      headers: { 'x-access-token': NEXPOS_TOKEN, 'x-nexpos-language': 'vi' }
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

async function fetchAllProducts(nexposBrandId: string): Promise<unknown[]> {
  let all: unknown[] = [], pageNum = 1
  while (true) {
    const d = await fetchJSON(`${NEXPOS_API}/brand-service/brands/${nexposBrandId}/core-products?page=${pageNum}&limit=100`) as Record<string, unknown>
    if (!d.success) break
    all = all.concat((d.data as unknown[]) || [])
    if (!d.hasNextPage) break
    pageNum++
  }
  return all
}

async function fetchBillTemplates(nexposBrandId: string): Promise<unknown[]> {
  const d = await fetchJSON(`${NEXPOS_API}/brand-service/brands/${nexposBrandId}/bills`) as Record<string, unknown>
  return (d.data as unknown[]) || []
}

function mapProductType(t: string): string {
  if (t === 'thanh_pham') return 'finished_product'
  if (t === 'nguyen_lieu') return 'raw_material'
  if (t === 'ban_thanh_pham') return 'semi_product'
  return 'goods'
}

function mapBillSize(size: number): string {
  if (size >= 500) return 'A4'
  if (size >= 200) return 'A5'
  if (size >= 76) return '80mm'
  return '58mm'
}

function mapBillType(t: string): string {
  if (t === 'bill_for_complete') return 'receipt'
  if (t === 'bill_for_order') return 'order'
  return 'delivery'
}

async function main() {
  await mongoose.connect(MONGODB_URI)
  console.log('Connected to MongoDB')

  const Product = mongoose.models.Product || mongoose.model('Product', ProductSchema)
  const BillTemplate = mongoose.models.BillTemplate || mongoose.model('BillTemplate', BillTemplateSchema)
  const Brand = mongoose.models.Brand || mongoose.model('Brand', BrandSchema)

  // Update brand logos
  console.log('\n--- Updating brand logos ---')
  await Brand.findByIdAndUpdate('69fb3e6c437c76011e8088c8', { logo: 'https://storage.googleapis.com/nexpos-images/images/dmm.jpg-8a6d70ffeddcb94163c31f6c8a1ebb49.jpg' })
  await Brand.findByIdAndUpdate('69fb3eb9437c76011e8088da', { logo: 'https://storage.googleapis.com/nexpos-images/images/g%C3%A0%20n%C6%B0%E1%BB%9Bng.jpeg-abe82725193dc2621813638caaae1ba8.jpg' })
  console.log('Brand logos updated ✓')

  // Migrate products
  console.log('\n--- Migrating products ---')
  let totalInserted = 0, totalSkipped = 0

  for (const [nexposId, bposId] of Object.entries(BRAND_MAP)) {
    console.log(`Fetching products for brand ${nexposId}...`)
    const products = await fetchAllProducts(nexposId) as Record<string, unknown>[]
    console.log(`  Got ${products.length} products`)

    for (const p of products) {
      try {
        await Product.updateOne(
          { code: p.code as string },
          {
            $setOnInsert: {
              name: p.name, code: p.code,
              barcode: (p.bar_code as string) || '',
              category: (p.category as string) || 'Khác',
              type: mapProductType(p.type as string),
              unit: (p.unit as string) || 'Cái',
              brandId: new mongoose.Types.ObjectId(bposId),
              price: (p.sale_price as number) || 0,
              costPrice: (p.price as number) || 0,
              description: p.description === '#REF!' ? '' : ((p.description as string) || ''),
              allowSell: p.available_for_sale !== false,
              status: (p.status as string) || 'active',
              saleStatus: p.available_for_sale !== false ? 'selling' : 'stopped',
              weight: (p.weight as number) || 0,
              height: (p.height as number) || 0,
              length: (p.length as number) || 0,
              image: (Array.isArray(p.images) && p.images[0]) ? p.images[0] as string : '',
            }
          },
          { upsert: true }
        ).then(r => {
          if (r.upsertedCount > 0) totalInserted++
          else totalSkipped++
        })
      } catch (e) {
        console.warn(`  Skip ${p.code}: ${(e as Error).message}`)
        totalSkipped++
      }
    }
  }
  console.log(`Products: ${totalInserted} inserted, ${totalSkipped} skipped ✓`)

  // Migrate bill templates
  console.log('\n--- Migrating bill templates ---')
  let btInserted = 0

  for (const [nexposId, bposId] of Object.entries(BRAND_MAP)) {
    const templates = await fetchBillTemplates(nexposId) as Record<string, unknown>[]
    for (const t of templates) {
      const exists = await BillTemplate.findOne({ name: t.name as string, brandId: new mongoose.Types.ObjectId(bposId) })
      if (!exists) {
        await BillTemplate.create({
          name: t.name, isActive: true,
          type: mapBillType(t.bill_type as string),
          size: mapBillSize(t.bill_size as number),
          brandId: new mongoose.Types.ObjectId(bposId),
          templateContent: (t.content_html as string) || '',
        })
        btInserted++
        console.log(`  Created bill template: ${t.name}`)
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
