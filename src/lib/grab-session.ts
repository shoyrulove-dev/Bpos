import type { SessionData } from '@/integrations/types'

function parseStoredJson(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return undefined

  try {
    const parsed = JSON.parse(value) as unknown
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : undefined
  } catch {
    return undefined
  }
}

function unwrapStoredString(value: unknown) {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  if (!trimmed) return ''

  try {
    const parsed = JSON.parse(trimmed) as unknown
    return typeof parsed === 'string' ? parsed.trim() : trimmed
  } catch {
    return trimmed
  }
}

function getCookieValue(session: SessionData, name: string) {
  return session.cookies.find((cookie) => cookie.name === name)?.value?.trim() || undefined
}

function getMerchantResource(localStorage: Record<string, string>) {
  const selectedResource = unwrapStoredString(localStorage.selectedResource)
  if (selectedResource.includes('zeus_merchant:')) {
    return selectedResource
      .split(',')
      .map((part) => part.trim())
      .find((part) => part.startsWith('zeus_merchant:'))
  }

  const userprofileInfo = parseStoredJson(localStorage.userprofileInfo)
  const userProfile = userprofileInfo?.user_profile
  const parentEntityId = typeof userProfile === 'object' && userProfile && !Array.isArray(userProfile)
    ? String((userProfile as Record<string, unknown>).parent_entity_id ?? '').trim()
    : ''
  if (parentEntityId) return `zeus_merchant:${parentEntityId}`

  return undefined
}

function getGrabId(localStorage: Record<string, string>) {
  const userprofileInfo = parseStoredJson(localStorage.userprofileInfo)
  const userProfile = userprofileInfo?.user_profile
  if (!userProfile || typeof userProfile !== 'object' || Array.isArray(userProfile)) return undefined

  const grabId = String((userProfile as Record<string, unknown>).grab_id ?? '').trim()
  return grabId || undefined
}

function getProfileCurrency(localStorage: Record<string, string>) {
  const profileInfo = parseStoredJson(localStorage.profileInfo)
  const currency = String(profileInfo?.currency ?? '').trim()
  return currency || undefined
}

export function enrichGrabSessionExtraHeaders(session: SessionData, fallbackStoreId?: string) {
  const localStorage = session.localStorage ?? {}
  const extraHeaders = { ...(session.extraHeaders ?? {}) }
  const discoveredStoreId = String(
    extraHeaders['x-grab-store-id']
    ?? extraHeaders['x-store-id']
    ?? fallbackStoreId
    ?? ''
  ).trim()

  const merchantResource = getMerchantResource(localStorage)
  const merchantId = String(
    extraHeaders['x-merchant-id']
    ?? (merchantResource ? merchantResource.replace(/^zeus_merchant:/, '') : '')
  ).trim()
  const storeResource = discoveredStoreId ? `zeus_store:${discoveredStoreId}` : ''

  let mexResource = unwrapStoredString(extraHeaders['x-mex-resource'] ?? localStorage.selectedResource)
  if (merchantResource && !mexResource.includes(merchantResource)) {
    mexResource = [merchantResource, mexResource].filter(Boolean).join(',')
  }
  if (storeResource && !mexResource.includes(storeResource)) {
    mexResource = [mexResource, storeResource].filter(Boolean).join(',')
  }

  const bearerToken = (
    extraHeaders.Authorization
    ?? extraHeaders.authorization
    ?? extraHeaders['x-grab-token']
    ?? getCookieValue(session, 'mexusers_authn_token')
  )?.trim()

  if (bearerToken && !extraHeaders.Authorization) {
    extraHeaders.Authorization = bearerToken.startsWith('Bearer ')
      ? bearerToken
      : `Bearer ${bearerToken}`
  }

  if (discoveredStoreId) {
    if (!extraHeaders['x-grab-store-id']) extraHeaders['x-grab-store-id'] = discoveredStoreId
    if (!extraHeaders['x-store-id']) extraHeaders['x-store-id'] = discoveredStoreId
  }
  if (merchantId && !extraHeaders['x-merchant-id']) extraHeaders['x-merchant-id'] = merchantId
  if (mexResource && !extraHeaders['x-mex-resource']) extraHeaders['x-mex-resource'] = mexResource

  const currency = getProfileCurrency(localStorage)
  if (currency && !extraHeaders['x-currency']) extraHeaders['x-currency'] = currency

  const grabId = getGrabId(localStorage)
  if (grabId && !extraHeaders['grab-id']) extraHeaders['grab-id'] = grabId

  if (!extraHeaders['x-client-id']) extraHeaders['x-client-id'] = 'GrabMerchant-Portal'
  if (!extraHeaders['x-grabkit-clientid']) extraHeaders['x-grabkit-clientid'] = 'GrabMerchant-Portal'
  if (!extraHeaders['x-user-type']) extraHeaders['x-user-type'] = 'user-profile'
  if (!extraHeaders['requestsource']) extraHeaders['requestsource'] = 'troyPortal'
  if (!extraHeaders['x-agent']) extraHeaders['x-agent'] = 'mexapp'
  if (!extraHeaders['x-app-platform']) extraHeaders['x-app-platform'] = 'web'
  if (!extraHeaders['x-language']) extraHeaders['x-language'] = 'vn'
  if (!extraHeaders['x-mex-version']) extraHeaders['x-mex-version'] = 'v2'

  return { extraHeaders, discoveredStoreId }
}