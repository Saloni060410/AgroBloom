import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Printer, Sun, CloudRain, Check, FileText, FlaskConical, AlertCircle, ChevronDown } from 'lucide-react'
import useDocumentTitle from '../hooks/useDocumentTitle.js'
import * as endpoints from '../services/endpoints.js'
import { useUserStore } from '../store/useUserStore.js'
import { useFieldHistory } from '../hooks/useFieldHistory.js'
import { formatDate, titleCase, daysFromToday, roundQty } from '../utils/format.js'
import { matchLogsToLines, notifyScheduleChanged, lineKey, saveLineHint } from '../utils/schedule.js'
import UndoToasts from '../components/ui/UndoToasts.jsx'
import ProductIcon from '../components/reco/ProductIcon.jsx'
import PlotSwitcher from '../components/layout/PlotSwitcher.jsx'
import PendingSchedulePanel from '../components/layout/PendingSchedulePanel.jsx'
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

// How long a "mark done" can be undone before the fertilizer log is actually saved.
const UNDO_MS = 6000
const todayIso = () => new Date().toISOString().slice(0, 10)

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
  const [queue, setQueue] = useState([]) // marked done, waiting out the undo window
  const [confirm, setConfirm] = useState(null) // { key, qty, date, error } for the step being confirmed
  const [markError, setMarkError] = useState(null)
  const [showDone, setShowDone] = useState(false)
  const pending = useRef(new Map()) // id -> { timer, item }

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

  // Saves a queued dose as a real FertilizerLog, so the next plan credits it and History shows it.
  const commit = useCallback(async (item) => {
    pending.current.delete(item.id)
    try {
      const created = await endpoints.createFertilizerLog(item.fieldId, {
        type: item.type,
        quantityKgPerAcre: item.qty,
        appliedOn: item.date,
      })
      saveLineHint(created.id, item.key)
      setExtra((prev) => ({ id: item.fieldId, list: [created, ...(prev.id === item.fieldId ? prev.list : [])] }))
      notifyScheduleChanged()
    } catch (err) {
      setMarkError(`Could not save ${item.label}: ${err?.message || 'try again'}. It is back in your open doses.`)
    } finally {
      setQueue((q) => q.filter((x) => x.id !== item.id))
    }
  }, [])

  // Anything still waiting is saved right away when the page is left, the field changes or the tab closes.
  useEffect(() => {
    const entries = pending.current
    const flush = () => {
      for (const { timer, item } of [...entries.values()]) {
        clearTimeout(timer)
        commit(item)
      }
    }
    window.addEventListener('pagehide', flush)
    return () => {
      window.removeEventListener('pagehide', flush)
      flush()
    }
  }, [fieldId, commit])

  const enqueue = (step, qty, date) => {
    const item = {
      id: `${step.key}-${Date.now()}`,
      key: step.key,
      fieldId,
      type: step.line.fertilizer_type,
      qty,
      date,
      label: `${roundQty(qty)} kg/acre ${step.product}`,
    }
    const timer = setTimeout(() => commit(item), UNDO_MS)
    pending.current.set(item.id, { timer, item })
    setQueue((q) => [...q, item])
    setConfirm(null)
    setMarkError(null)
  }

  const undo = (id) => {
    const entry = pending.current.get(id)
    if (entry) clearTimeout(entry.timer)
    pending.current.delete(id)
    setQueue((q) => q.filter((x) => x.id !== id))
  }

  const openConfirm = (step) => {
    if (confirm?.key === step.key) {
      setConfirm(null)
      return
    }
    setConfirm({ key: step.key, qty: String(roundQty(step.line.quantity_kg_per_acre, 2)), date: todayIso(), error: null })
  }

  const submitConfirm = (e, step) => {
    e.preventDefault()
    const qty = parseFloat(confirm.qty)
    const min = rec ? String(rec.createdAt).slice(0, 10) : '1970-01-01'
    let error = null
    if (!(qty > 0)) error = 'Enter the quantity you applied, above zero.'
    else if (!confirm.date || confirm.date > todayIso()) error = 'Choose a date that is not in the future.'
    else if (confirm.date < min) error = `Choose a date on or after ${formatDate(min)}, when this plan was made. Earlier applications are counted as earlier use, not as this dose.`
    if (error) {
      setConfirm({ ...confirm, error })
      return
    }
    enqueue(step, qty, confirm.date)
  }

  const matches = matchLogsToLines(rec, logs)
  const steps = (rec?.schedule || []).map((line, i) => {
    const m = meta[line.fertilizer_type]
    const key = lineKey(line, i)
    const queued = queue.find((q) => q.fieldId === fieldId && q.key === key) || null
    return {
      key,
      index: i,
      line,
      log: matches[i],
      queued,
      applied: Boolean(matches[i] || queued),
      status: stepStatus(line.apply_by),
      product: m?.name || h.fertName(line.fertilizer_type),
      bags: m?.bag_size_kg && field?.areaAcres ? `≈ ${((line.quantity_kg_per_acre * field.areaAcres) / m.bag_size_kg).toFixed(1)} bags of ${m.bag_size_kg} kg across ${field.areaAcres} acres` : null,
    }
  })
  const openSteps = steps.filter((s) => !s.applied)
  const doneSteps = steps.filter((s) => s.applied)
  const doneExpanded = showDone || (openSteps.length === 0 && doneSteps.length > 0)
  const toasts = queue
    .filter((q) => q.fieldId === fieldId)
    .map((q) => ({ id: q.id, message: `Logged ${q.label} on ${formatDate(q.date)}. Saving in a moment.`, onUndo: () => undo(q.id) }))

  const totals = {}
  for (const line of rec?.schedule || []) totals[line.fertilizer_type] = (totals[line.fertilizer_type] || 0) + line.quantity_kg_per_acre
  const rainy = weather && weather.rainfallMmForecast >= 2

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4 no-print">
        <div>
          <p className="text-sm font-semibold text-primary-700">{field ? `${field.name} · ${field.areaAcres ?? '?'} acres` : 'Loading field…'}</p>
          <h1 className="text-3xl font-bold text-ink-primary mt-0.5">Application Schedule</h1>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <PlotSwitcher fieldId={fieldId} suffix="/schedule" />
          <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-2 min-h-[46px] px-5 rounded-full border-2 border-primary-600 text-primary-700 hover:bg-primary-50 font-medium text-sm cursor-pointer transition-colors">
            <Printer className="w-4 h-4" aria-hidden="true" /> Print this field
          </button>
          <Link to="/schedule/all?print=1" className="inline-flex items-center gap-2 min-h-[46px] px-5 rounded-full bg-primary-600 hover:bg-primary-700 text-white font-medium text-sm shadow-sm transition-colors">
            <Printer className="w-4 h-4" aria-hidden="true" /> Print all fields
          </Link>
        </div>
      </div>

      <PendingSchedulePanel currentFieldId={fieldId} />

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

          {openSteps.length === 0 && doneSteps.length > 0 && (
            <p className="no-print flex items-center gap-2 rounded-lg bg-risk-low-bg border border-risk-low-border text-risk-low-text px-4 py-3 font-medium">
              <Check className="w-5 h-5" aria-hidden="true" /> Every dose in this plan is logged as applied.
            </p>
          )}

          {openSteps.length > 0 && (
            <ol className="relative space-y-4">
              <span className="absolute top-6 bottom-6 left-[1.55rem] w-0.5 bg-border-strong/50 no-print" aria-hidden="true" />
              {openSteps.map((s) => {
                const confirming = confirm?.key === s.key
                return (
                  <li key={s.key} className="relative grid grid-cols-[3.2rem_1fr] gap-x-3">
                    <span
                      className="relative z-10 mt-5 w-11 h-11 rounded-full inline-flex items-center justify-center text-lg font-semibold ring-4 ring-bg-base"
                      style={{ backgroundColor: s.status.current ? '#c9683f' : '#efe1c8', color: s.status.current ? '#fff' : '#75745e' }}
                    >
                      {String(s.index + 1).padStart(2, '0')}
                    </span>
                    <div className={`rounded-lg border shadow-sm p-5 ${s.status.current ? 'bg-white border-terracotta-500/60' : 'bg-white/80 border-border-default'}`}>
                      <div className="flex flex-col sm:flex-row gap-4 justify-between">
                        <div className="flex gap-4 min-w-0">
                          <ProductIcon type={s.line.fertilizer_type} className="w-14 h-16 shrink-0" />
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <h2 className="text-lg font-semibold text-ink-primary">{titleCase(s.line.stage)}</h2>
                              <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border ${TONE[s.status.tone]}`}>{s.status.text}</span>
                            </div>
                            <p className="mt-1 font-semibold text-ink-primary">{roundQty(s.line.quantity_kg_per_acre)} kg/acre {s.product}</p>
                            {s.bags && <p className="text-sm text-ink-secondary">{s.bags}</p>}
                            <p className="text-sm text-ink-muted mt-1.5">{s.line.timing_note || `Apply at the ${titleCase(s.line.stage).toLowerCase()} stage.`}</p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => openConfirm(s)}
                          aria-expanded={confirming}
                          aria-controls={`confirm-${s.key}`}
                          className="no-print self-start shrink-0 inline-flex items-center gap-1.5 min-h-[44px] px-5 rounded-full bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium shadow-sm cursor-pointer transition-colors"
                        >
                          <Check className="w-4 h-4" aria-hidden="true" />
                          Mark done
                        </button>
                      </div>

                      {confirming && (
                        <form
                          id={`confirm-${s.key}`}
                          onSubmit={(e) => submitConfirm(e, s)}
                          noValidate
                          className="no-print mt-4 pt-4 border-t border-border-subtle grid sm:grid-cols-[1fr_1fr_auto] gap-3 items-end"
                        >
                          <div>
                            <label htmlFor={`qty-${s.key}`} className="block text-sm font-medium mb-1">Quantity applied (kg/acre)</label>
                            <input
                              id={`qty-${s.key}`}
                              type="number"
                              min="0"
                              step="0.1"
                              value={confirm.qty}
                              onChange={(e) => setConfirm({ ...confirm, qty: e.target.value, error: null })}
                              className="w-full min-h-[44px] px-3 rounded-md border-2 border-border-default focus:border-primary-600 bg-white font-semibold focus:outline-none"
                            />
                            <p className="text-xs text-ink-muted mt-1">Planned: {roundQty(s.line.quantity_kg_per_acre)} kg/acre</p>
                          </div>
                          <div>
                            <label htmlFor={`date-${s.key}`} className="block text-sm font-medium mb-1">Applied on</label>
                            <input
                              id={`date-${s.key}`}
                              type="date"
                              min={String(rec.createdAt).slice(0, 10)}
                              max={todayIso()}
                              value={confirm.date}
                              onChange={(e) => setConfirm({ ...confirm, date: e.target.value, error: null })}
                              className="w-full min-h-[44px] px-3 rounded-md border-2 border-border-default focus:border-primary-600 bg-white focus:outline-none"
                            />
                          </div>
                          <div className="flex gap-2">
                            <button type="submit" className="min-h-[44px] px-5 rounded-full bg-terracotta-600 hover:bg-terracotta-700 text-white text-sm font-medium cursor-pointer">Log it</button>
                            <button type="button" onClick={() => setConfirm(null)} className="min-h-[44px] px-4 rounded-full text-ink-secondary hover:bg-bg-subtle text-sm font-medium cursor-pointer">Cancel</button>
                          </div>
                          {confirm.error && <p role="alert" className="sm:col-span-3 text-sm text-risk-high-text">{confirm.error}</p>}
                        </form>
                      )}
                    </div>
                  </li>
                )
              })}
            </ol>
          )}

          {doneSteps.length > 0 && (
            <section aria-labelledby="done-heading" className="rounded-lg border border-border-default bg-white/70">
              <h2 id="done-heading">
                <button
                  type="button"
                  onClick={() => setShowDone((v) => !v)}
                  aria-expanded={doneExpanded}
                  className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left cursor-pointer min-h-[52px]"
                >
                  <span className="flex items-center gap-2.5 font-semibold text-ink-primary">
                    <span className="w-7 h-7 rounded-full bg-primary-600 text-white inline-flex items-center justify-center" aria-hidden="true"><Check className="w-4 h-4" /></span>
                    Done
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-risk-low-bg text-risk-low-text border border-risk-low-border">{doneSteps.length}</span>
                  </span>
                  <ChevronDown className={`w-5 h-5 text-ink-muted transition-transform ${doneExpanded ? 'rotate-180' : ''}`} aria-hidden="true" />
                </button>
              </h2>
              {doneExpanded && (
                <ul className="divide-y divide-border-subtle border-t border-border-subtle">
                  {doneSteps.map((s) => (
                    <li key={s.key} className="px-5 py-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm">
                      <span className="flex items-center gap-3 min-w-0">
                        <span className="text-ink-muted font-semibold tabular-nums">{String(s.index + 1).padStart(2, '0')}</span>
                        <ProductIcon type={s.line.fertilizer_type} className="w-6 h-7 shrink-0" />
                        <span className="min-w-0">
                          <span className="font-medium text-ink-primary">{titleCase(s.line.stage)}</span>
                          <span className="text-ink-secondary"> &middot; {s.product}</span>
                        </span>
                      </span>
                      <span className="flex items-center gap-3 text-ink-secondary">
                        {s.queued ? (
                          <>
                            <span>{roundQty(s.queued.qty)} kg/acre &middot; saving&hellip;</span>
                            <button type="button" onClick={() => undo(s.queued.id)} className="no-print font-semibold text-terracotta-600 hover:underline cursor-pointer min-h-touch">Undo</button>
                          </>
                        ) : (
                          <span>{roundQty(s.log.quantityKgPerAcre)} kg/acre &middot; logged {formatDate(s.log.appliedOn)}</span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

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
      <UndoToasts items={toasts} durationMs={UNDO_MS} />
    </div>
  )
}
