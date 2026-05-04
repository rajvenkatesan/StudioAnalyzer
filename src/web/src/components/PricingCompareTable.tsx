import type { PricingPlanRow, PlanType } from '@shared/types'

interface StudioPricing {
  studioId: number
  studioName: string
  pricingPlans: PricingPlanRow[]
}

interface Props {
  studios: StudioPricing[]
}

// Row descriptor — one row in the table
interface RowDef {
  key: string
  label: string
  icon: string
  filter: (p: PricingPlanRow) => boolean
}

const STATIC_ROWS: RowDef[] = [
  { key: 'INTRO',      label: 'Intro / Trial', icon: '🌟', filter: (p) => p.planType === 'INTRO'      },
  { key: 'DROP_IN',    label: 'Drop-in',        icon: '🎟', filter: (p) => p.planType === 'DROP_IN'    },
  { key: 'CLASS_PACK', label: 'Class Pack',     icon: '📦', filter: (p) => p.planType === 'CLASS_PACK' },
  { key: 'ANNUAL',     label: 'Annual',         icon: '⭐', filter: (p) => p.planType === 'ANNUAL'     },
]

function fmtMonthlyLabel(classCount: number | null, commitmentMonths: number | null): string {
  const classPart = classCount != null ? `${classCount}/mo` : 'Unlimited'
  const commitPart =
    commitmentMonths == null ? '' :
    commitmentMonths === 12  ? '-12mo' :
    commitmentMonths === 1   ? '-1mo'  :
                               `-${commitmentMonths}mo`
  return `Monthly-${classPart}${commitPart}`
}

/** Build dynamic MONTHLY rows — one per unique (classCount, commitmentMonths) combo. */
function buildMonthlyRows(plans: PricingPlanRow[]): RowDef[] {
  const monthly = plans.filter((p) => p.planType === 'MONTHLY')
  const seen = new Set<string>()
  const combos: { classCount: number | null; commitmentMonths: number | null }[] = []

  for (const p of monthly) {
    const cc = p.classCount ?? null
    const cm = p.commitmentMonths ?? null
    const key = `${cc}_${cm}`
    if (seen.has(key)) continue
    seen.add(key)
    combos.push({ classCount: cc, commitmentMonths: cm })
  }

  // Sort: by classCount asc (unlimited last), then commitmentMonths desc (longest first)
  combos.sort((a, b) => {
    const ca = a.classCount ?? 9999
    const cb = b.classCount ?? 9999
    if (ca !== cb) return ca - cb
    return (b.commitmentMonths ?? 0) - (a.commitmentMonths ?? 0)
  })

  return combos.map(({ classCount, commitmentMonths }) => ({
    key: `MONTHLY_${classCount ?? 'u'}_${commitmentMonths ?? 'n'}`,
    label: fmtMonthlyLabel(classCount, commitmentMonths),
    icon: '♾',
    filter: (p) =>
      p.planType === 'MONTHLY' &&
      (p.classCount ?? null) === classCount &&
      (p.commitmentMonths ?? null) === commitmentMonths,
  }))
}

function formatPrice(amount: number, currency = 'USD') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount)
}

function PriceCell({ plans }: { plans: PricingPlanRow[] }) {
  if (plans.length === 0) return <span className="na-cell">N/A</span>
  return (
    <div className="space-y-2">
      {plans.map((p) => (
        <div key={p.id} className="space-y-0.5">
          <div className="flex items-baseline gap-1.5">
            <span className="text-base font-bold text-gray-900">{formatPrice(p.priceAmount)}</span>
          </div>
          {p.pricePerClass != null && (
            <div className="text-xs font-medium text-gray-500">
              {formatPrice(p.pricePerClass)} / class
            </div>
          )}
          {p.planName && (
            <div className="text-xs text-gray-400 truncate max-w-[160px]">{p.planName}</div>
          )}
        </div>
      ))}
    </div>
  )
}

export default function PricingCompareTable({ studios }: Props) {
  if (studios.length === 0) {
    return <p className="text-sm na-cell">No pricing data available.</p>
  }

  const allPlans = studios.flatMap((s) => s.pricingPlans)
  const monthlyRows = buildMonthlyRows(allPlans)
  const rows: RowDef[] = [
    ...STATIC_ROWS.slice(0, 3),  // INTRO, DROP_IN, CLASS_PACK
    ...monthlyRows,               // dynamic Monthly-N/mo-Mmo rows
    STATIC_ROWS[3],               // ANNUAL
  ]

  // Best $/class per row (for highlighting when comparing multiple studios)
  const minPerClass: Record<string, number> = {}
  for (const row of rows) {
    let min = Infinity
    for (const s of studios) {
      for (const p of s.pricingPlans.filter(row.filter)) {
        if (p.pricePerClass != null && p.pricePerClass < min) min = p.pricePerClass
      }
    }
    if (min < Infinity) minPerClass[row.key] = min
  }

  return (
    <div className="overflow-x-auto -mx-6 px-6">
      <table className="data-table">
        <thead>
          <tr>
            <th className="w-48">Plan Type</th>
            {studios.map((s) => (
              <th key={s.studioId}>{s.studioName}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const hasAny = studios.some((s) => s.pricingPlans.some(row.filter))
            if (!hasAny) return null

            return (
              <tr key={row.key}>
                <td>
                  <div className="flex items-center gap-2">
                    <span className="text-base">{row.icon}</span>
                    <span className="font-medium text-gray-700 text-xs">{row.label}</span>
                  </div>
                </td>
                {studios.map((s) => {
                  const plans = s.pricingPlans.filter(row.filter)
                  const isCheapest =
                    studios.length > 1 &&
                    minPerClass[row.key] !== undefined &&
                    plans.some((p) => p.pricePerClass === minPerClass[row.key])

                  return (
                    <td key={s.studioId} className={`align-top ${isCheapest ? 'bg-emerald-50/60' : ''}`}>
                      <PriceCell plans={plans} />
                      {isCheapest && plans.length > 0 && (
                        <span className="inline-flex items-center gap-1 mt-1.5 text-[10px] font-semibold
                                         text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                          Best $/class
                        </span>
                      )}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
