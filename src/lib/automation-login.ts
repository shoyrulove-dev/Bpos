import type { SessionData } from '@/integrations/types'

export type AutomationLoginResponse = {
  success?: boolean
  session?: SessionData
  orders?: unknown[]
  requiresOtp?: boolean
  otpTarget?: string
  sessionKey?: string
  error?: string
  token?: string
  expiresAt?: string | number
  extraHeaders?: Record<string, string>
  storeId?: string | number
  storeName?: string
}

type AutomationLoginRequestOptions = {
  automationUrl: string
  automationSecret: string
  provider: string
  body: Record<string, unknown>
  timeoutMs?: number
  maxGrabRetries?: number
}

export type AutomationLoginResult = {
  serviceRes: Response
  data: AutomationLoginResponse | null
  parseError?: string
}

function shouldRetryGrabLogin(data: AutomationLoginResponse | null, parseError?: string) {
  const message = `${parseError ?? ''} ${data?.error ?? ''}`.toLowerCase()
  return message.includes('khong lay duoc phien hop le')
    || message.includes('không lấy được phiên hợp lệ')
    || message.includes('invalid auth state')
}

async function parseAutomationLoginResponse(serviceRes: Response): Promise<{
  data: AutomationLoginResponse | null
  parseError?: string
}> {
  const raw = await serviceRes.text()
  const trimmed = raw.trim()

  if (!trimmed) {
    return {
      data: null,
      parseError: `Automation service trả về rỗng (${serviceRes.status})`,
    }
  }

  try {
    return {
      data: JSON.parse(trimmed) as AutomationLoginResponse,
    }
  } catch {
    return {
      data: null,
      parseError: `Automation service trả về JSON không hợp lệ (${serviceRes.status})`,
    }
  }
}

export async function requestAutomationLogin(options: AutomationLoginRequestOptions): Promise<AutomationLoginResult> {
  const {
    automationUrl,
    automationSecret,
    provider,
    body,
    timeoutMs = 120_000,
    maxGrabRetries = 2,
  } = options

  const maxAttempts = provider === 'grab' ? Math.max(1, maxGrabRetries + 1) : 1
  let lastResult: AutomationLoginResult | null = null

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const serviceRes = await fetch(`${automationUrl}/api/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${automationSecret}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    })

    const parsed = await parseAutomationLoginResponse(serviceRes)
    lastResult = {
      serviceRes,
      data: parsed.data,
      parseError: parsed.parseError,
    }

    if (provider !== 'grab' || attempt >= maxAttempts || !shouldRetryGrabLogin(parsed.data, parsed.parseError)) {
      return lastResult
    }
  }

  if (!lastResult) {
    throw new Error('Automation login không trả về kết quả')
  }

  return lastResult
}