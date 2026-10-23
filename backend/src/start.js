// Production entry point: applies database migrations only when there are some to apply, then starts the API.
//
// The container used to run `npx prisma migrate deploy` before every start. That is a second program that has
// to load, connect and check, about a second on a laptop and many times that on a free host with a fraction of
// a CPU, and it ran on every wake-up from sleep although nothing had changed. One count query tells the same
// thing: if every migration folder is already recorded as applied, there is nothing to do. A new database (no
// migrations table), a new migration, or a failed one all differ from the count and still run the real command.
import { spawnSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { prisma } from './config/db.js'

const migrationsDir = fileURLToPath(new URL('../prisma/migrations', import.meta.url))
const onDisk = readdirSync(migrationsDir, { withFileTypes: true }).filter((entry) => entry.isDirectory()).length

async function appliedCount() {
  try {
    const [row] = await prisma.$queryRaw`SELECT count(*)::int AS n FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`
    return row.n
  } catch {
    return -1 // no migrations table yet: a brand-new database
  }
}

const applied = await appliedCount()
if (applied === onDisk) {
  process.stdout.write(`Database is up to date (${applied} migrations), skipping migrate\n`)
} else {
  process.stdout.write(`Applying migrations (${applied < 0 ? 'new database' : `${applied} of ${onDisk} applied`})\n`)
  const result = spawnSync(fileURLToPath(new URL('../node_modules/.bin/prisma', import.meta.url)), ['migrate', 'deploy'], { stdio: 'inherit' })
  if (result.status !== 0) process.exit(result.status ?? 1)
}

await import('./server.js')
