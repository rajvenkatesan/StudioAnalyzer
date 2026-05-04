import { useState, useEffect, useMemo, CSSProperties } from 'react'
import { api } from '../lib/api'
import type { PricingMatrixEntry, PricingPlanRow, PlanType, PlanCategory, StudioStatus } from '@shared/types'

// ── Types ─────────────────────────────────────────────────────────────────────

type ViewMode = 'overview' | PlanType
type SortDir  = 'asc' | 'desc'

interface ColSort { col: string; dir: SortDir }

// ── Overview column definitions ───────────────────────────────────────────────
// Each slot defines a specific package tier. For a given studio, we show the
// cheapest plan that matches the slot's predicate, or — if none exists.

interface ColDef {
  key:   string
  label: string       // main header text
  sub?:  string       // optional second line (smaller, gray)
  match: (p: PricingPlanRow) => boolean
}

const COL_DEFS: ColDef[] = [
  {
    key:   'intro',
    label: 'Intro',
    match: (p) => p.planType === 'INTRO',
  },
  {
    key:   'dropIn',
    label: 'Drop-In',
    match: (p) => p.planType === 'DROP_IN',
  },
  {
    key:   'pack5',
    label: '5-Class',
    sub:   'pack',
    match: (p) => p.planType === 'CLASS_PACK' && p.classCount === 5,
  },
  {
    key:   'pack10',
    label: '10-Class',
    sub:   'pack',
    match: (p) => p.planType === 'CLASS_PACK' && p.classCount === 10,
  },
  {
    key:   'pack20',
    label: '20-Class',
    sub:   'pack',
    match: (p) => p.planType === 'CLASS_PACK' && p.classCount === 20,
  },
  {
    key:   'mo4',
    label: '4-Class',
    sub:   '/ month',
    match: (p) => p.planType === 'MONTHLY' && p.classCount === 4,
  },
  {
    key:   'mo8',
    label: '8-Class',
    sub:   '/ month',
    match: (p) => p.planType === 'MONTHLY' && p.classCount === 8,
  },
  {
    key:   'mo12',
    label: '12-Class',
    sub:   '/ month',
    match: (p) => p.planType === 'MONTHLY' && p.classCount === 12,
  },
  {
    key:   'unlimited',
    label: 'Monthly',
    sub:   'unlimited',
    match: (p) => p.planType === 'MONTHLY' && p.classCount == null,
  },
]

// ── Row model for the overview ────────────────────────────────────────────────

interface StudioRow {
  studioId:   number
  studioName: string
  studioType: string
  city:       string | null
  state:      string | null
  status:     StudioStatus
  prices:     Record<string, number | null>  // colKey → cheapest matching price
}

