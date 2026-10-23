// Turns an uploaded soil report (a JPEG/PNG photo, a PDF, or a .docx) into plain text, entirely in the
// browser. The OCR engine, its English data and the PDF worker are served from this site (public/ocr,
// copied by scripts/copy-ocr-assets.mjs), so nothing about the report is uploaded anywhere.
// The heavy libraries are imported only when a report is actually read.

export const MAX_REPORT_BYTES = 15 * 1024 * 1024
// A Soil Health Card or lab sheet is one or two pages. A longer PDF is a document of some other kind, so
// it is refused before any page is read or put through OCR (which takes minutes on a long scan).
export const MAX_REPORT_PAGES = 8
const READ_PAGES = 4
export const REPORT_ACCEPT =
  'image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif,application/pdf,.pdf,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document'

export class ReportError extends Error {}

export function reportKind(file) {
  const name = (file.name || '').toLowerCase()
  if (/\.(heic|heif)$/.test(name) || /^image\/hei[cf]/.test(file.type)) return 'heic'
  if (file.type.startsWith('image/') || /\.(jpe?g|png|webp)$/.test(name)) return 'image'
  if (file.type === 'application/pdf' || name.endsWith('.pdf')) return 'pdf'
  if (name.endsWith('.docx') || file.type.includes('wordprocessingml')) return 'docx'
  if (name.endsWith('.doc')) return 'doc'
  return 'unknown'
}

let workerPromise = null

async function getOcrWorker() {
  if (!workerPromise) {
    workerPromise = import('tesseract.js').then(({ createWorker }) =>
      createWorker('eng', 1, {
        workerPath: '/ocr/worker.min.js',
        corePath: '/ocr',
        langPath: '/ocr',
      }),
    )
    workerPromise.catch(() => {
      workerPromise = null
    })
  }
  return workerPromise
}

/** Draws an image source onto a canvas whose long side is a sensible size for OCR. */
function toCanvas(source, width, height) {
  const longSide = Math.max(width, height)
  const scale = longSide > 2400 ? 2400 / longSide : longSide < 1200 ? Math.min(2, 1600 / longSide) : 1
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(width * scale)
  canvas.height = Math.round(height * scale)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height)
  return canvas
}

// Soil cards are mostly tables, and the default layout analysis stumbles on table grid lines. Reading
// the page in a few different layout modes and keeping every result lets the parser use whichever one
// read the values cleanly: 6 = one uniform block, 4 = one column of varying sizes, 11 = sparse text.
const OCR_MODES = ['6', '4', '11']

/**
 * A cleaned-up copy of a canvas for OCR: grayscale, contrast stretched between the 2nd and 98th
 * percentile of brightness, then Otsu-thresholded to pure black and white. This is what rescues
 * phone photos with shadows, a dim backdrop or low contrast.
 */
function enhance(canvas) {
  const out = document.createElement('canvas')
  out.width = canvas.width
  out.height = canvas.height
  const ctx = out.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(canvas, 0, 0)
  const img = ctx.getImageData(0, 0, out.width, out.height)
  const px = img.data
  const gray = new Uint8ClampedArray(px.length / 4)
  const hist = new Uint32Array(256)
  for (let i = 0, j = 0; i < px.length; i += 4, j += 1) {
    const g = Math.round(0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2])
    gray[j] = g
    hist[g] += 1
  }
  const total = gray.length
  const percentile = (q) => {
    let acc = 0
    for (let v = 0; v < 256; v += 1) {
      acc += hist[v]
      if (acc >= total * q) return v
    }
    return 255
  }
  const lo = percentile(0.02)
  const hi = Math.max(lo + 1, percentile(0.98))
  const stretched = new Uint8ClampedArray(gray.length)
  const hist2 = new Uint32Array(256)
  for (let j = 0; j < gray.length; j += 1) {
    const v = Math.max(0, Math.min(255, Math.round(((gray[j] - lo) / (hi - lo)) * 255)))
    stretched[j] = v
    hist2[v] += 1
  }
  // Otsu: the threshold that best separates ink from paper.
  let sum = 0
  for (let v = 0; v < 256; v += 1) sum += v * hist2[v]
  let sumB = 0
  let wB = 0
  let best = 0
  let threshold = 128
  for (let v = 0; v < 256; v += 1) {
    wB += hist2[v]
    if (!wB) continue
    const wF = total - wB
    if (!wF) break
    sumB += v * hist2[v]
    const between = wB * wF * (sumB / wB - (sum - sumB) / wF) ** 2
    if (between > best) {
      best = between
      threshold = v
    }
  }
  for (let i = 0, j = 0; i < px.length; i += 4, j += 1) {
    const v = stretched[j] > threshold ? 255 : 0
    px[i] = v
    px[i + 1] = v
    px[i + 2] = v
    px[i + 3] = 255
  }
  ctx.putImageData(img, 0, 0)
  return out
}

