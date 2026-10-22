import { useEffect, useState } from 'react'
import { Sun, Cloud, CloudRain, CloudFog, CloudLightning, MapPin, Droplets, Wind, LocateFixed } from 'lucide-react'
import WeatherCard from './WeatherCard.jsx'
import { fetchCurrentWeather, fetchPlaceName, describeWeather } from '../../services/placeWeather.js'
import { nearestField } from '../../utils/geo.js'

const ICONS = { sun: Sun, cloud: Cloud, rain: CloudRain, fog: CloudFog, storm: CloudLightning }
const CACHE_KEY = 'agrobloom.localWeather'
const CACHE_MS = 10 * 60_000

function readCache() {
  try {
    const c = JSON.parse(sessionStorage.getItem(CACHE_KEY) || 'null')
    return c && Date.now() - c.at < CACHE_MS ? c : null
  } catch {
    return null
  }
}

function writeCache(value) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ...value, at: Date.now() }))
  } catch {
    // private mode: the card just asks again next time
  }
}

/**
 * Weather where the farmer is right now. The place is the name of one of their fields when they are
 * within a few km of it, otherwise the locality the browser reports (e.g. Mumbai). If the position
 * cannot be read, it falls back to the first field's weather and says why.
 */
export default function LocalWeatherCard({ plots, fallbackField, className = '' }) {
  const [state, setState] = useState(() => {
    const cached = readCache()
    if (cached) return { status: 'ready', ...cached }
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      return { status: 'unavailable', reason: 'This browser cannot share a location.' }
    }
    return { status: 'locating' }
  })

  // Asks the browser for the position, then loads the weather and place name for it.
  const resolve = () => {
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = Number(pos.coords.latitude.toFixed(4))
        const lon = Number(pos.coords.longitude.toFixed(4))
        try {
          const [weather, placeName] = await Promise.all([fetchCurrentWeather(lat, lon), fetchPlaceName(lat, lon)])
          const next = { lat, lon, weather, placeName }
          writeCache(next)
          setState({ status: 'ready', ...next })
        } catch {
          setState({ status: 'unavailable', reason: 'The weather service did not answer.' })
        }
      },
      (err) =>
        setState({
          status: 'unavailable',
          reason: err.code === 1 ? 'Location access is blocked for this site.' : 'Your location could not be read.',
        }),
      { timeout: 10000, maximumAge: CACHE_MS },
    )
  }

  const retry = () => {
    setState({ status: 'locating' })
    resolve()
  }

  useEffect(() => {
    if (state.status === 'locating') resolve()
    // Runs once on mount; resolve() only sets state from the browser's callbacks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (state.status === 'ready') {
    const match = nearestField(plots, state.lat, state.lon)
    const place = match ? match.field.name : state.placeName || 'Your location'
    const { text, kind } = describeWeather(state.weather.code)
    const Icon = ICONS[kind] || Cloud
    return (
      <section aria-label="Weather where you are" className={`bg-white/90 rounded-lg shadow-md border border-border-subtle px-5 py-3.5 min-w-[280px] ${className}`}>
        <div className="flex items-center gap-1.5 text-sm font-semibold text-ink-primary">
          <MapPin className="w-4 h-4 text-ink-muted shrink-0" aria-hidden="true" />
          <span className="truncate">{place}</span>
          {match && <span className="text-[11px] font-medium text-primary-700 bg-primary-100 rounded-full px-2 py-0.5 shrink-0">your field</span>}
        </div>
        <div className="mt-2 flex items-center gap-4">
          <Icon className={`w-10 h-10 shrink-0 ${kind === 'sun' ? 'text-accent-ochre' : 'text-accent-water'}`} aria-hidden="true" />
          <div className="leading-tight">
            <div className="text-2xl font-semibold">{Math.round(state.weather.temperatureC)}&deg;C</div>
            <div className="text-xs text-ink-secondary">{text}</div>
          </div>
          <div className="w-px self-stretch bg-border-default" aria-hidden="true" />
          <dl className="text-xs text-ink-secondary space-y-1">
            <div className="flex items-center gap-1.5"><Droplets className="w-3.5 h-3.5" aria-hidden="true" /><dt className="sr-only">Humidity</dt><dd>Humidity {Math.round(state.weather.humidityPct)}%</dd></div>
            <div className="flex items-center gap-1.5"><Wind className="w-3.5 h-3.5" aria-hidden="true" /><dt className="sr-only">Wind</dt><dd>Wind {Math.round(state.weather.windKmh)} km/h</dd></div>
          </dl>
        </div>
        <p className="mt-2 text-[11px] text-ink-muted">Where you are now &middot; Open-Meteo</p>
      </section>
    )
  }

  if (state.status === 'locating') {
    return (
      <section aria-label="Weather" className={`bg-white/90 rounded-lg shadow-md border border-border-subtle px-5 py-3.5 min-w-[280px] ${className}`}>
        <div className="flex items-center gap-2 text-sm text-ink-secondary" role="status">
          <LocateFixed className="w-4 h-4 animate-pulse" aria-hidden="true" /> Finding the weather where you are&hellip;
        </div>
      </section>
    )
  }

  // Location is not available: show the first field's weather and say what happened.
  return (
    <div className={`space-y-2 ${className}`}>
      {fallbackField ? <WeatherCard field={fallbackField} /> : null}
      <p className="text-xs text-ink-muted flex items-center gap-2">
        <span>{state.reason} Showing {fallbackField ? 'your field’s' : 'no'} weather instead.</span>
        <button type="button" onClick={retry} className="font-semibold text-primary-700 hover:underline cursor-pointer min-h-touch">Try again</button>
      </p>
    </div>
  )
}
