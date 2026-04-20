import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { DiscoveryRunSummary } from '@shared/types'

type DiscoveryMode = 'zipcode' | 'franchise'

export default function DiscoverTab() {
  const queryClient = useQueryClient()
  const [mode, setMode] = useState<DiscoveryMode>('zipcode')

  // Zipcode form state
  const [zipcode, setZipcode] = useState('')
  const [query, setQuery] = useState('')

  // Franchise form state
  const [studioName, setStudioName] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [activeRun, setActiveRun] = useState<DiscoveryRunSummary | null>(null)
  const [error, setError] = useState<string | null>(null)

  const { data: runs = [] } = useQuery({
    queryKey: ['runs'],
    queryFn: api.discovery.listRuns,
    refetchInterval: (q) => {
      const hasActive = q.state.data?.some(
        (r: DiscoveryRunSummary) => r.status === 'PENDING' || r.status === 'RUNNING'
      )
      return hasActive ? 2_000 : false
    },
  })

  // Poll the active run
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

  const handleZipcodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (zipcode.length !== 5 || !query.trim()) return
    setError(null)
    setActiveRun(null)
    setSubmitting(true)
    try {
      const { runId } = await api.discovery.run({ zipcode, query })
      const run = await api.discovery.getRun(runId)
      setActiveRun(run)
      queryClient.invalidateQueries({ queryKey: ['runs'] })
    } catch (err: any) {
      setError(err?.message ?? 'Discovery failed — check that the API server is running.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleFranchiseSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!studioName.trim()) return
    setError(null)
    setActiveRun(null)
    setSubmitting(true)
    try {
      const { runId } = await api.discovery.franchise({ studioName })
      const run = await api.discovery.getRun(runId)
      setActiveRun(run)
      queryClient.invalidateQueries({ queryKey: ['runs'] })
    } catch (err: any) {
      setError(err?.message ?? 'Discovery failed — check that the API server is running.')
    } finally {
      setSubmitting(false)
    }
  }

  const isRunning = activeRun?.status === 'PENDING' || activeRun?.status === 'RUNNING'

  return (
    <div className="p-8 max-w-3xl">
      <h2 className="text-base font-semibold text-gray-800 mb-6">Discover Studios</h2>

      {/* Mode toggle */}
      <div className="flex gap-1 mb-5 bg-gray-100 p-1 rounded-lg w-fit">
        <button
          onClick={() => { setMode('zipcode'); setActiveRun(null); setError(null) }}
          className={[
            'px-4 py-1.5 text-sm font-medium rounded-md transition-colors',
            mode === 'zipcode'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700',
          ].join(' ')}
        >
          By Zipcode
        </button>
        <button
          onClick={() => { setMode('franchise'); setActiveRun(null); setError(null) }}
          className={[
            'px-4 py-1.5 text-sm font-medium rounded-md transition-colors',
            mode === 'franchise'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700',
          ].join(' ')}
        >
          By Studio Name
        </button>
      </div>

      {/* ── Zipcode form ── */}
      {mode === 'zipcode' && (
        <form onSubmit={handleZipcodeSubmit} className="panel p-5 mb-6">
          <p className="text-xs text-gray-500 mb-4">
            Search for studios near a specific zipcode.
          </p>
          <div className="flex flex-wrap gap-4 items-end">
            <div>
              <label className="label">Zipcode</label>
              <input
                className="input w-28"
                placeholder="94123"
                value={zipcode}
                onChange={(e) => setZipcode(e.target.value.replace(/\D/g, '').slice(0, 5))}
                maxLength={5}
                required
                disabled={submitting || isRunning}
              />
            </div>
            <div>
              <label className="label">Studio name or type</label>
              <input
                className="input w-64"
                placeholder="solidcore, yoga, pilates…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                required
                disabled={submitting || isRunning}
              />
            </div>
            <button
              type="submit"
              className="btn-primary"
              disabled={submitting || isRunning || zipcode.length !== 5 || !query.trim()}
            >
              {isRunning ? 'Running…' : submitting ? 'Starting…' : 'Run Discovery'}
            </button>
          </div>
          <RunStatus activeRun={activeRun} error={error} />
        </form>
      )}

      {/* ── Franchise form ── */}
      {mode === 'franchise' && (
        <form onSubmit={handleFranchiseSubmit} className="panel p-5 mb-6">
          <p className="text-xs text-gray-500 mb-4">
            Find all US locations for a studio franchise (e.g. "solidcore", "orangetheory").
            Searches across all states — no zipcode needed.
          </p>
          <div className="flex flex-wrap gap-4 items-end">
            <div>
              <label className="label">Studio / brand name</label>
              <input
                className="input w-72"
                placeholder="solidcore, Orangetheory, F45…"
                value={studioName}
                onChange={(e) => setStudioName(e.target.value)}
                required
                disabled={submitting || isRunning}
              />
            </div>
            <button
              type="submit"
              className="btn-primary"
              disabled={submitting || isRunning || !studioName.trim()}
            >
              {isRunning ? 'Running…' : submitting ? 'Starting…' : 'Find All Locations'}
            </button>
          </div>
          <p className="text-[11px] text-gray-400 mt-3">
            Returns up to 60 locations from Google Places. May take a few minutes to scrape.
          </p>
          <RunStatus activeRun={activeRun} error={error} />
        </form>
      )}

      {/* Run history */}
      {runs.length > 0 && (
        <div className="panel overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <h3 className="text-sm font-medium text-gray-700">Run History</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Mode</th>
                  <th>Query</th>
                  <th>Scope</th>
                  <th>Status</th>
                  <th>Studios</th>
                  <th>New</th>
                  <th>Updated</th>
                  <th>Duration</th>
                  <th>Started</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => {
                  const isActive = run.status === 'PENDING' || run.status === 'RUNNING'
                  return (
                  <tr key={run.id} className="cursor-default">
                    <td className="text-gray-400 font-mono text-xs">{run.id}</td>
                    <td>
                      <span className={[
                        'text-xs font-medium px-2 py-0.5 rounded-full',
                        run.discoveryMode === 'franchise'
                          ? 'bg-purple-100 text-purple-700'
                          : run.discoveryMode === 'refresh'
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-blue-100 text-blue-700',
                      ].join(' ')}>
                        {run.discoveryMode === 'franchise' ? 'Franchise' : run.discoveryMode === 'refresh' ? 'Refresh' : 'Zipcode'}
                      </span>
                    </td>
                    <td className="font-medium text-gray-800">{run.searchQuery}</td>
                    <td className="font-mono text-xs text-gray-500">
                      {run.discoveryMode === 'franchise' ? 'US-wide' : run.discoveryMode === 'refresh' ? '—' : run.zipcode}
                    </td>
                    <td><StatusBadge status={run.status} /></td>
                    <td className="text-center">{run.studiosFound ?? '—'}</td>
                    <td className="text-center text-green-700 font-medium">
                      {run.newLocations != null && run.newLocations > 0 ? `+${run.newLocations}` : run.newLocations ?? '—'}
                    </td>
                    <td className="text-center">{run.updatedLocations ?? '—'}</td>
                    <td className="text-xs text-gray-400">
                      {run.durationMs != null ? `${(run.durationMs / 1000).toFixed(1)}s` : '—'}
                    </td>
                    <td className="text-xs text-gray-400">
                      {new Date(run.startedAt).toLocaleString('en-US', {
                        month: 'short', day: 'numeric',
                        hour: 'numeric', minute: '2-digit',
                      })}
                    </td>
                    <td>
                      {isActive && (
                        <button
                          onClick={() => api.discovery.cancelRun(run.id).catch(() => {})}
                          className="px-2 py-0.5 text-xs font-medium text-red-600 border border-red-300 rounded hover:bg-red-50 whitespace-nowrap"
                        >
                          Kill
                        </button>
                      )}
                    </td>
                  </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function RunStatus({ activeRun, error }: { activeRun: DiscoveryRunSummary | null; error: string | null }) {
  if (!activeRun && !error) return null

  const isActive = activeRun?.status === 'PENDING' || activeRun?.status === 'RUNNING'

  const handleCancel = async () => {
    if (!activeRun) return
    try { await api.discovery.cancelRun(activeRun.id) } catch { /* ignore */ }
  }

  return (
    <div className="mt-4 pt-4 border-t border-gray-100">
      {activeRun && (
        <>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-700">
              "{activeRun.searchQuery}"
              {activeRun.discoveryMode === 'zipcode' && ` in ${activeRun.zipcode}`}
              {activeRun.discoveryMode === 'franchise' && ' — all US locations'}
            </span>
            <StatusBadge status={activeRun.status} />
            {isActive && (
              <button
                onClick={handleCancel}
                className="px-2 py-0.5 text-xs font-medium text-red-600 border border-red-300 rounded hover:bg-red-50"
              >
                Kill
              </button>
            )}
          </div>
          {activeRun.status === 'COMPLETED' && (
            <div className="mt-2 text-xs text-gray-500 flex gap-4">
              <span><b className="text-gray-800">{activeRun.studiosFound ?? 0}</b> studios found</span>
              <span><b className="text-green-700">{activeRun.newLocations ?? 0}</b> new locations</span>
              <span><b className="text-gray-800">{activeRun.updatedLocations ?? 0}</b> updated</span>
              {activeRun.durationMs != null && (
                <span className="text-gray-400">{(activeRun.durationMs / 1000).toFixed(1)}s</span>
              )}
            </div>
          )}
          {activeRun.status === 'FAILED' && (
            <p className="mt-2 text-xs text-red-600">{activeRun.errorMessage}</p>
          )}
          {activeRun.errorMessage && activeRun.status === 'COMPLETED' && (
            <p className="mt-2 text-xs text-amber-600">Warning: {activeRun.errorMessage}</p>
          )}
        </>
      )}
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    PENDING:   'badge-pending',
    RUNNING:   'badge-running',
    COMPLETED: 'badge-completed',
    FAILED:    'badge-failed',
    CANCELLED: 'badge-failed',
  }
  return <span className={map[status] ?? 'badge-pending'}>{status}</span>
}
