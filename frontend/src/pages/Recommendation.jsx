import { useMemo, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Download, Check, FlaskConical, ChevronDown, Wallet, ShieldAlert } from 'lucide-react'
import useDocumentTitle from '../hooks/useDocumentTitle.js'
import { useFieldHistory } from '../hooks/useFieldHistory.js'
import { buildHistoryEvents } from '../utils/historyEvents.js'
import { capitalize } from '../utils/format.js'
import DoseTimeline from '../components/reco/DoseTimeline.jsx'
import HistoryTimeline from '../components/reco/HistoryTimeline.jsx'
import EcoMeter from '../components/reco/EcoMeter.jsx'
import PlanExplainer from '../components/reco/PlanExplainer.jsx'
import FilterSelect from '../components/reco/FilterSelect.jsx'
import PlotSwitcher from '../components/layout/PlotSwitcher.jsx'
import { SoilBagArt } from '../components/illustrations/SmallArt.jsx'
import { BRAND } from '../components/brand/brand.js'

const RISK_BOX = {
  LOW: 'bg-risk-low-bg border-risk-low-border text-risk-low-text',
  MEDIUM: 'bg-risk-med-bg border-risk-med-border text-risk-med-text',
  HIGH: 'bg-risk-high-bg border-risk-high-border text-risk-high-text',
}

