import test from 'node:test'
import assert from 'node:assert/strict'
import { buildAllFieldsSlip } from '../src/utils/slip.js'

const fertilizers = [
  { id: 'urea', name: 'Urea', price_inr_per_kg: 6, price_date: '2025-01-01', bag_size_kg: 45 },
  { id: 'dap', name: 'DAP', price_inr_per_kg: 27, price_date: '2025-01-01', bag_size_kg: 50 },
  { id: 'mystery', name: 'Mystery mix', price_inr_per_kg: null, bag_size_kg: null },
]
const rec = (lines) => ({ createdAt: '2026-10-01T00:00:00Z', schedule: lines })
const line = (type, qty, apply_by = null) => ({ stage: 'x', fertilizer_type: type, quantity_kg_per_acre: qty, apply_by })

const plots = [
  { field: { id: 'a', name: 'North', areaAcres: 2 } },
  { field: { id: 'b', name: 'South', areaAcres: 3 } },
  { field: { id: 'c', name: 'No plan', areaAcres: 1 } },
  { field: { id: 'd', name: 'Done', areaAcres: 1 } },
]
const statusByField = {
  a: { recommendation: rec([line('urea', 20, '2026-10-20'), line('dap', 10)]), logs: [] },
  b: { recommendation: rec([line('urea', 30)]), logs: [] },
  d: { recommendation: rec([line('urea', 5)]), logs: [{ id: 'l1', type: 'urea', appliedOn: '2026-10-05T00:00:00Z' }] },
}

test('totals per field and per product, combined across fields', () => {
  const s = buildAllFieldsSlip({ plots, statusByField, fertilizers })
  assert.deepEqual(s.fields.map((f) => f.field.name), ['North', 'South']) // no plan and fully applied are left out
  const urea = s.products.find((p) => p.id === 'urea')
  assert.equal(urea.totalKg, 20 * 2 + 30 * 3) // 130 kg
  assert.equal(urea.bags, Math.ceil(130 / 45)) // 3 bags
  assert.equal(urea.amount, 130 * 6)
  assert.deepEqual(urea.byField, [{ name: 'North', kg: 40 }, { name: 'South', kg: 90 }])
  const dap = s.products.find((p) => p.id === 'dap')
  assert.equal(dap.totalKg, 20)
  assert.equal(s.grandTotal, 130 * 6 + 20 * 27)
})

test('field subtotals add up to the bill', () => {
  const s = buildAllFieldsSlip({ plots, statusByField, fertilizers })
  const north = s.fields.find((f) => f.field.name === 'North')
  assert.equal(north.subtotalKg, 40 + 20)
  assert.equal(north.subtotalAmount, 40 * 6 + 20 * 27)
  assert.equal(s.fields.reduce((n, f) => n + f.subtotalAmount, 0), s.grandTotal)
})

test('doses already logged as applied are not on the slip', () => {
  const withLog = { ...statusByField, a: { ...statusByField.a, logs: [{ id: 'l2', type: 'urea', appliedOn: '2026-10-05T00:00:00Z' }] } }
  const s = buildAllFieldsSlip({ plots, statusByField: withLog, fertilizers })
  const north = s.fields.find((f) => f.field.name === 'North')
  assert.deepEqual(north.rows.map((r) => r.productId), ['dap'])
})

test('an unpriced product is named and kept out of the money totals', () => {
  const sbf = { a: { recommendation: rec([line('mystery', 4), line('urea', 10)]), logs: [] } }
  const s = buildAllFieldsSlip({ plots: [plots[0]], statusByField: sbf, fertilizers })
  assert.deepEqual(s.unpriced, ['Mystery mix'])
  assert.equal(s.grandTotal, 10 * 2 * 6)
  assert.equal(s.fields[0].subtotalAmount, null)
})

test('a field with no area is flagged, not guessed', () => {
  const sbf = { a: { recommendation: rec([line('urea', 10)]), logs: [] } }
  const s = buildAllFieldsSlip({ plots: [{ field: { id: 'a', name: 'North', areaAcres: null } }], statusByField: sbf, fertilizers })
  assert.deepEqual(s.fieldsMissingArea, ['North'])
  assert.equal(s.products.length, 0)
})
