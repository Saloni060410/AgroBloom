import app from './app.js'
import { env } from './config/env.js'
import { prisma } from './config/db.js'
import { health as mlHealth } from './services/mlService.js'

const server = app.listen(env.PORT, () => {
  process.stdout.write(`AgroBloom backend listening on :${env.PORT}\n`)
  // On a host that sleeps idle services the ML service is asleep too. This request wakes it while
  // the first user request is still being handled; the answer is not needed, so failures are ignored.
  if (env.NODE_ENV === 'production' && env.ML_MODE === 'online') mlHealth().catch(() => {})
})

// Security/reliability pass: without this, `docker compose down`/a container orchestrator's
// SIGTERM killed the process outright -- in-flight requests dropped mid-response, and Prisma's
// own connection pool was never told to close, leaving stale connections on the Postgres side
// until they timed out on their own. `server.close()` stops accepting new connections and lets
// in-flight ones finish; only once that's done (or the process is exiting regardless) is
// Prisma's pool disconnected, then the process exits cleanly. A second SIGTERM (an orchestrator
// escalating because the first one didn't exit fast enough) exits immediately rather than
// hanging a shutdown a second time.
let shuttingDown = false

function shutdown(signal) {
  if (shuttingDown) {
    process.exit(1)
  }
  shuttingDown = true

  process.stdout.write(`${signal} received, shutting down\n`)
  server.close(async () => {
    await prisma.$disconnect()
    process.exit(0)
  })
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
