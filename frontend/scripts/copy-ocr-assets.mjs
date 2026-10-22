// Copies the OCR engine, its English language data and the PDF worker out of node_modules into
// public/ocr so the soil-report scanner runs from this site: no CDN, works offline, and nothing about
// the farmer's report leaves the browser. Run automatically before `npm run dev` and `npm run build`.
// The copies are generated, so public/ocr is git-ignored.
import { cpSync, mkdirSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const out = path.join(root, 'public', 'ocr')
const nm = (...p) => path.join(root, 'node_modules', ...p)

const files = [
  [nm('tesseract.js', 'dist', 'worker.min.js'), 'worker.min.js'],
  [nm('tesseract.js-core', 'tesseract-core-lstm.wasm.js'), 'tesseract-core-lstm.wasm.js'],
  [nm('tesseract.js-core', 'tesseract-core-simd-lstm.wasm.js'), 'tesseract-core-simd-lstm.wasm.js'],
  [nm('tesseract.js-core', 'tesseract-core-relaxedsimd-lstm.wasm.js'), 'tesseract-core-relaxedsimd-lstm.wasm.js'],
  [nm('@tesseract.js-data', 'eng', '4.0.0_best_int', 'eng.traineddata.gz'), 'eng.traineddata.gz'],
  [nm('pdfjs-dist', 'build', 'pdf.worker.min.mjs'), 'pdf.worker.min.mjs'],
]

mkdirSync(out, { recursive: true })
let copied = 0
for (const [from, name] of files) {
  if (!existsSync(from)) {
    console.warn(`copy-ocr-assets: missing ${path.relative(root, from)} (run npm install)`)
    continue
  }
  cpSync(from, path.join(out, name))
  copied += 1
}
console.log(`copy-ocr-assets: ${copied}/${files.length} files in public/ocr`)
