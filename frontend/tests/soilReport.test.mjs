import test from 'node:test'
import assert from 'node:assert/strict'
import { parseSoilReport, assessSoilReport, parseBest, MAX_REPORT_WORDS } from '../src/utils/soilReport.js'

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

// ---- is the file a soil report at all? ----------------------------------------------------------

const CARD = `SOIL HEALTH CARD
Nitrogen (N) 245 kg/ha Low
Phosphorus (P) 18.5 kg/ha Medium
Potassium (K) 310 kg/ha Medium
pH 7.4
Organic Carbon (OC) 0.52 %`

const JOURNAL = `Journal of Rural Studies, Volume 12, Issue 3. ISSN 2349-1234. DOI 10.1000/jrs.2024.3
Abstract. This paper examines village water use. Keywords: water, villages, survey.
1. Introduction. Earlier work (Rao et al., 2019) found that the pH of well water, 7.2 on average,
and nitrogen from run-off, 12 kg/ha, affected yields.
2. Materials and Methods. We surveyed 120 households.
Conclusion. More study is needed. References. Rao, S. et al. (2019).`

test('a Soil Health Card, a lab table and a short handwritten note all count as soil reports', () => {
  assert.equal(assessSoilReport(CARD).ok, true)
  assert.equal(assessSoilReport('Available N 280.5 kg/ha\nPhosphorus (P2O5) 22 kg/ha\nPotash (K2O) 145 kg/ha\nSoil reaction (pH) 6.8').ok, true)
  assert.equal(assessSoilReport('Soil test 12 March\nN: 245 kg/ha\nK: 310 kg/ha').ok, true)
})

test('a journal paper is refused even though it names nitrogen and pH and has numbers beside them', () => {
  const r = assessSoilReport(JOURNAL)
  assert.equal(r.ok, false)
  assert.equal(r.why, 'article')
})

test('ordinary documents are refused: a CV, a notice that mentions pH, plain prose', () => {
  assert.equal(assessSoilReport('Curriculum vitae. Name: Asha Rao. Skills: Python. Education: B.Tech, CGPA 8.1.').ok, false)
  assert.equal(assessSoilReport('College notice: lab pH meter 7 will be serviced on 12 March. Nitrogen cylinders arrive on 14.').ok, false)
  assert.equal(assessSoilReport('').ok, false)
})

test('a long document is refused however many soil words it has, unless it is a Soil Health Card', () => {
  const filler = 'the committee discussed field visits and the schedule for the year '.repeat(MAX_REPORT_WORDS)
  const long = assessSoilReport(`${filler} nitrogen 245 kg/ha phosphorus 18 kg/ha potassium 310 kg/ha ph 7.4`)
  assert.equal(long.ok, false)
  assert.equal(long.why, 'too-long')
  assert.equal(assessSoilReport(`SOIL HEALTH CARD ${filler.repeat(1)} nitrogen 245 kg/ha`).ok, true)
})

test('parseBest accepts a report when any one OCR layout of it reads as a soil report', () => {
  const blurry = { text: 'n 2 5 kg h a', confidence: 50, words: [] }
  const clear = { text: CARD, confidence: 90, words: [] }
  assert.equal(parseBest([blurry, clear]).assessment.ok, true)
  assert.equal(parseBest([blurry]).assessment.ok, false)
  assert.equal(parseBest([]).assessment.ok, false)
})
