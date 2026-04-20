import { Client, PlaceType1, PlacesNearbyRanking } from '@googlemaps/google-maps-services-js'
import type { GeocodeResult2 } from './geocode'

const client = new Client()

export interface PlaceResult {
  googlePlaceId: string
  name: string
  address: string
  addressComponents: {
    addressLine1: string
    city: string
    state: string
    postalCode: string
  }
  lat: number
  lng: number
  phone?: string
  websiteUrl?: string
}

/**
 * Search Google Places for studios matching `query` near a zipcode centroid.
 * Results are filtered to only those whose postal code matches the target zipcode.
 */
export async function searchStudiosNearby(
  geocoded: GeocodeResult2,
  radiusMeters: number,
  query: string,
  targetZipcode: string
): Promise<PlaceResult[]> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY
  if (!apiKey) throw new Error('GOOGLE_PLACES_API_KEY is not set')

  const results: PlaceResult[] = []
  let pageToken: string | undefined

  do {
    const response = await client.placesNearby({
      params: {
        location: { lat: geocoded.lat, lng: geocoded.lng },
        radius: radiusMeters,
        keyword: query,
        key: apiKey,
        ...(pageToken ? { pagetoken: pageToken } : {}),
      },
    })

    for (const place of response.data.results) {
      if (!place.place_id || !place.name) continue

      // Fetch full place details to get address components and contact info
      const detail = await fetchPlaceDetail(place.place_id, apiKey)
      if (!detail) continue

      // Filter: only keep places whose postal code matches our target zipcode
      if (detail.addressComponents.postalCode !== targetZipcode) continue

      results.push(detail)
    }

    pageToken = response.data.next_page_token
    // Google requires a short delay before using a page token
    if (pageToken) await delay(2_000)
  } while (pageToken && results.length < 50)

  return results
}

