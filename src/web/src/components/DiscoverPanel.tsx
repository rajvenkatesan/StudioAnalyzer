import { useState, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { DiscoveryRunSummary } from '@shared/types'

export default function DiscoverPanel() {
  const queryClient = useQueryClient()
  const [zipcode, setZipcode] = useState('')
  const [query, setQuery] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [activeRun, setActiveRun] = useState<DiscoveryRunSummary | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!activeRun || activeRun.status === 'COMPLETED' || activeRun.status === 'FAILED') return
    const interval = setInterval(async () => {
      try {
        const updated = await api.discovery.getRun(activeRun.id)
        setActiveRun(updated)
        if (updated.status === 'COMPLETED' || updated.status === 'FAILED') {
          queryClient.invalidateQueries({ queryKey: ['runs'] })
          queryClient.invalidateQueries({ queryKey: ['studios'] })
        }
      } catch { /* keep polling */ }
    }, 2_000)
    return () => clearInterval(interval)
  }, [activeRun, queryClient])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (zipcode.length !== 5) return
    setError(null)
    setActiveRun(null)
    setSubmitting(true)
    try {
      const { runId } = await api.discovery.run({ zipcode, query })
      const run = await api.discovery.getRun(runId)
      setActiveRun(run)
      queryClient.invalidateQueries({ queryKey: ['runs'] })
    } catch (err: any) {
      setError(err?.message ?? 'Discovery failed. Check API is running.')
    } finally {
      setSubmitting(false)
    }
  }

  const isActive = activeRun?.status === 'PENDING' || activeRun?.status === 'RUNNING'

  return (
    <div className="card border-brand-100 bg-gradient-to-br from-brand-50/60 to-white">
      <div className="flex items-center gap-2 mb-5">
        <div className="w-7 h-7 rounded-lg bg-brand-100 flex items-center justify-center">
          <svg className="w-3.5 h-3.5 text-brand-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        <h2 className="text-sm font-semibold text-gray-800">Discover Studios</h2>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1.5">Zipcode</label>
          <input
            className="border border-gray-200 bg-white rounded-lg px-3 py-2 text-sm w-28
                       focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent
                       shadow-sm"
            placeholder="94123"
            value={zipcode}
            onChange={(e) => setZipcode(e.target.value.replace(/\D/g, '').slice(0, 5))}
            maxLength={5}
            required
            disabled={submitting || isActive}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1.5">Studio name or type</label>
          <input
            className="border border-gray-200 bg-white rounded-lg px-3 py-2 text-sm w-60
                       focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent
                       shadow-sm"
            placeholder="solidcore, yoga, pilates…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            required
            disabled={submitting || isActive}
          />
        </div>
        <button
          type="submit"
          disabled={submitting || isActive || zipcode.length !== 5 || !query}
          className="btn-primary flex items-center gap-2"
        >
          {isActive ? (
            <>
              <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Running…
            </>
          ) : submitting ? 'Starting…' : 'Run Discovery'}
        </button>
      </form>

      {activeRun && (
        <div className="mt-4 p-4 rounded-xl border border-gray-100 bg-white shadow-sm">
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-medium text-gray-700">
              "{activeRun.searchQuery}" · {activeRun.zipcode}
            </span>
            <RunStatusPill status={activeRun.status} />
          </div>
          {activeRun.status === 'COMPLETED' && (
            <div className="mt-2 flex flex-wrap gap-4 text-xs">
              <Metric label="Studios" value={activeRun.studiosFound ?? 0} />
              <Metric label="New locations" value={activeRun.newLocations ?? 0} color="text-emerald-600" />
              <Metric label="Updated" value={activeRun.updatedLocations ?? 0} />
              {activeRun.durationMs != null && (
                <span className="text-gray-400">{(activeRun.durationMs / 1000).toFixed(1)}s</span>
              )}
            </div>
          )}
          {activeRun.status === 'FAILED' && (
            <p className="mt-2 text-xs text-red-600">{activeRun.errorMessage}</p>
          )}
          {activeRun.errorMessage && activeRun.status === 'COMPLETED' && (
            <p className="mt-2 text-xs text-amber-600">⚠ {activeRun.errorMessage}</p>
          )}
        </div>
      )}

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <p className="mt-3 text-xs text-gray-400">
        Re-running the same zipcode + query is supported — each run is recorded separately.
      </p>
    </div>
  )
}

function Metric({ label, value, color = 'text-gray-900' }: { label: string; value: number; color?: string }) {
  return (
    <span className="text-gray-500">
      <span className={`font-semibold ${color}`}>{value}</span> {label}
    </span>
  )
}

function RunStatusPill({ status }: { status: string }) {
  const configs: Record<string, { label: string; dot: string; text: string }> = {
    PENDING:   { label: 'Pending',    dot: 'bg-amber-400',              text: 'text-amber-700' },
    RUNNING:   { label: 'Running',    dot: 'bg-blue-500 animate-pulse', text: 'text-blue-700' },
    COMPLETED: { label: 'Completed',  dot: 'bg-emerald-500',            text: 'text-emerald-700' },
    FAILED:    { label: 'Failed',     dot: 'bg-red-500',                text: 'text-red-700' },
  }
  const cfg = configs[status] ?? configs.PENDING
  return (
    <span className={`flex items-center gap-1.5 text-xs font-semibold ${cfg.text}`}>
      <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  )
}
