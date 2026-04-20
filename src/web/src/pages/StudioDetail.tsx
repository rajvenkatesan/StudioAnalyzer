import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import HoursGrid from '../components/HoursGrid'
import UtilizationHeatmap from '../components/UtilizationHeatmap'
import PricingCompareTable from '../components/PricingCompareTable'
import type { PlanType } from '@shared/types'

const PLAN_LABELS: Record<PlanType, string> = {
  INTRO: 'Intro / Trial',
  DROP_IN: 'Drop-in',
  CLASS_PACK: 'Class Pack',
  MONTHLY: 'Monthly',
  ANNUAL: 'Annual',
}

const tabs = [
  {
    key: 'schedule' as const,
    label: 'Schedule & Utilization',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round"
          d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
  },
  {
    key: 'hours' as const,
    label: 'Hours',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round"
          d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    key: 'pricing' as const,
    label: 'Pricing',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round"
          d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
]

export default function StudioDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const studioId = parseInt(id!, 10)
  const [selectedLocationId, setSelectedLocationId] = useState<number | null>(null)
  const [tab, setTab] = useState<'schedule' | 'hours' | 'pricing'>('schedule')

  const { data: studio, isLoading } = useQuery({
    queryKey: ['studio', studioId],
    queryFn: () => api.studios.get(studioId),
    enabled: !isNaN(studioId),
  })

  const locationId = selectedLocationId ?? studio?.locations?.[0]?.id ?? null

  const { data: hours = [] } = useQuery({
    queryKey: ['hours', locationId],
    queryFn: () => api.locations.hours(locationId!),
    enabled: locationId !== null && tab === 'hours',
  })

  const { data: utilization = [] } = useQuery({
    queryKey: ['utilization', locationId],
    queryFn: () => api.locations.utilization(locationId!),
    enabled: locationId !== null && tab === 'schedule',
  })

  const { data: pricing = [] } = useQuery({
    queryKey: ['pricing', studioId],
    queryFn: () => api.studios.pricing(studioId),
    enabled: tab === 'pricing',
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <svg className="w-6 h-6 animate-spin text-brand-500" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    )
  }

  if (!studio) return <p className="text-sm text-red-500 p-6">Studio not found.</p>

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <button
          onClick={() => navigate(-1)}
          className="mt-1 p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-gray-900 truncate">{studio.name}</h1>
          <div className="flex flex-wrap items-center gap-3 mt-1.5">
            <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-brand-50 text-brand-700 capitalize">
              {studio.studioType?.name}
            </span>
            {studio.websiteUrl && (
              <a
                href={studio.websiteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-gray-400 hover:text-brand-600 flex items-center gap-1"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round"
                    d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
                {(() => { try { return new URL(studio.websiteUrl).hostname } catch { return studio.websiteUrl } })()}
              </a>
            )}
            {studio.phone && (
              <span className="text-xs text-gray-400">{studio.phone}</span>
            )}
          </div>
        </div>
      </div>

      {/* Location selector */}
      {studio.locations?.length > 0 && (
        <div className="card-sm">
          <div className="flex items-center gap-2 mb-3">
            <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Locations</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {studio.locations.map((loc: any) => (
              <button
                key={loc.id}
                onClick={() => setSelectedLocationId(loc.id)}
                className={`text-sm px-3 py-1.5 rounded-lg border transition-colors ${
                  (selectedLocationId ?? studio.locations[0].id) === loc.id
                    ? 'border-brand-400 bg-brand-50 text-brand-700 font-medium'
                    : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                {loc.addressLine1}, {loc.city}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-150 ${
              tab === t.key
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'schedule' && locationId && (
        <div className="card">
          <div className="flex items-center gap-2 mb-5">
            <h2 className="text-sm font-semibold text-gray-800">Class Utilization Heatmap</h2>
            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">latest run</span>
          </div>
          <UtilizationHeatmap snapshots={utilization} />
        </div>
      )}

      {tab === 'hours' && locationId && (
        <div className="card">
          <h2 className="text-sm font-semibold text-gray-800 mb-5">Hours of Operation</h2>
          <HoursGrid slots={hours} />
        </div>
      )}

      {tab === 'pricing' && (
        <div className="card">
          <h2 className="text-sm font-semibold text-gray-800 mb-5">Current Pricing</h2>
          {pricing.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-sm text-gray-400">Pricing data not available for this studio.</p>
            </div>
          ) : (
            <>
              <PricingCompareTable
                studios={[{ studioId, studioName: studio.name, pricingPlans: pricing }]}
              />
              <p className="text-xs text-gray-400 mt-4 pt-4 border-t border-gray-50">
                * Unlimited plans assume 16 classes/month for $/class calculation.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  )
}
