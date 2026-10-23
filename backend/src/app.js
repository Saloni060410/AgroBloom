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

// This is a JSON API that other origins are allowed to call (the CORS allowlist below decides which). The default
// Cross-Origin-Resource-Policy of same-origin made the browser flag the sign-in page's wake-up ping as blocked.
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }))
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
    // The browser asks permission (an OPTIONS request) before every call that carries the sign-in token, one
    // extra round trip each. Letting it remember the answer for two hours (Chrome's longest) makes repeat
    // visits to a page skip them.
    maxAge: 7200,
  })
)
app.use(express.json({ limit: '100kb' }))
app.use(requestId)
app.use(structuredLogging)
// A page opens with six to nine calls, so 120 a minute was a limit a person moving quickly between pages could reach.
// Sign-in and sign-up keep their own, much stricter limit (routes/auth.routes.js).
app.use(rateLimit({ windowMs: 60_000, limit: 300 }))

app.use('/api', routes)
app.use(notFound)
app.use(errorHandler)

export default app
