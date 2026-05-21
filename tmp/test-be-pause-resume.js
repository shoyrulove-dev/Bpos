/**
 * E2E test: Be pause / resume
 *
 * Chạy trực tiếp qua scraper (port 3845) — không cần xác thực Bpos.
 *
 *   node tmp/test-be-pause-resume.js
 *
 * Options (env):
 *   SCRAPER_URL=http://127.0.0.1:3845   (mặc định)
 *   STORE_ID=<externalStoreId>          (bỏ qua để auto-pick store Be đầu tiên)
 *   DRY_RUN=1                           (chỉ xem store, không thực hiện pause/resume)
 */

const SCRAPER_URL  = process.env.SCRAPER_URL  ?? 'http://127.0.0.1:3845'
const TARGET_STORE = process.env.STORE_ID     ?? ''
const DRY_RUN      = process.env.DRY_RUN      === '1'
const POLL_MS      = 4_000   // khoảng cách mỗi lần poll
const MAX_POLLS    = 15      // tối đa ~60 giây chờ

// ─── helpers ────────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

async function apiFetch(path, body) {
  const opts = body
    ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
    : { method: 'GET' }
  const res = await fetch(`${SCRAPER_URL}${path}`, opts)
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${path}`)
  return res.json()
}

async function getStores() {
  const data = await apiFetch('/store-status')
  if (!Array.isArray(data.stores)) throw new Error('Scraper /store-status không trả về mảng stores')
  return data.stores
}

function isBeStore(s) {
  const src = String(s.source ?? '').toLowerCase()
  return src === 'be' || src === 'befood'
}

function findStore(stores, target) {
  if (target) {
    const found = stores.find(s =>
      isBeStore(s) &&
      (String(s.storeId ?? '') === target || String(s.integrationId ?? '') === target || String(s.label ?? '') === target)
    )
    if (!found) throw new Error(`Không tìm thấy store Be với id/label "${target}"`)
    return found
  }
  const beStores = stores.filter(s => isBeStore(s) && s.loggedIn !== false)
  if (!beStores.length) throw new Error('Không có store Be nào đang online. Kiểm tra scraper đã đăng nhập chưa.')
  return beStores[0]
}

function storeKey(s) {
  return s.integrationId ?? s.storeId ?? s.label
}

async function pollUntil(label, predicate) {
  for (let i = 1; i <= MAX_POLLS; i++) {
    await sleep(POLL_MS)
    const stores = await getStores()
    const s = stores.find(st => storeKey(st) === storeKey._target)
    if (s && predicate(s)) {
      console.log(`  ✅ ${label} (lần ${i})`)
      return s
    }
    const status = s ? `paused=${s.paused} loggedIn=${s.loggedIn}` : '(không tìm thấy trong danh sách)'
    console.log(`  ⏳ ${label} — ${status} (${i}/${MAX_POLLS})`)
  }
  throw new Error(`Timeout sau ${MAX_POLLS} lần poll: ${label}`)
}

// ─── test steps ─────────────────────────────────────────────────────────────

async function stepVersion() {
  try {
    const data = await apiFetch('/version')
    console.log(`  Scraper version: ${data.version ?? '(không có)'}`)
  } catch {
    console.log('  (endpoint /version không tồn tại — bỏ qua)')
  }
}

async function stepListStores() {
  const stores = await getStores()
  const beStores = stores.filter(isBeStore)
  console.log(`  Tổng stores Be: ${beStores.length}`)
  for (const s of beStores) {
    const status = s.loggedIn === false ? '🔴 offline' : s.paused ? '⏸ paused' : '🟢 active'
    console.log(`    ${status}  ${s.label ?? s.storeId ?? '?'}  (id=${s.integrationId ?? s.storeId ?? '-'})`)
  }
  return stores
}

async function stepPause(store, duration = 'until-reopen') {
  console.log(`  Gửi pause (duration=${duration})…`)
  const body = {
    source: 'be',
    duration,
    ...(store.integrationId ? { integrationId: store.integrationId } : {}),
    ...(store.storeId       ? { storeId: store.storeId }             : {}),
  }
  const res = await apiFetch('/pause-store', body)
  console.log(`  Response:`, JSON.stringify(res))
  if (res.ok === false) throw new Error(`Pause thất bại: ${res.message ?? JSON.stringify(res)}`)
}

async function stepResume(store) {
  console.log('  Gửi resume…')
  const body = {
    source: 'be',
    ...(store.integrationId ? { integrationId: store.integrationId } : {}),
    ...(store.storeId       ? { storeId: store.storeId }             : {}),
  }
  const res = await apiFetch('/resume-store', body)
  console.log(`  Response:`, JSON.stringify(res))
  if (res.ok === false) throw new Error(`Resume thất bại: ${res.message ?? JSON.stringify(res)}`)
}

// ─── main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('══════════════════════════════════════════════════')
  console.log(' E2E Test: Be Pause / Resume')
  console.log(` Scraper: ${SCRAPER_URL}`)
  if (TARGET_STORE) console.log(` Target store: ${TARGET_STORE}`)
  if (DRY_RUN) console.log(' DRY_RUN=1 — chỉ liệt kê, không thực hiện action')
  console.log('══════════════════════════════════════════════════\n')

  console.log('[0] Kiểm tra scraper version')
  await stepVersion()

  console.log('\n[1] Danh sách store Be hiện tại')
  const stores = await stepListStores()

  const store = findStore(stores, TARGET_STORE)
  console.log(`\n→ Store được chọn để test: "${store.label ?? store.storeId}"`)
  console.log(`  integrationId=${store.integrationId ?? '-'}  storeId=${store.storeId ?? '-'}`)
  console.log(`  loggedIn=${store.loggedIn}  paused=${store.paused}`)

  if (DRY_RUN) {
    console.log('\nDRY_RUN — kết thúc.')
    return
  }

  // Gán target cho pollUntil
  storeKey._target = storeKey(store)

  // ── Bước 2: Pause ──────────────────────────────────────────────────────────
  if (store.paused) {
    console.log('\n[2] Store đang paused — bỏ qua bước pause, sẽ test resume trước')
  } else {
    console.log('\n[2] PAUSE store')
    await stepPause(store)

    console.log('\n[3] Poll cho đến khi paused…')
    await pollUntil('Store đã paused', s => s.paused === true)
  }

  // ── Bước 3: Resume ────────────────────────────────────────────────────────
  console.log('\n[4] RESUME store')
  await stepResume(store)

  console.log('\n[5] Poll cho đến khi resumed…')
  await pollUntil('Store đã resumed', s => s.paused === false)

  // ── Bước 4 (tuỳ chọn): Pause lại về trạng thái ban đầu ────────────────
  if (store.paused) {
    console.log('\n[6] Pause lại về trạng thái ban đầu')
    await stepPause(store, store.pauseMode ?? 'until-reopen')
    await pollUntil('Store đã paused trở lại', s => s.paused === true)
  }

  console.log('\n══════════════════════════════════════════════════')
  console.log(' ✅ E2E test PASSED — Be pause/resume hoạt động đúng')
  console.log('══════════════════════════════════════════════════')
}

main().catch(err => {
  console.error('\n❌ E2E test FAILED:', err.message)
  process.exit(1)
})