export default function Recommendation() {
  const { fieldId } = useParams()
  useDocumentTitle(`Fertilizer Recommendation — ${BRAND.name}`)
  const h = useFieldHistory(fieldId)
  const [filter, setFilter] = useState('all')
  const [showWhy, setShowWhy] = useState(false)

  const rec = h.recommendations[0] || null
  const fertilizerMeta = useMemo(() => Object.fromEntries(h.fertilizers.map((f) => [f.id, f])), [h.fertilizers])
  const events = useMemo(
    () => buildHistoryEvents({ ...h, cropName: h.cropName, fertName: h.fertName }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [h.field, h.soilTests, h.logs, h.recommendations, h.ratings, h.crops, h.fertilizers],
  )
  const visible = filter === 'all' ? events : events.filter((e) => e.kind === filter)

  const cropLabel = rec ? h.cropName(rec.cropType) : h.cropName(h.field?.cropType)
  const fieldName = h.field?.name || 'Field'

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 no-print">
        <h1 className="text-2xl sm:text-[2rem] font-bold text-primary-900 leading-tight">Fertilizer Recommendation &amp; Field History</h1>
        <PlotSwitcher fieldId={fieldId} suffix="/recommendation" />
      </div>
      <div className="print-only text-lg font-semibold">{BRAND.name} &middot; {fieldName} &middot; Fertilizer summary</div>

      {h.status === 'error' && (
        <div role="alert" className="p-4 rounded-md bg-risk-high-bg border border-risk-high-border text-risk-high-text text-sm flex flex-wrap items-center justify-between gap-3">
          <span>{h.error}</span>
          <button type="button" onClick={h.reload} className="font-semibold underline cursor-pointer">Try again</button>
        </div>
      )}

      <div className="grid xl:grid-cols-[1.4fr_1fr] gap-6 items-start">
        {/* Left: the plan */}
        <section aria-labelledby="ml-output" className="bg-white rounded-lg border border-border-default shadow-md p-5 sm:p-7">
          {h.status === 'loading' ? (
            <div className="space-y-4 animate-pulse" aria-hidden="true">
              <div className="h-8 w-2/3 bg-bg-muted rounded" />
              <div className="h-64 bg-bg-muted rounded" />
            </div>
          ) : !rec ? (
            <div className="text-center py-10 space-y-4">
              <SoilBagArt className="w-48 h-40 mx-auto" />
              <h2 id="ml-output" className="text-xl font-semibold text-ink-primary">No plan for {fieldName} yet</h2>
              <p className="text-ink-secondary max-w-md mx-auto text-sm">Enter a soil test and the model will build a dose and a dated schedule from it.</p>
              <Link to={`/fields/${fieldId}/soil`} className="inline-flex items-center gap-2 min-h-[48px] px-7 rounded-full bg-primary-600 hover:bg-primary-700 text-white font-medium shadow-md">
                <FlaskConical className="w-4 h-4" aria-hidden="true" /> Enter soil test
              </Link>
            </div>
          ) : (
            <>
              <h2 id="ml-output" className="text-2xl font-bold text-primary-900 leading-tight">ML Model Output for {cropLabel}</h2>
              <p className="text-ink-primary mt-0.5">{fieldName}{h.field?.areaAcres ? ` · ${h.field.areaAcres} acres` : ''}</p>
              <h3 className="mt-3 text-lg font-bold text-ink-primary">Recommended Fertilizer Dosage</h3>

              <div className="mt-4 grid md:grid-cols-[14rem_1fr] gap-6">
                <div className="flex flex-col items-center gap-6">
                  <SoilBagArt className="w-48 h-40" />
                  <div className="w-full">
                    <h4 className="text-lg font-bold text-ink-primary mb-1">Eco-Health Meter</h4>
                    <EcoMeter riskLevel={rec.risk?.level} nutrientBalance={rec.explanation?.nutrient_balance} />
                  </div>
                </div>
                <div>
                  <DoseTimeline
                    schedule={rec.schedule || []}
                    sowingDate={h.field?.sowingDate}
                    areaAcres={h.field?.areaAcres}
                    fertName={h.fertName}
                    fertilizerMeta={fertilizerMeta}
                  />
                </div>
              </div>

              <div className="mt-6 grid sm:grid-cols-2 gap-3 text-sm">
                <div className={`rounded-md border p-3.5 flex gap-2.5 ${RISK_BOX[rec.risk?.level] || RISK_BOX.LOW}`}>
                  <ShieldAlert className="w-5 h-5 shrink-0 mt-0.5" aria-hidden="true" />
                  <div>
                    <div className="font-semibold text-ink-primary">{capitalize(rec.risk?.level || 'low')} risk</div>
                    <p className="text-ink-secondary mt-0.5">{rec.risk?.reason}</p>
                    {rec.risk?.soilHealthImpact && <p className="text-ink-secondary mt-1.5"><span className="font-medium text-ink-primary">Soil health: </span>{rec.risk.soilHealthImpact}</p>}
                    {rec.risk?.yieldImpact && <p className="text-ink-secondary mt-1.5"><span className="font-medium text-ink-primary">Yield: </span>{rec.risk.yieldImpact}</p>}
                  </div>
                </div>
                <div className="rounded-md bg-accent-maize/70 border border-risk-med-border p-3.5 flex gap-2.5">
                  <Wallet className="w-5 h-5 text-risk-med-text shrink-0 mt-0.5" aria-hidden="true" />
                  <div>
                    <div className="font-semibold text-ink-primary">
                      {rec.estimatedCost != null ? `₹${Math.round(rec.estimatedCost)} per acre` : 'Cost not available'}
                    </div>
                    <p className="text-ink-secondary mt-0.5">
                      {rec.estimatedSaving == null
                        ? 'No earlier application logged, so there is nothing to compare the cost with.'
                        : rec.estimatedSaving >= 0
                          ? `₹${Math.round(rec.estimatedSaving)} per acre less than the fertilizer you last logged.`
                          : `₹${Math.abs(Math.round(rec.estimatedSaving))} per acre more than you last logged. The field needs nutrients it did not get before.`}
                    </p>
                    <p className="text-xs text-ink-muted mt-1.5">Model {rec.modelVersion} &middot; weather: {rec.weatherSource || 'unknown'}</p>
                  </div>
                </div>
              </div>

              <div className="mt-4">
                <button
                  type="button"
                  onClick={() => setShowWhy((v) => !v)}
                  aria-expanded={showWhy}
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary-700 hover:underline cursor-pointer min-h-touch no-print"
                >
                  How this dose was calculated
                  <ChevronDown className={`w-4 h-4 transition-transform ${showWhy ? 'rotate-180' : ''}`} aria-hidden="true" />
                </button>
                {showWhy && <div className="mt-2"><PlanExplainer recommendation={rec} /></div>}
              </div>

              <div className="mt-6 flex flex-wrap items-center gap-3 no-print">
                <Link
                  to={`/fields/${fieldId}/schedule`}
                  className="inline-flex items-center gap-2 min-h-[52px] px-7 rounded-md bg-terracotta-600 hover:bg-terracotta-700 text-white text-lg font-medium shadow-md transition-colors"
                >
                  Log Applications to Field History
                  <span className="w-7 h-7 rounded-md bg-white/20 inline-flex items-center justify-center" aria-hidden="true"><Check className="w-5 h-5" /></span>
                </Link>
                <Link to={`/fields/${fieldId}/soil`} className="min-h-[48px] inline-flex items-center px-5 rounded-full border-2 border-primary-600 text-primary-700 hover:bg-primary-50 font-medium">
                  New soil test
                </Link>
              </div>
            </>
          )}
        </section>

        {/* Right: the field's history */}
        <section aria-labelledby="history-log" className="rounded-lg bg-bg-subtle border border-border-default shadow-md p-5 sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h2 id="history-log" className="text-2xl font-bold text-ink-primary leading-tight">{fieldName} History Log</h2>
            <button
              type="button"
              onClick={() => window.print()}
              className="no-print inline-flex items-center gap-2.5 min-h-[52px] px-4 rounded-full bg-bg-muted hover:bg-border-default text-left cursor-pointer transition-colors"
            >
              <Download className="w-6 h-6 text-terracotta-600 shrink-0" aria-hidden="true" />
              <span className="text-sm font-semibold leading-tight">Download PDF<br />Summary</span>
            </button>
          </div>
          <div className="mt-4 no-print"><FilterSelect value={filter} onChange={setFilter} /></div>
          <div className="mt-4">
            {h.status === 'loading' ? (
              <div className="space-y-3 animate-pulse" aria-hidden="true">
                {[0, 1, 2].map((i) => <div key={i} className="h-20 bg-bg-muted rounded-lg" />)}
              </div>
            ) : (
              <HistoryTimeline events={visible} emptyText="No events of this kind yet." />
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
