import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowRight, FlaskConical, CalendarDays, Sparkles, ShieldCheck, MapPin, Droplets, Loader2, Check } from 'lucide-react'
import useDocumentTitle from '../hooks/useDocumentTitle.js'
import { useFieldHistory } from '../hooks/useFieldHistory.js'
import { nextApplication } from '../hooks/usePlotDetails.js'
import { usePlotStore } from '../store/usePlotStore.js'
import * as endpoints from '../services/endpoints.js'
import { soilHealthScore, soilHealthBand, npkSummary } from '../utils/soilHealth.js'
import { formatDate, titleCase, daysFromToday, capitalize, roundQty } from '../utils/format.js'
import FieldScene from '../components/illustrations/FieldScene.jsx'
import { RingGauge } from '../components/ui/Gauges.jsx'
import PlotSwitcher from '../components/layout/PlotSwitcher.jsx'
import WeatherCard from '../components/layout/WeatherCard.jsx'
import { BRAND } from '../components/brand/brand.js'

function Row({ icon: Icon, title, text, to, cta }) {
  return (
    <li className="p-5 flex flex-wrap items-center justify-between gap-3 hover:bg-bg-subtle/60 transition-colors">
      <div className="flex items-start gap-3.5 min-w-0">
        <span className="w-10 h-10 rounded-md bg-primary-100 text-primary-700 inline-flex items-center justify-center shrink-0">
          <Icon className="w-5 h-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <div className="font-semibold text-ink-primary">{title}</div>
          <div className="text-sm text-ink-secondary mt-0.5">{text}</div>
        </div>
      </div>
      <Link to={to} className="inline-flex items-center gap-1 text-sm font-semibold text-primary-700 hover:underline min-h-touch">
        {cta} <ArrowRight className="w-4 h-4" aria-hidden="true" />
      </Link>
    </li>
  )
}

