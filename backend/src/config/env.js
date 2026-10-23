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
  // How long to wait for the ML service. 5s is plenty when it is always running; a free host that
  // sleeps it needs about a minute for the first request after idle (see docs/DEPLOYMENT.md).
  ML_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
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
