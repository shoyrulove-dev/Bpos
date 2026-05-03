import type { PlatformAdapter } from './types'
import { ShopeeAdapter } from './shopee'
import { GrabAdapter }   from './grab'
import { XanhSMAdapter } from './xanh-sm'
import { BeAdapter }     from './be'

const adapters = new Map<string, PlatformAdapter>()
adapters.set('shopee',  new ShopeeAdapter())
adapters.set('grab',    new GrabAdapter())
adapters.set('xanh_sm', new XanhSMAdapter())
adapters.set('be',      new BeAdapter())

export function getAdapter(source: string): PlatformAdapter | undefined {
  return adapters.get(source)
}

export function getAllAdapters(): PlatformAdapter[] {
  return Array.from(adapters.values())
}

export function getSupportedSources(): string[] {
  return Array.from(adapters.keys())
}
