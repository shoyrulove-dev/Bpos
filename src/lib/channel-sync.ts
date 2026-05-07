import ChannelModel from '@/models/Channel'

type IntegrationChannelInput = {
  provider: string
  brandId: unknown
  hubId?: unknown | null
  externalStoreId?: string | null
  externalStoreName?: string | null
  isActive?: boolean | null
}

const CHANNEL_LABELS: Record<string, string> = {
  grab: 'GrabFood',
  be: 'Be Food',
  shopee: 'Shopee Food',
  xanh_sm: 'Xanh SM',
}

const MARKETPLACE_PROVIDERS = new Set(Object.keys(CHANNEL_LABELS))

export async function ensureChannelForIntegration(input: IntegrationChannelInput) {
  if (!MARKETPLACE_PROVIDERS.has(input.provider) || !input.brandId) return null

  const externalStoreId = input.externalStoreId?.trim() || undefined
  const externalStoreName = input.externalStoreName?.trim() || undefined
  const channelName = externalStoreName || externalStoreId || CHANNEL_LABELS[input.provider]

  const filter: Record<string, unknown> = {
    source: input.provider,
    brandId: input.brandId,
  }

  if (input.hubId) {
    filter.hubId = input.hubId
  }

  const matcher: Record<string, unknown>[] = []
  if (externalStoreId) matcher.push({ externalStoreId })
  if (externalStoreName) {
    matcher.push({ name: externalStoreName })
    matcher.push({ externalStoreName })
  }

  if (matcher.length > 0) {
    filter.$or = matcher
  } else {
    filter.name = channelName
  }

  return ChannelModel.findOneAndUpdate(
    filter,
    {
      $set: {
        name: channelName,
        source: input.provider,
        brandId: input.brandId,
        ...(input.hubId ? { hubId: input.hubId } : {}),
        ...(externalStoreId ? { externalStoreId } : {}),
        ...(externalStoreName ? { externalStoreName } : {}),
        status: input.isActive === false ? 'inactive' : 'active',
      },
      $setOnInsert: {
        connectedAt: new Date(),
      },
    },
    {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true,
    }
  )
}