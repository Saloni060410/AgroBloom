import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'

// An ML service that is waking up answers after a long delay. A page must not wait for it: with no cached
// copy, the API answers from the bundled snapshot after a short wait, and the cache fills when ML answers.
let server
let hits

before(async () => {
  hits = 0
  server = http.createServer((req, res) => {
    hits += 1
    setTimeout(() => {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify([{ id: 'from-ml', name_en: 'From ML', varieties: [], stages: [] }]))
    }, 600)
  })
  await new Promise((resolve) => server.listen(0, resolve))
  process.env.ML_SERVICE_URL = `http://localhost:${server.address().port}`
  process.env.ML_MODE = 'online'
  process.env.ML_REFERENCE_WAIT_MS = '100'
  process.env.ML_RETRY_DELAYS_MS = '1'
})

after(() => server.close())

test('a slow ML service gets the snapshot now and the real answer cached a moment later', async () => {
  const mod = await import('../src/services/referenceService.js')

  const started = Date.now()
  const first = await mod.getCrops()
  assert.ok(Date.now() - started < 450, 'should not have waited for the slow service')
  assert.equal(first.length, 7)
  assert.ok(first.some((crop) => crop.id === 'rice'))

  await new Promise((resolve) => setTimeout(resolve, 900))
  const second = await mod.getCrops()
  assert.equal(second[0].id, 'from-ml') // the background request filled the cache
  assert.equal(hits, 1)
})

test('the bundled snapshot has every crop, the soil ratings and the products a plan can use', async () => {
  const { default: snapshot } = await import('../src/data/reference.snapshot.json', { with: { type: 'json' } })
  assert.deepEqual(
    snapshot.crops.map((crop) => crop.id).sort(),
    ['barley', 'chickpea', 'cotton', 'maize', 'rice', 'sugarcane', 'wheat']
  )
  assert.ok(snapshot.soilRatings.length > 0)
  assert.ok(['urea', 'dap', 'mop', 'ssp'].every((id) => snapshot.fertilizers.some((f) => f.id === id)))
})
