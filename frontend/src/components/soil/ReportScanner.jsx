import { useRef, useState } from 'react'
import { Upload, Camera, Loader2, Check, AlertCircle, Undo2, ScanLine } from 'lucide-react'
import { readReport, ReportError, REPORT_ACCEPT } from '../../services/reportReader.js'
import { parseBest, LOW_CONFIDENCE } from '../../utils/soilReport.js'

/**
 * Lets the farmer upload a soil report (JPEG/PNG, PDF or .docx) or photograph one with the camera.
 * The values it can read replace the matching sliders at once, and a summary shows exactly what was
 * read and what was not, with Undo. Reading happens in the browser; the file is never uploaded.
 */
export default function ReportScanner({ soil, setSoil, onScanned }) {
  const fileInput = useRef(null)
  const cameraInput = useRef(null)
  const [phase, setPhase] = useState({ name: 'idle' })

  async function handleFile(file) {
    if (!file) return
    setPhase({ name: 'reading', fileName: file.name, progress: 0 })
    try {
      const { readings } = await readReport(file, (p) => setPhase((s) => (s.name === 'reading' ? { ...s, progress: p } : s)))
      const result = parseBest(readings)
      if (!result.found.length) {
        setPhase({ name: 'empty', fileName: file.name })
        return
      }
      // Values the OCR was unsure of do not move a meter: a confident wrong number is worse than a blank.
      const sure = result.found.filter((f) => !f.check)
      const unsure = result.found.filter((f) => f.check)
      const previous = soil
      if (sure.length) {
        setSoil((s) => ({ ...s, ...Object.fromEntries(sure.map((f) => [f.key, f.value])) }))
        onScanned?.(Object.fromEntries(sure.map((f) => [f.key, 'ok'])))
      }
      setPhase({ name: 'done', fileName: file.name, result: { ...result, sure, unsure }, previous })
    } catch (err) {
      setPhase({
        name: 'error',
        message: err instanceof ReportError ? err.message : 'That file could not be read. Try a clearer photo or a PDF.',
      })
    }
  }

  const pick = (e) => {
    const file = e.target.files?.[0]
    e.target.value = '' // lets the same file be chosen again
    handleFile(file)
  }

  const reading = phase.name === 'reading'

  return (
    <section aria-labelledby="scan-heading" className="rounded-lg border-2 border-dashed border-primary-500/60 bg-primary-50/70 p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <span className="w-11 h-11 rounded-full bg-primary-600 text-white inline-flex items-center justify-center shrink-0" aria-hidden="true">
            <ScanLine className="w-6 h-6" />
          </span>
          <div>
            <h2 id="scan-heading" className="text-lg font-semibold text-ink-primary">Have your soil report?</h2>
            <p className="text-sm text-ink-secondary mt-0.5 max-w-xl">
              Upload a photo, PDF or Word file of your Soil Health Card or lab sheet, or take a photo of it. The meters below fill in from what is read.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={reading}
            className="inline-flex items-center gap-2 min-h-[48px] px-5 rounded-full bg-primary-600 hover:bg-primary-700 disabled:opacity-60 text-white font-medium shadow-sm cursor-pointer transition-colors"
          >
            <Upload className="w-4 h-4" aria-hidden="true" /> Upload report
          </button>
          <button
            type="button"
            onClick={() => cameraInput.current?.click()}
            disabled={reading}
            className="inline-flex items-center gap-2 min-h-[48px] px-5 rounded-full border-2 border-primary-600 text-primary-700 hover:bg-white disabled:opacity-60 font-medium cursor-pointer transition-colors"
          >
            <Camera className="w-4 h-4" aria-hidden="true" /> Take a photo
          </button>
        </div>

        {/* JPEG / PNG / PDF / DOCX. capture opens the rear camera on a phone and the file picker on a computer. */}
        <input ref={fileInput} type="file" accept={REPORT_ACCEPT} onChange={pick} className="sr-only" tabIndex={-1} aria-label="Choose a soil report file" />
        <input ref={cameraInput} type="file" accept="image/*" capture="environment" onChange={pick} className="sr-only" tabIndex={-1} aria-label="Take a photo of a soil report" />
      </div>

      <p className="mt-3 text-xs text-ink-muted">JPEG, PNG, HEIC, PDF or .docx, up to 15 MB. Read on this device; nothing is uploaded.</p>

      <div aria-live="polite" className="mt-3">
        {reading && (
          <p className="flex items-center gap-2 text-sm font-medium text-ink-primary" role="status">
            <Loader2 className="w-4 h-4 animate-spin text-primary-600" aria-hidden="true" />
            Reading {phase.fileName}&hellip; {phase.progress > 0 ? `${Math.round(phase.progress * 100)}%` : ''}
          </p>
        )}

        {phase.name === 'error' && (
          <p role="alert" className="flex items-start gap-2 text-sm text-risk-high-text">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" /> {phase.message}
          </p>
        )}

        {phase.name === 'empty' && (
          <p role="alert" className="flex items-start gap-2 text-sm text-risk-med-text">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
            <span>
              No soil values could be found in {phase.fileName}. For a photo, lay the card flat in good light with all of it in the frame. You can still set the meters by hand.
            </span>
          </p>
        )}

        {phase.name === 'done' && (
          <div className="rounded-md bg-white border border-risk-low-border p-4 space-y-3" role="status">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="flex items-center gap-2 font-semibold text-risk-low-text">
                <Check className="w-4 h-4" aria-hidden="true" />
                {phase.result.sure.length ? `Filled ${phase.result.sure.length} of 6 meters from ${phase.fileName}` : `Nothing could be read reliably from ${phase.fileName}`}
              </p>
              <button
                type="button"
                onClick={() => {
                  setSoil(phase.previous)
                  onScanned?.({})
                  setPhase({ name: 'idle' })
                }}
                className="inline-flex items-center gap-1.5 min-h-[40px] px-3 rounded-full text-sm font-semibold text-terracotta-600 hover:bg-terracotta-50 cursor-pointer"
              >
                <Undo2 className="w-4 h-4" aria-hidden="true" /> Undo
              </button>
            </div>
            <ul className="flex flex-wrap gap-2">
              {phase.result.sure.map((f) => (
                <li key={f.key} className="text-sm rounded-full border px-3 py-1 bg-risk-low-bg text-risk-low-text border-risk-low-border">
                  {f.label}: <strong>{f.value}</strong> {f.unit}
                </li>
              ))}
              {phase.result.unsure.map((f) => (
                <li key={f.key} className="text-sm rounded-full border px-3 py-1 bg-risk-med-bg text-risk-med-text border-risk-med-border">
                  <span className="font-semibold">Not sure: </span>
                  {f.label}, saw <strong>{f.value}</strong>. Set it by hand.
                </li>
              ))}
            </ul>
            {phase.result.sure.some((f) => f.note) && (
              <ul className="text-xs text-ink-secondary list-disc pl-5">
                {phase.result.sure.filter((f) => f.note).map((f) => (
                  <li key={f.key}>{f.label}: {f.note}</li>
                ))}
              </ul>
            )}
            {phase.result.missing.length > 0 && (
              <p className="text-sm text-ink-secondary">Not found, left as they were: {phase.result.missing.join(', ')}.</p>
            )}
            {phase.result.unsure.length > 0 || (phase.result.confidence != null && phase.result.confidence < LOW_CONFIDENCE) ? (
              <p className="flex items-start gap-2 text-sm font-medium text-risk-med-text bg-risk-med-bg border border-risk-med-border rounded-md px-3 py-2">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
                <span>
                  Parts of this were hard to read. Handwriting, blur and glare often turn digits into other digits, so unsure values were left alone. Check every scanned meter against your report. Printed or typed reports read far more reliably.
                </span>
              </p>
            ) : (
              <p className="text-xs text-ink-muted">Scans can misread a digit. Check each meter against your report before running the model.</p>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
