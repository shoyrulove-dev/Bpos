import { CircleHelp, Pause, WifiOff } from 'lucide-react'
import { cn } from '@/lib/utils'

type PlatformStatusTone = 'active' | 'paused' | 'offline' | 'unknown' | 'inactive'

const TONE_CLASS: Record<PlatformStatusTone, string> = {
  active: 'text-green-500',
  paused: 'text-amber-500',
  offline: 'text-red-500',
  unknown: 'text-gray-400',
  inactive: 'text-gray-300',
}

export function PlatformStatusIcon({
  status,
  title,
  className,
}: {
  status: PlatformStatusTone
  title: string
  className?: string
}) {
  if (status === 'paused') {
    return (
      <span className="inline-flex shrink-0" title={title} aria-label={title}>
        <Pause className={cn('h-3.5 w-3.5', TONE_CLASS[status], className)} />
      </span>
    )
  }

  if (status === 'offline') {
    return (
      <span className="inline-flex shrink-0" title={title} aria-label={title}>
        <WifiOff className={cn('h-3.5 w-3.5', TONE_CLASS[status], className)} />
      </span>
    )
  }

  if (status === 'unknown') {
    return (
      <span className="inline-flex shrink-0" title={title} aria-label={title}>
        <CircleHelp className={cn('h-3.5 w-3.5', TONE_CLASS[status], className)} />
      </span>
    )
  }

  return (
    <span
      className={cn('inline-block h-2.5 w-2.5 shrink-0 rounded-full', TONE_CLASS[status].replace('text-', 'bg-'), className)}
      title={title}
      aria-label={title}
    />
  )
}
