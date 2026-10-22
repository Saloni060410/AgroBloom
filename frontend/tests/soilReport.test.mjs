import test from 'node:test'
import assert from 'node:assert/strict'
import { parseSoilReport } from '../src/utils/soilReport.js'

test('reads a Soil Health Card style listing', () => {
  const r = parseSoilReport(`SOIL HEALTH CARD
Nitrogen (N) 245 kg/ha Low
Phosphorus (P) 18.5 kg/ha Medium
Potassium (K) 310 kg/ha Medium
pH 7.4
Organic Carbon (OC) 0.52 %`)
  assert.deepEqual(r.values, { n: 245, p: 18.5, k: 310, ph: 7.4, organicCarbon: 0.52 })
  assert.deepEqual(r.missing, ['Moisture'])
})

test('reads a table with a unit column and P2O5 / K2O names', () => {
  const r = parseSoilReport(`Parameter  Value  Unit
Available N  280.5  kg/ha
Phosphorus (P2O5)  22  kg/ha
Potash (K2O)  145  kg/ha
Soil reaction (pH)  6.8
Moisture  31 %`)
  assert.deepEqual(r.values, { n: 280.5, p: 22, k: 145, ph: 6.8, moisture: 31 })
})

test('converts ppm to kg/ha and g/kg to percent, and says so', () => {
  const r = parseSoilReport('Phosphorus 10 ppm\nOrganic carbon 5.2 g/kg')
  assert.equal(r.values.p, 22.4)
  assert.equal(r.values.organicCarbon, 0.52)
  assert.match(r.found.find((f) => f.key === 'p').note, /ppm converted/)
  assert.match(r.found.find((f) => f.key === 'organicCarbon').note, /g\/kg converted/)
})

test('repairs OCR damage in numbers', () => {
  const r = parseSoilReport('Nitrogen (N) 2O5 kg/ha\nPotassium (K) 3,10 kg/ha\nOrganic Carbon 0,52 %')
  assert.equal(r.values.n, 205)
  assert.equal(r.values.k, undefined) // 3,10 is a decimal comma (3.10), far too low to be potassium in kg/ha
  assert.equal(r.values.organicCarbon, 0.52)
})

test('never takes the next parameter\'s number when its own is missing', () => {
  const r = parseSoilReport('Nitrogen (N) kg/ha\nPhosphorus (P) 18 kg/ha')
  assert.equal(r.values.n, undefined)
  assert.equal(r.values.p, 18)
  assert.ok(r.missing.includes('Nitrogen (N)'))
})

test('rejects values outside a plausible range', () => {
  const r = parseSoilReport('pH 77\nNitrogen 5000')
  assert.deepEqual(r.values, {})
  assert.equal(r.missing.length, 6)
})

test('returns everything as missing for unrelated text', () => {
  const r = parseSoilReport('Invoice 4421 for seeds, total 5300')
  assert.deepEqual(r.values, {})
  assert.equal(r.found.length, 0)
})

test('does not accept a number glued to a letter (an OCR misread)', () => {
  const r = parseSoilReport('Nitrogen (N) R45 kg/ha\npH F4')
  assert.equal(r.values.n, undefined)
  assert.equal(r.values.ph, undefined)
})

test('flags only the values whose own digits were read with low confidence', async () => {
  const { parseBest } = await import('../src/utils/soilReport.js')
  const best = parseBest([
    {
      text: 'Nitrogen 245 kg/ha\nPotassium 210 kg/ha\npH 7.4',
      confidence: 80,
      words: [
        { text: '245', confidence: 95 },
        { text: '210', confidence: 21 },
        { text: '7.4', confidence: 90 },
      ],
    },
  ])
  const check = Object.fromEntries(best.found.map((f) => [f.key, f.check]))
  assert.deepEqual(check, { n: false, k: true, ph: false })
})

test('text read exactly from a PDF or Word file is never flagged', async () => {
  const { parseBest } = await import('../src/utils/soilReport.js')
  const best = parseBest([{ text: 'Nitrogen 245 kg/ha', confidence: null }])
  assert.equal(best.found[0].check, false)
})
