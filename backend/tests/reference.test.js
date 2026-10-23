import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { runInFreshProcess } from './helpers/runInFreshProcess.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const servicePath = path.join(__dirname, '../src/services/referenceService.js')

let server
let hits
let available

before(async () => {
  hits = 0
  available = true

  server = http.createServer((req, res) => {
    hits += 1

    if (!available) {
      res.writeHead(503)
      res.end()
      return
    }

    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(
      JSON.stringify([
        {
          id: 'wheat',
          name_en: 'Wheat',
          varieties: [],
          stages: [],
        },
      ])
    )
  })

  await new Promise((resolve) => server.listen(0, resolve))

  process.env.ML_SERVICE_URL =
    `http://localhost:${server.address().port}`
  process.env.ML_MODE = 'online'
  process.env.ML_RETRY_DELAYS_MS = '1,1'
})

after(() => server.close())

test('getCrops fetches from ML once, then serves from cache', async () => {
  const { getCrops } =
    await import('../src/services/referenceService.js')

  const first = await getCrops()
  const second = await getCrops()

  assert.equal(hits, 1)
  assert.deepEqual(first, second)
})

test('serves a stale copy while ML is down, then the bundled snapshot once past 24h', async () => {
  const mod =
    await import('../src/services/referenceService.js?stale=' + Date.now())

  await mod.getCrops()

  available = false

  const originalNow = Date.now
  const start = originalNow()

  Date.now = () => start + 2 * 60 * 60_000

  const stale = await mod.getCrops()

  assert.equal(stale[0].id, 'wheat')

  Date.now = () => start + 25 * 60 * 60_000

  // No copy left to show: the bundled snapshot (all seven crops) rather than a 503.
  const snapshot = await mod.getCrops()

  assert.equal(snapshot.length, 7)

  Date.now = originalNow
})

test('ML_MODE=offline serves backend/config/reference.dev.json without calling ML', async () => {
  // A genuine fresh process, not a mid-process process.env mutation + cache-busted
  // re-import: src/config/env.js parses process.env exactly once, into a frozen `env`
  // object, the moment anything first imports it -- which the two tests above already did
  // (with ML_MODE='online'), so mutating process.env.ML_MODE here and re-importing
  // referenceService.js with a `?offline=` query string does NOT work: that cache-busted
  // copy still resolves the *same*, already-cached env.js, still reporting 'online'. See
  // tests/helpers/runInFreshProcess.js.
  const output = await runInFreshProcess({
    env: { ML_MODE: 'offline' },
    servicePath,
    script: 'async (mod) => mod.getFertilizers()',
  })

  assert.equal(output.ok, true, output.message)
  assert.ok(output.result.some((f) => f.id === 'urea'))
})