async function fetchPlaceDetail(placeId: string, apiKey: string): Promise<PlaceResult | null> {
  try {
    const response = await client.placeDetails({
      params: {
        place_id: placeId,
        fields: ['name', 'place_id', 'formatted_address', 'address_components',
                 'geometry', 'formatted_phone_number', 'website'],
        key: apiKey,
      },
    })

    const p = response.data.result
    if (!p) return null

    const components = p.address_components ?? []
    const get = (type: string) =>
      components.find((c) => c.types.includes(type as any))?.long_name ?? ''
    const getShort = (type: string) =>
      components.find((c) => c.types.includes(type as any))?.short_name ?? ''

    const streetNumber = get('street_number')
    const route = get('route')
    const addressLine1 = [streetNumber, route].filter(Boolean).join(' ')

    return {
      googlePlaceId: p.place_id!,
      name: p.name!,
      address: p.formatted_address ?? addressLine1,
      addressComponents: {
        addressLine1,
        city: get('locality') || get('sublocality'),
        state: getShort('administrative_area_level_1'),
        postalCode: get('postal_code'),
      },
      lat: p.geometry?.location.lat ?? 0,
      lng: p.geometry?.location.lng ?? 0,
      phone: p.formatted_phone_number,
      websiteUrl: p.website,
    }
  } catch {
    return null
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Major US metros used to broaden franchise search coverage.
// Each search returns up to 60 results; deduplication by googlePlaceId keeps the set clean.
const US_METRO_QUERIES = [
  'New York NY', 'Los Angeles CA', 'Chicago IL', 'Houston TX', 'Phoenix AZ',
  'Philadelphia PA', 'San Antonio TX', 'San Diego CA', 'Dallas TX', 'San Jose CA',
  'Austin TX', 'Jacksonville FL', 'Fort Worth TX', 'Columbus OH', 'Charlotte NC',
  'Indianapolis IN', 'San Francisco CA', 'Seattle WA', 'Denver CO', 'Nashville TN',
  'Oklahoma City OK', 'El Paso TX', 'Washington DC', 'Las Vegas NV', 'Louisville KY',
  'Memphis TN', 'Portland OR', 'Baltimore MD', 'Milwaukee WI', 'Albuquerque NM',
  'Tucson AZ', 'Fresno CA', 'Sacramento CA', 'Kansas City MO', 'Mesa AZ',
  'Atlanta GA', 'Omaha NE', 'Colorado Springs CO', 'Raleigh NC', 'Miami FL',
  'Minneapolis MN', 'Tampa FL', 'Tulsa OK', 'Arlington TX', 'New Orleans LA',
  'Boston MA', 'Cleveland OH', 'Bakersfield CA', 'Honolulu HI', 'Anchorage AK',
]

/**
 * Returns true when `placeName` matches `searchTerm` as the studio brand.
 *
 * Two checks, either of which passes:
 *
 * 1. Exact whole-word match (case-insensitive) on the raw search term.
 *    Works when the user types multi-word terms like "solid core" or "f45 training".
 *      "Solidcore - Marina District"  → true  ✓
 *      "Solid Core Fitness"           → false ✗  (wrong brand)
 *
 * 2. Normalized prefix match: strip spaces/punctuation from both sides and check
 *    that the place name starts with the search term. Handles the common case where
 *    a user types the brand without spaces (e.g. "jetsetpilates") but Google stores
 *    it as separate words ("Jetset Pilates - SoHo").
 *      "Jetset Pilates - SoHo" (norm: "jetsetpilates...") startsWith "jetsetpilates" → true ✓
 */
function nameMatchesExact(placeName: string, searchTerm: string): boolean {
  // Check 1: word-boundary match on the raw term
  const escapedTerm = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  if (new RegExp(`\\b${escapedTerm}\\b`, 'i').test(placeName)) return true

  // Check 2: normalized prefix match (strips spaces & punctuation from both)
  const normSearch = searchTerm.toLowerCase().replace(/[^a-z0-9]/g, '')
  const normPlace  = placeName.toLowerCase().replace(/[^a-z0-9]/g, '')
  if (normSearch.length > 0 && normPlace.startsWith(normSearch)) return true

  return false
}

/**
 * Search Google Places for all US locations of a franchise by name.
 * Iterates over major US metros to overcome the 60-result per-query limit.
 * Only keeps results whose Place name contains the exact brand name as whole words —
 * fuzzy / partial-word matches are discarded.
 * Deduplicates by googlePlaceId — safe to call with up to ~500 unique locations.
 */
export async function searchStudiosByName(brandName: string): Promise<PlaceResult[]> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY
  if (!apiKey) throw new Error('GOOGLE_PLACES_API_KEY is not set')

  const seen = new Set<string>()
  const results: PlaceResult[] = []

  for (const metro of US_METRO_QUERIES) {
    let pageToken: string | undefined

    do {
      const response = await client.textSearch({
        params: {
          query: `${brandName} ${metro}`,
          region: 'us',
          key: apiKey,
          ...(pageToken ? { pagetoken: pageToken } : {}),
        },
      })

      for (const place of response.data.results) {
        if (!place.place_id || !place.name) continue
        if (seen.has(place.place_id)) continue

        // Exact-word filter: drop anything Google returns that isn't actually
        // the right brand (e.g. searching "solidcore" must not return "Solid Core Pilates")
        if (!nameMatchesExact(place.name, brandName)) continue

        const detail = await fetchPlaceDetail(place.place_id, apiKey)
        if (!detail) continue

        // Keep only US results with a valid state + postal code
        if (!detail.addressComponents.state || !detail.addressComponents.postalCode) continue

        seen.add(place.place_id)
        results.push(detail)
      }

      pageToken = response.data.next_page_token
      if (pageToken) await delay(2_000)
    } while (pageToken)

    // Stop early if we've exceeded the target ceiling
    if (results.length >= 500) break
  }

  return results
}

// ── Fixture support for offline tests ─────────────────────────────────────────

import fs from 'fs'
import path from 'path'

const FIXTURE_DIR = path.resolve(__dirname, '../../../tests/fixtures')

export async function searchStudiosNearbyWithFixture(
  geocoded: GeocodeResult2,
  radiusMeters: number,
  query: string,
  targetZipcode: string
): Promise<PlaceResult[]> {
  if (process.env.DISCOVERY_FIXTURE === 'true') {
    const fixtureFile = path.join(FIXTURE_DIR, `${targetZipcode}_${query.replace(/\s+/g, '-')}.json`)
    if (fs.existsSync(fixtureFile)) {
      return JSON.parse(fs.readFileSync(fixtureFile, 'utf-8')) as PlaceResult[]
    }
    // No fixture file — return empty (test will fail gracefully)
    return []
  }
  return searchStudiosNearby(geocoded, radiusMeters, query, targetZipcode)
}
