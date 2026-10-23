import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'

// A service that is still starting refuses or fails the first requests, then answers. The reference
// lists must come back anyway, not as "ML service unreachable and no cached copy".
let server
let hits
let failFirst
let failStatus

before(async () => {
  server = http.createServer((req, res) => {
    hits += 1
    if (hits <= failFirst) {
      res.writeHead(failStatus)
      res.end()
      return
    }
    res.writeHead(200, { 'Content-Type': 'application/json' })
    setTimeout(() => res.end(JSON.stringify([{ id: 'wheat', name_en: 'Wheat', varieties: [], stages: [] }])), 30)
  })
  await new Promise((resolve) => server.listen(0, resolve))
  process.env.ML_SERVICE_URL = `http://localhost:${server.address().port}`
  process.env.ML_MODE = 'online'
  process.env.ML_RETRY_DELAYS_MS = '5,5,5'
})

after(() => server.close())

async function freshModule() {
  return import('../src/services/referenceService.js?retry=' + Math.random())
}

test('a 5xx while the ML service starts is retried until it answers', async () => {
  hits = 0
  failFirst = 2
  failStatus = 503
  const mod = await freshModule()
  const crops = await mod.getCrops()
  assert.equal(crops[0].id, 'wheat')
  assert.equal(hits, 3)
})

test('it gives up after the retries and reports the service unreachable', async () => {
  hits = 0
  failFirst = 99
  failStatus = 502
  const mod = await freshModule()
  await assert.rejects(() => mod.getCrops(), { name: 'ReferenceUnavailableError' })
  assert.equal(hits, 4) // the first try and the three retries
})

test('a 4xx is not retried', async () => {
  hits = 0
  failFirst = 99
  failStatus = 404
  const mod = await freshModule()
  await assert.rejects(() => mod.getCrops(), { name: 'ReferenceUnavailableError' })
  assert.equal(hits, 1)
})

test('callers that arrive together share one request', async () => {
  hits = 0
  failFirst = 0
  const mod = await freshModule()
  const [a, b, c] = await Promise.all([mod.getCrops(), mod.getCrops(), mod.getCrops()])
  assert.deepEqual(a, b)
  assert.deepEqual(b, c)
  assert.equal(hits, 1)
})

test('warming the cache fills it so the first page does not wait', async () => {
  hits = 0
  failFirst = 0
  const mod = await freshModule()
  await mod.warmReferenceCache()
  const afterWarm = hits
  assert.equal(afterWarm, 3) // crops, soil ratings, fertilizers
  await mod.getCrops()
  await mod.getSoilRatings()
  await mod.getFertilizers()
  assert.equal(hits, afterWarm)
})
