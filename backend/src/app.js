import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import { CORS_ORIGINS, env } from './config/env.js'
import routes from './routes/index.js'
import { errorHandler, notFound } from './middleware/error.middleware.js'
import { requestId, structuredLogging } from './middleware/logging.middleware.js'

const app = express()

// Behind a host's load balancer every request arrives from the proxy's address. Trusting one hop
// makes req.ip (and so the rate limiter) the real client, not one shared bucket for everybody.
if (env.NODE_ENV === 'production') app.set('trust proxy', 1)

app.use(helmet())
app.use(
  cors({
    // A real allowlist (CORS_ORIGINS, comma-separated in CORS_ORIGIN), not one trusted string:
    // `origin` is undefined for same-origin/non-browser requests (curl, the test suite's own
    // fetch calls, server-to-server) -- always allowed, matching cors()'s own documented default
    // behavior before this change. A browser request that sends an Origin header must match the
    // allowlist exactly or the request is rejected with a real Error (never silently reflects an
    // unrecognized origin back).
    origin(origin, callback) {
      if (!origin || CORS_ORIGINS.includes(origin)) return callback(null, true)
      const err = new Error(`Origin not allowed: ${origin}`)
      err.status = 403
      callback(err)
    },
  })
)
app.use(express.json({ limit: '100kb' }))
app.use(requestId)
app.use(structuredLogging)
app.use(rateLimit({ windowMs: 60_000, limit: 120 }))

app.use('/api', routes)
app.use(notFound)
app.use(errorHandler)

export default app
