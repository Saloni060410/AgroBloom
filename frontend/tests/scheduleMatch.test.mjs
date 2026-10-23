import test from 'node:test'
import assert from 'node:assert/strict'
import { matchLogsToLines, unmatchedLogs } from '../src/utils/schedule.js'

const rec = {
  createdAt: '2026-10-20T10:00:00Z',
  schedule: [
    { stage: 'sowing', fertilizer_type: 'dap', quantity_kg_per_acre: 54.4, apply_by: '2026-10-18' },
    { stage: 'crown_root_initiation', fertilizer_type: 'urea', quantity_kg_per_acre: 46.7, apply_by: '2026-11-08' },
    { stage: 'second_irrigation', fertilizer_type: 'urea', quantity_kg_per_acre: 68, apply_by: '2026-12-05' },
  ],
}
const log = (id, type, qty, appliedOn = '2026-10-23') => ({ id, type, quantityKgPerAcre: qty, appliedOn })

test('a log close to the planned amount completes the dose', () => {
  const matches = matchLogsToLines(rec, [log('a', 'urea', 46.7)], {})
  assert.equal(matches[1]?.id, 'a')
})

test('a part-application does not complete a dose: 20 of 46.7 kg leaves it pending', () => {
  const logs = [log('a', 'urea', 20)]
  const matches = matchLogsToLines(rec, logs, {})
  assert.deepEqual(matches, [null, null, null])
  assert.deepEqual(unmatchedLogs(rec, logs, matches).map((l) => l.id), ['a'])
})

test('90% of the dose is enough, 89% is not', () => {
  assert.ok(matchLogsToLines(rec, [log('a', 'urea', 0.9 * 46.7)], {})[1])
  assert.equal(matchLogsToLines(rec, [log('a', 'urea', 0.89 * 46.7)], {})[1], null)
})

test('more than planned still completes the dose', () => {
  assert.ok(matchLogsToLines(rec, [log('a', 'urea', 60)], {})[1])
})

test('a dose the farmer marked done for a line stays done even if they logged less', () => {
  const hinted = matchLogsToLines(rec, [log('a', 'urea', 40)], { a: 'crown_root_initiation-urea-1' })
  assert.equal(hinted[1]?.id, 'a')
})

test('a product the plan does not use, or an application made before the plan, is listed, not lost', () => {
  const logs = [log('mop', 'mop', 20), log('old', 'urea', 47, '2026-10-01'), log('ok', 'dap', 54.4)]
  const matches = matchLogsToLines(rec, logs, {})
  assert.equal(matches[0]?.id, 'ok')
  assert.deepEqual(unmatchedLogs(rec, logs, matches).map((l) => l.id), ['mop', 'old'])
})

test('with no plan every log is listed', () => {
  assert.deepEqual(unmatchedLogs(null, [log('a', 'urea', 20)]).map((l) => l.id), ['a'])
})
