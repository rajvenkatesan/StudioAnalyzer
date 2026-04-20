import { DAYS_OF_WEEK, OPERATING_HOURS, formatHour } from '@shared/types'
import type { UtilizationSnapshot, UtilizationCell } from '@shared/types'

type Props = {
  snapshots: UtilizationSnapshot[] | UtilizationCell[]
}

function isCell(item: any): item is UtilizationCell {
  return 'avgUtilizationRate' in item
}

function utilizationColor(rate: number | null, dataAvailable: boolean): string {
  if (!dataAvailable || rate === null) return 'bg-gray-100 text-gray-400'
  if (rate >= 0.85) return 'bg-red-500 text-white'
  if (rate >= 0.65) return 'bg-orange-400 text-white'
  if (rate >= 0.40) return 'bg-amber-300 text-gray-800'
  return 'bg-emerald-200 text-gray-700'
}

export default function UtilizationHeatmap({ snapshots }: Props) {
  if (!snapshots || snapshots.length === 0) {
    return (
      <div className="py-8 text-center">
        <p className="text-sm na-cell">No utilization data available for this location.</p>
      </div>
    )
  }

  type Cell = { rate: number | null; count: number; dataAvailable: boolean }
  const grid = new Map<string, Cell>()

  for (const item of snapshots) {
    if (isCell(item)) {
      // UtilizationCell has no startTime field — use hour from the cell's day data
      // The hour isn't directly on UtilizationCell so we skip; handled via snapshots path
      const cell = item as UtilizationCell
      // aggregate by hour — UtilizationCell doesn't carry startTime; skip here
      // (comparison API sends UtilizationCell[], studio detail sends UtilizationSnapshot[])
      const hourStr = (item as any).hour
      if (hourStr == null) continue
      const key = `${cell.dayOfWeek}:${hourStr}`
      grid.set(key, {
        rate: cell.avgUtilizationRate,
        count: cell.classCount,
        dataAvailable: cell.dataAvailable,
      })
    } else {
      const snap = item as UtilizationSnapshot
      const hour = parseInt(snap.startTime.split(':')[0], 10)
      const key = `${snap.dayOfWeek}:${hour}`
      const existing = grid.get(key)
      if (!existing) {
        grid.set(key, { rate: snap.utilizationRate, count: 1, dataAvailable: snap.dataAvailable })
      } else {
        const newRate =
          existing.rate !== null && snap.utilizationRate !== null
            ? (existing.rate * existing.count + snap.utilizationRate) / (existing.count + 1)
            : existing.rate ?? snap.utilizationRate
        grid.set(key, {
          rate: newRate,
          count: existing.count + 1,
          dataAvailable: existing.dataAvailable || snap.dataAvailable,
        })
      }
    }
  }

  return (
    <div className="overflow-x-auto">
      <table className="text-xs border-collapse">
        <thead>
          <tr>
            <th className="w-16 pr-3 text-right text-gray-400 font-normal pb-2" />
            {DAYS_OF_WEEK.map((d) => (
              <th key={d} className="w-12 text-center text-gray-500 font-semibold pb-2 px-0.5 text-[11px]">
                {d}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {OPERATING_HOURS.map((hour) => (
            <tr key={hour}>
              <td className="pr-3 text-right text-gray-400 py-px font-medium">{formatHour(hour)}</td>
              {DAYS_OF_WEEK.map((day) => {
                const cell = grid.get(`${day}:${hour}`)
                const rate = cell?.rate ?? null
                const dataAvailable = cell?.dataAvailable ?? false
                const hasData = cell !== undefined

                return (
                  <td key={day} className="px-0.5 py-px">
                    <div
                      className={`w-10 h-6 rounded flex items-center justify-center transition-colors text-[9px] font-bold ${
                        !hasData ? 'bg-gray-50' : utilizationColor(rate, dataAvailable)
                      }`}
                      title={
                        !hasData
                          ? 'No class'
                          : !dataAvailable
                          ? 'N/A'
                          : rate !== null
                          ? `${Math.round(rate * 100)}% full (${cell?.count} class${cell?.count !== 1 ? 'es' : ''})`
                          : 'N/A'
                      }
                    >
                      {hasData && dataAvailable && rate !== null
                        ? `${Math.round(rate * 100)}%`
                        : hasData && !dataAvailable
                        ? 'N/A'
                        : ''}
                    </div>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>

      <div className="flex flex-wrap items-center gap-4 mt-4 text-xs text-gray-500">
        {[
          { cls: 'bg-emerald-200', label: 'Low (<40%)' },
          { cls: 'bg-amber-300', label: 'Medium (40–65%)' },
          { cls: 'bg-orange-400', label: 'High (65–85%)' },
          { cls: 'bg-red-500', label: 'Full (>85%)' },
          { cls: 'bg-gray-100 border border-gray-200', label: 'N/A' },
        ].map(({ cls, label }) => (
          <span key={label} className="flex items-center gap-1.5">
            <span className={`w-3.5 h-3.5 rounded ${cls} inline-block`} />
            {label}
          </span>
        ))}
      </div>
    </div>
  )
}
