import dotenv from 'dotenv'
import { z } from 'zod'

dotenv.config({ path: process.env.NODE_ENV === 'test' ? '.env.test' : '.env' })

const schema = z.object({
  PORT: z.coerce.number().default(4000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(1),
  JWT_REFRESH_SECRET: z.string().min(1),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('7d'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  ML_SERVICE_URL: z.string().url().default('http://localhost:8001'),
  ML_MODE: z.enum(['online', 'offline']).default('online'),
  // bcrypt work factor for new password hashes. 12 is the default; 10 is the OWASP minimum and about four
  // times faster, which matters on a host that gives the API a fraction of a CPU. A hash keeps the cost it
  // was made with, so changing this never locks anyone out.
  BCRYPT_COST: z.coerce.number().int().min(10).max(14).default(12),
  // How long to wait for the ML service. 5s is plenty when it is always running; a free host that
  // sleeps it needs about a minute for the first request after idle (see docs/DEPLOYMENT.md).
  ML_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
  // Waits (ms, comma separated) between retries of a reference-data request that failed quickly: a
  // refused or reset connection, or a 5xx, while the ML service is starting after a deploy or a sleep.
  ML_RETRY_DELAYS_MS: z
    .string()
    .default('2000,5000,10000')
    .transform((list) => list.split(',').map((ms) => Number(ms.trim())).filter((ms) => Number.isFinite(ms) && ms >= 0)),
  WEATHER_SERVICE_URL: z.string().url().default('https://api.open-meteo.com/v1'),
  GEOCODE_SERVICE_URL: z.string().url().default('https://geocoding-api.open-meteo.com/v1'),
})

export const env = schema.parse(process.env)

// A real allowlist, not just a single trusted origin: CORS_ORIGIN may be one origin (every
// existing .env.example/docker-compose.yml/CI value) or a comma-separated list, for a
// multi-origin deployment (e.g. a deployed frontend plus a local dev server) without a schema
// change. Used by app.js's cors() origin callback, not by any test/doc that reads
// env.CORS_ORIGIN directly (unaffected -- still the raw string).
export const CORS_ORIGINS = env.CORS_ORIGIN.split(',').map((origin) => origin.trim()).filter(Boolean)