function buildRows(data: PricingMatrixEntry[]): StudioRow[] {
  return data.map((s) => {
    const prices: Record<string, number | null> = {}
    for (const col of COL_DEFS) {
      const hits = s.pricingPlans.filter(col.match)
      prices[col.key] = hits.length ? Math.min(...hits.map((p) => p.priceAmount)) : null
    }
    return {
      studioId:   s.studioId,
      studioName: s.studioName,
      studioType: s.studioType,
      city:       s.city,
      state:      s.state,
      status:     s.status ?? 'unknown',
      prices,
    }
  })
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<PlanCategory, string> = {
  INTRO:   'Intro',
  PACKS:   'Packs',
  MONTHLY: 'Monthly',
  SPECIAL: 'Special',
  CUSTOM:  'Custom',
}

const CATEGORY_COLORS: Record<PlanCategory, string> = {
  INTRO:   'bg-purple-100 text-purple-700',
  PACKS:   'bg-indigo-100 text-indigo-700',
  MONTHLY: 'bg-teal-100 text-teal-700',
  SPECIAL: 'bg-amber-100 text-amber-700',
  CUSTOM:  'bg-gray-100 text-gray-500',
}

function fmtCommitment(months: number | null | undefined): string {
  if (months == null) return 'None'
  if (months === 1)  return '1 mo'
  if (months === 12) return '1 yr'
  return `${months} mo`
}

function fmt(v: number | null | undefined, dec = 0): string {
  if (v == null) return '—'
  return `$${v.toFixed(dec)}`
}

/** Green → red heat scale within a column. */
function heatStyle(value: number | null | undefined, all: (number | null | undefined)[]): CSSProperties {
  if (value == null) return {}
  const nums = all.filter((v): v is number => v != null)
  if (nums.length < 2) return {}
  const min = Math.min(...nums), max = Math.max(...nums)
  if (max === min) return { background: 'hsl(120,50%,92%)', color: 'hsl(120,50%,25%)' }
  const pct = (value - min) / (max - min)
  const hue = Math.round(120 - 120 * pct)
  return { background: `hsl(${hue},50%,92%)`, color: `hsl(${hue},50%,22%)` }
}

function sortDir(col: string, s: ColSort): string {
  if (s.col !== col) return ' ↕'
  return s.dir === 'asc' ? ' ↑' : ' ↓'
}
function toggleSort(col: string, s: ColSort): ColSort {
  return s.col === col ? { col, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: 'asc' }
}

// ── Shared cell components ────────────────────────────────────────────────────

function PricingStatusBadge({ status }: { status: StudioStatus }) {
  if (status === 'open')     return <span className="ml-1.5 inline-flex items-center px-1.5 py-0 rounded text-[9px] font-semibold bg-green-100 text-green-700">Open</span>
  if (status === 'upcoming') return <span className="ml-1.5 inline-flex items-center px-1.5 py-0 rounded text-[9px] font-semibold bg-amber-100 text-amber-700">Upcoming</span>
  return null
}

const StudioCell = ({ name, type, status }: { name: string; type: string; status?: StudioStatus }) => (
  <td className="sticky left-0 z-10 bg-inherit px-3 py-2 text-sm font-medium text-gray-900
                 whitespace-nowrap border-r border-gray-100"
      style={{ minWidth: 200, maxWidth: 280 }}>
    <div className="flex items-center">
      <span className="truncate" title={name}>{name}</span>
      {status && <PricingStatusBadge status={status} />}
    </div>
    <div className="text-[10px] text-gray-400 truncate">{type}</div>
  </td>
)

const CityCell = ({ city, state }: { city: string | null; state: string | null }) => (
  <td className="px-3 py-2 text-sm text-gray-600 whitespace-nowrap" style={{ minWidth: 120 }}>
    {city
      ? <><span className="font-medium">{city}</span>
          {state && <span className="text-gray-400 text-xs ml-1">{state}</span>}</>
      : <span className="text-gray-300">—</span>}
  </td>
)

// ── Overview ─────────────────────────────────────────────────────────────────

function Overview({ rows }: { rows: StudioRow[] }) {
  const [sort, setSort] = useState<ColSort>({ col: 'studioName', dir: 'asc' })
  const onSort = (col: string) => setSort((s) => toggleSort(col, s))

  // Pre-compute column value arrays for heat coloring (over all rows)
  const colValueMap = useMemo(() => {
    const m: Record<string, (number | null)[]> = {}
    for (const col of COL_DEFS) m[col.key] = rows.map((r) => r.prices[col.key])
    return m
  }, [rows])

  const sorted = useMemo(() => {
    const dir = sort.dir === 'asc' ? 1 : -1
    const INF = sort.dir === 'asc' ? Infinity : -Infinity
    return [...rows].sort((a, b) => {
      // columns defined in COL_DEFS sort by price; others by string
      const colKey = sort.col
      if (colKey === 'studioName' || colKey === 'city') {
        const va = ((a as any)[colKey] ?? '') as string
        const vb = ((b as any)[colKey] ?? '') as string
        return dir * va.localeCompare(vb)
      }
      const va = a.prices[colKey] ?? INF
      const vb = b.prices[colKey] ?? INF
      return dir * (va - vb)
    })
  }, [rows, sort])

  if (rows.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400 text-sm">
        No studios with pricing data match your filter.
      </div>
    )
  }

  // Column group boundaries for visual separation
  const GROUP_AFTER = new Set(['dropIn', 'pack20', 'mo12'])

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead className="sticky top-0 z-20 bg-gray-50 border-b border-gray-200">
          {/* ── Group label row ── */}
          <tr className="border-b border-gray-100">
            <th className="sticky left-0 z-30 bg-gray-50" />  {/* Studio */}
            <th className="bg-gray-50" />                      {/* City */}
            <th colSpan={2}
                className="px-3 py-1 text-center text-[10px] font-semibold text-gray-400
                           uppercase tracking-widest border-l border-gray-200">
              Single classes
            </th>
            <th colSpan={3}
                className="px-3 py-1 text-center text-[10px] font-semibold text-indigo-400
                           uppercase tracking-widest border-l border-gray-200">
              Class packs
            </th>
            <th colSpan={3}
                className="px-3 py-1 text-center text-[10px] font-semibold text-teal-500
                           uppercase tracking-widest border-l border-gray-200">
              Limited monthly
            </th>
            <th colSpan={1}
                className="px-3 py-1 text-center text-[10px] font-semibold text-violet-500
                           uppercase tracking-widest border-l border-gray-200">
              Unlimited
            </th>
          </tr>
          {/* ── Column header row ── */}
          <tr>
            {/* Studio (sticky) */}
            <th onClick={() => onSort('studioName')}
                className="sticky left-0 z-30 bg-gray-50 px-3 py-2 text-left text-xs
                           font-semibold text-gray-500 uppercase tracking-wide border-r
                           border-gray-200 cursor-pointer select-none hover:text-gray-800 whitespace-nowrap"
                style={{ minWidth: 200 }}>
              Studio{sortDir('studioName', sort)}
            </th>
            {/* City */}
            <th onClick={() => onSort('city')}
                className="bg-gray-50 px-3 py-2 text-left text-xs font-semibold text-gray-500
                           uppercase tracking-wide cursor-pointer select-none hover:text-gray-800
                           whitespace-nowrap"
                style={{ minWidth: 120 }}>
              City{sortDir('city', sort)}
            </th>
            {/* Dynamic columns */}
            {COL_DEFS.map((col) => (
              <th key={col.key}
                  onClick={() => onSort(col.key)}
                  className={[
                    'px-3 py-2 text-right text-xs font-semibold text-gray-500 uppercase',
                    'tracking-wide cursor-pointer select-none hover:text-gray-800 whitespace-nowrap',
                    GROUP_AFTER.has(col.key) ? '' : '',
                    // Left border at group starts
                    col.key === 'intro'     ? 'border-l border-gray-200' : '',
                    col.key === 'pack5'     ? 'border-l border-indigo-100' : '',
                    col.key === 'mo4'       ? 'border-l border-teal-100' : '',
                    col.key === 'unlimited' ? 'border-l border-violet-100' : '',
                  ].join(' ')}>
                {col.label}
                {col.sub && (
                  <div className="text-[10px] font-normal normal-case tracking-normal text-gray-400">
                    {col.sub}
                  </div>
                )}
                <span className="text-gray-300 text-[10px]">{sortDir(col.key, sort)}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {sorted.map((row, i) => (
            <tr key={row.studioId} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'}>
              <StudioCell name={row.studioName} type={row.studioType} status={row.status} />
              <CityCell   city={row.city} state={row.state} />
              {COL_DEFS.map((col) => {
                const val   = row.prices[col.key]
                const style = heatStyle(val, colValueMap[col.key])
                const borderClass =
                  col.key === 'intro'     ? 'border-l border-gray-100' :
                  col.key === 'pack5'     ? 'border-l border-indigo-50' :
                  col.key === 'mo4'       ? 'border-l border-teal-50' :
                  col.key === 'unlimited' ? 'border-l border-violet-50' : ''
                return (
                  <td key={col.key}
                      className={`px-3 py-2 text-right whitespace-nowrap ${borderClass}`}>
                    {val == null
                      ? <span className="text-gray-200">—</span>
                      : <span className="inline-block rounded px-2 py-0.5 font-semibold tabular-nums text-sm"
                               style={style}>
                          {fmt(val)}
                        </span>}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-[10px] text-gray-400 text-right pt-2 pr-3 pb-4">
        Prices = total cost for that package. Color scale per column: green = cheapest → red = most expensive.
        Click any header to sort.
      </p>
    </div>
  )
}

// ── Detail table (one plan type) ─────────────────────────────────────────────

interface DetailRow extends PricingPlanRow {
  studioName: string
  studioType: string
  city:       string | null
  state:      string | null
  status:     StudioStatus
}

function DetailTable({ planType, data }: { planType: PlanType; data: PricingMatrixEntry[] }) {
  const defaultSort: ColSort =
    planType === 'CLASS_PACK' || planType === 'DROP_IN'
      ? { col: 'pricePerClass', dir: 'asc' }
      : { col: 'priceAmount',   dir: 'asc' }

  const [sort, setSort] = useState<ColSort>(defaultSort)
  // Reset sort when plan type changes
  useEffect(() => setSort(defaultSort), [planType]) // eslint-disable-line react-hooks/exhaustive-deps

  const rows: DetailRow[] = useMemo(() =>
    data.flatMap((s) =>
      s.pricingPlans
        .filter((p) => p.planType === planType)
        .map((p) => ({ ...p, studioName: s.studioName, studioType: s.studioType, city: s.city, state: s.state, status: s.status ?? 'unknown' as StudioStatus }))
    ), [data, planType])

  const sorted = useMemo(() => {
    const dir = sort.dir === 'asc' ? 1 : -1
    const INF = sort.dir === 'asc' ? Infinity : -Infinity
    return [...rows].sort((a, b) => {
      const va = (a as any)[sort.col] ?? INF
      const vb = (b as any)[sort.col] ?? INF
      if (typeof va === 'string') return dir * va.localeCompare(vb)
      return dir * (va - vb)
    })
  }, [rows, sort])

  const onSort = (col: string) => setSort((s) => toggleSort(col, s))

  const ppcValues   = rows.map((r) => r.pricePerClass)
  const priceValues = rows.map((r) => r.priceAmount)
  const annualMoAll = rows.map((r) => r.priceAmount / 12)

  if (rows.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400 text-sm">
        No {planType.replace('_', ' ').toLowerCase()} plans in current data.
      </div>
    )
  }

  const showClasses    = planType === 'INTRO' || planType === 'CLASS_PACK' || planType === 'MONTHLY'
  const showCommitment = planType === 'MONTHLY' || planType === 'ANNUAL'
  const showPpc        = planType === 'DROP_IN' || planType === 'CLASS_PACK'
  const showAnnualMo   = planType === 'ANNUAL'
  const showEstPpc     = planType === 'MONTHLY' || planType === 'ANNUAL'
  const ppcLabel       = planType === 'DROP_IN' ? '$/class' : '$/cls'

  const ThS = ({ label, col, right = false }: { label: string; col: string; right?: boolean }) => (
    <th onClick={() => onSort(col)}
        className={`px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide
          cursor-pointer select-none hover:text-gray-800 whitespace-nowrap
          ${right ? 'text-right' : 'text-left'}`}>
      {label}<span className="text-gray-300">{sortDir(col, sort)}</span>
    </th>
  )

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead className="sticky top-0 z-20 bg-gray-50 border-b border-gray-200">
          <tr>
            <ThS label="Studio"   col="studioName" />
            <ThS label="City"     col="city" />
            <ThS label="Package"  col="planName" />
            <ThS label="Category" col="planCategory" />
            {showClasses    && <ThS label="Classes"    col="classCount"      right />}
            {showCommitment && <ThS label="Commitment" col="commitmentMonths" right />}
            <ThS label="Price"    col="priceAmount" right />
            {showPpc      && <ThS label={ppcLabel}             col="pricePerClass" right />}
            {showAnnualMo && <ThS label="÷12 /mo"              col="_annualMo"     right />}
            {showEstPpc   && <ThS label="$/cls"  col="pricePerClass" right />}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {sorted.map((row, i) => {
            const annualMo   = row.priceAmount / 12
            const rowBg      = row.isPartial
              ? (i % 2 === 0 ? 'bg-red-50' : 'bg-red-50/70')
              : (i % 2 === 0 ? 'bg-white'  : 'bg-gray-50/50')
            return (
              <tr key={`${row.id}-${i}`} className={rowBg}>
                <StudioCell name={row.studioName} type={row.studioType} status={row.status} />
                <CityCell city={row.city} state={row.state} />

                {/* Package name */}
                <td className="px-3 py-2 text-gray-700" style={{ maxWidth: 220 }}>
                  <div className="truncate text-sm" title={row.planName}>{row.planName}</div>
                  {row.isPartial && (
                    <div className="text-[10px] text-red-600 font-semibold">⚠ partial data</div>
                  )}
                  {row.notes && (
                    <div className="text-[10px] text-amber-600 truncate" title={row.notes}>⚠ {row.notes}</div>
                  )}
                </td>

                {/* Category badge */}
                <td className="px-3 py-2 whitespace-nowrap">
                  {row.planCategory
                    ? <span className={`inline-block rounded px-2 py-0.5 text-[10px] font-semibold uppercase ${CATEGORY_COLORS[row.planCategory]}`}>
                        {CATEGORY_LABELS[row.planCategory]}
                      </span>
                    : <span className="text-gray-300 text-xs">—</span>}
                </td>

                {showClasses && (
                  <td className="px-3 py-2 text-right text-sm text-gray-600 tabular-nums">
                    {row.classCount != null
                      ? row.classCount
                      : /\bunlimited\b/i.test(row.planName)
                        ? <span className="text-violet-500 font-semibold text-xs">∞</span>
                        : <span className={row.planCategory === 'PACKS' ? 'text-red-400 font-semibold' : 'text-gray-300'}>—</span>}
                  </td>
                )}

                {showCommitment && (
                  <td className="px-3 py-2 text-right text-sm text-gray-600 whitespace-nowrap">
                    {fmtCommitment(row.commitmentMonths)}
                  </td>
                )}

                <td className="px-3 py-2 text-right tabular-nums">
                  <span className="inline-block rounded px-2 py-0.5 font-semibold text-sm"
                        style={heatStyle(row.priceAmount, priceValues)}>
                    {fmt(row.priceAmount)}
                  </span>
                </td>

                {showPpc && (
                  <td className="px-3 py-2 text-right tabular-nums">
                    {row.pricePerClass != null
                      ? <span className="inline-block rounded px-2 py-0.5 font-semibold text-sm"
                               style={heatStyle(row.pricePerClass, ppcValues)}>
                          {fmt(row.pricePerClass, 2)}
                        </span>
                      : <span className="text-gray-300">—</span>}
                  </td>
                )}

                {showAnnualMo && (
                  <td className="px-3 py-2 text-right tabular-nums">
                    <span className="inline-block rounded px-2 py-0.5 font-semibold text-sm"
                          style={heatStyle(annualMo, annualMoAll)}>
                      {fmt(annualMo, 0)}
                    </span>
                  </td>
                )}

                {showEstPpc && (
                  <td className="px-3 py-2 text-right tabular-nums">
                    {row.pricePerClass != null
                      ? <span className="inline-block rounded px-2 py-0.5 text-sm"
                               style={heatStyle(row.pricePerClass, ppcValues)}>
                          {fmt(row.pricePerClass, 2)}
                        </span>
                      : <span className="text-gray-300">—</span>}
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="text-[10px] text-gray-400 text-right pt-2 pr-3 pb-4">
        {rows.length} plan{rows.length !== 1 ? 's' : ''} across{' '}
        {new Set(rows.map((r) => r.studioId)).size} studios.
        {showEstPpc && ' $/cls uses actual class count; unlimited plans assume 16/mo.'}
        {rows.some((r) => r.isPartial) && ' '}
        {rows.some((r) => r.isPartial) && (
          <span className="text-red-400">Red rows = partial data (scraper could not determine all fields).</span>
        )}
      </p>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

const VIEW_TABS: { key: ViewMode; label: string; desc: string }[] = [
  { key: 'overview',   label: 'Overview',   desc: 'Total cost per package tier — one column per specific package size' },
  { key: 'INTRO',      label: 'Intro',      desc: 'All intro / trial packages' },
  { key: 'DROP_IN',    label: 'Drop-In',    desc: 'Single class / walk-in rates' },
  { key: 'CLASS_PACK', label: 'Class Pack', desc: 'Multi-class packs — sorted by $/class by default' },
  { key: 'MONTHLY',    label: 'Monthly',    desc: 'Monthly memberships (limited and unlimited)' },
  { key: 'ANNUAL',     label: 'Annual',     desc: 'Annual memberships' },
]

export default function PricingTab() {
  const [view,    setView]    = useState<ViewMode>('overview')
  const [search,  setSearch]  = useState('')
  const [data,    setData]    = useState<PricingMatrixEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    api.pricing.matrix()
      .then(setData)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return data
    return data.filter((s) =>
      s.studioName.toLowerCase().includes(q) ||
      s.studioType.toLowerCase().includes(q) ||
      (s.city?.toLowerCase().includes(q)  ?? false) ||
      (s.state?.toLowerCase().includes(q) ?? false)
    )
  }, [data, search])

  const rows = useMemo(() => buildRows(filtered), [filtered])

  const currentDesc = VIEW_TABS.find((t) => t.key === view)?.desc ?? ''

  return (
    <div className="flex flex-col h-full">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="px-6 pt-6 pb-4 border-b border-gray-200 bg-white shrink-0">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Pricing Matrix</h2>
            <p className="text-xs text-gray-500 mt-0.5">{currentDesc}</p>
          </div>
          <input
            type="search"
            placeholder="Filter by studio, city, state…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="border border-gray-300 rounded-md px-3 py-1.5 text-sm w-64
                       focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>

        <div className="flex gap-1 mt-4 flex-wrap">
          {VIEW_TABS.map(({ key, label }) => (
            <button key={key} onClick={() => setView(key)}
                    className={[
                      'px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                      view === key
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
                    ].join(' ')}>
              {label}
            </button>
          ))}
          {filtered.length > 0 && (
            <span className="ml-auto text-xs text-gray-400 self-center">
              {filtered.length} studio{filtered.length !== 1 ? 's' : ''}
              {search ? ` matching "${search}"` : ' with pricing data'}
            </span>
          )}
        </div>
      </div>

      {/* ── Body ────────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto bg-white">
        {loading && (
          <div className="flex items-center justify-center h-48 text-gray-400 text-sm">
            Loading pricing data…
          </div>
        )}
        {error && (
          <div className="flex items-center justify-center h-48 text-red-500 text-sm">
            {error}
          </div>
        )}
        {!loading && !error && (
          view === 'overview'
            ? <Overview rows={rows} />
            : <DetailTable planType={view as PlanType} data={filtered} />
        )}
      </div>
    </div>
  )
}
