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

function buildChannelFilter(input: IntegrationChannelInput) {
  if (!MARKETPLACE_PROVIDERS.has(input.provider) || !input.brandId) return null

  const externalStoreId = input.externalStoreId?.trim() || undefined
  const externalStoreName = input.externalStoreName?.trim() || undefined

  // Avoid creating ambiguous placeholder channels before the real store identity is known.
  if (!externalStoreId && !externalStoreName) return null

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

  filter.$or = matcher
  return { filter, externalStoreId, externalStoreName }
}

export async function ensureChannelForIntegration(input: IntegrationChannelInput) {
  const built = buildChannelFilter(input)
  if (!built) return null

  const channelName = built.externalStoreName || built.externalStoreId || CHANNEL_LABELS[input.provider]

  return ChannelModel.findOneAndUpdate(
    built.filter,
    {
      $set: {
        name: channelName,
        source: input.provider,
        brandId: input.brandId,
        ...(input.hubId ? { hubId: input.hubId } : {}),
        ...(built.externalStoreId ? { externalStoreId: built.externalStoreId } : {}),
        ...(built.externalStoreName ? { externalStoreName: built.externalStoreName } : {}),
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

export async function deleteChannelForIntegration(input: IntegrationChannelInput) {
  const built = buildChannelFilter(input)
  if (!built) return null
  return ChannelModel.deleteMany(built.filter)
}
