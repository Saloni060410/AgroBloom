import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import axios from 'axios'
import { env } from '../config/env.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DEV_FALLBACK_PATH = path.join(__dirname, '../../config/reference.dev.json')

const FRESH_MS = 60 * 60_000       // 1 hour
const STALE_MS = 24 * 60 * 60_000  // 24 hours

const client = axios.create({ baseURL: env.ML_SERVICE_URL, timeout: env.ML_TIMEOUT_MS })
const cache = new Map() // key -> { data, fetchedAt }

export class ReferenceUnavailableError extends Error {
  constructor(message = 'Reference data is unavailable') {
    super(message)
    this.name = 'ReferenceUnavailableError'
    this.status = 503
  }
}

let devFallback = null

function loadDevFallback() {
  if (!devFallback) {
    devFallback = JSON.parse(
      fs.readFileSync(DEV_FALLBACK_PATH, 'utf-8')
    )
  }

  return devFallback
}

async function getCached(key, mlPath) {
  const entry = cache.get(key)
  const now = Date.now()

  if (entry && now - entry.fetchedAt < FRESH_MS) {
    return entry.data
  }

  try {
    const { data } = await client.get(mlPath)
    cache.set(key, { data, fetchedAt: now })
    return data
  } catch {
    if (entry && now - entry.fetchedAt < STALE_MS) {
      return entry.data
    }

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
    const { data } = await client.get(
      '/reference/seasonal-weather',
      { params: { lat, lng, month } }
    )

    cache.set(key, { data, fetchedAt: now })
    return data
  } catch {
    if (entry && now - entry.fetchedAt < STALE_MS) {
      return entry.data
    }

    throw new ReferenceUnavailableError(
      'ML service unreachable and no cached seasonal weather'
    )
  }
}
