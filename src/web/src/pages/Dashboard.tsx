import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell,
} from 'recharts'
import { api } from '../lib/api'
import DiscoverPanel from '../components/DiscoverPanel'
import type { DiscoveryRunSummary, StudioSummary } from '@shared/types'
import { DAYS_OF_WEEK } from '@shared/types'

// ── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  sub,
  icon,
  accent = 'brand',
}: {
  label: string
  value: string | number
  sub?: string
  icon: React.ReactNode
  accent?: string
}) {
  const accentMap: Record<string, string> = {
    brand:   'bg-brand-50 text-brand-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    violet:  'bg-violet-50 text-violet-600',
    amber:   'bg-amber-50 text-amber-600',
  }
  return (
    <div className="kpi-card">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</span>
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${accentMap[accent] ?? accentMap.brand}`}>
          {icon}
        </div>
      </div>
      <div className="text-3xl font-bold text-gray-900 mt-1">{value}</div>
      {sub && <div className="text-xs text-gray-400">{sub}</div>}
    </div>
  )
}

// ── Status Badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const cls: Record<string, string> = {
    PENDING: 'badge-pending',
    RUNNING: 'badge-running',
    COMPLETED: 'badge-completed',
    FAILED: 'badge-failed',
  }
  const dot: Record<string, string> = {
    PENDING: 'bg-amber-400',
    RUNNING: 'bg-blue-500 animate-pulse',
    COMPLETED: 'bg-emerald-500',
    FAILED: 'bg-red-500',
  }
  return (
    <span className={cls[status] ?? 'badge-pending'}>
      <span className={`w-1.5 h-1.5 rounded-full ${dot[status] ?? 'bg-amber-400'}`} />
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </span>
  )
}

// ── Weekly class bar chart ────────────────────────────────────────────────────

const CHART_COLORS = [
  '#4f46e5', '#7c3aed', '#0891b2', '#059669', '#d97706', '#dc2626',
  '#7c3aed', '#0284c7', '#16a34a', '#ca8a04',
]

function WeeklyVolumeChart({ studios }: { studios: StudioSummary[] }) {
  if (studios.length === 0) return null

  const data = studios.map((s) => ({
    name: s.name.length > 20 ? s.name.slice(0, 18) + '…' : s.name,
    total: s.weeklyClassCount,
    ...Object.fromEntries(DAYS_OF_WEEK.map((d) => [d, s.dailyClassCounts[d] ?? 0])),
  }))

  return (
    <div className="card">
      <h2 className="text-sm font-semibold text-gray-800 mb-1">Weekly Class Volume</h2>
      <p className="text-xs text-gray-400 mb-5">Total classes per week from latest discovery run</p>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 11, fill: '#94a3b8' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: '#94a3b8' }}
            axisLine={false}
            tickLine={false}
            allowDecimals={false}
          />
          <Tooltip
            contentStyle={{
              background: '#fff',
              border: '1px solid #e2e8f0',
              borderRadius: 10,
              fontSize: 12,
              boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.07)',
            }}
            cursor={{ fill: '#f8fafc' }}
            formatter={(value: number) => [`${value} classes`, '']}
          />
          <Bar dataKey="total" radius={[6, 6, 0, 0]} maxBarSize={60}>
            {data.map((_, i) => (
              <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── Day breakdown mini-bars ───────────────────────────────────────────────────

function DayBar({ day, count, max }: { day: string; count: number; max: number }) {
  const pct = max > 0 ? Math.round((count / max) * 100) : 0
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-7 text-gray-400 font-medium">{day}</span>
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-brand-400 rounded-full transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-4 text-right text-gray-600 font-semibold">{count}</span>
    </div>
  )
}

// ── Studio Card ───────────────────────────────────────────────────────────────

function StudioCard({ studio }: { studio: StudioSummary }) {
  const navigate = useNavigate()
  const loc = studio.locations[0]
  const maxDay = Math.max(...DAYS_OF_WEEK.map((d) => studio.dailyClassCounts[d] ?? 0), 1)

  return (
    <div
      className="card cursor-pointer hover:shadow-card-md hover:-translate-y-0.5 transition-all duration-150"
      onClick={() => navigate(`/studios/${studio.id}`)}
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="min-w-0">
          <div className="font-semibold text-gray-900 truncate">{studio.name}</div>
          <span className="inline-block mt-0.5 text-[10px] font-medium px-2 py-0.5 rounded-full bg-brand-50 text-brand-700 capitalize">
            {studio.studioType}
          </span>
        </div>
        {studio.weeklyClassCount > 0 && (
          <div className="shrink-0 text-right">
            <div className="text-2xl font-bold text-gray-900">{studio.weeklyClassCount}</div>
            <div className="text-[10px] text-gray-400">/ week</div>
          </div>
        )}
      </div>

      {loc && (
        <p className="text-xs text-gray-400 mb-3">
          {loc.addressLine1}, {loc.city}, {loc.state} {loc.postalCode}
          {studio.locationCount > 1 && (
            <span className="ml-1 font-medium text-gray-500">+{studio.locationCount - 1} more</span>
          )}
        </p>
      )}

      {studio.weeklyClassCount > 0 ? (
        <div className="space-y-1.5 pt-2 border-t border-gray-50">
          {DAYS_OF_WEEK.map((d) => (
            <DayBar key={d} day={d} count={studio.dailyClassCounts[d] ?? 0} max={maxDay} />
          ))}
        </div>
      ) : (
        <p className="text-xs text-gray-300 pt-2 border-t border-gray-50">No schedule data yet</p>
      )}
    </div>
  )
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { data: runs = [], isLoading: runsLoading } = useQuery({
    queryKey: ['runs'],
    queryFn: api.discovery.listRuns,
    refetchInterval: (query) => {
      const hasActive = query.state.data?.some(
        (r: DiscoveryRunSummary) => r.status === 'PENDING' || r.status === 'RUNNING'
      )
      return hasActive ? 2_000 : false
    },
  })

  const { data: studios = [] } = useQuery({
    queryKey: ['studios'],
    queryFn: () => api.studios.list(),
  })

  const totalLocations = studios.reduce((sum, s) => sum + s.locationCount, 0)
  const totalClasses = studios.reduce((sum, s) => sum + s.weeklyClassCount, 0)
  const lastRun = runs[0]
  const recent = runs.slice(0, 8)

  return (
    <div className="space-y-7">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-400 mt-0.5">Fitness studio competitive intelligence</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Studios"
          value={studios.length}
          sub={`${totalLocations} location${totalLocations !== 1 ? 's' : ''}`}
          accent="brand"
          icon={
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          }
        />
        <KpiCard
          label="Weekly Classes"
          value={totalClasses}
          sub="across all studios"
          accent="violet"
          icon={
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          }
        />
        <KpiCard
          label="Discovery Runs"
          value={runs.length}
          sub={runs.filter((r) => r.status === 'COMPLETED').length + ' completed'}
          accent="emerald"
          icon={
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          }
        />
        <KpiCard
          label="Last Run"
          value={lastRun ? new Date(lastRun.startedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
          sub={lastRun ? lastRun.searchQuery : 'No runs yet'}
          accent="amber"
          icon={
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
      </div>

      {/* Discover panel */}
      <DiscoverPanel />

      {/* Chart */}
      {studios.length > 0 && <WeeklyVolumeChart studios={studios} />}

      {/* Studio cards */}
      {studios.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Discovered Studios</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {studios.map((s) => (
              <StudioCard key={s.id} studio={s} />
            ))}
          </div>
        </div>
      )}

      {/* Recent runs */}
      <div className="card">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-sm font-semibold text-gray-800">Recent Discovery Runs</h2>
          {runs.length > 8 && (
            <a href="/runs" className="text-xs text-brand-600 hover:underline font-medium">View all →</a>
          )}
        </div>

        {runsLoading ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : recent.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-sm text-gray-400">No runs yet. Run your first discovery above.</p>
          </div>
        ) : (
          <div className="overflow-x-auto -mx-6 px-6">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Query</th>
                  <th>Zip</th>
                  <th>Status</th>
                  <th>Studios</th>
                  <th>New Locations</th>
                  <th>Duration</th>
                  <th>Started</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((run) => (
                  <tr key={run.id}>
                    <td className="font-medium text-gray-900">{run.searchQuery}</td>
                    <td className="text-gray-500 font-mono text-xs">{run.zipcode}</td>
                    <td><StatusBadge status={run.status} /></td>
                    <td className="text-gray-600">{run.studiosFound ?? '—'}</td>
                    <td className="text-emerald-600 font-medium">{run.newLocations ?? '—'}</td>
                    <td className="text-gray-400 text-xs">
                      {run.durationMs != null ? `${(run.durationMs / 1000).toFixed(1)}s` : '—'}
                    </td>
                    <td className="text-gray-400 text-xs">
                      {new Date(run.startedAt).toLocaleString('en-US', {
                        month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
