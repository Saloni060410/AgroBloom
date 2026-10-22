// Weather and place name for the farmer's current position, which can be nowhere near any of their
// fields. Both lookups are public, key-free services called from the browser with the coordinates the
// farmer just allowed the browser to share. Each degrades on its own: no place name still shows weather.

const TIMEOUT_MS = 8000

async function getJson(url) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, { signal: controller.signal })
    if (!res.ok) throw new Error(`Request failed (${res.status})`)
    return await res.json()
  } finally {
    clearTimeout(timer)
  }
}

/** Current conditions at a point from Open-Meteo. */
export async function fetchCurrentWeather(lat, lon) {
  const url =
    'https://api.open-meteo.com/v1/forecast' +
    `?latitude=${lat}&longitude=${lon}` +
    '&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&timezone=auto'
  const data = await getJson(url)
  const c = data?.current
  if (!c || c.temperature_2m == null) throw new Error('No current weather in the response')
  return {
    temperatureC: c.temperature_2m,
    humidityPct: c.relative_humidity_2m,
    windKmh: c.wind_speed_10m,
    code: c.weather_code,
  }
}

/** "Mumbai, Maharashtra" for a point, or null when the lookup fails. */
export async function fetchPlaceName(lat, lon) {
  try {
    const data = await getJson(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`,
    )
    const place = data.city || data.locality
    if (!place) return null
    const region = data.principalSubdivision
    return region && region !== place ? `${place}, ${region}` : place
  } catch {
    return null
  }
}

/** WMO weather code -> a short word and an icon family. */
export function describeWeather(code) {
  if (code === 0) return { text: 'Sunny', kind: 'sun' }
  if (code === 1) return { text: 'Mostly sunny', kind: 'sun' }
  if (code === 2) return { text: 'Partly cloudy', kind: 'cloud' }
  if (code === 3) return { text: 'Overcast', kind: 'cloud' }
  if (code === 45 || code === 48) return { text: 'Foggy', kind: 'fog' }
  if (code >= 51 && code <= 57) return { text: 'Drizzle', kind: 'rain' }
  if (code >= 61 && code <= 67) return { text: 'Rain', kind: 'rain' }
  if (code >= 71 && code <= 77) return { text: 'Snow', kind: 'cloud' }
  if (code >= 80 && code <= 82) return { text: 'Showers', kind: 'rain' }
  if (code >= 95) return { text: 'Thunderstorm', kind: 'storm' }
  return { text: 'Weather', kind: 'cloud' }
}
