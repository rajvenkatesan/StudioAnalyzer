import type {
  DiscoverRequest,
  FranchiseDiscoverRequest,
  DiscoverResponse,
  DiscoveryRunSummary,
  StudioSummary,
  LocationDetail,
  HourSlot,
  ClassScheduleRow,
  UtilizationSnapshot,
  PricingPlanRow,
  StudioComparison,
  PricingMatrixEntry,
  PricingRecommendationResponse,
  InstructorRow,
  InstructorDiscoverRequest,
  InstructorEnrichRequest,
  CreateStudioRequest,
} from '@shared/types'

const BASE = '/api/v1'

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`)
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}`)
  return res.json()
}

async function del(path: string, body?: unknown): Promise<void> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'DELETE',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new Error(`DELETE ${path} → ${res.status}`)
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`POST ${path} → ${res.status}`)
  return res.json()
}

async function put<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`PUT ${path} → ${res.status}`)
  return res.json()
}

// ── Discovery ──────────────────────────────────────────────────────────────

export const api = {
  discovery: {
    run: (body: DiscoverRequest) =>
      post<DiscoverResponse>('/discovery/run', body),

    franchise: (body: FranchiseDiscoverRequest) =>
      post<DiscoverResponse>('/discovery/franchise', body),

    getRun: (id: number) =>
      get<DiscoveryRunSummary>(`/discovery/runs/${id}`),

    listRuns: () =>
      get<DiscoveryRunSummary[]>('/discovery/runs'),

    cancelRun: (id: number) =>
      post<{ ok: boolean }>(`/discovery/runs/${id}/cancel`, {}),

    discoverInstructors: (body: InstructorDiscoverRequest) =>
      post<DiscoverResponse>('/discovery/instructors', body),
  },

  // ── Studios ──────────────────────────────────────────────────────────────

  studios: {
    list: (params?: { zipcode?: string; query?: string; studioTypeId?: number }) => {
      const qs = new URLSearchParams()
      if (params?.zipcode) qs.set('zipcode', params.zipcode)
      if (params?.query) qs.set('query', params.query)
      if (params?.studioTypeId) qs.set('studioTypeId', String(params.studioTypeId))
      return get<StudioSummary[]>(`/studios${qs.size ? `?${qs}` : ''}`)
    },

    create: (body: CreateStudioRequest) => post<{ studio: any; location: any }>('/studios', body),

    get: (id: number) => get<any>(`/studios/${id}`),

    locations: (id: number) => get<LocationDetail[]>(`/studios/${id}/locations`),

    pricing: (id: number) => get<PricingPlanRow[]>(`/studios/${id}/pricing`),

    deleteMany: (ids: number[]) => del('/studios', { ids }),

    refresh: (ids: number[]) => post<DiscoverResponse>('/studios/refresh', { ids }),

    purge: (ids: number[]) => post<DiscoverResponse>('/studios/purge', { ids }),
  },

  // ── Locations ────────────────────────────────────────────────────────────

  locations: {
    hours: (id: number) => get<(HourSlot & { dataAvailable: boolean })[]>(`/locations/${id}/hours`),
    schedule: (id: number) => get<ClassScheduleRow[]>(`/locations/${id}/schedule`),
    utilization: (id: number) => get<UtilizationSnapshot[]>(`/locations/${id}/utilization`),
  },

  // ── Pricing comparison ────────────────────────────────────────────────────

  pricing: {
    compare: (zipcode: string, query?: string) => {
      const qs = new URLSearchParams({ zipcode })
      if (query) qs.set('query', query)
      return get<{ studioId: number; studioName: string; pricingPlans: PricingPlanRow[] }[]>(
        `/pricing/compare?${qs}`
      )
    },

    matrix: () => get<PricingMatrixEntry[]>('/pricing/matrix'),

    recommendations: (zipcode: string) =>
      get<PricingRecommendationResponse>(`/pricing/recommendations?zipcode=${encodeURIComponent(zipcode)}`),
  },

  // ── Instructors ───────────────────────────────────────────────────────────

  instructors: {
    list: (params?: { zipcode?: string; query?: string; classType?: string }) => {
      const qs = new URLSearchParams()
      if (params?.zipcode)   qs.set('zipcode',   params.zipcode)
      if (params?.query)     qs.set('query',      params.query)
      if (params?.classType) qs.set('classType',  params.classType)
      return get<InstructorRow[]>(`/instructors${qs.size ? `?${qs}` : ''}`)
    },
    get:    (id: number) => get<InstructorRow>(`/instructors/${id}`),
    enrich: (body: InstructorEnrichRequest) =>
      post<{ ok: boolean; queued: number }>('/instructors/enrich', body),
  },

  // ── Hints (StudioHelper.md) ───────────────────────────────────────────────

  hints: {
    get: () => get<{ content: string }>('/hints').then((r) => r.content),
    put: (content: string) => put<{ ok: boolean }>('/hints', { content }),
  },

  // ── Analysis ─────────────────────────────────────────────────────────────

  analysis: {
    compare: (zipcode: string, query?: string) => {
      const qs = new URLSearchParams({ zipcode })
      if (query) qs.set('query', query)
      return get<StudioComparison[]>(`/analysis/compare?${qs}`)
    },

    busySlots: (locationId: number) =>
      get<any[]>(`/analysis/busy-slots?locationId=${locationId}`),
  },
}
