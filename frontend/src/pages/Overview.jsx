import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, FlaskConical, CalendarClock, Sprout, Ruler, ArrowRight } from 'lucide-react'
import useDocumentTitle from '../hooks/useDocumentTitle.js'
import { useUserStore } from '../store/useUserStore.js'
import { usePlotStore } from '../store/usePlotStore.js'
import { usePlotDetails } from '../hooks/usePlotDetails.js'
import PendingTag from '../components/farms/PendingTag.jsx'
import { soilHealthScore, soilHealthBand } from '../utils/soilHealth.js'
import { firstName, titleCase } from '../utils/format.js'
import LocalWeatherCard from '../components/layout/LocalWeatherCard.jsx'
import { Avatar } from '../components/layout/UserMenu.jsx'
import { BRAND } from '../components/brand/brand.js'

function Kpi({ icon: Icon, label, value, tone = 'bg-primary-100 text-primary-700' }) {
  return (
    <div className="bg-white rounded-lg border border-border-default shadow-sm p-5 flex items-center gap-4">
      <span className={`w-12 h-12 rounded-md inline-flex items-center justify-center shrink-0 ${tone}`}>
        <Icon className="w-6 h-6" aria-hidden="true" />
      </span>
      <div className="leading-tight">
        <div className="text-2xl font-semibold text-ink-primary">{value}</div>
        <div className="text-sm text-ink-secondary mt-0.5">{label}</div>
      </div>
    </div>
  )
}

/** Cross-field summary: totals and what needs attention next. Everything here is derived from real records. */
export default function Overview() {
  useDocumentTitle(`Overview — ${BRAND.name}`)
  const user = useUserStore((s) => s.user)
  const { plots, status, loadPlots } = usePlotStore()
  const { details, ratings } = usePlotDetails(plots)

  useEffect(() => {
    loadPlots()
  }, [loadPlots])

  const totalAcres = plots.reduce((sum, p) => sum + (p.field.areaAcres || 0), 0)
  const withSoil = plots.filter((p) => details[p.field.id]?.soil)

  // Build the attention list from each field's soil test, newest plan and unapplied doses.
  const attention = []
  for (const { field } of plots) {
    const d = details[field.id]
    if (!d) continue
    if (d.needsSoil) {
      const missing = d.soilState.state === 'missing'
      attention.push({ id: `${field.id}-soil`, tone: 'warn', field, text: d.soilState.reason, to: `/fields/${field.id}/soil`, cta: missing ? 'Enter soil test' : 'Retest soil' })
      if (missing) continue
    }
    const rec = d.recommendation
    if (rec?.risk?.level === 'HIGH' || rec?.risk?.level === 'MEDIUM') {
      attention.push({ id: `${field.id}-risk`, tone: rec.risk.level === 'HIGH' ? 'bad' : 'warn', field, text: rec.risk.reason, to: `/fields/${field.id}/recommendation`, cta: 'Open plan' })
    }
    if (d.overdue > 0) {
      const worst = d.due[0]
      attention.push({ id: `${field.id}-overdue`, tone: 'bad', field, text: `${titleCase(worst.line.fertilizer_type)} was due ${Math.abs(worst.days)} day${Math.abs(worst.days) === 1 ? '' : 's'} ago${d.overdue > 1 ? ` (${d.overdue} doses overdue)` : ''}.`, to: `/fields/${field.id}/schedule`, cta: 'Open schedule' })
    }
  }
  const dueSoon = plots.reduce((n, p) => n + (details[p.field.id]?.due.filter((x) => x.days >= 0).length || 0), 0)

  const weatherField = plots.find((p) => p.field.latitude != null)?.field || plots[0]?.field

  return (
    <div className="space-y-8">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-5 animate-reveal">
        <div className="flex items-center gap-4">
          <Avatar name={user?.name} size={72} className="ring-4 ring-white shadow-md" />
          <div>
            <h1 className="text-3xl sm:text-[2.2rem] font-bold text-ink-primary leading-tight">Welcome back, {firstName(user?.name)}!</h1>
            <p className="mt-1 text-ink-secondary">Here is where your fields stand today.</p>
          </div>
        </div>
        <LocalWeatherCard plots={plots} fallbackField={weatherField} />
      </header>

      <section aria-label="Totals" className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4 animate-reveal delay-1">
        <Kpi icon={Sprout} label="Fields" value={plots.length} />
        <Kpi icon={Ruler} label="Acres in total" value={totalAcres.toFixed(1)} tone="bg-accent-maize text-accent-amber" />
        <Kpi icon={FlaskConical} label="Fields with a soil test" value={`${withSoil.length} of ${plots.length}`} tone="bg-accent-water-soft text-accent-water" />
        <Kpi icon={CalendarClock} label="Doses due within 7 days" value={dueSoon} tone="bg-terracotta-100 text-terracotta-700" />
      </section>

      <div className="grid lg:grid-cols-[1.2fr_1fr] gap-6">
        <section aria-labelledby="attention" className="bg-white rounded-lg border border-border-default shadow-sm p-6 animate-reveal delay-2">
          <h2 id="attention" className="text-xl font-semibold text-ink-primary">Needs attention</h2>
          {status !== 'ready' ? (
            <p className="mt-4 text-sm text-ink-muted">Loading your fields&hellip;</p>
          ) : attention.length === 0 ? (
            <p className="mt-4 flex items-center gap-2 text-primary-700 font-medium">
              <CheckCircle2 className="w-5 h-5" aria-hidden="true" /> Nothing needs attention right now.
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-border-subtle">
              {attention.map((a) => (
                <li key={a.id} className="py-4 flex items-start gap-3">
                  <AlertTriangle className={`w-5 h-5 mt-0.5 shrink-0 ${a.tone === 'bad' ? 'text-risk-high-text' : 'text-risk-med-text'}`} aria-hidden="true" />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-ink-primary">{a.field.name}</div>
                    <p className="text-sm text-ink-secondary mt-0.5">{a.text}</p>
                  </div>
                  <Link to={a.to} className="shrink-0 inline-flex items-center gap-1 text-sm font-semibold text-primary-700 hover:underline min-h-touch">
                    {a.cta} <ArrowRight className="w-4 h-4" aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="by-field" className="bg-white rounded-lg border border-border-default shadow-sm p-6 animate-reveal delay-3">
          <h2 id="by-field" className="text-xl font-semibold text-ink-primary">Soil health by field</h2>
          {plots.length === 0 ? (
            <p className="mt-4 text-sm text-ink-muted">
              No fields yet. <Link className="text-primary-700 font-semibold hover:underline" to="/dashboard">Add your first farm.</Link>
            </p>
          ) : (
            <ul className="mt-4 space-y-4">
              {plots.map(({ field }) => {
                const score = soilHealthScore(details[field.id]?.soil, ratings)
                const band = soilHealthBand(score)
                return (
                  <li key={field.id}>
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <Link to={`/fields/${field.id}`} className="font-semibold text-ink-primary hover:underline truncate">{field.name}</Link>
                      <span className="text-ink-secondary shrink-0 flex items-center gap-2">
                        <PendingTag status={details[field.id]} />
                        {score != null ? `${score}% · ${band.label}` : band.label}
                      </span>
                    </div>
                    <div className="mt-1.5 h-2.5 rounded-full bg-bg-muted overflow-hidden" role="img" aria-label={score != null ? `Soil health ${score} percent` : 'No soil test'}>
                      <div className="h-full rounded-full transition-all duration-slow" style={{ width: `${score ?? 0}%`, backgroundColor: band.color }} />
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}
