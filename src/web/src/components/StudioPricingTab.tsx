import { useState, useRef, CSSProperties } from 'react'
import { api } from '../lib/api'
import type { PricingRecommendationResponse, PricingRecommendationRow } from '@shared/types'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(v: number | null | undefined): string {
  if (v == null) return '—'
  return `$${v.toLocaleString('en-US')}`
}

/** Position of `value` within [low, high] as 0–100 %. */
function rangePct(value: number, low: number, high: number): number {
  if (high === low) return 50
  return Math.round(Math.max(0, Math.min(100, ((value - low) / (high - low)) * 100)))
}

/** A compact horizontal range bar: ←low────●────high→ */
function RangeBar({ row }: { row: PricingRecommendationRow }) {
  if (row.recommended == null || row.low == null || row.high == null) return null
  const pct = rangePct(row.recommended, row.low, row.high)
  return (
    <div className="flex items-center gap-2 mt-1">
      <span className="text-[10px] text-gray-400 tabular-nums w-10 text-right">{fmt(row.low)}</span>
      <div className="relative flex-1 h-1.5 bg-gray-200 rounded-full">
        <div
          className="absolute top-0 h-1.5 bg-indigo-200 rounded-full"
          style={{ left: 0, width: `${pct}%` }}
        />
        <div
          className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-indigo-600
                     border-2 border-white shadow"
          style={{ left: `calc(${pct}% - 6px)` }}
        />
      </div>
      <span className="text-[10px] text-gray-400 tabular-nums w-10">{fmt(row.high)}</span>
    </div>
  )
}

// Confidence badge: more data points = more filled dots
function Confidence({ n }: { n: number }) {
  const level = n >= 20 ? 4 : n >= 10 ? 3 : n >= 4 ? 2 : 1
  return (
    <span className="inline-flex items-center gap-0.5" title={`${n} studios`}>
      {[1, 2, 3, 4].map((d) => (
        <span key={d}
              className={`inline-block w-1.5 h-1.5 rounded-full ${
                d <= level ? 'bg-indigo-500' : 'bg-gray-200'
              }`} />
      ))}
      <span className="ml-1 text-[10px] text-gray-400">{n}</span>
    </span>
  )
}

// COL index badge with color: green below 100, amber near, red above
function COLBadge({ col, desc }: { col: number; desc: string }) {
  const style: CSSProperties =
    col < 95  ? { background: 'hsl(140,55%,92%)', color: 'hsl(140,55%,25%)' } :
    col < 110 ? { background: 'hsl(50,80%,92%)',  color: 'hsl(50,60%,28%)'  } :
    col < 130 ? { background: 'hsl(30,80%,92%)',  color: 'hsl(30,60%,28%)'  } :
                { background: 'hsl(0,60%,92%)',   color: 'hsl(0,60%,30%)'   }

  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-sm font-semibold"
          style={style}>
      COL&nbsp;{col}
      <span className="font-normal text-xs opacity-80">({desc})</span>
    </span>
  )
}

// Group headers for the table rows
const GROUP_META: Record<string, { label: string; color: string }> = {
  intro:     { label: 'Single / Trial',   color: 'bg-gray-50'   },
  dropIn:    { label: 'Single / Trial',   color: 'bg-gray-50'   },
  pack5:     { label: 'Class Packs',      color: 'bg-indigo-50' },
  pack10:    { label: 'Class Packs',      color: 'bg-indigo-50' },
  pack20:    { label: 'Class Packs',      color: 'bg-indigo-50' },
  mo4:       { label: 'Limited Monthly',  color: 'bg-teal-50'   },
  mo8:       { label: 'Limited Monthly',  color: 'bg-teal-50'   },
  mo12:      { label: 'Limited Monthly',  color: 'bg-teal-50'   },
  unlimited: { label: 'Unlimited',        color: 'bg-violet-50' },
}

// Which rows start a new group (show a divider + group label)
const GROUP_START = new Set(['intro', 'pack5', 'mo4', 'unlimited'])

// ── Main component ────────────────────────────────────────────────────────────

