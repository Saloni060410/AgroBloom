import { useState, useEffect, useCallback, useId } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Trash2, AlertTriangle, AlertOctagon, ShieldCheck, ArrowRight, Loader2, Info, Leaf, Sparkles } from 'lucide-react'
import useDebounce from '../../hooks/useDebounce.js'
import * as endpoints from '../../services/endpoints.js'
import { capitalize } from '../../utils/format.js'

const NUTRIENTS = [
  ['n', 'Nitrogen (N)'],
  ['p', 'Phosphorus (P₂O₅)'],
  ['k', 'Potassium (K₂O)'],
]

const LEVELS = {
  high: {
    tag: 'High risk: over-application',
    icon: AlertOctagon,
    box: 'border-risk-high-border bg-risk-high-bg',
    text: 'text-risk-high-text',
    summary: 'Far more than the crop can use. Expect runoff, wasted money and possible root burn.',
  },
  medium: {
    tag: 'Medium risk: imbalance',
    icon: AlertTriangle,
    box: 'border-risk-med-border bg-risk-med-bg',
    text: 'text-risk-med-text',
    summary: 'The amounts are out of balance with what the soil and crop need. Adjust before applying.',
  },
  low: {
    tag: 'Low risk: safe dose',
    icon: ShieldCheck,
    box: 'border-risk-low-border bg-risk-low-bg',
    text: 'text-risk-low-text',
    summary: 'This matches the crop’s need and the soil’s reserves.',
  },
}

function bagsText(fertilizer, kgPerAcre, acres) {
  const total = Number(kgPerAcre) * Number(acres)
  if (!total || total <= 0) return null
  const bagKg = fertilizer?.bag_size_kg || (String(fertilizer?.id || '').includes('urea') ? 45 : 50)
  const bags = total / bagKg
  return `${Math.round(total)} kg for the field, about ${bags.toFixed(1)} bags of ${bagKg} kg`
}

const fmt = (v, d = 1) => (Number.isFinite(Number(v)) ? Number(v).toFixed(d).replace(/\.0+$/, '') : '-')

/**
 * Live "what if I apply this?" check. Every change to the planned products re-runs the real
 * POST /fields/:id/risk-check after a short pause. Nothing is saved.
 */
