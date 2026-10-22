import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import app from '../src/app.js'
import { prisma } from '../src/config/db.js'

let server, baseUrl

before(() => {
  server = app.listen(0)
  baseUrl = `http://localhost:${server.address().port}/api`
})

after(async () => {
  server.close()
  await prisma.$disconnect()
})

beforeEach(async () => {
  await prisma.fertilizerLog.deleteMany()
  await prisma.recommendation.deleteMany()
  await prisma.soilTest.deleteMany()
  await prisma.field.deleteMany()
  await prisma.farm.deleteMany()
  await prisma.refreshToken.deleteMany()
  await prisma.user.deleteMany()
})

const authed = (token) => ({ Authorization: `Bearer ${token}` })

async function registerUser(email) {
  const res = await fetch(`${baseUrl}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'a-strong-password', name: 'Tester', role: 'FARMER' }),
  })
  return res.json()
}

test('owner CRUD: farm -> field -> soil test -> fertilizer log', async () => {
  const user = await registerUser('ownerA@test.dev')

  const farmRes = await fetch(`${baseUrl}/farms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authed(user.accessToken) },
    body: JSON.stringify({ name: 'A Farm' }),
  })
  const farm = await farmRes.json()
  assert.equal(farmRes.status, 201)

  const fieldRes = await fetch(`${baseUrl}/farms/${farm.id}/fields`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authed(user.accessToken) },
    body: JSON.stringify({ name: 'A Field', cropType: 'wheat', growthStage: 'sowing' }),
  })
  const field = await fieldRes.json()
  assert.equal(fieldRes.status, 201)

  const soilRes = await fetch(`${baseUrl}/fields/${field.id}/soil-tests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authed(user.accessToken) },
    body: JSON.stringify({ n: 210, p: 9, k: 90, ph: 7.4, organicCarbon: 0.42, moisture: 18 }),
  })
  assert.equal(soilRes.status, 201)

  const logRes = await fetch(`${baseUrl}/fields/${field.id}/fertilizer-logs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authed(user.accessToken) },
    body: JSON.stringify({ type: 'urea', quantityKgPerAcre: 100, appliedOn: '2026-03-10' }),
  })
  assert.equal(logRes.status, 201)

  const listRes = await fetch(`${baseUrl}/fields/${field.id}/soil-tests`, { headers: authed(user.accessToken) })
  const list = await listRes.json()
  assert.equal(list.total, 1)
})

test('another user gets 404 on someone else\'s farm, field, soil tests and logs', async () => {
  const owner = await registerUser('ownerB@test.dev')
  const other = await registerUser('otherB@test.dev')

  const farm = await prisma.farm.create({ data: { name: 'B Farm', ownerId: owner.user.id } })
  const field = await prisma.field.create({
    data: { name: 'B Field', farmId: farm.id, cropType: 'wheat', growthStage: 'sowing' },
  })
  await prisma.soilTest.create({
    data: { fieldId: field.id, n: 210, p: 9, k: 90, ph: 7.4, organicCarbon: 0.42, moisture: 18 },
  })

  assert.equal((await fetch(`${baseUrl}/farms/${farm.id}`, { headers: authed(other.accessToken) })).status, 404)
  assert.equal((await fetch(`${baseUrl}/fields/${field.id}`, { headers: authed(other.accessToken) })).status, 404)
  assert.equal(
    (await fetch(`${baseUrl}/fields/${field.id}/soil-tests`, { headers: authed(other.accessToken) })).status,
    404
  )
  assert.equal(
    (
      await fetch(`${baseUrl}/fields/${field.id}/fertilizer-logs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authed(other.accessToken) },
        body: JSON.stringify({ type: 'urea', quantityKgPerAcre: 50, appliedOn: '2026-01-01' }),
      })
    ).status,
    404
  )
})

test('invalid soil test body returns 422 with details', async () => {
  const user = await registerUser('invalid@test.dev')
  const farm = await prisma.farm.create({ data: { name: 'Farm', ownerId: user.user.id } })
  const field = await prisma.field.create({
    data: { name: 'Field', farmId: farm.id, cropType: 'wheat', growthStage: 'sowing' },
  })

  const res = await fetch(`${baseUrl}/fields/${field.id}/soil-tests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authed(user.accessToken) },
    body: JSON.stringify({ n: 210, p: 9, k: 90, ph: 15, organicCarbon: 0.42, moisture: 18 }),
  })
  const data = await res.json()
  assert.equal(res.status, 422)
  assert.ok(data.details && typeof data.details === 'object')
  assert.ok(data.details.fieldErrors.ph)
})

test('fertilizer log with a future date returns 422', async () => {
  const user = await registerUser('future@test.dev')
  const farm = await prisma.farm.create({ data: { name: 'Farm', ownerId: user.user.id } })
  const field = await prisma.field.create({
    data: { name: 'Field', farmId: farm.id, cropType: 'wheat', growthStage: 'sowing' },
  })

  const future = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)
  const res = await fetch(`${baseUrl}/fields/${field.id}/fertilizer-logs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authed(user.accessToken) },
    body: JSON.stringify({ type: 'urea', quantityKgPerAcre: 50, appliedOn: future }),
  })
  assert.equal(res.status, 422)
})

test('a farm can hold several crop fields, and deleting one leaves the rest', async () => {
  const user = await registerUser('multicrop@test.dev')
  const farm = await prisma.farm.create({ data: { name: 'North Plot', ownerId: user.user.id } })
  const headers = { 'Content-Type': 'application/json', ...authed(user.accessToken) }

  const created = []
  for (const [name, cropType] of [['North Plot', 'wheat'], ['North Plot \u2013 Chickpea', 'chickpea']]) {
    const res = await fetch(`${baseUrl}/farms/${farm.id}/fields`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ name, cropType, growthStage: 'sowing' }),
    })
    assert.equal(res.status, 201)
    created.push(await res.json())
  }
  await prisma.soilTest.create({
    data: { fieldId: created[1].id, n: 210, p: 9, k: 90, ph: 7.4, organicCarbon: 0.42, moisture: 18 },
  })

  const listed = await (await fetch(`${baseUrl}/farms/${farm.id}/fields`, { headers: authed(user.accessToken) })).json()
  assert.equal(listed.total, 2)

  const del = await fetch(`${baseUrl}/fields/${created[1].id}`, { method: 'DELETE', headers: authed(user.accessToken) })
  assert.equal(del.status, 204)

  const after = await (await fetch(`${baseUrl}/farms/${farm.id}/fields`, { headers: authed(user.accessToken) })).json()
  assert.deepEqual(after.items.map((f) => f.id), [created[0].id])
  assert.equal(await prisma.soilTest.count({ where: { fieldId: created[1].id } }), 0)
})

test('another user cannot delete someone else\'s field', async () => {
  const owner = await registerUser('delOwner@test.dev')
  const other = await registerUser('delOther@test.dev')
  const farm = await prisma.farm.create({ data: { name: 'Farm', ownerId: owner.user.id } })
  const field = await prisma.field.create({ data: { name: 'Field', farmId: farm.id, cropType: 'wheat', growthStage: 'sowing' } })

  const res = await fetch(`${baseUrl}/fields/${field.id}`, { method: 'DELETE', headers: authed(other.accessToken) })
  assert.equal(res.status, 404)
  assert.equal(await prisma.field.count({ where: { id: field.id } }), 1)
})
