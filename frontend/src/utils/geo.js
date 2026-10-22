const EARTH_KM = 6371

/** Great-circle distance in kilometres between two points. */
export function distanceKm(lat1, lon1, lat2, lon2) {
  const rad = (d) => (d * Math.PI) / 180
  const dLat = rad(lat2 - lat1)
  const dLon = rad(lon2 - lon1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_KM * Math.asin(Math.sqrt(a))
}

/** How close the farmer must be to a field's coordinates to count as "at that field". */
export const AT_FIELD_KM = 5

/** The user's field nearest to a point, if one is within `radiusKm`; otherwise null. */
export function nearestField(plots, lat, lon, radiusKm = AT_FIELD_KM) {
  let best = null
  for (const { field } of plots) {
    if (field.latitude == null || field.longitude == null) continue
    const km = distanceKm(lat, lon, field.latitude, field.longitude)
    if (km <= radiusKm && (!best || km < best.km)) best = { field, km }
  }
  return best
}
