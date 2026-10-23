// Runs the backend tests against their OWN database.
//
// The tests empty tables (users, farms, fields, ...). Pointed at the development database that wipes whatever
// is in the running app: the demo farmer, the fields someone just created. So on a developer machine this
// derives `<name>_test` from DATABASE_URL, creates it if it is missing, applies the migrations to it, and runs
// the tests there. In CI (CI=true) DATABASE_URL already is a throwaway database, so it is used as it is.
import { spawn, spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import dotenv from 'dotenv'

dotenv.config({ quiet: true })
const require = createRequire(import.meta.url)
const { PrismaClient } = require('@prisma/client')

const source = process.env.DATABASE_URL
if (!source) {
  process.stderr.write('DATABASE_URL is not set (backend/.env), so there is no database to derive a test one from.\n')
  process.exit(1)
}

let testUrl = source
if (!process.env.CI) {
  const url = new URL(source)
  const name = decodeURIComponent(url.pathname.slice(1))
  const testName = name.endsWith('_test') ? name : `${name}_test`
  url.pathname = `/${testName}`
  testUrl = url.toString()

  // Create the database if it does not exist, through the server's maintenance database.
  const admin = new URL(source)
  admin.pathname = '/postgres'
  const prisma = new PrismaClient({ datasourceUrl: admin.toString() })
  try {
    const found = await prisma.$queryRaw`SELECT 1 AS found FROM pg_database WHERE datname = ${testName}`
    if (found.length === 0) {
      try {
        await prisma.$executeRawUnsafe(`CREATE DATABASE "${testName.replace(/"/g, '')}"`)
        process.stdout.write(`Created the test database ${testName}\n`)
      } catch {
        // The app's database user is often not allowed to create databases. Do not change its rights: say how.
        const role = decodeURIComponent(admin.username)
        process.stderr.write(`The test database ${testName} does not exist and ${role} may not create it.\nCreate it once with an admin account:  createdb -O ${role} ${testName}\n`)
        process.exit(1)
      }
    }
  } finally {
    await prisma.$disconnect()
  }

  const migrate = spawnSync('npx', ['prisma', 'migrate', 'deploy'], { env: { ...process.env, DATABASE_URL: testUrl }, encoding: 'utf-8' })
  if (migrate.status !== 0) {
    process.stderr.write(`Could not migrate the test database ${testName}:\n${migrate.stdout}${migrate.stderr}\n`)
    process.exit(1)
  }
  process.stdout.write(`Running the tests on ${testName}; the ${name} database is not touched.\n`)
}

const child = spawn(process.execPath, ['--test', '--test-concurrency=1', ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: { ...process.env, DATABASE_URL: testUrl },
})
child.on('exit', (code) => process.exit(code ?? 1))
