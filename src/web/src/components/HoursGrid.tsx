import { DAYS_OF_WEEK, OPERATING_HOURS, formatHour } from '@shared/types'
import type { HourSlot } from '@shared/types'

interface Props {
  slots: (HourSlot & { dataAvailable?: boolean })[]
}

export default function HoursGrid({ slots }: Props) {
  if (!slots || slots.length === 0) {
    return <p className="text-sm na-cell py-2">Hours of operation not available for this location.</p>
  }

  const grid = new Map<string, boolean>()
  for (const s of slots) {
    grid.set(`${s.dayOfWeek}:${s.hour}`, s.isOpen)
  }

  return (
    <div className="overflow-x-auto">
      <table className="text-xs border-collapse">
        <thead>
          <tr>
            <th className="w-16 pr-3 text-right text-gray-400 font-normal pb-2" />
            {DAYS_OF_WEEK.map((d) => (
              <th key={d} className="w-11 text-center text-gray-500 font-semibold pb-2 px-0.5 text-[11px]">
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
                const key = `${day}:${hour}`
                const isOpen = grid.get(key)
                const hasData = grid.has(key)

                return (
                  <td key={day} className="px-0.5 py-px">
                    <div
                      className={`w-9 h-5 rounded-sm transition-colors ${
                        !hasData
                          ? 'bg-gray-50'
                          : isOpen
                          ? 'bg-brand-500'
                          : 'bg-gray-100'
                      }`}
                      title={!hasData ? 'No data' : isOpen ? 'Open' : 'Closed'}
                    />
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>

      <div className="flex items-center gap-5 mt-4 text-xs text-gray-500">
        <span className="flex items-center gap-1.5">
          <span className="w-3.5 h-3.5 rounded bg-brand-500 inline-block" /> Open
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3.5 h-3.5 rounded bg-gray-100 inline-block border border-gray-200" /> Closed
        </span>
      </div>
    </div>
  )
}