export default function PlanRiskChecker({ fieldId, onBackToRecommended, fieldArea = 1, cropType = '' }) {
  const uid = useId()
  const [fertilizers, setFertilizers] = useState([])
  const [rows, setRows] = useState([
    { id: 'row-1', fertilizerType: 'urea', quantityKgPerAcre: 90 },
    { id: 'row-2', fertilizerType: 'dap', quantityKgPerAcre: 50 },
  ])
  const debouncedRows = useDebounce(rows, 450)
  const [result, setResult] = useState(null)
  const [checking, setChecking] = useState(false)
  const [apiError, setApiError] = useState(null)

  useEffect(() => {
    endpoints
      .getReferenceFertilizers()
      .then((list) => Array.isArray(list) && list.length && setFertilizers(list))
      .catch(() => {})
  }, [])

  const run = useCallback(
    async (input) => {
      const planned = input
        .filter((r) => r.fertilizerType && Number(r.quantityKgPerAcre) > 0)
        .map((r) => ({ fertilizerType: r.fertilizerType, quantityKgPerAcre: Number(r.quantityKgPerAcre) }))
      if (!planned.length) {
        setResult(null)
        setApiError(null)
        return
      }
      setChecking(true)
      setApiError(null)
      try {
        setResult(await endpoints.checkRisk(fieldId, { plannedApplication: planned }))
      } catch (err) {
        setApiError({ status: err.status, message: err.message || 'Could not complete the risk check.' })
        setResult(null)
      } finally {
        setChecking(false)
      }
    },
    [fieldId],
  )

  useEffect(() => {
    // Deferred a tick so the check starts after render rather than inside the effect body.
    const timer = setTimeout(() => run(debouncedRows), 0)
    return () => clearTimeout(timer)
  }, [debouncedRows, run])

  const update = (id, key, value) => setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [key]: value } : r)))
  const remove = (id) => setRows((prev) => (prev.length > 1 ? prev.filter((r) => r.id !== id) : prev))
  const add = () => {
    const unused = fertilizers.find((f) => !rows.some((r) => r.fertilizerType === f.id))?.id || 'urea'
    setRows((prev) => [...prev, { id: `row-${Date.now()}`, fertilizerType: unused, quantityKgPerAcre: 20 }])
  }

  const level = LEVELS[String(result?.risk?.level).toLowerCase()] || LEVELS.low
  const LevelIcon = level.icon

  return (
    <div className="space-y-6">
      <p className="rounded-md bg-bg-subtle border border-border-default px-4 py-2.5 text-sm text-ink-secondary flex items-center justify-between gap-3">
        <span className="flex items-center gap-2"><Info className="w-4 h-4 text-primary-600 shrink-0" aria-hidden="true" />Nothing here is saved. It only tells you how a dose would fare{cropType ? ` for ${capitalize(cropType)}` : ''}.</span>
        {checking && <Loader2 className="w-4 h-4 animate-spin text-primary-600" aria-label="Checking" />}
      </p>

      {apiError?.status === 409 && (
        <div role="alert" className="rounded-lg border-2 border-risk-med-border bg-risk-med-bg p-5 space-y-3">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-6 h-6 text-risk-med-text shrink-0" aria-hidden="true" />
            <div>
              <h2 className="font-semibold text-ink-primary">This field needs a soil test and a crop first</h2>
              <p className="text-sm text-ink-secondary mt-1">{apiError.message}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link to={`/fields/${fieldId}/soil`} className="min-h-[44px] inline-flex items-center px-5 rounded-full bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium">Enter soil test</Link>
            <Link to={`/fields/${fieldId}`} className="min-h-[44px] inline-flex items-center px-5 rounded-full border-2 border-primary-600 text-primary-700 text-sm font-medium">Field overview</Link>
          </div>
        </div>
      )}

      {apiError && apiError.status !== 409 && (
        <div role="alert" className="rounded-md bg-risk-high-bg border border-risk-high-border text-risk-high-text p-4 text-sm flex items-center justify-between gap-3">
          <span className="flex items-center gap-2"><AlertOctagon className="w-5 h-5 shrink-0" aria-hidden="true" />{apiError.message}</span>
          <button type="button" onClick={() => run(rows)} className="font-semibold underline cursor-pointer">Try again</button>
        </div>
      )}

      <section aria-labelledby={`${uid}-planned`} className="bg-white rounded-lg border border-border-default shadow-sm p-5 sm:p-6 space-y-4">
        <h2 id={`${uid}-planned`} className="text-xl font-semibold text-ink-primary">What you plan to apply</h2>
        <div className="space-y-3">
          {rows.map((row, idx) => {
            const fert = fertilizers.find((f) => f.id === row.fertilizerType)
            const bags = bagsText(fert || { id: row.fertilizerType }, row.quantityKgPerAcre, fieldArea)
            return (
              <div key={row.id} className="grid sm:grid-cols-[2rem_1.4fr_1fr_auto] gap-3 items-start rounded-md bg-bg-base border border-border-subtle p-3.5">
                <span className="hidden sm:block text-sm font-semibold text-ink-muted pt-2.5">#{idx + 1}</span>
                <div>
                  <label htmlFor={`${uid}-p-${row.id}`} className="sr-only">Product {idx + 1}</label>
                  <select id={`${uid}-p-${row.id}`} value={row.fertilizerType} onChange={(e) => update(row.id, 'fertilizerType', e.target.value)} className="w-full min-h-[44px] px-3 rounded-md border-2 border-border-default focus:border-primary-600 bg-white text-sm font-medium focus:outline-none cursor-pointer">
                    {(fertilizers.length ? fertilizers : [{ id: 'urea', name: 'Urea' }, { id: 'dap', name: 'DAP' }]).map((f) => (
                      <option key={f.id} value={f.id}>{f.name || f.id}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <div className="relative">
                    <label htmlFor={`${uid}-q-${row.id}`} className="sr-only">Kilograms per acre for product {idx + 1}</label>
                    <input id={`${uid}-q-${row.id}`} type="number" min="0" step="1" value={row.quantityKgPerAcre} onChange={(e) => update(row.id, 'quantityKgPerAcre', e.target.value)} className="w-full min-h-[44px] pl-3 pr-20 rounded-md border-2 border-border-default focus:border-primary-600 bg-white font-semibold focus:outline-none" />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-ink-muted pointer-events-none">kg/acre</span>
                  </div>
                  {bags && <p className="text-xs text-ink-muted mt-1">{bags}</p>}
                </div>
                <button type="button" onClick={() => remove(row.id)} disabled={rows.length === 1} aria-label={`Remove product ${idx + 1}`} className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-full text-ink-muted hover:text-risk-high-text hover:bg-risk-high-bg disabled:opacity-30 cursor-pointer">
                  <Trash2 className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>
            )
          })}
        </div>
        <button type="button" onClick={add} className="min-h-[44px] inline-flex items-center gap-1.5 px-5 rounded-full border-2 border-primary-600 text-primary-700 hover:bg-primary-50 text-sm font-medium cursor-pointer">
          <Plus className="w-4 h-4" aria-hidden="true" /> Add another product
        </button>
      </section>

      {result && (
        <div className="space-y-5 animate-reveal">
          <section aria-label="Risk result" className={`rounded-lg border-2 p-5 sm:p-6 space-y-4 ${level.box}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className={`flex items-center gap-2 font-semibold ${level.text}`}>
                  <LevelIcon className="w-5 h-5" aria-hidden="true" /> {level.tag}
                  {result.risk?.overApplicationPct != null && result.risk.overApplicationPct > 0 && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-white/70">{fmt(result.risk.overApplicationPct, 0)}% over</span>
                  )}
                </p>
                <p className="mt-1.5 text-ink-primary font-medium">{result.risk?.reason || level.summary}</p>
              </div>
              <button type="button" onClick={onBackToRecommended} className="min-h-[44px] px-5 rounded-full bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium cursor-pointer">
                Use the recommended dose instead
              </button>
            </div>
            <div className="grid md:grid-cols-2 gap-3 text-sm">
              <div className="rounded-md bg-white/70 p-3.5">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-primary flex items-center gap-1.5"><Leaf className="w-3.5 h-3.5 text-primary-600" aria-hidden="true" /> Soil health</p>
                <p className="mt-1 text-ink-secondary">{result.risk?.soilHealthImpact}</p>
              </div>
              <div className="rounded-md bg-white/70 p-3.5">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-primary flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5 text-accent-amber" aria-hidden="true" /> Yield</p>
                <p className="mt-1 text-ink-secondary">{result.risk?.yieldImpact}</p>
              </div>
            </div>
          </section>

          {result.nutrientBalance && (
            <section aria-labelledby={`${uid}-bal`} className="bg-white rounded-lg border border-border-default shadow-sm p-5 sm:p-6">
              <h2 id={`${uid}-bal`} className="text-xl font-semibold text-ink-primary">Planned against recommended, per nutrient</h2>
              <p className="text-xs text-ink-muted mt-0.5">100% means your plan matches what the model recommends. Amounts are kg per hectare.</p>
              <div className="mt-4 grid md:grid-cols-3 gap-4">
                {NUTRIENTS.map(([key, label]) => {
                  const n = result.nutrientBalance[key] || { appliedKgHa: 0, recommendedKgHa: 0, ratio: 1 }
                  const pct = Math.round((n.ratio || 0) * 100)
                  const high = pct > 120
                  const low = pct < 80
                  const tone = high ? 'bg-risk-high-text' : low ? 'bg-risk-med-text' : 'bg-primary-600'
                  return (
                    <div key={key} className="rounded-md bg-bg-base border border-border-subtle p-4 space-y-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-sm">{label}</span>
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${high ? 'bg-risk-high-bg text-risk-high-text' : low ? 'bg-risk-med-bg text-risk-med-text' : 'bg-risk-low-bg text-risk-low-text'}`}>
                          {high ? 'Too high' : low ? 'Too low' : 'Balanced'} ({pct}%)
                        </span>
                      </div>
                      <dl className="text-sm space-y-1">
                        <div className="flex justify-between"><dt className="text-ink-secondary">Planned</dt><dd className="font-semibold">{fmt(n.appliedKgHa)}</dd></div>
                        <div className="flex justify-between"><dt className="text-ink-secondary">Recommended</dt><dd className="font-semibold text-primary-700">{fmt(n.recommendedKgHa)}</dd></div>
                      </dl>
                      <div className="h-2.5 rounded-full bg-bg-muted overflow-hidden" role="img" aria-label={`${pct} percent of the recommended amount`}>
                        <div className={`h-full rounded-full ${tone}`} style={{ width: `${Math.min(pct, 150) / 1.5}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
              <div className="mt-5 pt-4 border-t border-border-subtle flex flex-wrap items-center justify-between gap-3">
                <span className="text-sm text-ink-secondary">The recommended plan is built from the same soil test and forecast.</span>
                <button type="button" onClick={onBackToRecommended} className="min-h-[44px] inline-flex items-center gap-2 px-5 rounded-full border-2 border-primary-600 text-primary-700 hover:bg-primary-50 text-sm font-medium cursor-pointer">
                  Back to the plan <ArrowRight className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  )
}