/** @returns {Promise<Array<{text: string, confidence: number, words: Array<{text: string, confidence: number}>}>>} one reading per layout mode, for the image as given and cleaned up */
async function ocrCanvas(canvas, onProgress) {
  const worker = await getOcrWorker()
  const versions = [canvas, enhance(canvas)]
  const texts = []
  const steps = versions.length * OCR_MODES.length
  for (const image of versions) {
    for (const mode of OCR_MODES) {
      await worker.setParameters({ tessedit_pageseg_mode: mode, preserve_interword_spaces: '1' })
      const { data } = await worker.recognize(image, {}, { blocks: true })
      const words = []
      for (const block of data.blocks || []) {
        for (const paragraph of block.paragraphs || []) {
          for (const line of paragraph.lines || []) {
            for (const word of line.words || []) {
              if (/\d/.test(word.text)) words.push({ text: word.text, confidence: word.confidence })
            }
          }
        }
      }
      texts.push({ text: data.text || '', confidence: data.confidence ?? 0, words })
      onProgress?.(texts.length / steps)
    }
  }
  return texts
}

/** iPhone photos are often HEIC, which most browsers cannot draw. Decode to JPEG in the browser. */
async function heicToJpeg(file) {
  try {
    const { heicTo } = await import('heic-to')
    return await heicTo({ blob: file, type: 'image/jpeg', quality: 0.92 })
  } catch {
    throw new ReportError('That HEIC photo could not be opened. Try taking it again, or share it as a JPEG.')
  }
}

async function readImage(file, onProgress) {
  let bitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    try {
      bitmap = await createImageBitmap(await heicToJpeg(file))
    } catch (err) {
      throw err instanceof ReportError ? err : new ReportError('That image could not be opened. Try a JPEG or PNG photo.')
    }
  }
  const canvas = toCanvas(bitmap, bitmap.width, bitmap.height)
  bitmap.close?.()
  return ocrCanvas(canvas, onProgress)
}

async function readPdf(file, onProgress) {
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = '/ocr/pdf.worker.min.mjs'
  let pdf
  try {
    pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise
  } catch {
    throw new ReportError('That PDF could not be opened. It may be damaged or password protected.')
  }
  if (pdf.numPages > MAX_REPORT_PAGES) {
    throw new ReportError(
      `That PDF has ${pdf.numPages} pages. A soil report is one to a few pages, so this does not look like one. Nothing was read.`,
    )
  }
  const pages = Math.min(pdf.numPages, READ_PAGES)

  // Most lab PDFs carry real text: read it directly, which is exact.
  let text = ''
  for (let i = 1; i <= pages; i += 1) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const rows = new Map()
    for (const item of content.items) {
      if (!('str' in item) || !item.str.trim()) continue
      const y = Math.round(item.transform[5] / 3)
      rows.set(y, [...(rows.get(y) || []), item])
    }
    text += [...rows.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([, items]) => items.sort((a, b) => a.transform[4] - b.transform[4]).map((it) => it.str).join(' '))
      .join('\n') + '\n'
  }
  if (text.replace(/\s/g, '').length >= 40) return [{ text, confidence: null }]

  // A scanned PDF has no text layer: draw each page and run OCR on it.
  const ocr = []
  for (let i = 1; i <= pages; i += 1) {
    const page = await pdf.getPage(i)
    const viewport = page.getViewport({ scale: 2 })
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(viewport.width)
    canvas.height = Math.round(viewport.height)
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise
    ocr.push(...(await ocrCanvas(canvas, (p) => onProgress?.((i - 1 + p) / pages))))
  }
  return ocr
}

async function readDocx(file) {
  const mod = await import('mammoth/mammoth.browser.js')
  const mammoth = mod.default || mod
  try {
    const { value } = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })
    return [{ text: value, confidence: null }]
  } catch {
    throw new ReportError('That Word file could not be read. Save it as .docx or PDF and try again.')
  }
}

/**
 * Reads a report file to text: one reading for a PDF text layer or a Word file, several (one per OCR
 * layout mode and image version) for an image or scanned PDF. Each reading is { text, confidence }, with
 * confidence 0-100 from OCR, or null when the text was read exactly, not recognised. onProgress receives 0..1 while OCR runs.
 * Throws ReportError with a message that is safe to show the farmer.
 */
export async function readReport(file, onProgress) {
  if (file.size > MAX_REPORT_BYTES) throw new ReportError('That file is over 15 MB. Use a smaller photo or PDF.')
  const kind = reportKind(file)
  if (kind === 'doc') throw new ReportError('Older .doc files cannot be read. Save it as .docx or PDF and try again.')
  if (kind === 'unknown') throw new ReportError('Use a JPEG, PNG or HEIC photo, a PDF, or a .docx file.')
  if (kind === 'image' || kind === 'heic') return { kind, readings: await readImage(file, onProgress) }
  if (kind === 'pdf') return { kind, readings: await readPdf(file, onProgress) }
  return { kind, readings: await readDocx(file) }
}
