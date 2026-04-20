// Geocoding uses two strategies — no Google Geocoding API needed:
//   1. Local `zipcodes` npm package (instant, offline, covers ~99% of US zips)
//   2. OpenStreetMap Nominatim fallback (free, no API key, handles PO Box zips)

// eslint-disable-next-line @typescript-eslint/no-require-imports
const zipcodeDb = require('zipcodes')

export interface GeocodeResult2 {
  lat: number
  lng: number
  boundingBox: {
    northeast: { lat: number; lng: number }
    southwest: { lat: number; lng: number }
  }
}

/**
 * Geocode a US zipcode to its centroid lat/lng and bounding box.
 * Uses local DB first, falls back to Nominatim if not found.
 */
export async function geocodeZipcode(zipcode: string): Promise<GeocodeResult2> {
  // 1. Try local database (instant, no network)
  const local = zipcodeDb.lookup(zipcode)
  if (local?.latitude && local?.longitude) {
    const lat = local.latitude as number
    const lng = local.longitude as number
    return { lat, lng, boundingBox: approximateBoundingBox(lat, lng) }
  }

  // 2. Fall back to OpenStreetMap Nominatim (free, no API key)
  return geocodeViaNominatim(zipcode)
}

/**
 * Nominatim geocoding — used for PO Box zips and any zip missing from local DB.
 * Rate limit: 1 req/sec (well within our usage).
 */
async function geocodeViaNominatim(zipcode: string): Promise<GeocodeResult2> {
  const url =
    `https://nominatim.openstreetmap.org/search` +
    `?postalcode=${encodeURIComponent(zipcode)}&country=US&format=json&limit=1&addressdetails=0`

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'StudioAnalyzer/1.0 (local research tool)',
      'Accept': 'application/json',
    },
  })

  if (!response.ok) {
    throw new Error(`Nominatim geocoding failed: HTTP ${response.status}`)
  }

  const results = await response.json() as any[]

  if (!results || results.length === 0) {
    throw new Error(
      `Could not geocode zipcode "${zipcode}". ` +
      `It may be a PO Box or non-geographic zip with no known centroid. ` +
      `Try a nearby standard 5-digit residential zipcode.`
    )
  }

  const r = results[0]
  const lat = parseFloat(r.lat)
  const lng = parseFloat(r.lon)

  // Nominatim returns a bounding box as [south, north, west, east]
  let boundingBox: GeocodeResult2['boundingBox']
  if (r.boundingbox && r.boundingbox.length === 4) {
    const [south, north, west, east] = r.boundingbox.map(parseFloat)
    boundingBox = {
      northeast: { lat: north, lng: east },
      southwest: { lat: south, lng: west },
    }
  } else {
    boundingBox = approximateBoundingBox(lat, lng)
  }

  return { lat, lng, boundingBox }
}

/**
 * Approximate a bounding box for a zipcode centroid.
 * Uses ±0.05° (~5.5 km) — covers a typical urban zipcode area.
 */
function approximateBoundingBox(lat: number, lng: number): GeocodeResult2['boundingBox'] {
  const delta = 0.05
  return {
    northeast: { lat: lat + delta, lng: lng + delta },
    southwest: { lat: lat - delta, lng: lng - delta },
  }
}

/**
 * Derive a search radius in meters from a bounding box.
 */
export function deriveBoundaryRadius(boundingBox: GeocodeResult2['boundingBox']): number {
  const { northeast, southwest } = boundingBox
  const latDiff = northeast.lat - southwest.lat
  const lngDiff = northeast.lng - southwest.lng
  const diagonalDeg = Math.sqrt(latDiff ** 2 + lngDiff ** 2)
  const diagonalMeters = diagonalDeg * 111_000
  return Math.min(diagonalMeters / 2, 8_000)
}

/**
 * Verify API key works for Places API (used on the verify-key endpoint).
 */
export async function verifyApiKey(): Promise<{ ok: boolean; message: string }> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY
  if (!apiKey || apiKey === 'your_key_here') {
    return { ok: false, message: 'GOOGLE_PLACES_API_KEY is not set in .env — needed for Places search' }
  }

  // Test geocoding (now uses local DB — always works)
  try {
    const geo = await geocodeZipcode('94105')
    return {
      ok: true,
      message: `Geocoding OK (lat=${geo.lat}, lng=${geo.lng}). Places API key is set — will be tested on first discovery run.`,
    }
  } catch (err: any) {
    return { ok: false, message: err.message }
  }
}
