import { DialGauge } from '../ui/Gauges.jsx'

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

/**
 * One soil parameter: a vertical slider, a dial showing where the value sits against its rating
 * bands, and an exact-value box. `bands` is [{ upTo, color, label }] in ascending order; the last
 * band's upTo is ignored (it runs to `max`).
 */
export default function ParamDial({ id, label, unit, value, min, max, step = 1, bands, onChange, decimals = 0, scanned }) {
  const numeric = Number.isFinite(value) ? value : min
  const span = max - min
  const frac = clamp((numeric - min) / span, 0, 1)
  const segments = bands.map((b, i) => ({
    to: i === bands.length - 1 ? 1 : clamp((b.upTo - min) / span, 0, 1),
    color: b.color,
  }))
  const band = bands.find((b, i) => i === bands.length - 1 || numeric < b.upTo) || bands[bands.length - 1]
  const fill = band.color

  return (
    <div className="flex flex-col items-center gap-3 min-w-0">
      <label htmlFor={id} className="text-[15px] font-semibold text-ink-primary text-center leading-tight">
        {label}
      </label>
      {scanned && (
        <span
          className={`-mt-1.5 text-[11px] font-semibold rounded-full px-2 py-0.5 border ${
            scanned === 'check' ? 'bg-risk-med-bg text-risk-med-text border-risk-med-border' : 'bg-risk-low-bg text-risk-low-text border-risk-low-border'
          }`}
        >
          {scanned === 'check' ? 'Scanned: check this' : 'From scan'}
        </span>
      )}
      <div className="flex items-center gap-2">
        <div className="relative w-10 h-40 shrink-0">
          <input
            id={`${id}-range`}
            type="range"
            aria-label={`${label} slider`}
            min={min}
            max={max}
            step={step}
            value={clamp(numeric, min, max)}
            onChange={(e) => onChange(Number(e.target.value))}
            className="ab-range absolute left-1/2 top-1/2 w-40 h-10 -translate-x-1/2 -translate-y-1/2 -rotate-90"
            style={{ '--p': `${frac * 100}%`, '--c': fill }}
          />
        </div>
        <div className="text-center">
          <DialGauge value={frac} segments={segments} size={92} thickness={12} label={`${label} ${numeric} ${unit}, ${band.label}`} />
          <div className="text-xs font-semibold -mt-1" style={{ color: fill }}>{band.label}</div>
        </div>
      </div>
      <div className="flex items-baseline gap-1.5">
        <input
          id={id}
          type="number"
          inputMode="decimal"
          min={min}
          max={max}
          step={step}
          value={Number.isFinite(value) ? Number(value.toFixed(decimals + 1)) : ''}
          onChange={(e) => onChange(e.target.value === '' ? NaN : Number(e.target.value))}
          className="w-[4.6rem] min-h-[40px] text-center text-lg font-semibold rounded-md border-2 border-border-default focus:border-primary-600 bg-white focus:outline-none"
        />
        <span className="text-sm text-ink-secondary">{unit}</span>
      </div>
    </div>
  )
}
