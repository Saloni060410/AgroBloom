import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { Sparkles, Loader2, AlertCircle, ChevronDown, Plus, Info } from 'lucide-react'
import useDocumentTitle from '../hooks/useDocumentTitle.js'
import * as endpoints from '../services/endpoints.js'
import { useRecommendationStore } from '../store/useRecommendationStore.js'
import { usePlotStore } from '../store/usePlotStore.js'
import { DEFAULT_RATINGS, ratingsFromReference } from '../utils/soilHealth.js'
import { formatDate, titleCase } from '../utils/format.js'
import CropCard, { CropTile } from '../components/soil/CropCard.jsx'
import ParamDial from '../components/soil/ParamDial.jsx'
import FieldScene from '../components/illustrations/FieldScene.jsx'
import { BRAND } from '../components/brand/brand.js'

const LOW = '#c9683f'
const OK = '#6b9a3f'
const HIGH = '#e0a52f'

// Starting values when a field has no soil test yet: a typical Central Punjab soil. They are only a
// starting point for the sliders and the page says so.
const STARTER = { n: 210, p: 16, k: 310, ph: 7.4, organicCarbon: 0.48, moisture: 28 }

const toBands = (band, [lowLabel, okLabel, highLabel]) => [
  { upTo: band.low_below, color: LOW, label: lowLabel },
  { upTo: band.high_above, color: OK, label: okLabel },
  { upTo: Infinity, color: HIGH, label: highLabel },
]

