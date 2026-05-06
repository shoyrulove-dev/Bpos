import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db'
import ProductModel from '@/models/Product'
import BillTemplateModel from '@/models/BillTemplate'
import BrandModel from '@/models/Brand'

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret') || req.nextUrl.searchParams.get('secret')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  await connectDB()

  const body = await req.json()
  const { products = [], billTemplates = [], brandLogos = [] } = body

  // Update brand logos
  let logosUpdated = 0
  for (const { brandId, logo } of brandLogos) {
    await BrandModel.findByIdAndUpdate(brandId, { logo })
    logosUpdated++
  }

  // Bulk upsert products
  let productsInserted = 0, productsSkipped = 0
  for (const p of products) {
    try {
      const r = await ProductModel.updateOne(
        { code: p.code },
        { $setOnInsert: p },
        { upsert: true }
      )
      if (r.upsertedCount > 0) productsInserted++
      else productsSkipped++
    } catch {
      productsSkipped++
    }
  }

  // Upsert bill templates
  let templatesInserted = 0, templatesSkipped = 0
  for (const t of billTemplates) {
    const exists = await BillTemplateModel.findOne({ name: t.name, brandId: t.brandId })
    if (!exists) {
      await BillTemplateModel.create(t)
      templatesInserted++
    } else {
      templatesSkipped++
    }
  }

  return NextResponse.json({
    success: true,
    logosUpdated,
    products: { inserted: productsInserted, skipped: productsSkipped },
    billTemplates: { inserted: templatesInserted, skipped: templatesSkipped }
  })
}
