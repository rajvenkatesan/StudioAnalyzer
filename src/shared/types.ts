// Shared types used by both API and web frontend

export type DayOfWeek = 'MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT' | 'SUN'
export type PlanType = 'INTRO' | 'DROP_IN' | 'CLASS_PACK' | 'MONTHLY' | 'ANNUAL'
export type RunStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED'

export const DAYS_OF_WEEK: DayOfWeek[] = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']
export const DAY_LABELS: Record<DayOfWeek, string> = {
  MON: 'Monday', TUE: 'Tuesday', WED: 'Wednesday', THU: 'Thursday',
  FRI: 'Friday', SAT: 'Saturday', SUN: 'Sunday',
}

// Hours from 4 AM (4) to 11 PM (23)
export const OPERATING_HOURS = Array.from({ length: 20 }, (_, i) => i + 4)
export function formatHour(hour: number): string {
  if (hour === 0) return '12 AM'
  if (hour < 12) return `${hour} AM`
  if (hour === 12) return '12 PM'
  return `${hour - 12} PM`
}

// ─── API request / response types ────────────────────────────────────────────

export interface DiscoverRequest {
  zipcode: string
  query: string
}

export interface FranchiseDiscoverRequest {
  studioName: string
}

export interface DiscoverResponse {
  runId: number
  status: RunStatus
}

export interface DiscoveryRunSummary {
  id: number
  searchQuery: string
  zipcode: string          // "NATIONWIDE" for franchise runs
  discoveryMode: 'zipcode' | 'franchise' | 'refresh'
  status: RunStatus
  studiosFound: number | null
  locationsFound: number | null
  newLocations: number | null
  updatedLocations: number | null
  errorMessage: string | null
  startedAt: string
  completedAt: string | null
  durationMs: number | null
}

export interface StudioLocationSummary {
  id: number
  addressLine1: string
  addressLine2: string | null
  city: string
  state: string
  postalCode: string
}

export interface StudioSummary {
  id: number
  name: string
  normalizedBrand: string
  studioType: string
  websiteUrl: string | null
  phone: string | null
  locationCount: number
  locations: StudioLocationSummary[]
  weeklyClassCount: number
  dailyClassCounts: Record<DayOfWeek, number>
  lastDiscoveredAt: string | null
  minPricePerClass: number | null
  maxPricePerClass: number | null
}

export interface LocationDetail {
  id: number
  studioId: number
  addressLine1: string
  addressLine2: string | null
  city: string
  state: string
  postalCode: string
  latitude: number | null
  longitude: number | null
  googlePlaceId: string | null
}

export interface HourSlot {
  dayOfWeek: DayOfWeek
  hour: number // 4–23
  isOpen: boolean
}

export interface ClassScheduleRow {
  id: number
  locationId: number
  className: string
  dayOfWeek: DayOfWeek
  startTime: string
  durationMinutes: number
  instructor: string | null
  totalSpots: number | null
}

export interface UtilizationSnapshot {
  id: number
  classScheduleId: number
  dayOfWeek: DayOfWeek
  startTime: string
  spotsAvailable: number | null
  totalSpots: number | null
  dataAvailable: boolean
  utilizationRate: number | null // null when dataAvailable=false or totalSpots=null
  spotsTaken: number | null
  observedAt: string
}

export interface PricingPlanRow {
  id: number
  studioId: number
  locationId: number | null
  planName: string
  planType: PlanType
  priceAmount: number
  currency: string
  classCount: number | null
  validityDays: number | null
  pricePerClass: number | null
  notes: string | null
}

// ─── Pricing recommendation types ─────────────────────────────────────────

export interface ComparableStudio {
  studioName: string
  city:       string | null
  state:      string | null
  colIndex:   number
  price:      number          // actual (non-normalised) price
}

export interface PricingRecommendationRow {
  key:         string
  label:       string
  planType:    PlanType
  classCount:  number | null      // null = unlimited / any
  dataPoints:  number             // # plans contributing to this tier
  recommended: number | null      // COL-adjusted median, rounded to $5
  low:         number | null      // COL-adjusted P25
  high:        number | null      // COL-adjusted P75
  rawMedian:   number | null      // unscaled national-average median (for reference)
  colBand:     number | null      // ± band used: 5 | 10 | 15 | 25 | null (no data)
  comparables: ComparableStudio[] // studios used, sorted by price asc
}

export interface PricingRecommendationResponse {
  zipcode:         string
  city:            string | null
  state:           string | null
  colIndex:        number       // COL index for the target location
  colDescription:  string       // e.g. "15% above the US average"
  totalStudios:    number       // # unique studios used across all tiers
  recommendations: PricingRecommendationRow[]
}

// ─── Pricing matrix types ──────────────────────────────────────────────────

export interface PricingMatrixEntry {
  studioId: number
  studioName: string
  studioType: string
  city: string | null
  state: string | null
  pricingPlans: PricingPlanRow[]
}

// ─── Analysis types ────────────────────────────────────────────────────────

export interface UtilizationCell {
  dayOfWeek: DayOfWeek
  hour: number
  avgUtilizationRate: number | null
  classCount: number
  dataAvailable: boolean
}

export interface StudioComparison {
  studioId: number
  studioName: string
  normalizedBrand: string
  locations: LocationDetail[]
  weeklyClassCount: number
  dailyClassCounts: Record<DayOfWeek, number>
  utilizationGrid: UtilizationCell[]
  pricingPlans: PricingPlanRow[]
  hoursGrid: HourSlot[]
}