export default function SoilInput() {
  const { fieldId } = useParams()
  const navigate = useNavigate()
  useDocumentTitle(`Soil Diagnostics — ${BRAND.name}`)

  const { plots, loadPlots, updateField: updatePlotInStore } = usePlotStore()
  const { generateRecommendation } = useRecommendationStore()

  const [field, setField] = useState(null)
  const [crops, setCrops] = useState([])
  const [ratings, setRatings] = useState(DEFAULT_RATINGS)
  const [cropId, setCropId] = useState('')
  const [soil, setSoil] = useState(STARTER)
  const [prefilledFrom, setPrefilledFrom] = useState(null) // ISO date of the soil test the sliders started from
  const [loadError, setLoadError] = useState(null)

  const [logs, setLogs] = useState([])
  const [fertilizers, setFertilizers] = useState([])
  const [newLog, setNewLog] = useState({ type: '', qty: '', date: new Date().toISOString().slice(0, 10) })
  const [logBusy, setLogBusy] = useState(false)
  const [logError, setLogError] = useState(null)

  const [running, setRunning] = useState(false)
  const [runError, setRunError] = useState(null)

  useEffect(() => {
    loadPlots()
  }, [loadPlots])

  // Everything about this field: the field, its crop list, the newest soil test and fertilizer logs.
  useEffect(() => {
    if (!fieldId) return undefined
    let cancelled = false
    async function load() {
      setLoadError(null)
      try {
        const [fieldRes, cropsRes, soilRes, logsRes, fertRes, ratingRes] = await Promise.all([
          endpoints.getFieldById(fieldId),
          endpoints.getReferenceCrops(),
          endpoints.getSoilTests(fieldId, { limit: 1 }).catch(() => null),
          endpoints.getFertilizerLogs(fieldId, { limit: 20 }).catch(() => null),
          endpoints.getReferenceFertilizers().catch(() => []),
          endpoints.getReferenceSoilRatings().catch(() => null),
        ])
        if (cancelled) return
        setField(fieldRes)
        setCrops(cropsRes)
        setCropId(fieldRes?.cropType || cropsRes[0]?.id || '')
        const latest = (soilRes?.items || [])[0]
        if (latest) {
          setSoil({ n: latest.n, p: latest.p, k: latest.k, ph: latest.ph, organicCarbon: latest.organicCarbon, moisture: latest.moisture })
          setPrefilledFrom(latest.testedOn)
        } else {
          setSoil(STARTER)
          setPrefilledFrom(null)
        }
        setLogs(logsRes?.items || [])
        setFertilizers(fertRes || [])
        setNewLog((l) => ({ ...l, type: l.type || fertRes?.[0]?.id || '' }))
        if (ratingRes) setRatings(ratingsFromReference(ratingRes))
      } catch (err) {
        if (!cancelled) setLoadError(err?.message || 'Could not load this field.')
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [fieldId])

  const set = (key) => (value) => setSoil((s) => ({ ...s, [key]: value }))

  const bands = useMemo(
    () => ({
      n: toBands(ratings.n, ['Low', 'Medium', 'High']),
      p: toBands(ratings.p, ['Low', 'Medium', 'High']),
      k: toBands(ratings.k, ['Low', 'Medium', 'High']),
      ph: [
        { upTo: 6.5, color: LOW, label: 'Acidic' },
        { upTo: 7.5, color: OK, label: 'Optimal' },
        { upTo: Infinity, color: HIGH, label: 'Alkaline' },
      ],
      oc: toBands(ratings.organic_carbon, ['Low', 'Medium', 'High']),
      moisture: [
        { upTo: 20, color: LOW, label: 'Dry' },
        { upTo: 35, color: OK, label: 'Good' },
        { upTo: Infinity, color: HIGH, label: 'Wet' },
      ],
    }),
    [ratings],
  )

  const activeCrop = crops.find((c) => c.id === cropId)
  const cropOptions = crops.map((c) => c.id)
  const allValid = Object.values(soil).every((v) => Number.isFinite(v))

  const runModel = async () => {
    if (!allValid || running) return
    setRunning(true)
    setRunError(null)
    try {
      await endpoints.createSoilTest(fieldId, {
        n: soil.n,
        p: soil.p,
        k: soil.k,
        ph: soil.ph,
        organicCarbon: soil.organicCarbon,
        moisture: soil.moisture,
      })
      // Choosing a different crop switches the field to it, starting at that crop's own first stage,
      // so the dashboard, the plan and the history all agree on what is growing.
      if (field && cropId !== field.cropType) {
        const switched = await endpoints.updateField(fieldId, {
          cropType: cropId,
          growthStage: activeCrop?.stages?.[0]?.id,
          sowingDate: new Date().toISOString().slice(0, 10),
        })
        updatePlotInStore(fieldId, switched)
      }
      await generateRecommendation(fieldId, {})
      navigate(`/fields/${fieldId}/recommendation`)
    } catch (err) {
      setRunError(err?.message || 'The model could not run. Check the values and try again.')
      setRunning(false)
    }
  }

  const addLog = async (e) => {
    e.preventDefault()
    const qty = parseFloat(newLog.qty)
    if (!newLog.type || !(qty > 0) || !newLog.date) {
      setLogError('Choose a product, a quantity above zero and a date.')
      return
    }
    setLogBusy(true)
    setLogError(null)
    try {
      const created = await endpoints.createFertilizerLog(fieldId, { type: newLog.type, quantityKgPerAcre: qty, appliedOn: newLog.date })
      setLogs((l) => [created, ...l])
      setNewLog((n) => ({ ...n, qty: '' }))
    } catch (err) {
      setLogError(err?.details?.fieldErrors?.appliedOn?.[0] || err?.message || 'Could not save this application.')
    } finally {
      setLogBusy(false)
    }
  }

  const fertName = (id) => fertilizers.find((f) => f.id === id)?.name || titleCase(id)

  return (
    <div className="pb-16">
      {/* Active field band */}
      <div className="bg-primary-600 text-white">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 py-6">
          <label htmlFor="active-field" className="text-sm font-semibold uppercase tracking-wider">
            Select your active field:
          </label>
          <div className="mt-2 flex items-stretch max-w-xl bg-white rounded-md overflow-hidden text-ink-primary shadow-md">
            <div className="w-16 shrink-0 bg-bg-muted">
              <FieldScene crop={field?.cropType || 'wheat'} seed={5} className="w-full h-full" />
            </div>
            <div className="relative flex-1">
              <select
                id="active-field"
                value={fieldId}
                onChange={(e) => navigate(`/fields/${e.target.value}/soil`)}
                className="w-full min-h-[52px] pl-4 pr-10 appearance-none bg-transparent text-base font-medium focus:outline-none cursor-pointer"
              >
                {plots.map(({ field: f }) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                    {f.cropType ? ` (${titleCase(f.cropType)})` : ''}
                  </option>
                ))}
                {!plots.some((p) => p.field.id === fieldId) && <option value={fieldId}>{field?.name || 'This field'}</option>}
              </select>
              <ChevronDown className="w-5 h-5 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-5 sm:px-8 pt-8 space-y-10">
        {loadError && (
          <div role="alert" className="p-4 rounded-md bg-risk-high-bg border border-risk-high-border text-risk-high-text text-sm">
            {loadError} <Link to="/dashboard" className="font-semibold underline">Back to My Fields</Link>
          </div>
        )}

        {/* 1. Crop */}
        <section aria-labelledby="step-crop">
          <h1 id="step-crop" className="text-lg font-bold uppercase tracking-wide text-ink-primary">1. Select your current crop:</h1>
          <div className="mt-5 grid grid-cols-[minmax(0,1fr)] lg:grid-cols-[19rem_minmax(0,1fr)] gap-8 items-start">
            {cropId ? (
              <CropCard
                key={cropId}
                crop={cropId}
                stageCount={activeCrop?.stages?.length}
                varietyCount={activeCrop?.varieties?.length}
                onConfirm={setCropId}
              />
            ) : (
              <div className="h-[26rem] rounded-xl bg-white/60 border border-border-default animate-pulse" aria-hidden="true" />
            )}
            <div>
              <p className="text-sm text-ink-secondary mb-3">Pick another crop to plan for. The dose tables switch with it.</p>
              {field && cropId && cropId !== field.cropType && (
                <p role="status" className="mb-3 text-sm rounded-md bg-accent-maize border border-risk-med-border text-risk-med-text px-3 py-2">
                  Running the model will switch {field.name} from {titleCase(field.cropType)} to {titleCase(cropId)}, at its first growth stage, with today as the sowing date. You can change both on the field page.
                </p>
              )}
              <div className="flex lg:grid lg:grid-cols-3 gap-4 overflow-x-auto lg:overflow-visible pb-3 no-scrollbar">
                {cropOptions
                  .filter((id) => id !== cropId)
                  .map((id) => (
                    <CropTile key={id} crop={id} selected={false} onSelect={setCropId} />
                  ))}
              </div>
            </div>
          </div>
        </section>

        {/* 2. Soil parameters */}
        <section aria-labelledby="step-soil">
          <h2 id="step-soil" className="text-lg font-bold uppercase tracking-wide text-ink-primary">2. Configure soil health parameters:</h2>
          <p className="mt-1 text-sm text-ink-secondary flex items-start gap-1.5">
            <Info className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
            {prefilledFrom
              ? `Started from this field’s soil test of ${formatDate(prefilledFrom)}. Adjust to match your new report.`
              : 'No soil test on file yet. The sliders start at a typical Central Punjab soil. Replace them with the values on your Soil Health Card.'}
          </p>
          <div className="mt-5 bg-white/80 border border-border-default rounded-lg shadow-sm p-5 sm:p-7 grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-x-4 gap-y-8">
            <ParamDial id="soil-n" label="Nitrogen (N)" unit="kg/ha" min={0} max={800} value={soil.n} onChange={set('n')} bands={bands.n} />
            <ParamDial id="soil-p" label="Phosphorus (P)" unit="kg/ha" min={0} max={60} value={soil.p} step={0.5} onChange={set('p')} bands={bands.p} decimals={1} />
            <ParamDial id="soil-k" label="Potassium (K)" unit="kg/ha" min={0} max={800} value={soil.k} onChange={set('k')} bands={bands.k} />
            <ParamDial id="soil-ph" label="Soil pH" unit="pH" min={4} max={10} value={soil.ph} step={0.1} onChange={set('ph')} bands={bands.ph} decimals={1} />
            <ParamDial id="soil-oc" label="Organic Carbon" unit="%" min={0} max={2} value={soil.organicCarbon} step={0.01} onChange={set('organicCarbon')} bands={bands.oc} decimals={2} />
            <ParamDial id="soil-moisture" label="Moisture (%)" unit="%" min={0} max={100} value={soil.moisture} onChange={set('moisture')} bands={bands.moisture} />
          </div>
        </section>

        {/* Run */}
        <div className="flex flex-col items-center gap-3">
          {runError && (
            <div role="alert" className="max-w-xl w-full p-3 rounded-md bg-risk-high-bg border border-risk-high-border text-risk-high-text text-sm flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
              <span>{runError}</span>
            </div>
          )}
          <button
            type="button"
            onClick={runModel}
            disabled={running || !allValid || !cropId}
            className="inline-flex items-center gap-3 min-h-[60px] px-10 rounded-full bg-primary-700 hover:bg-primary-900 disabled:opacity-60 text-white text-lg font-semibold uppercase tracking-wide shadow-[0_0_0_4px_#f3d9a3,0_10px_26px_-6px_rgba(88,122,52,0.6)] transition-all cursor-pointer active:scale-[0.98]"
          >
            {running ? <Loader2 className="w-6 h-6 animate-spin" aria-hidden="true" /> : <Sparkles className="w-6 h-6 text-accent-sun" aria-hidden="true" />}
            {running ? 'Running the model…' : 'Run AI fertilizer model'}
          </button>
          <p className="text-xs text-ink-muted">Saves this soil test to {field?.name || 'the field'}, then builds the plan from it.</p>
        </div>

        {/* Earlier applications */}
        <section aria-labelledby="prior-use" className="bg-white/70 border border-border-default rounded-lg p-5 sm:p-7">
          <h2 id="prior-use" className="text-lg font-semibold text-ink-primary">Fertilizer you already applied</h2>
          <p className="mt-1 text-sm text-ink-secondary max-w-2xl">
            Logged applications are credited against the new dose, so the plan does not ask you to buy what is already in the ground.
          </p>

          <form onSubmit={addLog} noValidate className="mt-4 grid sm:grid-cols-[1.4fr_1fr_1fr_auto] gap-3 items-end">
            <div>
              <label htmlFor="log-type" className="block text-sm font-medium mb-1">Product</label>
              <select id="log-type" value={newLog.type} onChange={(e) => setNewLog((n) => ({ ...n, type: e.target.value }))} className="w-full min-h-[44px] px-3 rounded-md border-2 border-border-default focus:border-primary-600 bg-white focus:outline-none">
                {fertilizers.map((f) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="log-qty" className="block text-sm font-medium mb-1">Kg per acre</label>
              <input id="log-qty" type="number" min="0" step="0.5" value={newLog.qty} onChange={(e) => setNewLog((n) => ({ ...n, qty: e.target.value }))} className="w-full min-h-[44px] px-3 rounded-md border-2 border-border-default focus:border-primary-600 bg-white focus:outline-none" />
            </div>
            <div>
              <label htmlFor="log-date" className="block text-sm font-medium mb-1">Applied on</label>
              <input id="log-date" type="date" max={new Date().toISOString().slice(0, 10)} value={newLog.date} onChange={(e) => setNewLog((n) => ({ ...n, date: e.target.value }))} className="w-full min-h-[44px] px-3 rounded-md border-2 border-border-default focus:border-primary-600 bg-white focus:outline-none" />
            </div>
            <button type="submit" disabled={logBusy} className="min-h-[44px] px-5 inline-flex items-center justify-center gap-1.5 rounded-full bg-terracotta-600 hover:bg-terracotta-700 disabled:opacity-60 text-white font-medium cursor-pointer">
              {logBusy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Plus className="w-4 h-4" aria-hidden="true" />} Log it
            </button>
          </form>
          {logError && <p role="alert" className="mt-2 text-sm text-risk-high-text">{logError}</p>}

          {logs.length > 0 ? (
            <ul className="mt-4 divide-y divide-border-subtle text-sm">
              {logs.slice(0, 5).map((l) => (
                <li key={l.id} className="py-2.5 flex items-center justify-between gap-3">
                  <span className="font-medium text-ink-primary">{fertName(l.type)}</span>
                  <span className="text-ink-secondary">{l.quantityKgPerAcre} kg/acre &middot; {formatDate(l.appliedOn)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-ink-muted">Nothing logged yet for this field.</p>
          )}
        </section>
      </div>
    </div>
  )
}
