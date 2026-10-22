import test from 'node:test'
import assert from 'node:assert/strict'
import { soilTestState, stageAt, seasonDays } from '../src/utils/soilTestStatus.js'

const wheat = { cropType: 'wheat', sowingDate: '2026-11-15' } // season about 140 days
const on = (d) => new Date(`${d}T12:00:00Z`)

test('season length is the midpoint of the published range', () => {
  assert.equal(seasonDays('wheat'), 140)
  assert.equal(seasonDays('not-a-crop'), 120)
})

test('stage is counted from the sowing date', () => {
  assert.equal(stageAt(wheat, '2026-11-10').id, 'sowing') // before sowing counts as sowing
  assert.equal(stageAt(wheat, '2026-12-05').id, 'early') // day 20
  assert.equal(stageAt(wheat, '2027-01-20').id, 'mid') // day 66
  assert.equal(stageAt(wheat, '2027-02-20').id, 'flowering') // day 97
  assert.equal(stageAt(wheat, '2027-03-30').id, 'maturity') // day 135
  assert.equal(stageAt(wheat, '2027-05-15').id, 'post') // day 181
  assert.equal(stageAt({ cropType: 'wheat' }, '2027-01-01'), null)
})

test('no soil test is missing', () => {
  assert.equal(soilTestState(wheat, null, on('2026-12-01')).state, 'missing')
})

test('a test from the current stage is valid', () => {
  assert.equal(soilTestState(wheat, { testedOn: '2026-11-14' }, on('2026-11-20')).state, 'valid')
  assert.equal(soilTestState(wheat, { testedOn: '2026-12-01' }, on('2026-12-20')).state, 'valid')
})

test('a test from before the crop reached a later major stage is stale', () => {
  const r = soilTestState(wheat, { testedOn: '2026-11-14' }, on('2027-01-25'))
  assert.equal(r.state, 'stale')
  assert.match(r.reason, /sowing/)
  assert.match(r.reason, /mid-season/)
  assert.equal(soilTestState(wheat, { testedOn: '2027-01-20' }, on('2027-02-25')).state, 'stale')
})

test('after harvest an in-season test asks for a test before the next crop', () => {
  const r = soilTestState(wheat, { testedOn: '2027-03-01' }, on('2027-05-20'))
  assert.equal(r.state, 'stale')
  assert.match(r.reason, /before the next crop/)
})

test('a field without a sowing date falls back to test age', () => {
  const field = { cropType: 'wheat' }
  assert.equal(soilTestState(field, { testedOn: '2026-06-01' }, on('2026-10-01')).state, 'valid')
  assert.equal(soilTestState(field, { testedOn: '2025-06-01' }, on('2026-10-01')).state, 'stale')
})

test('a test over a year old is stale even in the same stage', () => {
  const f = { cropType: 'sugarcane', sowingDate: '2025-03-01' } // season about 330 days
  assert.equal(soilTestState(f, { testedOn: '2025-03-02' }, on('2026-03-20')).state, 'stale')
})
