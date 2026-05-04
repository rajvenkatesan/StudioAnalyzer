import { useState, useEffect, useRef } from 'react'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { StudioSummary, PricingPlanRow, ClassScheduleRow, CreateStudioRequest, StudioStatus } from '@shared/types'
import { DAYS_OF_WEEK } from '@shared/types'

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: StudioStatus }) {
  if (status === 'open') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-green-100 text-green-700">
        Open
      </span>
    )
  }
  if (status === 'upcoming') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-700">
        Upcoming
      </span>
    )
  }
  return <span className="text-gray-300 text-[10px]">—</span>
}

// ── Add Studio modal ──────────────────────────────────────────────────────────

const EMPTY_FORM: CreateStudioRequest = {
  name: '',
  websiteUrl: '',
  phone: '',
  brandName: '',
  addressLine1: '',
  addressLine2: '',
  city: '',
  state: '',
  postalCode: '',
  country: 'US',
}

function AddStudioModal({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: () => void
}) {
  const [form, setForm] = useState<CreateStudioRequest>(EMPTY_FORM)
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: (data: CreateStudioRequest) => api.studios.create(data),
    onSuccess: () => { onCreated(); onClose() },
    onError: (e: any) => setError(e?.message ?? 'Failed to create studio'),
  })

  const set = (field: keyof CreateStudioRequest) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((prev) => ({ ...prev, [field]: e.target.value }))

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    const payload: CreateStudioRequest = {
      ...form,
      websiteUrl: form.websiteUrl || undefined,
      phone: form.phone || undefined,
      addressLine2: form.addressLine2 || undefined,
    }
    mutation.mutate(payload)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-gray-800">Add Studio</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {/* Studio info */}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Studio Name *</label>
              <input className="input w-full" value={form.name} onChange={set('name')} required placeholder="e.g. JETSET Pilates Irvine" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Brand Name *</label>
              <input className="input w-full" value={form.brandName} onChange={set('brandName')} required placeholder="e.g. jetsetpilates" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Website URL</label>
              <input className="input w-full" value={form.websiteUrl} onChange={set('websiteUrl')} placeholder="https://..." />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Phone</label>
              <input className="input w-full" value={form.phone} onChange={set('phone')} placeholder="(555) 555-5555" />
            </div>
          </div>

          {/* Location */}
          <div className="border-t border-gray-100 pt-3">
            <p className="text-xs font-medium text-gray-500 mb-2">Location</p>
            <div className="space-y-2">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Address Line 1 *</label>
                <input className="input w-full" value={form.addressLine1} onChange={set('addressLine1')} required placeholder="123 Main St" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Address Line 2</label>
                <input className="input w-full" value={form.addressLine2} onChange={set('addressLine2')} placeholder="Suite 200" />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-1">
                  <label className="block text-xs font-medium text-gray-600 mb-1">City *</label>
                  <input className="input w-full" value={form.city} onChange={set('city')} required placeholder="Irvine" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">State *</label>
                  <input className="input w-full" value={form.state} onChange={set('state')} required placeholder="CA" maxLength={2} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">ZIP *</label>
                  <input className="input w-full" value={form.postalCode} onChange={set('postalCode')} required placeholder="92618" />
                </div>
              </div>
            </div>
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn text-xs text-gray-500" onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              className="btn text-xs bg-indigo-600 text-white border-indigo-600 hover:bg-indigo-700 disabled:opacity-40"
              disabled={mutation.isPending}
            >
              {mutation.isPending ? 'Adding…' : 'Add Studio'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// 5 AM – 11 PM
const SCHEDULE_HOURS = Array.from({ length: 19 }, (_, i) => i + 5)

function fmtHour(h: number): string {
  if (h < 12) return `${h} AM`
  if (h === 12) return '12 PM'
  return `${h - 12} PM`
}

// ── Schedule grid (one studio / location) ─────────────────────────────────────

function ScheduleGrid({ locationId }: { locationId: number }) {
  const { data: schedule = [], isLoading, isError } = useQuery({
    queryKey: ['schedule', locationId],
    queryFn: () => api.locations.schedule(locationId),
  })

  if (isLoading) return <p className="text-xs text-gray-400 py-4 text-center">Loading schedule…</p>
  if (isError)   return <p className="text-xs text-red-500 py-4">Failed to load schedule data.</p>

  // If no rows came back, show a friendly message instead of a grid full of N/A
  const dataExists = schedule.length > 0
  if (!dataExists) {
    return (
      <div className="py-6 text-center border border-dashed border-gray-200 rounded">
        <p className="text-sm text-gray-500 font-medium">No schedule data</p>
        <p className="text-xs text-gray-400 mt-1">
          Run Discovery again for this studio to scrape its class schedule.
        </p>
      </div>
    )
  }

  const hasClass = (day: string, hour: number): boolean =>
    schedule.some((s) => s.dayOfWeek === day && parseInt(s.startTime.split(':')[0], 10) === hour)

  return (
    <div className="overflow-x-auto">
      <table className="text-xs border-collapse">
        <thead>
          <tr>
            <th className="text-right pr-4 pb-2 w-16 text-gray-400 font-normal border-b border-gray-200" />
            {DAYS_OF_WEEK.map((d) => (
              <th
                key={d}
                className="w-12 text-center pb-2 text-xs font-semibold text-gray-500 border-b border-gray-200"
              >
                {d}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {SCHEDULE_HOURS.map((hour) => (
            <tr key={hour} className="border-b border-gray-50">
              <td className="text-right pr-4 py-1 text-gray-400 font-mono text-[11px]">
                {fmtHour(hour)}
              </td>
              {DAYS_OF_WEEK.map((day) => {
                const cls = hasClass(day, hour)
                return (
                  <td key={day} className="text-center py-1">
                    {cls ? (
                      <span className="font-bold text-indigo-700">X</span>
                    ) : (
                      <span className="text-gray-300">0</span>
                    )}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Schedule panel (one or multiple studios) ──────────────────────────────────

function SchedulePanel({ studios }: { studios: StudioSummary[] }) {
  const [activeSid, setActiveSid] = useState(studios[0]?.id ?? null)
  const studio = studios.find((s) => s.id === activeSid) ?? studios[0]
  const locationId = studio?.locations[0]?.id

  return (
    <div className="panel mt-6 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 bg-gray-50">
        <span className="text-sm font-semibold text-gray-700">Class Schedule</span>
        <span className="text-xs text-gray-400">X = class · 0 = no class that hour</span>
      </div>

      {/* Studio tabs when multiple selected */}
      {studios.length > 1 && (
        <div className="flex border-b border-gray-100">
          {studios.map((s) => (
            <button
              key={s.id}
              onClick={() => setActiveSid(s.id)}
              className={[
                'px-4 py-2 text-xs font-medium border-b-2 transition-colors',
                activeSid === s.id
                  ? 'border-indigo-600 text-indigo-700'
                  : 'border-transparent text-gray-500 hover:text-gray-800',
              ].join(' ')}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}

      <div className="px-5 py-4">
        {studios.length === 1 && (
          <p className="text-xs font-medium text-gray-600 mb-3">{studio.name}</p>
        )}
        {locationId ? (
          <ScheduleGrid locationId={locationId} />
        ) : (
          <p className="text-xs text-gray-400">No location found for this studio.</p>
        )}
      </div>
    </div>
  )
}

// ── Pricing panel ─────────────────────────────────────────────────────────────

const PLAN_ORDER = ['INTRO', 'DROP_IN', 'CLASS_PACK', 'MONTHLY', 'ANNUAL'] as const
const PLAN_LABELS: Record<string, string> = {
  INTRO:      'Intro',
  DROP_IN:    'Drop-in',
  CLASS_PACK: 'Class Pack',
  MONTHLY:    'Monthly Unlimited',
  ANNUAL:     'Annual',
}

function fmt(amount: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
}

type PricingSortKey = 'type' | 'name' | 'price' | 'classes' | 'perClass'

function StudioPricing({ studio }: { studio: StudioSummary }) {
  const [pSortKey, setPSortKey] = useState<PricingSortKey>('type')
  const [pSortDir, setPSortDir] = useState<SortDir>('asc')

  const { data: plans = [], isLoading } = useQuery({
    queryKey: ['pricing', studio.id],
    queryFn: () => api.studios.pricing(studio.id),
  })

  if (isLoading) return <p className="text-xs text-gray-400 py-4 px-3">Loading…</p>
  if (plans.length === 0) return (
    <div className="py-6 px-4 text-center border border-dashed border-gray-200 rounded m-3">
      <p className="text-sm text-gray-500 font-medium">No pricing data</p>
      <p className="text-xs text-gray-400 mt-1">Run Discovery again for this studio to scrape its pricing.</p>
    </div>
  )

  const handlePSort = (key: string) => {
    const k = key as PricingSortKey
    setPSortDir((prev) => (pSortKey === k ? (prev === 'asc' ? 'desc' : 'asc') : 'asc'))
    setPSortKey(k)
  }

  const PLAN_RANK: Record<string, number> = { INTRO: 0, DROP_IN: 1, CLASS_PACK: 2, MONTHLY: 3, ANNUAL: 4 }

  const sortedPlans = [...plans].sort((a, b) => {
    let cmp = 0
    if (pSortKey === 'type')     cmp = (PLAN_RANK[a.planType] ?? 9) - (PLAN_RANK[b.planType] ?? 9)
    else if (pSortKey === 'name')     cmp = (a.planName ?? '').localeCompare(b.planName ?? '')
    else if (pSortKey === 'price')    cmp = a.priceAmount - b.priceAmount
    else if (pSortKey === 'classes')  cmp = (a.classCount ?? 0) - (b.classCount ?? 0)
    else if (pSortKey === 'perClass') cmp = (a.pricePerClass ?? Infinity) - (b.pricePerClass ?? Infinity)
    return pSortDir === 'asc' ? cmp : -cmp
  })

  return (
    <div>
      <table className="tbl">
        <thead>
          <tr>
            <SortTh label="Plan Type"  sortKey="type"     active={pSortKey === 'type'}     dir={pSortDir} onSort={handlePSort} />
            <SortTh label="Package"    sortKey="name"     active={pSortKey === 'name'}     dir={pSortDir} onSort={handlePSort} />
            <SortTh label="Price"      sortKey="price"    active={pSortKey === 'price'}    dir={pSortDir} onSort={handlePSort} className="text-right" />
            <SortTh label="Classes"    sortKey="classes"  active={pSortKey === 'classes'}  dir={pSortDir} onSort={handlePSort} className="text-right" />
            <SortTh label="Per Class"  sortKey="perClass" active={pSortKey === 'perClass'} dir={pSortDir} onSort={handlePSort} className="text-right" />
          </tr>
        </thead>
        <tbody>
          {sortedPlans.map((p) => (
            <tr key={p.id} className="cursor-default">
              <td className="text-gray-500">{PLAN_LABELS[p.planType] ?? p.planType}</td>
              <td className="text-gray-700">{p.planName || '—'}</td>
              <td className="text-right font-semibold text-gray-900">{fmt(p.priceAmount)}</td>
              <td className="text-right text-gray-500">
                {p.planType === 'MONTHLY' || p.planType === 'ANNUAL'
                  ? <span className="text-gray-400 text-xs italic">Unlimited</span>
                  : p.classCount ?? <span className="na">—</span>}
              </td>
              <td className="text-right text-gray-600">
                {p.planType === 'INTRO' || p.planType === 'MONTHLY' || p.planType === 'ANNUAL'
                  ? <span className="na">—</span>
                  : p.pricePerClass != null ? fmt(p.pricePerClass) : <span className="na">—</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function PricingPanel({ studios }: { studios: StudioSummary[] }) {
  const [activeSid, setActiveSid] = useState(studios[0]?.id ?? null)
  const studio = studios.find((s) => s.id === activeSid) ?? studios[0]

  return (
    <div className="panel mt-6 overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
        <span className="text-sm font-semibold text-gray-700">Pricing</span>
      </div>

      {studios.length > 1 && (
        <div className="flex border-b border-gray-100">
          {studios.map((s) => (
            <button
              key={s.id}
              onClick={() => setActiveSid(s.id)}
              className={[
                'px-4 py-2 text-xs font-medium border-b-2 transition-colors',
                activeSid === s.id
                  ? 'border-indigo-600 text-indigo-700'
                  : 'border-transparent text-gray-500 hover:text-gray-800',
              ].join(' ')}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}

      <div className="overflow-x-auto">
        {studio && (
          <>
            {studios.length === 1 && (
              <p className="text-xs font-medium text-gray-600 px-3 pt-3 pb-1">{studio.name}</p>
            )}
            <StudioPricing studio={studio} />
          </>
        )}
      </div>
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Extract brand slug from a website URL.
 *  https://www.jetsetpilates.com  →  jetsetpilates
 *  https://solidcore.co           →  solidcore
 *  https://mntstudio.com/sf       →  mntstudio
 */
function extractBrand(url: string | null | undefined): string {
  if (!url) return ''
  try {
    let host = new URL(url).hostname       // e.g. "www.jetsetpilates.com"
    host = host.replace(/^www\./, '')      // strip leading www.
    const dot = host.lastIndexOf('.')
    if (dot > 0) host = host.slice(0, dot) // strip TLD
    return host
  } catch {
    return ''
  }
}

// ── Sortable column header ────────────────────────────────────────────────────

type SortDir = 'asc' | 'desc'

function SortTh({
  label,
  sortKey,
  active,
  dir,
  onSort,
  className = '',
}: {
  label: string
  sortKey: string
  active: boolean
  dir: SortDir
  onSort: (key: string) => void
  className?: string
}) {
  return (
    <th
      className={`cursor-pointer select-none whitespace-nowrap ${className}`}
      onClick={() => onSort(sortKey)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <span className={`text-[10px] ${active ? 'text-indigo-500' : 'text-gray-300'}`}>
          {active ? (dir === 'asc' ? '▲' : '▼') : '▲▼'}
        </span>
      </span>
    </th>
  )
}

// ── Studios table ─────────────────────────────────────────────────────────────

type SortKey = 'name' | 'brand' | 'city' | 'address' | 'total' | 'minPpc' | 'maxPpc' | typeof DAYS_OF_WEEK[number]

export default function StudiosTab() {
  const queryClient = useQueryClient()
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmPurge, setConfirmPurge] = useState(false)
  const [refreshStatus, setRefreshStatus] = useState<'idle' | 'running' | 'done' | 'failed'>('idle')
  const [purgeStatus, setPurgeStatus] = useState<'idle' | 'running' | 'done' | 'failed'>('idle')
  const refreshRunId = useRef<number | null>(null)
  const purgeRunId = useRef<number | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)

  const { data: studios = [], isLoading } = useQuery({
    queryKey: ['studios'],
    queryFn: () => api.studios.list(),
  })

  const handleSort = (key: string) => {
    const k = key as SortKey
    setSortDir((prev) => (sortKey === k ? (prev === 'asc' ? 'desc' : 'asc') : 'asc'))
    setSortKey(k)
  }

  const sortedStudios = [...studios].sort((a, b) => {
    let cmp = 0
    if (sortKey === 'name') {
      cmp = a.name.localeCompare(b.name)
    } else if (sortKey === 'brand') {
      cmp = extractBrand(a.websiteUrl).localeCompare(extractBrand(b.websiteUrl))
    } else if (sortKey === 'city') {
      const ca = a.locations[0]?.city ?? ''
      const cb = b.locations[0]?.city ?? ''
      cmp = ca.localeCompare(cb)
    } else if (sortKey === 'address') {
      const aa = a.locations[0]?.addressLine1 ?? ''
      const ab = b.locations[0]?.addressLine1 ?? ''
      cmp = aa.localeCompare(ab)
    } else if (sortKey === 'total') {
      cmp = (a.weeklyClassCount ?? 0) - (b.weeklyClassCount ?? 0)
    } else if (sortKey === 'minPpc') {
      cmp = (a.minPricePerClass ?? Infinity) - (b.minPricePerClass ?? Infinity)
    } else if (sortKey === 'maxPpc') {
      cmp = (a.maxPricePerClass ?? Infinity) - (b.maxPricePerClass ?? Infinity)
    } else {
      // Day-of-week column
      const day = sortKey as typeof DAYS_OF_WEEK[number]
      cmp = (a.dailyClassCounts[day] ?? 0) - (b.dailyClassCounts[day] ?? 0)
    }
    return sortDir === 'asc' ? cmp : -cmp
  })

  const selectedStudios = studios.filter((s) => selected.has(s.id))
  const allSelected = studios.length > 0 && selected.size === studios.length

  const toggle = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
    setConfirmDelete(false)
  }

  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(studios.map((s) => s.id)))
    setConfirmDelete(false)
  }

  const handleDelete = async () => {
    if (selected.size === 0) return
    setDeleting(true)
    try {
      await api.studios.deleteMany(Array.from(selected))
      setSelected(new Set())
      setConfirmDelete(false)
      queryClient.invalidateQueries({ queryKey: ['studios'] })
    } finally {
      setDeleting(false)
    }
  }

  const handleRefresh = async () => {
    if (selected.size === 0 || refreshStatus === 'running') return
    setRefreshStatus('running')
    try {
      const { runId } = await api.studios.refresh(Array.from(selected))
      refreshRunId.current = runId
    } catch {
      setRefreshStatus('failed')
    }
  }

  const handlePurge = async () => {
    if (selected.size === 0 || purgeStatus === 'running') return
    setConfirmPurge(false)
    setPurgeStatus('running')
    try {
      const { runId } = await api.studios.purge(Array.from(selected))
      purgeRunId.current = runId
      // Immediately invalidate pricing/schedule so the UI shows empty panels
      queryClient.invalidateQueries({ queryKey: ['pricing'] })
      queryClient.invalidateQueries({ queryKey: ['schedule'] })
      queryClient.invalidateQueries({ queryKey: ['studios'] })
    } catch {
      setPurgeStatus('failed')
    }
  }

  // Poll the active refresh run
  useEffect(() => {
    if (refreshStatus !== 'running' || refreshRunId.current === null) return
    const interval = setInterval(async () => {
      try {
        const run = await api.discovery.getRun(refreshRunId.current!)
        if (run.status === 'COMPLETED') {
          setRefreshStatus('done')
          refreshRunId.current = null
          queryClient.invalidateQueries({ queryKey: ['studios'] })
          queryClient.invalidateQueries({ queryKey: ['pricing'] })
          queryClient.invalidateQueries({ queryKey: ['schedule'] })
          setTimeout(() => setRefreshStatus('idle'), 3_000)
        } else if (run.status === 'FAILED') {
          setRefreshStatus('failed')
          refreshRunId.current = null
          setTimeout(() => setRefreshStatus('idle'), 4_000)
        }
      } catch { /* keep polling */ }
    }, 2_000)
    return () => clearInterval(interval)
  }, [refreshStatus, queryClient])

  // Poll the active purge run
  useEffect(() => {
    if (purgeStatus !== 'running' || purgeRunId.current === null) return
    const interval = setInterval(async () => {
      try {
        const run = await api.discovery.getRun(purgeRunId.current!)
        if (run.status === 'COMPLETED') {
          setPurgeStatus('done')
          purgeRunId.current = null
          queryClient.invalidateQueries({ queryKey: ['studios'] })
          queryClient.invalidateQueries({ queryKey: ['pricing'] })
          queryClient.invalidateQueries({ queryKey: ['schedule'] })
          setTimeout(() => setPurgeStatus('idle'), 3_000)
        } else if (run.status === 'FAILED') {
          setPurgeStatus('failed')
          purgeRunId.current = null
          setTimeout(() => setPurgeStatus('idle'), 4_000)
        }
      } catch { /* keep polling */ }
    }, 2_000)
    return () => clearInterval(interval)
  }, [purgeStatus, queryClient])

  return (
    <div className="p-6">
      {showAddModal && (
        <AddStudioModal
          onClose={() => setShowAddModal(false)}
          onCreated={() => queryClient.invalidateQueries({ queryKey: ['studios'] })}
        />
      )}

      {/* Header row */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-gray-800">
          Studios
          {studios.length > 0 && (
            <span className="ml-2 text-sm font-normal text-gray-400">{studios.length} total</span>
          )}
        </h2>

        <div className="flex items-center gap-2">
          {/* New button — always visible */}
          <button
            className="btn text-xs text-indigo-600 border-indigo-300 hover:bg-indigo-50"
            onClick={() => setShowAddModal(true)}
          >
            + New
          </button>

        {/* Action buttons — only visible when ≥1 row selected */}
        {selected.size > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 mr-1">
              {selected.size} selected
            </span>

            {/* Refresh button */}
            <button
              className={[
                'btn text-xs',
                refreshStatus === 'running' ? 'text-indigo-500 border-indigo-300' :
                refreshStatus === 'done'    ? 'text-green-600 border-green-300' :
                refreshStatus === 'failed'  ? 'text-red-500 border-red-300' :
                'text-gray-600',
              ].join(' ')}
              onClick={handleRefresh}
              disabled={refreshStatus === 'running' || purgeStatus === 'running'}
            >
              {refreshStatus === 'running' ? 'Refreshing…' :
               refreshStatus === 'done'    ? 'Refreshed!' :
               refreshStatus === 'failed'  ? 'Refresh failed' :
               'Refresh'}
            </button>

            {/* Purge with inline confirmation */}
            {purgeStatus === 'idle' || purgeStatus === 'done' || purgeStatus === 'failed' ? (
              !confirmPurge ? (
                <button
                  className={[
                    'btn text-xs',
                    purgeStatus === 'done'   ? 'text-green-600 border-green-300' :
                    purgeStatus === 'failed' ? 'text-red-500 border-red-300' :
                    'text-orange-600 border-orange-300 hover:bg-orange-50',
                  ].join(' ')}
                  onClick={() => { setConfirmDelete(false); setConfirmPurge(true) }}
                  disabled={refreshStatus === 'running'}
                >
                  {purgeStatus === 'done'   ? 'Purged!' :
                   purgeStatus === 'failed' ? 'Purge failed' :
                   'Purge'}
                </button>
              ) : (
                <div className="flex items-center gap-1.5 px-2 py-1 bg-orange-50 border border-orange-200 rounded text-xs">
                  <span className="text-orange-800 font-medium">
                    Clear data for {selected.size} studio{selected.size > 1 ? 's' : ''} and re-scrape?
                  </span>
                  <button
                    className="px-2 py-0.5 bg-orange-600 text-white rounded font-medium hover:bg-orange-700"
                    onClick={handlePurge}
                  >
                    Yes, purge
                  </button>
                  <button
                    className="px-2 py-0.5 text-gray-500 hover:text-gray-800"
                    onClick={() => setConfirmPurge(false)}
                  >
                    Cancel
                  </button>
                </div>
              )
            ) : (
              <button className="btn text-xs text-orange-500 border-orange-300" disabled>
                Purging…
              </button>
            )}

            {/* Delete with inline confirmation */}
            {!confirmDelete ? (
              <button
                className="btn text-xs text-red-500 border-red-300 hover:bg-red-50"
                onClick={() => { setConfirmPurge(false); setConfirmDelete(true) }}
              >
                Delete
              </button>
            ) : (
              <div className="flex items-center gap-1.5 px-2 py-1 bg-red-50 border border-red-200 rounded text-xs">
                <span className="text-red-700 font-medium">
                  Delete {selected.size} studio{selected.size > 1 ? 's' : ''} and all their data?
                </span>
                <button
                  className="px-2 py-0.5 bg-red-600 text-white rounded font-medium hover:bg-red-700 disabled:opacity-40"
                  onClick={handleDelete}
                  disabled={deleting}
                >
                  {deleting ? 'Deleting…' : 'Yes, delete'}
                </button>
                <button
                  className="px-2 py-0.5 text-gray-500 hover:text-gray-800"
                  onClick={() => setConfirmDelete(false)}
                  disabled={deleting}
                >
                  Cancel
                </button>
              </div>
            )}

            <button
              className="btn text-xs text-gray-400"
              onClick={() => { setSelected(new Set()); setConfirmDelete(false); setConfirmPurge(false) }}
            >
              Clear
            </button>
          </div>
        )}
        </div>
      </div>

      {/* Studios table */}
      <div className="panel overflow-hidden">
        {isLoading ? (
          <p className="p-6 text-sm text-gray-400 text-center">Loading studios…</p>
        ) : studios.length === 0 ? (
          <p className="p-6 text-sm text-gray-400 text-center">
            No studios found. Go to Discover to run a discovery.
          </p>
        ) : (
          <div className="overflow-auto max-h-[352px]">
            <table className="tbl">
              <thead className="sticky top-0 bg-white z-10 shadow-[0_1px_0_0_#e5e7eb]">
                <tr>
                  <th className="w-8">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAll}
                      className="cursor-pointer"
                      title="Select all"
                    />
                  </th>
                  <SortTh label="Studio"   sortKey="name"    active={sortKey === 'name'}    dir={sortDir} onSort={handleSort} />
                  <SortTh label="Brand"    sortKey="brand"   active={sortKey === 'brand'}   dir={sortDir} onSort={handleSort} />
                  <SortTh label="City"     sortKey="city"    active={sortKey === 'city'}    dir={sortDir} onSort={handleSort} />
                  <SortTh label="Address"  sortKey="address" active={sortKey === 'address'} dir={sortDir} onSort={handleSort} />
                  <th className="whitespace-nowrap text-gray-500 font-semibold text-xs">Zipcode</th>
                  <th className="whitespace-nowrap text-gray-500 font-semibold text-xs">Status</th>
                  {DAYS_OF_WEEK.map((d) => (
                    <SortTh key={d} label={d} sortKey={d} active={sortKey === d} dir={sortDir} onSort={handleSort} className="text-center" />
                  ))}
                  <SortTh label="Total/wk" sortKey="total"  active={sortKey === 'total'}  dir={sortDir} onSort={handleSort} className="text-center" />
                  <SortTh label="Low $/cls" sortKey="minPpc" active={sortKey === 'minPpc'} dir={sortDir} onSort={handleSort} className="text-right" />
                  <SortTh label="High $/cls" sortKey="maxPpc" active={sortKey === 'maxPpc'} dir={sortDir} onSort={handleSort} className="text-right" />
                </tr>
              </thead>
              <tbody>
                {sortedStudios.map((studio) => {
                  const loc = studio.locations[0]
                  const isSelected = selected.has(studio.id)
                  return (
                    <tr
                      key={studio.id}
                      className={isSelected ? 'selected' : ''}
                      onClick={() => toggle(studio.id)}
                    >
                      <td onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggle(studio.id)}
                          className="cursor-pointer"
                        />
                      </td>
                      <td>
                        <div className="font-medium text-gray-900">{studio.name}</div>
                        {studio.websiteUrl && (
                          <a
                            href={studio.websiteUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-indigo-500 hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {(() => {
                              try { return new URL(studio.websiteUrl!).hostname }
                              catch { return studio.websiteUrl }
                            })()}
                          </a>
                        )}
                      </td>
                      <td className="text-xs font-mono text-gray-600">
                        {extractBrand(studio.websiteUrl) || <span className="na">—</span>}
                      </td>
                      <td className="text-gray-700 text-xs">
                        {loc?.city
                          ? <>{loc.city}{studio.locationCount > 1 && <span className="ml-1 text-gray-400">+{studio.locationCount - 1}</span>}</>
                          : <span className="na">—</span>}
                      </td>
                      <td className="text-gray-500 text-xs">
                        {loc
                          ? `${loc.addressLine1}, ${loc.state}`
                          : <span className="na">—</span>}
                      </td>
                      <td className="text-xs font-mono text-gray-600 tabular-nums">
                        {studio.zipcode ?? <span className="na">—</span>}
                      </td>
                      <td>
                        <StatusBadge status={(loc?.status ?? 'unknown') as StudioStatus} />
                      </td>
                      {DAYS_OF_WEEK.map((d) => {
                        const count = studio.dailyClassCounts[d] ?? 0
                        return (
                          <td key={d} className="text-center">
                            {count > 0
                              ? <span className="font-semibold text-gray-800">{count}</span>
                              : <span className="na">0</span>}
                          </td>
                        )
                      })}
                      <td className="text-center">
                        {studio.weeklyClassCount > 0
                          ? <span className="font-bold text-indigo-700">{studio.weeklyClassCount}</span>
                          : <span className="na">—</span>}
                      </td>
                      <td className="text-right text-green-700 font-medium">
                        {studio.minPricePerClass != null ? fmt(studio.minPricePerClass) : <span className="na">—</span>}
                      </td>
                      <td className="text-right text-gray-600">
                        {studio.maxPricePerClass != null ? fmt(studio.maxPricePerClass) : <span className="na">—</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detail panels — auto-shown whenever rows are selected */}
      {selectedStudios.length > 0 && (
        <>
          <PricingPanel studios={selectedStudios} />
          <SchedulePanel studios={selectedStudios} />
        </>
      )}
    </div>
  )
}