/** Dossier for one field: facts, current soil health, the next dose, and the growth stage control. */
export default function FieldProfile() {
  const { fieldId } = useParams()
  useDocumentTitle(`Field — ${BRAND.name}`)
  const h = useFieldHistory(fieldId)
  const updatePlot = usePlotStore((s) => s.updateField)

  const field = h.field
  const crop = h.crops.find((c) => c.id === field?.cropType)
  const stages = crop?.stages || []
  const [edit, setEdit] = useState(null) // { fieldId, value, sowing, saved } for the field being edited
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)

  const editing = edit && edit.fieldId === fieldId ? edit : null
  const stage = editing ? editing.value : field?.growthStage || ''
  const sowing = editing ? editing.sowing : field?.sowingDate ? String(field.sowingDate).slice(0, 10) : ''
  const saved = Boolean(editing?.saved)
  const dirty = Boolean(editing) && !editing.saved && (stage !== (field?.growthStage || '') || sowing !== (field?.sowingDate ? String(field.sowingDate).slice(0, 10) : ''))

  const soil = h.soilTests[0] || null
  const rec = h.recommendations[0] || null
  const score = soilHealthScore(soil, h.ratings)
  const band = soilHealthBand(score)
  const npk = npkSummary(soil, h.ratings)
  const next = nextApplication(rec, daysFromToday)

  const saveStage = async () => {
    setSaving(true)
    setSaveError(null)
    try {
      const updated = await endpoints.updateField(fieldId, { growthStage: stage, ...(sowing ? { sowingDate: sowing } : {}) })
      updatePlot(fieldId, updated)
      setEdit({ fieldId, value: stage, sowing, saved: true })
      h.reload()
    } catch (err) {
      setSaveError(err?.message || 'Could not save the growth stage.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-5xl mx-auto px-5 sm:px-8 py-8 space-y-8">
      {h.status === 'error' && (
        <div role="alert" className="p-4 rounded-md bg-risk-high-bg border border-risk-high-border text-risk-high-text text-sm flex justify-between gap-3">
          <span>{h.error}</span>
          <Link to="/dashboard" className="font-semibold underline">Back to My Fields</Link>
        </div>
      )}

      <header className="rounded-lg overflow-hidden bg-white border border-border-default shadow-md">
        <FieldScene crop={field?.cropType || 'wheat'} seed={11} className="w-full h-40 sm:h-52 block" />
        <div className="p-5 sm:p-7 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-ink-primary leading-tight">{field?.name || 'Loading…'}</h1>
            <p className="mt-1 text-ink-secondary">
              {[
                h.cropName(field?.cropType),
                field?.cropVariety,
                field?.areaAcres != null ? `${field.areaAcres} acres` : null,
                field?.sowingDate ? `Sown ${formatDate(field.sowingDate)}` : null,
                field?.irrigation ? capitalize(field.irrigation) : null,
              ].filter(Boolean).join(' · ')}
            </p>
            {field?.latitude != null && (
              <p className="mt-1 text-sm text-ink-muted inline-flex items-center gap-1.5">
                <MapPin className="w-4 h-4" aria-hidden="true" /> {field.latitude.toFixed(3)}, {field.longitude.toFixed(3)}
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <PlotSwitcher fieldId={fieldId} suffix="" />
            {field && <WeatherCard field={field} className="!min-w-[15rem]" />}
          </div>
        </div>
      </header>

      <div className="grid md:grid-cols-[1fr_15rem] gap-6">
        <section aria-labelledby="next-action" className="bg-white rounded-lg border border-border-default shadow-md p-6 sm:p-7">
          <p id="next-action" className="text-xs font-semibold uppercase tracking-widest text-terracotta-600">Next action</p>
          {next ? (
            <>
              <p className="mt-2 text-3xl font-bold text-ink-primary leading-tight">
                {roundQty(next.line.quantity_kg_per_acre)} kg/acre {h.fertName(next.line.fertilizer_type)}
              </p>
              <p className="mt-1 text-ink-secondary">
                {titleCase(next.line.stage)} &middot; {next.days < 0 ? `${Math.abs(next.days)} days overdue` : next.days === 0 ? 'due today' : `due in ${next.days} days`} ({formatDate(next.line.apply_by)})
              </p>
              {next.line.timing_note && <p className="mt-3 text-sm text-ink-secondary border-t border-border-subtle pt-3">{next.line.timing_note}</p>}
            </>
          ) : rec ? (
            <p className="mt-2 text-lg text-ink-secondary">The current plan has no dated application. Open it to see the stages.</p>
          ) : (
            <p className="mt-2 text-lg text-ink-secondary">No plan yet. Enter a soil test and the model will build one.</p>
          )}
          <div className="mt-5 flex flex-wrap gap-3">
            <Link to={rec ? `/fields/${fieldId}/recommendation` : `/fields/${fieldId}/soil`} className="inline-flex items-center gap-2 min-h-[48px] px-6 rounded-full bg-primary-600 hover:bg-primary-700 text-white font-medium shadow-md transition-colors">
              {rec ? 'View full plan' : 'Enter soil test'} <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </Link>
            {rec && (
              <Link to={`/fields/${fieldId}/schedule`} className="inline-flex items-center min-h-[48px] px-6 rounded-full border-2 border-primary-600 text-primary-700 hover:bg-primary-50 font-medium transition-colors">
                Application dates
              </Link>
            )}
          </div>
        </section>

        <section aria-label="Soil health" className="bg-white rounded-lg border border-border-default shadow-md p-6 flex flex-col items-center justify-center text-center">
          <RingGauge value={(score ?? 0) / 100} color={band.color} size={120} stroke={11} label={score != null ? `Soil health ${score} percent, ${band.label}` : 'No soil test yet'}>
            <span className="text-xs text-ink-secondary">Soil Health</span>
            <span className="text-3xl font-semibold leading-tight">{score != null ? `${score}%` : '–'}</span>
          </RingGauge>
          <div className="mt-1 font-semibold" style={{ color: band.color }}>{band.label}</div>
          {npk && <div className="text-sm text-ink-secondary mt-1">NPK: {npk.text}</div>}
        </section>
      </div>

      <section aria-labelledby="stage" className="bg-white rounded-lg border border-border-default shadow-sm p-5 sm:p-6">
        <h2 id="stage" className="text-lg font-semibold text-ink-primary flex items-center gap-2"><Droplets className="w-5 h-5 text-accent-water" aria-hidden="true" /> Growth stage and sowing date</h2>
        <p className="text-sm text-ink-secondary mt-1">The plan is built for this stage. Move it forward as the crop grows, then run the model again.</p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label htmlFor="stage-select" className="sr-only">Growth stage</label>
          <select id="stage-select" value={stage} onChange={(e) => setEdit({ fieldId, value: e.target.value, sowing, saved: false })} disabled={!stages.length} className="min-h-[46px] px-4 rounded-md border-2 border-border-default focus:border-primary-600 bg-white text-sm font-medium focus:outline-none cursor-pointer">
            {stages.map((s) => (
              <option key={s.id} value={s.id}>{s.name_en}</option>
            ))}
          </select>
          <label htmlFor="sowing-date" className="sr-only">Sowing date</label>
          <input id="sowing-date" type="date" value={sowing} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setEdit({ fieldId, value: stage, sowing: e.target.value, saved: false })} className="min-h-[46px] px-4 rounded-md border-2 border-border-default focus:border-primary-600 bg-white text-sm font-medium focus:outline-none" />
          <button type="button" onClick={saveStage} disabled={saving || !stage || !dirty} className="min-h-[46px] px-6 inline-flex items-center gap-2 rounded-full bg-terracotta-600 hover:bg-terracotta-700 disabled:opacity-50 text-white text-sm font-medium cursor-pointer">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : saved ? <Check className="w-4 h-4" aria-hidden="true" /> : null}
            {saved ? 'Saved' : 'Save'}
          </button>
          {saveError && <span role="alert" className="text-sm text-risk-high-text">{saveError}</span>}
        </div>
      </section>

      <ul className="bg-white rounded-lg border border-border-default shadow-sm divide-y divide-border-subtle overflow-hidden">
        <Row
          icon={Sparkles}
          title="Fertilizer plan"
          text={rec ? `${roundQty(rec.quantityKgPerAcre)} kg/acre ${h.fertName(rec.fertilizerType)} as the main product · ${capitalize(rec.risk?.level || 'low')} risk` : 'No plan generated yet'}
          to={`/fields/${fieldId}/recommendation`}
          cta="Open plan"
        />
        <Row
          icon={FlaskConical}
          title="Latest soil test"
          text={soil ? `${formatDate(soil.testedOn)} · N ${soil.n} · P ${soil.p} · K ${soil.k} kg/ha · pH ${soil.ph} · OC ${soil.organicCarbon}%` : 'No soil test yet'}
          to={`/fields/${fieldId}/soil`}
          cta={soil ? 'Enter a new one' : 'Enter soil test'}
        />
        <Row
          icon={CalendarDays}
          title="Application schedule"
          text={rec ? `${(rec.schedule || []).length} application${(rec.schedule || []).length === 1 ? '' : 's'} in the current plan` : 'Available once a plan exists'}
          to={`/fields/${fieldId}/schedule`}
          cta="View dates"
        />
        <Row
          icon={ShieldCheck}
          title="Check your own dose"
          text="Try a quantity you were planning to apply and see its over- or under-application risk."
          to={`/fields/${fieldId}/risk-check`}
          cta="Run a risk check"
        />
      </ul>
    </div>
  )
}
