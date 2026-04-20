import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  Legend, Cell,
} from 'recharts'
import { api } from '../lib/api'
import HoursGrid from '../components/HoursGrid'
import UtilizationHeatmap from '../components/UtilizationHeatmap'
import PricingCompareTable from '../components/PricingCompareTable'
import type { StudioComparison } from '@shared/types'
import { DAYS_OF_WEEK, DAY_LABELS } from '@shared/types'

const COLORS = ['#4f46e5', '#7c3aed', '#0891b2', '#059669', '#d97706', '#dc2626']

// ── Weekly volume grouped bar chart ─────────────────────────────────────────

function VolumeChart({ comparisons }: { comparisons: StudioComparison[] }) {
  const data = DAYS_OF_WEEK.map((day) => {
    const entry: Record<string, any> = { day: DAY_LABELS[day].slice(0, 3) }
    for (const c of comparisons) {
      entry[c.studioName] = c.dailyClassCounts[day] ?? 0
    }
    return entry
  })

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
        <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} allowDecimals={false} />
        <Tooltip
          contentStyle={{
            background: '#fff',
            border: '1px solid #e2e8f0',
            borderRadius: 10,
            fontSize: 12,
            boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.07)',
          }}
          cursor={{ fill: '#f8fafc' }}
        />
        <Legend
          iconType="circle"
          iconSize={8}
          wrapperStyle={{ fontSize: 12, paddingTop: 12 }}
        />
        {comparisons.map((c, i) => (
          <Bar
            key={c.studioId}
            dataKey={c.studioName}
            fill={COLORS[i % COLORS.length]}
            radius={[4, 4, 0, 0]}
            maxBarSize={32}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}

// ── Total volume chart ────────────────────────────────────────────────────────

function TotalVolumeChart({ comparisons }: { comparisons: StudioComparison[] }) {
  const data = comparisons.map((c, i) => ({
    name: c.studioName.length > 22 ? c.studioName.slice(0, 20) + '…' : c.studioName,
    classes: c.weeklyClassCount,
    fill: COLORS[i % COLORS.length],
  }))

  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} allowDecimals={false} />
        <YAxis
          type="category"
          dataKey="name"
          width={150}
          tick={{ fontSize: 11, fill: '#64748b' }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          contentStyle={{
            background: '#fff',
            border: '1px solid #e2e8f0',
            borderRadius: 10,
            fontSize: 12,
          }}
          cursor={{ fill: '#f8fafc' }}
          formatter={(v: number) => [`${v} classes/week`, '']}
        />
        <Bar dataKey="classes" radius={[0, 6, 6, 0]} maxBarSize={28}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.fill} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

// ── Section wrapper ───────────────────────────────────────────────────────────

function Section({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section className="card space-y-5">
      <div>
        <h2 className="text-sm font-semibold text-gray-800">{title}</h2>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
      {children}
    </section>
  )
}

// ── Comparison page ───────────────────────────────────────────────────────────

export default function Comparison() {
  const [zipcode, setZipcode] = useState('')
  const [query, setQuery] = useState('')
  const [submitted, setSubmitted] = useState<{ zipcode: string; query: string } | null>(null)

  const { data: comparisons = [], isLoading, error } = useQuery({
    queryKey: ['comparison', submitted?.zipcode, submitted?.query],
    queryFn: () => api.analysis.compare(submitted!.zipcode, submitted?.query),
    enabled: submitted !== null,
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (zipcode.length === 5) setSubmitted({ zipcode, query })
  }

  return (
    <div className="space-y-7">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Compare Studios</h1>
        <p className="text-sm text-gray-400 mt-0.5">Side-by-side analysis of pricing, schedule, and utilization</p>
      </div>

      {/* Search form */}
      <form onSubmit={handleSubmit} className="card-sm flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1.5">Zipcode</label>
          <input
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-28 focus:outline-none focus:ring-2 focus:ring-brand-400"
            placeholder="94123"
            value={zipcode}
            onChange={(e) => setZipcode(e.target.value)}
            maxLength={5}
            required
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1.5">Studio type (optional)</label>
          <input
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-44 focus:outline-none focus:ring-2 focus:ring-brand-400"
            placeholder="solidcore, yoga…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <button type="submit" className="btn-primary">Compare</button>
      </form>

      {/* States */}
      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <svg className="w-4 h-4 animate-spin text-brand-500" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Loading comparison data…
        </div>
      )}
      {error && (
        <div className="card-sm bg-red-50 border-red-100 text-sm text-red-600">
          Failed to load comparison data.
        </div>
      )}

      {submitted && !isLoading && comparisons.length === 0 && (
        <div className="card py-12 text-center">
          <p className="text-sm text-gray-400">
            No studios found for zipcode {submitted.zipcode}
            {submitted.query ? ` matching "${submitted.query}"` : ''}.
          </p>
          <p className="text-xs text-gray-300 mt-1">Run a discovery first.</p>
        </div>
      )}

      {comparisons.length > 0 && (
        <div className="space-y-6">
          {/* Total weekly volume */}
          <Section title="Total Weekly Classes" sub="Classes per week from latest discovery run">
            <TotalVolumeChart comparisons={comparisons} />
          </Section>

          {/* Day-by-day breakdown */}
          <Section title="Daily Class Breakdown" sub="Classes per day of week, grouped by studio">
            <VolumeChart comparisons={comparisons} />
            <div className="overflow-x-auto -mx-6 px-6">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Studio</th>
                    {DAYS_OF_WEEK.map((d) => (
                      <th key={d} className="text-center">{d}</th>
                    ))}
                    <th className="text-center">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {comparisons.map((c, i) => (
                    <tr key={c.studioId}>
                      <td>
                        <div className="flex items-center gap-2">
                          <div
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ background: COLORS[i % COLORS.length] }}
                          />
                          <span className="font-medium text-gray-900">{c.studioName}</span>
                        </div>
                      </td>
                      {DAYS_OF_WEEK.map((d) => (
                        <td key={d} className="text-center text-gray-600">
                          {c.dailyClassCounts[d] ?? 0}
                        </td>
                      ))}
                      <td className="text-center font-bold text-brand-700">{c.weeklyClassCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          {/* Pricing */}
          <Section title="Pricing Comparison" sub="Side-by-side pricing across plan types">
            <PricingCompareTable
              studios={comparisons.map((c) => ({
                studioId: c.studioId,
                studioName: c.studioName,
                pricingPlans: c.pricingPlans,
              }))}
            />
            <p className="text-xs text-gray-400 pt-3 border-t border-gray-50">
              * Unlimited plans assume 16 classes/month for $/class calculation.
            </p>
          </Section>

          {/* Per-studio utilization + hours */}
          {comparisons.map((c, i) => (
            <section key={c.studioId} className="card space-y-6">
              <div className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ background: COLORS[i % COLORS.length] }}
                />
                <h2 className="text-sm font-semibold text-gray-800">{c.studioName}</h2>
              </div>

              <div>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">
                  Utilization Heatmap
                </h3>
                <UtilizationHeatmap snapshots={c.utilizationGrid as any} />
              </div>

              <div className="pt-4 border-t border-gray-50">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">
                  Hours of Operation
                </h3>
                <HoursGrid slots={c.hoursGrid as any} />
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
