export type SessionRefreshMode = 'auto' | 'browser'

export function getDefaultSessionRefreshMode(provider?: string | null): SessionRefreshMode {
  return provider === 'be' || provider === 'shopee' ? 'browser' : 'auto'
}
