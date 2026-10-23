import { useEffect, useState } from 'react'
import { CloudSun, Thermometer, Droplets, MapPin } from 'lucide-react'
import * as endpoints from '../../services/endpoints.js'

const SOURCE_LABEL = { live: 'Live', cached: 'Cached', seasonal_average: 'Seasonal average' }

/** Weather for one field (Open-Meteo through the backend). Renders nothing until it has data. */
export default function WeatherCard({ field, className = '' }) {
  const [result, setResult] = useState({ id: null, weather: null, failed: false })
  const fieldId = field?.id
  const hasCoords = field?.latitude != null && field?.longitude != null

  useEffect(() => {
    if (!fieldId || !hasCoords) return undefined
    let cancelled = false
    endpoints
      .getFieldWeather(fieldId)
      .then((w) => {
        if (!cancelled) setResult({ id: fieldId, weather: w, failed: false })
      })
      .catch(() => {
        if (!cancelled) setResult({ id: fieldId, weather: null, failed: true })
      })
    return () => {
      cancelled = true
    }
  }, [fieldId, hasCoords])

  if (!field) return null

  // Ignore a result that belongs to a previously shown field.
  const current = result.id === fieldId ? result : { weather: null, failed: false }
  const { weather, failed } = current


  return (
    <section
      aria-label="Weather"
      className={`bg-white/90 rounded-lg shadow-md border border-border-subtle px-5 py-3.5 min-w-[260px] ${className}`}
    >
      <div className="flex items-center gap-1.5 text-sm font-semibold text-ink-primary">
        <MapPin className="w-4 h-4 text-ink-muted" aria-hidden="true" />
        <span className="truncate">{field.name}</span>
      </div>
      {weather ? (
        <div className="mt-2 flex items-center gap-4">
          <CloudSun className="w-10 h-10 shrink-0 text-accent-ochre" aria-hidden="true" />
          <div className="leading-tight">
            <div className="text-2xl font-semibold">{Math.round(weather.temperatureC)}&deg;C</div>
            <div className="text-xs text-ink-secondary">Right now</div>
          </div>
          <div className="w-px self-stretch bg-border-default" aria-hidden="true" />
          <dl className="text-xs text-ink-secondary space-y-1">
            <div className="flex items-center gap-1.5"><Droplets className="w-3.5 h-3.5" aria-hidden="true" /><dt className="sr-only">Humidity</dt><dd>Humidity {Math.round(weather.humidityPct)}%</dd></div>
            <div className="flex items-center gap-1.5"><Thermometer className="w-3.5 h-3.5" aria-hidden="true" /><dt className="sr-only">Rain forecast</dt><dd>{weather.rainfallMmForecast} mm, 5 days</dd></div>
          </dl>
        </div>
      ) : (
        <p className="mt-2 text-sm text-ink-muted">
          {!hasCoords ? 'Set this plot’s location to see its weather.' : failed ? 'Weather is unavailable right now.' : 'Loading weather…'}
        </p>
      )}
      {weather && (
        <p className="mt-2 text-[11px] text-ink-muted">Source: {SOURCE_LABEL[weather.source] || weather.source}</p>
      )}
    </section>
  )
}
