import { useEffect, useMemo, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Printer, Sun, CloudRain, Check, Loader2, FileText, FlaskConical, AlertCircle } from 'lucide-react'
import useDocumentTitle from '../hooks/useDocumentTitle.js'
import * as endpoints from '../services/endpoints.js'
import { useUserStore } from '../store/useUserStore.js'
import { useFieldHistory } from '../hooks/useFieldHistory.js'
import { formatDate, titleCase, daysFromToday, roundQty } from '../utils/format.js'
import ProductIcon from '../components/reco/ProductIcon.jsx'
import PlotSwitcher from '../components/layout/PlotSwitcher.jsx'
import { BRAND } from '../components/brand/brand.js'

// There is no execution log for a plan line, only the plan and the real fertilizer logs. Status is
// computed from apply_by against today, never assumed.
function stepStatus(applyBy) {
  const days = daysFromToday(applyBy)
  if (days == null) return { current: false, text: 'No fixed date for this stage', tone: 'neutral' }
  if (days < 0) return { current: true, text: `Overdue by ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'}`, tone: 'bad' }
  if (days === 0) return { current: true, text: 'Due today', tone: 'warn' }
  if (days <= 7) return { current: true, text: `Due in ${days} day${days === 1 ? '' : 's'}`, tone: 'warn' }
  return { current: false, text: `Scheduled for ${formatDate(applyBy)}`, tone: 'neutral' }
}

const TONE = {
  applied: 'bg-risk-low-bg text-risk-low-text border-risk-low-border',
  bad: 'bg-risk-high-bg text-risk-high-text border-risk-high-border',
  warn: 'bg-risk-med-bg text-risk-med-text border-risk-med-border',
  neutral: 'bg-bg-muted text-ink-secondary border-border-default',
}

