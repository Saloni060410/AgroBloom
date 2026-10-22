/**
 * Pulls the six soil values out of text read from a soil report (Soil Health Card, lab sheet).
 * The text comes from OCR or a PDF/Word extraction, so it is noisy; the parser is deliberately
 * conservative: it takes the first plausible number after a parameter's name, never reaches into the
 * next parameter's line, rejects values outside a sane range, and says what it converted.
 * Anything it cannot find is reported as missing, never guessed.
 */

// 1 ppm (mg/kg) of nutrient in the top 15 cm of soil is about 2.24 kg/ha.
const PPM_TO_KG_HA = 2.24

const PARAMS = [
  {
    key: 'n',
    label: 'Nitrogen (N)',
    unit: 'kg/ha',
    range: [10, 1500],
    aliases: [/\bavail(?:able|\.)?\s*nitrogen\b/g, /\bnitrogen\b/g, /\bavail(?:able|\.)?\s*n\b/g, /\bn\s*(?=[:=]|\(\s*kg)/g],
  },
  {
    key: 'p',
    label: 'Phosphorus (P)',
    unit: 'kg/ha',
    range: [0.5, 250],
    aliases: [/\bphosphor(?:us|ous)\b/g, /\bolsen\s*p\b/g, /\bavail(?:able|\.)?\s*p\b/g, /\bp\s*(?=[:=]|\(\s*kg)/g],
  },
  {
    key: 'k',
    label: 'Potassium (K)',
    unit: 'kg/ha',
    range: [10, 1500],
    aliases: [/\bpotassium\b/g, /\bpotash\b/g, /\bavail(?:able|\.)?\s*k\b/g, /\bk\s*(?=[:=]|\(\s*kg)/g],
  },
  {
    key: 'ph',
    label: 'Soil pH',
    unit: 'pH',
    range: [3, 11],
    aliases: [/\bsoil\s*reaction\b/g, /\bp\.?h\b/g],
  },
  {
    key: 'organicCarbon',
    label: 'Organic carbon',
    unit: '%',
    range: [0.01, 5],
    aliases: [/\borganic\s*carbon\b/g, /\bo\.?\s?c\b\.?/g],
  },
  {
    key: 'moisture',
    label: 'Moisture',
    unit: '%',
    range: [0, 100],
    aliases: [/\bsoil\s*moisture\b/g, /\bmoisture\b/g, /\bwater\s*content\b/g],
  },
]

const WINDOW = 80
// A number glued to a letter ("r45", "f4") is an OCR misread of a letter or a smudge, not a value.
const NUMBER = /(?<![a-z\d.])-?\d+(?:\.\d+)?/

/** Lower-cases and repairs the usual OCR damage so numbers and names can be matched. */
export function normalizeReportText(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[‒-―−]/g, '-')
    .replace(/p\s*2\s*o\s*5/g, 'p') // P2O5 -> p, so the 2 and 5 are not read as values
    .replace(/k\s*2\s*o\b/g, 'k')
    .replace(/(\d),(\d{3})(?!\d)/g, '$1$2') // thousands separator
    .replace(/(\d),(\d{1,2})(?!\d)/g, '$1.$2') // decimal comma
    .replace(/(?<=\d)[o](?=[\d.])/g, '0') // 2o5 -> 205
    .replace(/(?<=[\d.])o(?=\d)/g, '0')
    .replace(/(?<=\d)[li](?=\d)/g, '1')
    .replace(/[ \t]+/g, ' ')
}

/** Where the next parameter's name starts after `from`, so one parameter never reads another's number. */
function nextNameStart(text, from, ownKey) {
  let next = Infinity
  for (const p of PARAMS) {
    if (p.key === ownKey) continue
    for (const re of p.aliases) {
      re.lastIndex = from
      const m = re.exec(text)
      if (m && m.index < next) next = m.index
    }
  }
  return next
}

function readOne(text, param) {
  for (const re of param.aliases) {
    re.lastIndex = 0
    for (let m = re.exec(text); m; m = re.exec(text)) {
      const start = m.index + m[0].length
      const end = Math.min(start + WINDOW, nextNameStart(text, start, param.key), text.length)
      const slice = text.slice(start, end)
      const num = NUMBER.exec(slice)
      if (!num) continue
      let value = parseFloat(num[0])
      const after = slice.slice(num.index + num[0].length, num.index + num[0].length + 14)
      let note = null

      if (['n', 'p', 'k'].includes(param.key) && /\b(ppm|mg\s*\/?\s*kg)\b/.test(after)) {
        note = `${num[0]} ppm converted to kg/ha (x${PPM_TO_KG_HA})`
        value = Math.round(value * PPM_TO_KG_HA * 10) / 10
      } else if (param.key === 'organicCarbon' && /^\s*g\s*\/\s*kg\b/.test(after)) {
        note = `${num[0]} g/kg converted to %`
        value = Math.round(value) === value ? value / 10 : Math.round(value * 10) / 100
      }

      if (value >= param.range[0] && value <= param.range[1]) return { value, note, raw: num[0] }
    }
  }
  return null
}

/**
 * @returns {{ values: object, found: Array<{key,label,unit,value,note}>, missing: string[] }}
 */
export function parseSoilReport(rawText) {
  const text = normalizeReportText(rawText)
  const values = {}
  const found = []
  const missing = []
  for (const param of PARAMS) {
    const hit = readOne(text, param)
    if (hit) {
      values[param.key] = hit.value
      found.push({ key: param.key, label: param.label, unit: param.unit, value: hit.value, note: hit.note, raw: hit.raw })
    } else {
      missing.push(param.label)
    }
  }
  return { values, found, missing }
}

/** OCR confidence (0-100) below this means a word was hard to read: blurry, dim, smudged or handwritten. */
export const LOW_CONFIDENCE = 70

const digitsOf = (t) => normalizeReportText(t).replace(/[^\d.]/g, '')

/**
 * Parses several readings ({ text, confidence, words }) of the same report and keeps the one that found
 * the most values. Each value gets `check: true` when the OCR was unsure of the digits themselves, so
 * the farmer is pointed at the exact meters to verify. Text read from a PDF or Word file is exact and
 * is never flagged.
 */
export function parseBest(readings) {
  let best = null
  for (const reading of readings) {
    const parsed = parseSoilReport(reading.text)
    if (!best || parsed.found.length > best.found.length) best = { ...parsed, reading }
  }
  if (!best) return { ...parseSoilReport(''), confidence: null }
  const { reading } = best
  const found = best.found.map((f) => {
    if (reading.confidence == null) return { ...f, check: false }
    const scores = (reading.words || []).filter((w) => digitsOf(w.text) === f.raw).map((w) => w.confidence)
    // No matching word to score means the digits were glued to something: be cautious.
    const check = scores.length === 0 ? reading.confidence < LOW_CONFIDENCE : Math.min(...scores) < LOW_CONFIDENCE
    return { ...f, check }
  })
  return { values: best.values, found, missing: best.missing, confidence: reading.confidence }
}
