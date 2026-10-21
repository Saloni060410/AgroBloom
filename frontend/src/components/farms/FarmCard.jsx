import { Link } from 'react-router-dom'
import { Droplets, Sprout, FlaskConical, ArrowRight, Trash2, CalendarClock } from 'lucide-react'
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

/** One illustrated farmland card: photo, plot facts, soil health ring and the next dose. */
export default function FarmCard({ plot, cropName, detail, ratings, onRemove, index }) {
  const { farm, field } = plot
  const soil = detail?.soil || null
  const score = soilHealthScore(soil, ratings)
  const band = soilHealthBand(score)
  const npk = npkSummary(soil, ratings)
  const next = detail?.next || null
  const pending = (detail?.pendingCount || 0) > 0
  const crop = field.cropType || 'wheat'

  return (
    <article className={`bg-white rounded-lg border shadow-md p-3 flex flex-col animate-reveal ${pending ? 'border-risk-high-text ring-1 ring-risk-high-border' : 'border-border-default'}`} style={{ animationDelay: `${index * 70}ms` }}>
      <div className="relative">
        <Link to={`/fields/${field.id}`} className="block rounded-md overflow-hidden" aria-label={`Open ${field.name}`}>
          <FieldScene crop={crop} seed={index + 3} className="w-full h-40 sm:h-44 block" />
        </Link>
        <PendingTag status={detail} className="absolute top-3 left-3" />
      </div>

      <div className="px-2 pt-4 flex-1">
        <h2 className="text-xl font-semibold text-ink-primary leading-snug">
          {field.name} <span className="text-ink-muted font-normal">&middot;</span> {cropName}
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

      <div className="mt-4 flex items-center gap-2 px-1 pb-1">
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
          onClick={() => onRemove(farm)}
          aria-label={`Remove ${farm.name}`}
          title="Remove this farm"
          className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-full text-ink-muted hover:text-risk-high-text hover:bg-risk-high-bg cursor-pointer transition-colors"
        >
          <Trash2 className="w-[18px] h-[18px]" aria-hidden="true" />
        </button>
      </div>
    </article>
  )
}