export default function Schedule() {
  const { fieldId } = useParams()
  useDocumentTitle(`Application Schedule — ${BRAND.name}`)
  const user = useUserStore((s) => s.user)
  const h = useFieldHistory(fieldId)

  const [weatherState, setWeatherState] = useState({ id: null, weather: null })
  const [extra, setExtra] = useState({ id: null, list: [] })
  const [busyKey, setBusyKey] = useState(null)
  const [markError, setMarkError] = useState(null)

  useEffect(() => {
    let cancelled = false
    endpoints
      .getFieldWeather(fieldId)
      .then((w) => !cancelled && setWeatherState({ id: fieldId, weather: w }))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [fieldId])

  const weather = weatherState.id === fieldId ? weatherState.weather : null
  const extraLogs = extra.id === fieldId ? extra.list : []
  const rec = h.recommendations[0] || null
  const field = h.field
  const meta = useMemo(() => Object.fromEntries(h.fertilizers.map((f) => [f.id, f])), [h.fertilizers])
  const logs = [...extraLogs, ...h.logs]

  // "Done" writes a real FertilizerLog, so the next recommendation credits it and History shows it.
  const markDone = async (line, key) => {
    setBusyKey(key)
    setMarkError(null)
    try {
      const created = await endpoints.createFertilizerLog(fieldId, {
        type: line.fertilizer_type,
        quantityKgPerAcre: line.quantity_kg_per_acre,
        appliedOn: new Date().toISOString().slice(0, 10),
      })
      setExtra({ id: fieldId, list: [created, ...extraLogs] })
    } catch (err) {
      setMarkError(err?.message || 'Could not log this application. Try again.')
    } finally {
      setBusyKey(null)
    }
  }

  const steps = (rec?.schedule || []).map((line, i) => {
    const m = meta[line.fertilizer_type]
    const created = rec ? new Date(rec.createdAt) : null
    // A log of the same product made after the plan counts the step as applied. With two lines of the
    // same product this cannot tell them apart and marks both together.
    const applied = logs.some((l) => l.type === line.fertilizer_type && created && new Date(l.appliedOn) >= new Date(created.toISOString().slice(0, 10)))
    return {
      key: `${line.stage}-${line.fertilizer_type}-${i}`,
      line,
      applied,
      status: stepStatus(line.apply_by),
      product: m?.name || h.fertName(line.fertilizer_type),
      bags: m?.bag_size_kg && field?.areaAcres ? `≈ ${((line.quantity_kg_per_acre * field.areaAcres) / m.bag_size_kg).toFixed(1)} bags of ${m.bag_size_kg} kg across ${field.areaAcres} acres` : null,
    }
  })

  const totals = {}
  for (const line of rec?.schedule || []) totals[line.fertilizer_type] = (totals[line.fertilizer_type] || 0) + line.quantity_kg_per_acre
  const rainy = weather && weather.rainfallMmForecast >= 2

  return (
    <div className="max-w-5xl mx-auto px-5 sm:px-8 py-8 space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4 no-print">
        <div>
          <p className="text-sm font-semibold text-primary-700">{field ? `${field.name} · ${field.areaAcres ?? '?'} acres` : 'Loading field…'}</p>
          <h1 className="text-3xl font-bold text-ink-primary mt-0.5">Application Schedule</h1>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <PlotSwitcher fieldId={fieldId} suffix="/schedule" />
          <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-2 min-h-[46px] px-5 rounded-full border-2 border-primary-600 text-primary-700 hover:bg-primary-50 font-medium text-sm cursor-pointer transition-colors">
            <Printer className="w-4 h-4" aria-hidden="true" /> Print retailer slip
          </button>
        </div>
      </div>

      {h.status === 'error' && (
        <div role="alert" className="p-4 rounded-md bg-risk-high-bg border border-risk-high-border text-risk-high-text text-sm flex justify-between gap-3">
          <span>{h.error}</span>
          <button type="button" onClick={h.reload} className="font-semibold underline cursor-pointer">Try again</button>
        </div>
      )}

      {h.status === 'loading' && (
        <div className="space-y-4 animate-pulse" aria-hidden="true">
          {[0, 1].map((i) => <div key={i} className="h-36 rounded-lg bg-white/70 border border-border-default" />)}
        </div>
      )}

      {h.status === 'ready' && !rec && (
        <div className="bg-white rounded-lg border border-border-default shadow-sm p-10 text-center space-y-4">
          <h2 className="text-xl font-semibold">No plan to schedule yet</h2>
          <p className="text-sm text-ink-secondary">Enter a soil test to generate a dated application schedule.</p>
          <Link to={`/fields/${fieldId}/soil`} className="inline-flex items-center gap-2 min-h-[48px] px-7 rounded-full bg-primary-600 hover:bg-primary-700 text-white font-medium shadow-md">
            <FlaskConical className="w-4 h-4" aria-hidden="true" /> Enter soil test
          </Link>
        </div>
      )}

      {h.status === 'ready' && rec && (
        <>
          {weather && (
            <p className={`no-print inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium border ${rainy ? 'bg-info-bg text-info-text border-info-border' : 'bg-risk-low-bg text-risk-low-text border-risk-low-border'}`}>
              {rainy ? <CloudRain className="w-4 h-4" aria-hidden="true" /> : <Sun className="w-4 h-4" aria-hidden="true" />}
              {weather.rainfallMmForecast} mm rain forecast over 5 days ({weather.source === 'live' ? 'live' : titleCase(weather.source)}).
              {rainy ? ' Hold top-dressing until it has passed.' : ' A dry window for spreading.'}
            </p>
          )}

          {markError && (
            <div role="alert" className="p-3 rounded-md bg-risk-high-bg border border-risk-high-border text-risk-high-text text-sm flex items-center gap-2 no-print">
              <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" /> {markError}
            </div>
          )}

          <ol className="relative space-y-4">
            <span className="absolute top-6 bottom-6 left-[1.55rem] w-0.5 bg-border-strong/50 no-print" aria-hidden="true" />
            {steps.map((s, i) => (
              <li key={s.key} className="relative grid grid-cols-[3.2rem_1fr] gap-x-3">
                <span className="relative z-10 mt-5 w-11 h-11 rounded-full inline-flex items-center justify-center text-lg font-semibold ring-4 ring-bg-base"
                  style={{ backgroundColor: s.applied ? '#587a34' : s.status.current ? '#c9683f' : '#efe1c8', color: s.applied || s.status.current ? '#fff' : '#75745e' }}>
                  {s.applied ? <Check className="w-5 h-5" aria-hidden="true" /> : String(i + 1).padStart(2, '0')}
                </span>
                <div className={`rounded-lg border shadow-sm p-5 flex flex-col sm:flex-row gap-4 justify-between ${s.status.current && !s.applied ? 'bg-white border-terracotta-500/60' : 'bg-white/80 border-border-default'}`}>
                  <div className="flex gap-4 min-w-0">
                    <ProductIcon type={s.line.fertilizer_type} className="w-14 h-16 shrink-0" />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-lg font-semibold text-ink-primary">{titleCase(s.line.stage)}</h2>
                        <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border ${s.applied ? TONE.applied : TONE[s.status.tone]}`}>
                          {s.applied ? 'Applied' : s.status.text}
                        </span>
                      </div>
                      <p className="mt-1 font-semibold text-ink-primary">{roundQty(s.line.quantity_kg_per_acre)} kg/acre {s.product}</p>
                      {s.bags && <p className="text-sm text-ink-secondary">{s.bags}</p>}
                      <p className="text-sm text-ink-muted mt-1.5">{s.line.timing_note || `Apply at the ${titleCase(s.line.stage).toLowerCase()} stage.`}</p>
                    </div>
                  </div>
                  {!s.applied && (
                    <button
                      type="button"
                      onClick={() => markDone(s.line, s.key)}
                      disabled={busyKey === s.key}
                      title="Logs this product and quantity as applied today"
                      className="no-print self-start shrink-0 inline-flex items-center gap-1.5 min-h-[44px] px-5 rounded-full bg-primary-600 hover:bg-primary-700 disabled:opacity-60 text-white text-sm font-medium shadow-sm cursor-pointer transition-colors"
                    >
                      {busyKey === s.key ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Check className="w-4 h-4" aria-hidden="true" />}
                      Mark done
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ol>

          {/* Retailer slip, print-friendly */}
          <section aria-labelledby="slip" className="bg-white rounded-lg border border-border-default shadow-md p-6 sm:p-8">
            <div className="flex items-center justify-between gap-3 pb-4 border-b border-border-default">
              <div className="flex items-center gap-3">
                <span className="w-11 h-11 rounded-md bg-primary-100 text-primary-700 inline-flex items-center justify-center"><FileText className="w-6 h-6" aria-hidden="true" /></span>
                <div>
                  <h2 id="slip" className="text-xl font-semibold text-ink-primary leading-tight">Fertilizer purchase slip</h2>
                  <p className="text-xs text-ink-muted">Show this to your dealer. Quantities are per acre and for the whole field.</p>
                </div>
              </div>
            </div>
            <dl className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm pb-4 border-b border-border-subtle">
              <div><dt className="text-ink-muted">Farmer</dt><dd className="font-semibold mt-0.5">{user?.name || '-'}</dd></div>
              <div><dt className="text-ink-muted">Field</dt><dd className="font-semibold mt-0.5">{field ? `${field.name} (${field.areaAcres} acres)` : '-'}</dd></div>
              <div><dt className="text-ink-muted">Crop</dt><dd className="font-semibold mt-0.5">{h.cropName(rec.cropType)}</dd></div>
              <div><dt className="text-ink-muted">Estimated cost</dt><dd className="font-semibold text-primary-700 mt-0.5">{rec.estimatedCost != null ? `₹${Math.round(rec.estimatedCost)}/acre` : '-'}</dd></div>
            </dl>
            <ul className="mt-3 text-sm divide-y divide-border-subtle">
              {Object.entries(totals).map(([id, qty]) => {
                const m = meta[id]
                const total = field?.areaAcres ? qty * field.areaAcres : null
                return (
                  <li key={id} className="py-2.5 flex flex-wrap justify-between gap-2">
                    <span className="font-medium">{m?.name || h.fertName(id)}</span>
                    <span className="font-semibold">
                      {roundQty(qty)} kg/acre
                      {total != null && ` · ${roundQty(total)} kg total`}
                      {m?.bag_size_kg && total != null ? ` (≈ ${(total / m.bag_size_kg).toFixed(1)} bags)` : ''}
                    </span>
                  </li>
                )
              })}
            </ul>
            <p className="mt-4 text-xs text-ink-muted">Doses come from published PAU tables adjusted by this field&rsquo;s soil test. Confirm final rates with your local agriculture officer.</p>
          </section>
        </>
      )}
    </div>
  )
}
