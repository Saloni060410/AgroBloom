import { useMemo, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Download, FlaskConical, Sparkles, Droplets, Ruler } from 'lucide-react'
import useDocumentTitle from '../hooks/useDocumentTitle.js'
import { useFieldHistory } from '../hooks/useFieldHistory.js'
import { buildHistoryEvents } from '../utils/historyEvents.js'
import { soilHealthScore, soilHealthBand } from '../utils/soilHealth.js'
import { formatDate } from '../utils/format.js'
import HistoryTimeline from '../components/reco/HistoryTimeline.jsx'
import FilterSelect from '../components/reco/FilterSelect.jsx'
import PlotSwitcher from '../components/layout/PlotSwitcher.jsx'
import { RingGauge } from '../components/ui/Gauges.jsx'
import { BRAND } from '../components/brand/brand.js'

function Stat({ icon: Icon, label, value, note }) {
  return (
    <div className="bg-white rounded-lg border border-border-default shadow-sm p-4 flex items-start gap-3">
      <span className="w-10 h-10 rounded-md bg-primary-100 text-primary-700 inline-flex items-center justify-center shrink-0">
        <Icon className="w-5 h-5" aria-hidden="true" />
      </span>
      <div className="leading-tight min-w-0">
        <div className="text-xs text-ink-secondary">{label}</div>
        <div className="text-lg font-semibold text-ink-primary mt-0.5">{value}</div>
        {note && <div className="text-xs text-ink-muted mt-0.5">{note}</div>}
      </div>
    </div>
  )
}

/** Full-width log for one field, with a printable summary. */
export default function History() {
  const { fieldId } = useParams()
  const h = useFieldHistory(fieldId)
  useDocumentTitle(`Field History — ${BRAND.name}`)
  const [filter, setFilter] = useState('all')

  const events = useMemo(
    () => buildHistoryEvents({ ...h, cropName: h.cropName, fertName: h.fertName }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [h.field, h.soilTests, h.logs, h.recommendations, h.ratings, h.crops, h.fertilizers],
  )
  const visible = filter === 'all' ? events : events.filter((e) => e.kind === filter)

  const latestSoil = h.soilTests[0] || null
  const score = soilHealthScore(latestSoil, h.ratings)
  const band = soilHealthBand(score)
  const rec = h.recommendations[0]
  const fieldName = h.field?.name || 'Field'

  // Only savings the model actually computed against a logged baseline; never invented.
  const savings = h.recommendations.map((r) => r.estimatedSaving).filter((v) => v != null)
  const net = savings.reduce((a, b) => a + b, 0)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 no-print">
        <h1 className="text-2xl sm:text-[2rem] font-bold text-primary-900 leading-tight">{fieldName} &middot; Field History</h1>
        <div className="flex flex-wrap items-center gap-3">
          <PlotSwitcher fieldId={fieldId} suffix="/history" />
          <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-2 min-h-[46px] px-5 rounded-full bg-bg-muted hover:bg-border-default font-semibold text-sm cursor-pointer transition-colors">
            <Download className="w-4 h-4 text-terracotta-600" aria-hidden="true" /> Download PDF summary
          </button>
        </div>
      </div>
      <div className="print-only">
        <h1 className="text-2xl font-bold">{BRAND.name} &middot; {fieldName}</h1>
        <p className="text-sm">Field history summary, printed {formatDate(new Date())}</p>
      </div>

      {h.status === 'error' && (
        <div role="alert" className="p-4 rounded-md bg-risk-high-bg border border-risk-high-border text-risk-high-text text-sm flex justify-between gap-3">
          <span>{h.error}</span>
          <button type="button" onClick={h.reload} className="font-semibold underline cursor-pointer">Try again</button>
        </div>
      )}

      <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg border border-border-default shadow-sm p-4 flex items-center gap-4">
          <RingGauge value={(score ?? 0) / 100} color={band.color} size={84} stroke={9} label={score != null ? `Soil health ${score} percent` : 'No soil test yet'}>
            <span className="text-lg font-semibold">{score != null ? `${score}%` : '–'}</span>
          </RingGauge>
          <div className="leading-tight">
            <div className="text-xs text-ink-secondary">Soil health</div>
            <div className="font-semibold" style={{ color: band.color }}>{band.label}</div>
            {latestSoil && <div className="text-xs text-ink-muted mt-0.5">Tested {formatDate(latestSoil.testedOn)}</div>}
          </div>
        </div>
        <Stat icon={FlaskConical} label="Soil tests on record" value={h.soilTests.length} />
        <Stat icon={Sparkles} label="Plans generated" value={h.recommendations.length} note={rec ? `Latest: ${titleRisk(rec)}` : undefined} />
        <Stat
          icon={savings.length ? Droplets : Ruler}
          label="Cost vs. what you applied"
          value={savings.length ? `${net >= 0 ? '₹' : '−₹'}${Math.abs(Math.round(net))} ${net >= 0 ? 'saved' : 'more'}` : '–'}
          note={savings.length ? `Per acre, across ${savings.length} plan${savings.length === 1 ? '' : 's'} with a logged baseline` : 'Log an application to get a comparison'}
        />
      </div>

      <section aria-labelledby="full-log" className="rounded-lg bg-bg-subtle border border-border-default shadow-md p-5 sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="full-log" className="text-xl font-bold text-ink-primary">Everything recorded for {fieldName}</h2>
          <div className="no-print"><FilterSelect value={filter} onChange={setFilter} /></div>
        </div>
        <div className="mt-4 max-w-3xl">
          {h.status === 'loading' ? (
            <div className="space-y-3 animate-pulse" aria-hidden="true">
              {[0, 1, 2].map((i) => <div key={i} className="h-20 bg-bg-muted rounded-lg" />)}
            </div>
          ) : (
            <HistoryTimeline events={visible} emptyText="Nothing recorded yet. Enter a soil test to start this field's history." />
          )}
        </div>
        <div className="mt-6 no-print">
          <Link to={`/fields/${fieldId}/soil`} className="inline-flex items-center gap-2 min-h-[46px] px-6 rounded-full bg-primary-600 hover:bg-primary-700 text-white font-medium shadow-md">
            <FlaskConical className="w-4 h-4" aria-hidden="true" /> Enter a new soil test
          </Link>
        </div>
      </section>
    </div>
  )
}

function titleRisk(rec) {
  const l = rec.risk?.level
  return l ? `${l.charAt(0)}${l.slice(1).toLowerCase()} risk` : 'no risk rating'
}
