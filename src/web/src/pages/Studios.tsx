import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { DAYS_OF_WEEK } from '@shared/types'
import type { StudioSummary } from '@shared/types'

function DayPips({ studio }: { studio: StudioSummary }) {
  return (
    <div className="flex gap-1">
      {DAYS_OF_WEEK.map((d) => {
        const count = studio.dailyClassCounts[d] ?? 0
        return (
          <div key={d} className="flex flex-col items-center gap-0.5">
            <span className="text-[9px] text-gray-300 font-medium">{d[0]}</span>
            <div
              className={`w-5 h-5 rounded-md flex items-center justify-center text-[9px] font-bold ${
                count > 0
                  ? 'bg-brand-100 text-brand-700'
                  : 'bg-gray-50 text-gray-300'
              }`}
              title={`${d}: ${count}`}
            >
              {count > 0 ? count : '·'}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default function Studios() {
  const navigate = useNavigate()
  const [zipcode, setZipcode] = useState('')
  const [query, setQuery] = useState('')

  const { data: studios = [], isLoading } = useQuery({
    queryKey: ['studios', zipcode, query],
    queryFn: () => api.studios.list({ zipcode: zipcode || undefined, query: query || undefined }),
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Studios</h1>
        <p className="text-sm text-gray-400 mt-0.5">Browse and filter all discovered studios</p>
      </div>

      {/* Filters */}
      <div className="card-sm flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 010 2H4a1 1 0 01-1-1zm3 4a1 1 0 011-1h10a1 1 0 010 2H7a1 1 0 01-1-1zm3 4a1 1 0 011-1h4a1 1 0 010 2h-4a1 1 0 01-1-1z" />
          </svg>
          <span className="text-xs font-medium text-gray-500">Filter</span>
        </div>
        <input
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm w-28 focus:outline-none focus:ring-2 focus:ring-brand-400"
          placeholder="Zipcode"
          value={zipcode}
          onChange={(e) => setZipcode(e.target.value)}
          maxLength={5}
        />
        <input
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm w-48 focus:outline-none focus:ring-2 focus:ring-brand-400"
          placeholder="Brand or type…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {(zipcode || query) && (
          <button className="btn-ghost text-xs" onClick={() => { setZipcode(''); setQuery('') }}>
            Clear filters
          </button>
        )}
        <span className="ml-auto text-xs font-medium text-gray-400">
          {studios.length} studio{studios.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <svg className="w-5 h-5 animate-spin text-brand-500" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
        ) : studios.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-sm text-gray-400">No studios found. Run a discovery first.</p>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Studio</th>
                <th>Address</th>
                <th>Zipcode</th>
                <th>Type</th>
                <th>Schedule</th>
                <th>Last Seen</th>
              </tr>
            </thead>
            <tbody>
              {studios.map((s) => (
                <tr
                  key={s.id}
                  className="cursor-pointer"
                  onClick={() => navigate(`/studios/${s.id}`)}
                >
                  <td>
                    <div className="font-semibold text-gray-900">{s.name}</div>
                    <div className="flex items-center gap-2 mt-0.5">
                      {s.websiteUrl && (
                        <a
                          href={s.websiteUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-brand-500 hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {(() => { try { return new URL(s.websiteUrl!).hostname } catch { return s.websiteUrl } })()}
                        </a>
                      )}
                      {s.phone && <span className="text-xs text-gray-400">{s.phone}</span>}
                    </div>
                  </td>
                  <td>
                    {s.locations.length === 0 ? (
                      <span className="na-cell">No address</span>
                    ) : (
                      <div className="space-y-1">
                        {s.locations.map((loc) => (
                          <div key={loc.id} className="text-xs text-gray-600">
                            {loc.addressLine1}, {loc.city}, {loc.state}
                          </div>
                        ))}
                        {s.locationCount > 1 && (
                          <div className="text-xs text-gray-400">+{s.locationCount - 1} more</div>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="text-sm text-gray-600 font-mono tabular-nums">
                    {s.zipcode ?? <span className="na-cell">—</span>}
                  </td>
                  <td>
                    <span className="inline-block text-xs font-medium px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 capitalize">
                      {s.studioType}
                    </span>
                  </td>
                  <td>
                    {s.weeklyClassCount > 0 ? (
                      <div className="space-y-2">
                        <div className="text-sm font-bold text-gray-900">
                          {s.weeklyClassCount}
                          <span className="text-xs font-normal text-gray-400 ml-1">/ wk</span>
                        </div>
                        <DayPips studio={s} />
                      </div>
                    ) : (
                      <span className="na-cell">No data</span>
                    )}
                  </td>
                  <td className="text-xs text-gray-400">
                    {s.lastDiscoveredAt
                      ? new Date(s.lastDiscoveredAt).toLocaleDateString('en-US', {
                          month: 'short', day: 'numeric', year: 'numeric',
                        })
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
