import test from 'node:test'
import assert from 'node:assert/strict'
import { retestWarning, RECENT_TEST_DAYS } from '../src/utils/retestWarning.js'

const today = new Date('2026-10-23T12:00:00Z')

test('no earlier test, no warning', () => {
  assert.equal(retestWarning({ lastTestedOn: null, today }), null)
})

test('a test from today or a few days ago warns, with the days and the applications since', () => {
  const logs = [{ appliedOn: '2026-10-22T00:00:00Z' }, { appliedOn: '2026-09-01T00:00:00Z' }]
  assert.deepEqual(retestWarning({ lastTestedOn: '2026-10-20T00:00:00Z', logs, today }), { daysAgo: 3, applicationsSince: 1 })
  assert.equal(retestWarning({ lastTestedOn: '2026-10-23T00:00:00Z', today }).daysAgo, 0)
})

test('the warning stops at the limit', () => {
  assert.equal(RECENT_TEST_DAYS, 30)
  assert.ok(retestWarning({ lastTestedOn: '2026-09-25T00:00:00Z', today })) // 28 days
  assert.equal(retestWarning({ lastTestedOn: '2026-09-23T00:00:00Z', today }), null) // 30 days
})

test('an unreadable date gives no warning', () => {
  assert.equal(retestWarning({ lastTestedOn: 'not a date', today }), null)
})
