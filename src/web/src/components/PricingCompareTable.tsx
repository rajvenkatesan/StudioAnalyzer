import type { PricingPlanRow, PlanType } from '@shared/types'

interface StudioPricing {
  studioId: number
  studioName: string
  pricingPlans: PricingPlanRow[]
}

interface Props {
  studios: StudioPricing[]
}

const PLAN_ORDER: PlanType[] = ['INTRO', 'DROP_IN', 'CLASS_PACK', 'MONTHLY', 'ANNUAL']
const PLAN_LABELS: Record<PlanType, string> = {
  INTRO: 'Intro / Trial',
  DROP_IN: 'Drop-in',
  CLASS_PACK: 'Class Pack',
  MONTHLY: 'Monthly Unlimited',
  ANNUAL: 'Annual',
}
const PLAN_ICONS: Record<PlanType, string> = {
  INTRO: '🌟',
  DROP_IN: '🎟',
  CLASS_PACK: '📦',
  MONTHLY: '♾',
  ANNUAL: '⭐',
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
            {p.classCount && (
              <span className="text-xs text-gray-400">× {p.classCount} classes</span>
            )}
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

  const minPerClass: Record<string, number> = {}
  for (const type of PLAN_ORDER) {
    let min = Infinity
    for (const s of studios) {
      for (const p of s.pricingPlans.filter((p) => p.planType === type)) {
        if (p.pricePerClass != null && p.pricePerClass < min) min = p.pricePerClass
      }
    }
    if (min < Infinity) minPerClass[type] = min
  }

  return (
    <div className="overflow-x-auto -mx-6 px-6">
      <table className="data-table">
        <thead>
          <tr>
            <th className="w-40">Plan Type</th>
            {studios.map((s) => (
              <th key={s.studioId}>{s.studioName}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {PLAN_ORDER.map((type) => {
            const hasAny = studios.some((s) =>
              s.pricingPlans.some((p) => p.planType === type)
            )
            if (!hasAny) return null

            return (
              <tr key={type}>
                <td>
                  <div className="flex items-center gap-2">
                    <span className="text-base">{PLAN_ICONS[type]}</span>
                    <span className="font-medium text-gray-700 text-xs">{PLAN_LABELS[type]}</span>
                  </div>
                </td>
                {studios.map((s) => {
                  const plans = s.pricingPlans.filter((p) => p.planType === type)
                  const isCheapest =
                    plans.some((p) => p.pricePerClass === minPerClass[type]) &&
                    minPerClass[type] !== undefined &&
                    studios.length > 1

                  return (
                    <td
                      key={s.studioId}
                      className={`align-top ${isCheapest ? 'bg-emerald-50/60' : ''}`}
                    >
                      <PriceCell plans={plans} />
                      {isCheapest && plans.length > 0 && (
                        <span className="inline-flex items-center gap-1 mt-1.5 text-[10px] font-semibold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
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
