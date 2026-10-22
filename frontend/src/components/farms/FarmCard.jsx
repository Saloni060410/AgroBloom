import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Droplets, Sprout, FlaskConical, ArrowRight, Trash2, CalendarClock, Plus } from 'lucide-react'
import FieldScene from '../illustrations/FieldScene.jsx'
import { RingGauge } from '../ui/Gauges.jsx'
import { soilHealthScore, soilHealthBand, npkSummary } from '../../utils/soilHealth.js'
import { formatDate, titleCase } from '../../utils/format.js'
import PendingTag from './PendingTag.jsx'

function dueText(days) {
  if (days == null) return ''
  if (days < 0) return `${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} overdue`
  if (days === 0) return 'today'
  return `in ${days} day${days === 1 ? '' : 's'}`
}

/**
 * One illustrated card per farm. A farm with several crops shows a tab for each on the picture; the
 * rest of the card (facts, soil health, next dose, buttons) follows the selected crop.
 */
export default function FarmCard({ group, cropNameOf, details = {}, ratings, onRemove, onAddCrop, index }) {
  const { farm, plots } = group
  const [pickedId, setPickedId] = useState(null)
  // The picked crop, else the first one with work due, else the first.
  const plot =
    plots.find((p) => p.field.id === pickedId) ||
    plots.find((p) => (details[p.field.id]?.pendingCount || 0) > 0) ||
    plots[0]
  const { field } = plot
  const detail = details[field.id]
  const cropName = cropNameOf(field.cropType)
  const several = plots.length > 1
  const totalAcres = plots.reduce((sum, p) => sum + (p.field.areaAcres || 0), 0)
  const soil = detail?.soil || null
  const score = soilHealthScore(soil, ratings)
  const band = soilHealthBand(score)
  const npk = npkSummary(soil, ratings)
  const next = detail?.next || null
  const pendingAnywhere = plots.some((p) => (details[p.field.id]?.pendingCount || 0) > 0)
  const crop = field.cropType || 'wheat'

  return (
    <article className={`group relative bg-white rounded-lg border shadow-md p-3 flex flex-col animate-reveal transition-all duration-normal hover:shadow-lg hover:-translate-y-0.5 focus-within:shadow-lg ${pendingAnywhere ? 'border-risk-high-text ring-1 ring-risk-high-border' : 'border-border-default'}`} style={{ animationDelay: `${index * 70}ms` }}>
      <div className="relative">
        <div className="rounded-md overflow-hidden">
          <FieldScene crop={crop} seed={index + 3} className="w-full h-40 sm:h-44 block" />
        </div>
        <PendingTag status={detail} className="absolute top-3 left-3" />

        {/* Above the card's stretched link (z-10), so the tabs switch crop instead of opening it. */}
        <div role="tablist" aria-label={`Crops on ${farm.name}`} className="absolute z-10 left-3 right-3 bottom-3 flex gap-1.5 overflow-x-auto">
          {several &&
            plots.map((p) => {
              const selected = p.field.id === field.id
              const due = (details[p.field.id]?.pendingCount || 0) > 0
              return (
                <button
                  key={p.field.id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => setPickedId(p.field.id)}
                  className={`shrink-0 inline-flex items-center gap-1.5 min-h-[38px] px-3.5 rounded-full border text-sm font-medium cursor-pointer transition-colors ${
                    selected ? 'bg-primary-600 border-primary-600 text-white' : 'bg-white/85 border-white/70 text-ink-primary hover:bg-white'
                  }`}
                >
                  {due && (
                    <span className={`w-2 h-2 rounded-full bg-risk-high-text ${selected ? 'ring-2 ring-white' : ''}`}>
                      <span className="sr-only">Work due. </span>
                    </span>
                  )}
                  {cropNameOf(p.field.cropType)}
                </button>
              )
            })}
          <button
            type="button"
            onClick={() => onAddCrop?.(plot)}
            className="shrink-0 inline-flex items-center gap-1 min-h-[38px] px-3 rounded-full border border-dashed border-white bg-black/20 text-white text-sm font-medium hover:bg-black/30 cursor-pointer transition-colors"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden="true" /> Crop
            <span className="sr-only"> (add another crop to {farm.name})</span>
          </button>
        </div>
      </div>

      <div className="px-2 pt-4 flex-1">
        <h2 className="text-xl font-semibold text-ink-primary leading-snug">
          {/* The link stretches over the whole card, so clicking anywhere opens the field. The
              buttons at the bottom sit above it (relative z-10) and keep their own actions. */}
          <Link to={`/fields/${field.id}`} className="after:absolute after:inset-0 after:rounded-lg focus-visible:after:ring-2 focus-visible:after:ring-primary-600 group-hover:underline">
            {farm.name} <span className="text-ink-muted font-normal no-underline">&middot;</span>{' '}
            {several ? <span className="text-ink-secondary text-base font-normal">{totalAcres ? `${Number(totalAcres.toFixed(1))} acres, ` : ''}{plots.length} crops</span> : cropName}
          </Link>
        </h2>

        <div className="mt-3 flex items-start justify-between gap-3">
          <dl className="text-[15px] text-ink-primary space-y-1.5 min-w-0">
            <div><dt className="inline">Area: </dt><dd className="inline">{field.areaAcres != null ? `${field.areaAcres} Acres` : 'Not set'}</dd></div>
            <div><dt className="inline">Crop: </dt><dd className="inline">{cropName}{field.cropVariety ? ` (${field.cropVariety})` : ''}</dd></div>
            <div><dt className="inline">Planted: </dt><dd className="inline">{field.sowingDate ? formatDate(field.sowingDate) : 'Not set'}</dd></div>
            {field.growthStage && <div className="text-ink-muted text-sm">Stage: {titleCase(field.growthStage)}</div>}
          </dl>

          <div className="shrink-0 text-center">
            {score != null ? (
              <RingGauge value={score / 100} color={band.color} size={104} stroke={10} label={`Soil health ${score} percent, ${band.label}`}>
                <span className="text-[11px] text-ink-secondary leading-none">Soil Health</span>
                <span className="text-2xl font-semibold text-ink-primary leading-tight">{score}%</span>
              </RingGauge>
            ) : (
              <RingGauge value={0} size={104} stroke={10} label="No soil test yet">
                <span className="text-[11px] text-ink-secondary leading-none">Soil Health</span>
                <span className="text-lg font-semibold text-ink-muted leading-tight">&ndash;</span>
              </RingGauge>
            )}
            <div className="text-xs font-semibold -mt-1" style={{ color: band.color }}>{band.label}</div>
          </div>
        </div>
      </div>

      <div className="mt-4 pt-4 border-t border-border-subtle grid grid-cols-2 gap-3 px-1">
        <div className="flex items-center gap-2.5">
          <span className="w-11 h-11 rounded-md bg-accent-water-soft text-accent-water inline-flex items-center justify-center shrink-0">
            <Droplets className="w-6 h-6" aria-hidden="true" />
          </span>
          <div className="leading-tight">
            <div className="text-xs text-ink-secondary">Moisture</div>
            <div className="text-lg font-semibold">{soil ? `${soil.moisture}%` : '–'}</div>
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <span className="w-11 h-11 rounded-md bg-accent-maize text-accent-amber inline-flex items-center justify-center shrink-0">
            <FlaskConical className="w-6 h-6" aria-hidden="true" />
          </span>
          <div className="leading-tight">
            <div className="text-xs text-ink-secondary">NPK</div>
            <div className="text-lg font-semibold">{npk ? npk.text : '–'}</div>
          </div>
        </div>
      </div>

      <div className="mt-3 mx-1 rounded-md bg-primary-50 px-3 py-2.5 text-sm flex items-center gap-2.5 min-h-[44px]">
        <CalendarClock className="w-5 h-5 text-primary-600 shrink-0" aria-hidden="true" />
        {next ? (
          <span>
            <span className="font-semibold">Next dose {dueText(next.days)}:</span>{' '}
            {(next.line.quantity_kg_per_acre ?? 0).toFixed(1)} kg/acre {titleCase(next.line.fertilizer_type)}
          </span>
        ) : detail?.recommendation ? (
          <span>
            {(detail.recommendation.schedule || []).some((l) => l.apply_by)
              ? 'Every dated dose in the plan is logged as applied'
              : 'No dated application in the current plan'}
          </span>
        ) : (
          <span>No plan yet. Enter a soil test to get one.</span>
        )}
      </div>

      <div className="relative z-10 mt-4 flex items-center gap-2 px-1 pb-1">
        <Link
          to={`/fields/${field.id}/soil`}
          className="flex-1 inline-flex items-center justify-center gap-1.5 min-h-[44px] rounded-full border-2 border-primary-600 text-primary-700 hover:bg-primary-50 text-sm font-medium transition-colors"
        >
          <Sprout className="w-4 h-4" aria-hidden="true" /> Soil test
        </Link>
        <Link
          to={`/fields/${field.id}/recommendation`}
          className="flex-1 inline-flex items-center justify-center gap-1.5 min-h-[44px] rounded-full bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium shadow-sm transition-colors"
        >
          View plan <ArrowRight className="w-4 h-4" aria-hidden="true" />
        </Link>
        <button
          type="button"
          onClick={() => onRemove(plot)}
          aria-label={several ? `Remove ${cropName} from ${farm.name}` : `Remove ${farm.name}`}
          title={several ? `Remove ${cropName} from this farm` : 'Remove this farm'}
          className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-full text-ink-muted hover:text-risk-high-text hover:bg-risk-high-bg cursor-pointer transition-colors"
        >
          <Trash2 className="w-[18px] h-[18px]" aria-hidden="true" />
        </button>
      </div>
    </article>
  )
}