export default function StudioPricingTab() {
  const [zipInput, setZipInput]   = useState('')
  const [loading,  setLoading]    = useState(false)
  const [error,    setError]      = useState<string | null>(null)
  const [result,   setResult]     = useState<PricingRecommendationResponse | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const zip = zipInput.trim()
    if (!/^\d{5}$/.test(zip)) {
      setError('Please enter a valid 5-digit US zip code.')
      return
    }
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const data = await api.pricing.recommendations(zip)
      setResult(data)
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load recommendations.')
    } finally {
      setLoading(false)
    }
  }

  // Group rows for rendering with dividers
  const rows = result?.recommendations ?? []

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      {/* ── Title ─────────────────────────────────────────────────────────── */}
      <div className="mb-8">
        <h2 className="text-xl font-semibold text-gray-900">Your Studio Pricing</h2>
        <p className="text-sm text-gray-500 mt-1">
          Enter a zip code to get recommended pricing for a new studio in that market, based on
          comparable studios normalised to local cost of living.
        </p>
      </div>

      {/* ── Input form ────────────────────────────────────────────────────── */}
      <form onSubmit={handleSubmit}
            className="flex items-center gap-3 bg-white border border-gray-200 rounded-xl
                       shadow-sm px-4 py-3 mb-6">
        <div className="flex flex-col flex-1">
          <label htmlFor="zipcode" className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-0.5">
            Zip Code
          </label>
          <input
            id="zipcode"
            ref={inputRef}
            type="text"
            inputMode="numeric"
            maxLength={5}
            placeholder="e.g. 10001"
            value={zipInput}
            onChange={(e) => setZipInput(e.target.value.replace(/\D/g, '').slice(0, 5))}
            className="text-lg font-semibold text-gray-900 border-none outline-none bg-transparent
                       placeholder:text-gray-300 w-32 tabular-nums"
          />
        </div>
        <button
          type="submit"
          disabled={loading || zipInput.length !== 5}
          className="px-5 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg
                     hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed
                     transition-colors shadow-sm"
        >
          {loading ? 'Loading…' : 'Get Recommendations'}
        </button>
      </form>

      {/* ── Error ─────────────────────────────────────────────────────────── */}
      {error && (
        <div className="mb-6 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* ── Results ───────────────────────────────────────────────────────── */}
      {result && (
        <>
          {/* Context banner */}
          <div className="flex flex-wrap items-center gap-3 mb-6 px-4 py-3 bg-white
                          border border-gray-200 rounded-xl shadow-sm">
            <div className="flex-1 min-w-0">
              <div className="text-base font-semibold text-gray-900">
                {result.city && result.state
                  ? `${result.city}, ${result.state} (${result.zipcode})`
                  : result.zipcode}
              </div>
              <div className="text-xs text-gray-500 mt-0.5">
                Benchmarked against {result.totalStudios} studio
                {result.totalStudios !== 1 ? 's' : ''} across the US
              </div>
            </div>
            <COLBadge col={result.colIndex} desc={result.colDescription} />
          </div>

          {/* Methodology note */}
          <p className="text-[11px] text-gray-400 mb-4 leading-relaxed">
            Each comparable studio's prices are first scaled to a national-average-cost baseline
            (÷ their city's COL index), then the median and interquartile range are re-scaled
            to your market (× {result.colIndex}/100).{' '}
            <strong className="text-gray-500">Recommended</strong> = COL-adjusted median,
            rounded to the nearest $5.{' '}
            <strong className="text-gray-500">Range</strong> = P25 – P75 (middle 50% of comparable studios).
          </p>

          {/* Recommendations table */}
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Package
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Confidence
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Recommended Price
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide w-64">
                    Comparable Range (P25 – P75)
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => {
                  const meta     = GROUP_META[row.key] ?? { label: '', color: 'bg-white' }
                  const isStart  = GROUP_START.has(row.key)
                  const noData   = row.dataPoints === 0

                  return (
                    <>
                      {/* Group divider */}
                      {isStart && (
                        <tr key={`group-${row.key}`} className="border-t border-gray-100">
                          <td colSpan={4}
                              className="px-4 pt-3 pb-1 text-[10px] font-bold text-gray-400
                                         uppercase tracking-widest">
                            {meta.label}
                          </td>
                        </tr>
                      )}

                      {/* Data row */}
                      <tr key={row.key}
                          className={`border-t border-gray-100 ${meta.color} ${noData ? 'opacity-50' : ''}`}>

                        {/* Package name */}
                        <td className="px-4 py-3">
                          <span className="font-medium text-gray-800">{row.label}</span>
                          {row.classCount != null && (
                            <span className="ml-2 text-[10px] text-gray-400">
                              {row.classCount} {row.classCount === 1 ? 'class' : 'classes'}
                            </span>
                          )}
                        </td>

                        {/* Confidence dots */}
                        <td className="px-4 py-3 text-center">
                          {noData
                            ? <span className="text-[10px] text-gray-300">no data</span>
                            : <Confidence n={row.dataPoints} />}
                        </td>

                        {/* Recommended price — prominent */}
                        <td className="px-4 py-3 text-right">
                          {noData ? (
                            <span className="text-gray-300 text-sm">—</span>
                          ) : (
                            <span className="text-xl font-bold text-indigo-700 tabular-nums">
                              {fmt(row.recommended)}
                            </span>
                          )}
                        </td>

                        {/* Range bar */}
                        <td className="px-4 py-3 w-64">
                          {!noData && row.low != null && row.high != null ? (
                            <div>
                              <div className="flex justify-between text-[10px] text-gray-400 mb-0.5 tabular-nums">
                                <span>P25</span><span>P75</span>
                              </div>
                              <RangeBar row={row} />
                            </div>
                          ) : (
                            <span className="text-gray-300 text-xs">—</span>
                          )}
                        </td>
                      </tr>
                    </>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Footer note */}
          <p className="text-[10px] text-gray-400 mt-3 text-right">
            COL index source: ACCRA/COLI composite estimates. Data points = studios in the benchmark
            dataset offering that package tier. Prices rounded to nearest $5.
          </p>
        </>
      )}

      {/* ── Empty state ───────────────────────────────────────────────────── */}
      {!result && !loading && !error && (
        <div className="text-center py-20 text-gray-300">
          <div className="text-5xl mb-4">📍</div>
          <p className="text-sm">Enter a zip code above to see recommended pricing.</p>
        </div>
      )}
    </div>
  )
}
