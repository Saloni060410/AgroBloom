import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import axios from 'axios'
import { env } from '../config/env.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DEV_FALLBACK_PATH = path.join(__dirname, '../../config/reference.dev.json')
// Not the dev fallback above: that is a hand-written sample for offline development. This is exported from
// the ML service's own data (ml/scripts/export_reference_snapshot.py) and a test keeps it current. It lives
// under src/ because the Docker image only copies src/ and prisma/.
const SNAPSHOT_PATH = path.join(__dirname, '../data/reference.snapshot.json')

const FRESH_MS = 60 * 60_000       // 1 hour
const STALE_MS = 24 * 60 * 60_000  // 24 hours

const client = axios.create({ baseURL: env.ML_SERVICE_URL, timeout: env.ML_TIMEOUT_MS })
const cache = new Map() // key -> { data, fetchedAt }
const inflight = new Map() // key -> the request already on its way, so concurrent callers share it

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export class ReferenceUnavailableError extends Error {
  constructor(message = 'Reference data is unavailable') {
    super(message)
    this.name = 'ReferenceUnavailableError'
    this.status = 503
  }
}

let devFallback = null
let snapshot = null

function snapshotFor(key) {
  if (snapshot === null) {
    try {
      snapshot = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf-8'))
    } catch {
      snapshot = {}
    }
  }

  return snapshot[key] ?? null
}

// What went wrong, in the host's log. The error used to be swallowed, which left "unreachable" with no cause.
function logReferenceProblem(key, outcome, err) {
  process.stdout.write(
    `${JSON.stringify({
      event: 'ml_reference',
      key,
      outcome,
      status: err?.response?.status ?? null,
      code: err?.code ?? null,
      message: err?.message ?? null,
    })}\n`
  )
}

function loadDevFallback() {
  if (!devFallback) {
    devFallback = JSON.parse(
      fs.readFileSync(DEV_FALLBACK_PATH, 'utf-8')
    )
  }

  return devFallback
}

// A failure that comes back quickly (connection refused or reset, a 5xx from the host's proxy) is what a
// service that is still starting looks like, and trying again a few seconds later works. A timeout has
// already waited as long as we are willing to, and a 4xx will not get better.
function worthRetrying(err) {
  if (err.response) return err.response.status >= 500
  return err.code !== 'ECONNABORTED' && err.code !== 'ETIMEDOUT'
}

async function fetchWithRetry(mlPath, params) {
  const delays = env.ML_RETRY_DELAYS_MS
  for (let attempt = 0; ; attempt += 1) {
    try {
      const { data } = await client.get(mlPath, params ? { params } : undefined)
      return data
    } catch (err) {
      if (attempt >= delays.length || !worthRetrying(err)) throw err
      await sleep(delays[attempt])
    }
  }
}

// One request per key at a time: the soil-test page asks for crops, ratings and fertilizers together, and
// several people can arrive while the ML service is waking up. They wait for the same answer.
function fetchShared(key, mlPath, params) {
  if (!inflight.has(key)) {
    const request = fetchWithRetry(mlPath, params)
      .then((data) => {
        cache.set(key, { data, fetchedAt: Date.now() })
        return data
      })
      .finally(() => inflight.delete(key))
    inflight.set(key, request)
  }
  return inflight.get(key)
}

async function getCached(key, mlPath) {
  const entry = cache.get(key)
  const now = Date.now()

  if (entry && now - entry.fetchedAt < FRESH_MS) {
    return entry.data
  }

  const request = fetchShared(key, mlPath)
  const bundled = snapshotFor(key)

  // Nobody has a copy to show. A service that is waking can take a minute, so after a short wait answer
  // from the bundled snapshot and let the request finish in the background to fill the cache.
  if (!entry && bundled) {
    const outcome = await Promise.race([
      request.then((data) => ({ data }), (err) => ({ err })),
      sleep(env.ML_REFERENCE_WAIT_MS).then(() => ({ late: true })),
    ])

    if (outcome.data) return outcome.data

    logReferenceProblem(key, outcome.late ? 'slow, served snapshot' : 'failed, served snapshot', outcome.err)
    return bundled
  }

  try {
    return await request
  } catch (err) {
    if (entry && now - entry.fetchedAt < STALE_MS) {
      logReferenceProblem(key, 'failed, served stale copy', err)
      return entry.data
    }

    logReferenceProblem(key, bundled ? 'failed, served snapshot' : 'failed, no copy', err)
    if (bundled) return bundled

    throw new ReferenceUnavailableError(
      `ML service unreachable and no cached copy for ${key}`
    )
  }
}

export function getCrops() {
  if (env.ML_MODE === 'offline') {
    return loadDevFallback().crops
  }

  return getCached('crops', '/reference/crops')
}

export function getSoilRatings() {
  if (env.ML_MODE === 'offline') {
    return loadDevFallback().soilRatings
  }

  return getCached('soilRatings', '/reference/soil-ratings')
}

export function getFertilizers() {
  if (env.ML_MODE === 'offline') {
    return loadDevFallback().fertilizers
  }

  return getCached('fertilizers', '/reference/fertilizers')
}

// Used internally by J7's weather fallback chain — not exposed as its own route.
export async function seasonalWeather(lat, lng, month) {
  if (env.ML_MODE === 'offline') {
    return loadDevFallback().seasonalWeather[String(month)]
  }

  // Bucket by whole-degree lat/lng so nearby fields share a cache entry.
  const key = `seasonalWeather:${Math.round(lat)}:${Math.round(lng)}:${month}`
  const entry = cache.get(key)
  const now = Date.now()

  if (entry && now - entry.fetchedAt < FRESH_MS) {
    return entry.data
  }

  try {
    return await fetchShared(key, '/reference/seasonal-weather', { lat, lng, month })
  } catch (err) {
    if (entry && now - entry.fetchedAt < STALE_MS) {
      return entry.data
    }

    logReferenceProblem(key, 'failed, no copy', err)

    throw new ReferenceUnavailableError(
      'ML service unreachable and no cached seasonal weather'
    )
  }
}

// Fetches the three lists the screens need as soon as the server is up, so the cache is warm before the
// first person opens a page. On a host that sleeps the ML service this also wakes it. Failures are left
// for the first real request to report: it retries on its own.
export async function warmReferenceCache() {
  await Promise.allSettled([getCrops(), getSoilRatings(), getFertilizers()])
}
