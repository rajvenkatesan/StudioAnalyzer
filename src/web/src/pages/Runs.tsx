import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { DiscoveryRunSummary } from '@shared/types'

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

function RunRow({ run }: { run: DiscoveryRunSummary }) {
  return (
    <tr>
      <td>
        <span className="text-xs font-mono text-gray-300">#{run.id}</span>
      </td>
      <td>
        <div className="font-semibold text-gray-900">{run.searchQuery}</div>
        <div className="text-xs font-mono text-gray-400 mt-0.5">{run.zipcode}</div>
      </td>
      <td><StatusBadge status={run.status} /></td>
      <td className="text-center">
        <span className="font-semibold text-gray-800">{run.studiosFound ?? '—'}</span>
      </td>
      <td className="text-center">
        <span className="font-semibold text-gray-800">{run.locationsFound ?? '—'}</span>
      </td>
      <td className="text-center">
        {run.newLocations != null && run.newLocations > 0 ? (
          <span className="font-semibold text-emerald-600">+{run.newLocations}</span>
        ) : (
          <span className="text-gray-400">{run.newLocations ?? '—'}</span>
        )}
      </td>
      <td className="text-center">
        {run.updatedLocations != null && run.updatedLocations > 0 ? (
          <span className="font-medium text-blue-600">{run.updatedLocations}</span>
        ) : (
          <span className="text-gray-400">{run.updatedLocations ?? '—'}</span>
        )}
      </td>
      <td>
        {run.durationMs != null ? (
          <span className="text-xs font-medium text-gray-500">
            {(run.durationMs / 1000).toFixed(1)}s
          </span>
        ) : (
          <span className="text-gray-300">—</span>
        )}
      </td>
      <td>
        <div className="text-xs text-gray-500">
          {new Date(run.startedAt).toLocaleDateString('en-US', {
            month: 'short', day: 'numeric', year: 'numeric',
          })}
        </div>
        <div className="text-xs text-gray-300">
          {new Date(run.startedAt).toLocaleTimeString('en-US', {
            hour: 'numeric', minute: '2-digit',
          })}
        </div>
      </td>
    </tr>
  )
}

export default function Runs() {
  const { data: runs = [], isLoading } = useQuery({
    queryKey: ['runs'],
    queryFn: api.discovery.listRuns,
    refetchInterval: (query) => {
      const hasActive = query.state.data?.some(
        (r: DiscoveryRunSummary) => r.status === 'PENDING' || r.status === 'RUNNING'
      )
      return hasActive ? 2_000 : false
    },
  })

  const completed = runs.filter((r) => r.status === 'COMPLETED').length
  const failed = runs.filter((r) => r.status === 'FAILED').length
  const totalStudios = runs.reduce((max, r) => Math.max(max, r.studiosFound ?? 0), 0)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Discovery Runs</h1>
        <p className="text-sm text-gray-400 mt-0.5">History of all studio discovery jobs</p>
      </div>

      {/* Summary pills */}
      {runs.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {[
            { label: 'Total Runs', value: runs.length, color: 'bg-slate-100 text-slate-700' },
            { label: 'Completed', value: completed, color: 'bg-emerald-50 text-emerald-700' },
            { label: 'Failed', value: failed, color: failed > 0 ? 'bg-red-50 text-red-700' : 'bg-slate-50 text-slate-400' },
            { label: 'Max Studios Found', value: totalStudios, color: 'bg-brand-50 text-brand-700' },
          ].map(({ label, value, color }) => (
            <div key={label} className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${color}`}>
              {value} {label}
            </div>
          ))}
        </div>
      )}

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16 gap-2 text-gray-400 text-sm">
            <svg className="w-4 h-4 animate-spin text-brand-500" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Loading…
          </div>
        ) : runs.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-sm text-gray-400">No runs yet. Go to the Dashboard to run a discovery.</p>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Query / Zip</th>
                <th>Status</th>
                <th className="text-center">Studios</th>
                <th className="text-center">Locations</th>
                <th className="text-center">New</th>
                <th className="text-center">Updated</th>
                <th>Duration</th>
                <th>Started</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <RunRow key={run.id} run={run} />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Error messages */}
      {runs.filter((r) => r.errorMessage).map((r) => (
        <div key={r.id} className="card-sm border-amber-100 bg-amber-50">
          <div className="flex items-center gap-2 mb-1">
            <svg className="w-4 h-4 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <p className="text-xs font-semibold text-amber-700">Run #{r.id} warning</p>
          </div>
          <p className="text-xs text-amber-600 ml-6">{r.errorMessage}</p>
        </div>
      ))}
    </div>
  )
}
