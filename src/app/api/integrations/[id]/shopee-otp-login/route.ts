/**
 * Legacy compatibility route for old Shopee OTP login.
 *
 * ShopeeFood has moved to partner.business.accounts.shopee.vn.
 * We keep this route only so older UI flows fail gracefully and update the
 * integration record toward browser/manual partner-session mode.
 */
import { NextRequest } from 'next/server'
import { connectDB } from '@/lib/db'
import IntegrationModel from '@/models/Integration'
import { ok, err, requireAdmin } from '@/lib/api-helpers'

type ShopeeLoginBody = {
  step?: 'login' | 'otp'
  phone?: string
  username?: string
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const { res } = await requireAdmin(req)
  if (res) return res

  await connectDB()
  const integ = await IntegrationModel.findById(params.id)
  if (!integ) return err('Khong tim thay integration', 404)
  if (integ.provider !== 'shopee') return err('Chi dung cho Shopee Food')

  const body = (await req.json()) as ShopeeLoginBody
  const loginUsername = String(body.username ?? body.phone ?? integ.loginUsername ?? '').trim()

  await IntegrationModel.updateOne(
    { _id: params.id },
    {
      $set: {
        loginMode: 'auto',
        sessionRefreshMode: 'browser',
        ...(loginUsername ? { loginUsername } : {}),
        sessionError: 'Shopee da chuyen sang partner.business.accounts.shopee.vn. Hay dung browser/manual session hoac auto-login partner flow.',
      },
    },
  )

  return ok({
    success: false,
    requiresOtp: false,
    message: 'Shopee cu khong con dung OTP merchant.shopeefood.vn nua. Hay dang nhap qua partner.business.accounts.shopee.vn va luu browser session.',
    nextStep: {
      mode: 'partner-browser',
      loginUrl: 'https://partner.business.accounts.shopee.vn/',
      orderManagementUrl: 'https://partner.shopee.vn/shopee-food/order-management',
      businessHoursUrl: 'https://partner.shopee.vn/settings/shopee-food/business-hours',
    },
  })
}
