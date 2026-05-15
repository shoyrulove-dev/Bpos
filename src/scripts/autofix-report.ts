import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, resolve } from 'path'

type CheckStatus = 'pass' | 'warn' | 'fail' | 'skip'

type CheckResult = {
  name: string
  status: CheckStatus
  summary: string
  details?: Record<string, unknown>
}

type AutofixReport = {
  generatedAt: string
  repoVersion: string
  checks: CheckResult[]
  scraperProbe?: Record<string, unknown>
  summary: {
    pass: number
    warn: number
    fail: number
    skip: number
  }
}

const repoRoot = resolve(__dirname, '..', '..')

function readJson<T>(relativePath: string): T {
  return JSON.parse(readFileSync(resolve(repoRoot, relativePath), 'utf8')) as T
}

function readText(relativePath: string) {
  return readFileSync(resolve(repoRoot, relativePath), 'utf8')
}

function parseOutputPath() {
  const argIndex = process.argv.indexOf('--write')
  if (argIndex >= 0 && process.argv[argIndex + 1]) {
    return resolve(repoRoot, process.argv[argIndex + 1])
  }

  const envPath = process.env.AUTOFIX_REPORT_PATH?.trim()
  return envPath ? resolve(repoRoot, envPath) : null
}

function fileContainsAll(relativePath: string, tokens: string[], name: string, summary: string): CheckResult {
  if (!existsSync(resolve(repoRoot, relativePath))) {
    return { name, status: 'fail', summary: `${relativePath} không tồn tại` }
  }

  const text = readText(relativePath)
  const missing = tokens.filter((token) => !text.includes(token))
  if (missing.length > 0) {
    return {
      name,
      status: 'fail',
      summary,
      details: { missing, relativePath },
    }
  }

  return {
    name,
    status: 'pass',
    summary,
    details: { relativePath, matched: tokens },
  }
}

async function fetchJson(url: string) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 8000)

  try {
    const res = await fetch(url, { signal: controller.signal })
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`)
    }
    return await res.json()
  } finally {
    clearTimeout(timeout)
  }
}

async function probeScraper(scraperUrl: string): Promise<{ check: CheckResult; data?: Record<string, unknown> }> {
  try {
    const [status, storeStatus, events] = await Promise.all([
      fetchJson(`${scraperUrl}/status`),
      fetchJson(`${scraperUrl}/store-status`),
      fetchJson(`${scraperUrl}/events?limit=20`),
    ]) as [
      { version?: string; startedAt?: string; generatedAt?: string; grabSessions?: Array<{ loggedIn?: boolean }>; beSessions?: Array<{ loggedIn?: boolean }> },
      { stores?: Array<{ source?: string; paused?: boolean; loggedIn?: boolean }> },
      { events?: Array<{ label?: string; msg?: string; data?: { source?: string } }> },
    ]

    const grabSessions = status.grabSessions ?? []
    const beSessions = status.beSessions ?? []
    const stores = storeStatus.stores ?? []
    const latestBeEvents = (events.events ?? [])
      .filter((event) => event.data?.source === 'be')
      .slice(0, 5)
      .map((event) => `${event.label ?? '-'}: ${event.msg ?? '-'}`)

    const metrics = {
      version: status.version ?? 'unknown',
      startedAt: status.startedAt ?? null,
      generatedAt: status.generatedAt ?? null,
      grabOnline: grabSessions.filter((session) => session.loggedIn).length,
      grabTotal: grabSessions.length,
      beOnline: beSessions.filter((session) => session.loggedIn).length,
      beTotal: beSessions.length,
      grabPaused: stores.filter((store) => store.source === 'grab' && store.paused).length,
      bePaused: stores.filter((store) => store.source === 'be' && store.paused).length,
      latestBeEvents,
    }

    const allOnline = metrics.grabOnline === metrics.grabTotal && metrics.beOnline === metrics.beTotal

    return {
      check: {
        name: 'scraper-live-probe',
        status: allOnline ? 'pass' : 'warn',
        summary: allOnline ? 'Scraper online đầy đủ cho Grab/Be' : 'Scraper phản hồi nhưng còn account chưa online đủ',
        details: metrics,
      },
      data: metrics,
    }
  } catch (error) {
    return {
      check: {
        name: 'scraper-live-probe',
        status: 'warn',
        summary: 'Không probe được scraper live',
        details: { scraperUrl, error: error instanceof Error ? error.message : String(error) },
      },
    }
  }
}

async function main() {
  const packageJson = readJson<{ version?: string }>('package.json')
  const checks: CheckResult[] = [
    fileContainsAll(
      'src/app/(dashboard)/integrations/page.tsx',
      ['selectedBeAction', 'pause-tomorrow', 'pause-until-reopen', 'Chỉ áp dụng cho Be'],
      'bpos-be-pause-ui',
      'BPOS pause tab đã có action riêng cho Be giống scraper control',
    ),
    fileContainsAll(
      'src/app/api/integrations/pause-store/route.ts',
      ['pause-tomorrow', 'until-reopen', 'normalizePauseDuration'],
      'pause-store-normalization',
      'Route pause-store đã normalize đúng mode Be/Grab',
    ),
    fileContainsAll(
      'src/app/api/integrations/route.ts',
      ['vps-be-scraper', 'browser-scraper', 'scraperSyncStatus'],
      'external-sync-source-map',
      'Integrations API còn map đúng source sync ngoài cho Grab/Be',
    ),
  ]

  let scraperProbe: Record<string, unknown> | undefined
  const scraperUrl = process.env.SCRAPER_CONTROL_URL?.trim()
  if (scraperUrl) {
    const probe = await probeScraper(scraperUrl)
    checks.push(probe.check)
    scraperProbe = probe.data
  } else {
    checks.push({
      name: 'scraper-live-probe',
      status: 'skip',
      summary: 'Bỏ qua probe scraper vì chưa có SCRAPER_CONTROL_URL',
    })
  }

  const summary = checks.reduce(
    (acc, check) => {
      acc[check.status] += 1
      return acc
    },
    { pass: 0, warn: 0, fail: 0, skip: 0 },
  )

  const report: AutofixReport = {
    generatedAt: new Date().toISOString(),
    repoVersion: String(packageJson.version ?? '0.0.0'),
    checks,
    ...(scraperProbe ? { scraperProbe } : {}),
    summary,
  }

  const outputPath = parseOutputPath()
  if (outputPath) {
    mkdirSync(dirname(outputPath), { recursive: true })
    writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  }

  console.log(JSON.stringify(report, null, 2))

  if (summary.fail > 0) {
    process.exitCode = 1
  }
}

void main()