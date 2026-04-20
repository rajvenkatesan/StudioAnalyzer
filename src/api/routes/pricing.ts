import { FastifyPluginAsync } from 'fastify'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const zipcodeDb = require('zipcodes')
import prisma from '../lib/prisma'
import { getCOLIndex, colDescription } from '../lib/colIndex'
import type { PricingPlanRow, PricingMatrixEntry, PricingRecommendationRow, PricingRecommendationResponse } from '../../shared/types'

function toPricingRow(p: any): PricingPlanRow {
  return {
    id: p.id,
    studioId: p.studioId,
    locationId: p.locationId,
    planName: p.planName,
    planType: p.planType,
    priceAmount: p.priceAmount,
    currency: p.currency,
    classCount: p.classCount,
    validityDays: p.validityDays,
    pricePerClass: p.pricePerClass,
    notes: p.notes,
  }
}

const pricingRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/v1/studios/:id/pricing — current pricing for a studio
  app.get<{ Params: { id: string } }>('/studios/:id/pricing', async (request, reply) => {
    const studioId = parseInt(request.params.id, 10)
    if (isNaN(studioId)) return reply.status(400).send({ error: 'Invalid id' })

    const plans = await prisma.pricingPlan.findMany({
      where: { studioId },
      orderBy: [{ planType: 'asc' }, { priceAmount: 'asc' }],
    })

    return reply.send(plans.map(toPricingRow))
  })

  // GET /api/v1/pricing/compare?zipcode=&query=
  // Side-by-side pricing for all studios found in a zipcode + query
  app.get<{ Querystring: { zipcode?: string; query?: string } }>(
    '/pricing/compare',
    async (request, reply) => {
      const { zipcode, query } = request.query
      if (!zipcode) return reply.status(400).send({ error: 'zipcode required' })

      const studios = await prisma.studio.findMany({
        where: {
          ...(query ? { normalizedBrand: { contains: query.toLowerCase() } } : {}),
          locations: { some: { postalCode: zipcode } },
        },
        include: {
          pricingPlans: { orderBy: [{ planType: 'asc' }, { priceAmount: 'asc' }] },
        },
        take: 50,
      })

      const result = studios.map((s) => ({
        studioId: s.id,
        studioName: s.name,
        normalizedBrand: s.normalizedBrand,
        pricingPlans: s.pricingPlans.map(toPricingRow),
      }))

      return reply.send(result)
    }
  )
  // GET /api/v1/pricing/matrix — all studios that have pricing data (no filter required)
  // Returns one entry per studio, with all its pricing plans, for the Pricing Matrix tab.
  app.get<{ Reply: PricingMatrixEntry[] }>('/pricing/matrix', async (_request, reply) => {
    const studios = await prisma.studio.findMany({
      where: { pricingPlans: { some: {} } },
      include: {
        studioType: true,
        locations: { select: { city: true, state: true }, take: 1 },
        pricingPlans: { orderBy: [{ planType: 'asc' }, { priceAmount: 'asc' }] },
      },
      orderBy: { name: 'asc' },
    })

    const result: PricingMatrixEntry[] = studios.map((s) => ({
      studioId: s.id,
      studioName: s.name,
      studioType: s.studioType.name,
      city: s.locations[0]?.city ?? null,
      state: s.locations[0]?.state ?? null,
      pricingPlans: s.pricingPlans.map(toPricingRow),
    }))

    return reply.send(result)
  })

  // ── GET /api/v1/pricing/recommendations?zipcode= ──────────────────────────
  // Returns COL-adjusted pricing recommendations for a new studio in the given zip.
  //
  // Algorithm:
  //   1. Resolve the target zip → city/state → COL index (targetCOL).
  //   2. Pull every pricing plan from the DB, with each studio's location city/state.
  //   3. For each package tier, normalise each plan's price to the national baseline:
  //        normalisedPrice = actualPrice × (100 / sourceCOL)
  //   4. Compute P25, median, P75 of the normalised prices.
  //   5. Scale back to the target location:
  //        recommended = median × (targetCOL / 100), rounded to nearest $5.

  app.get<{ Querystring: { zipcode?: string } }>(
    '/pricing/recommendations',
    async (request, reply) => {
      const { zipcode } = request.query
      if (!zipcode || !/^\d{5}$/.test(zipcode)) {
        return reply.status(400).send({ error: 'Valid 5-digit US zipcode required' })
      }

      // ── Resolve target location ──────────────────────────────────────────
      const zInfo = zipcodeDb.lookup(zipcode) as { city?: string; state?: string } | null
      const targetCity  = zInfo?.city  ?? null
      const targetState = zInfo?.state ?? null
      const targetCOL   = getCOLIndex(targetCity, targetState)

      // ── Pull all plans with source city/state ────────────────────────────
      const allPlans = await prisma.pricingPlan.findMany({
        include: {
          studio: {
            include: { locations: { select: { city: true, state: true }, take: 1 } },
          },
        },
      })

      const totalStudios = new Set(allPlans.map((p) => p.studioId)).size

      // ── Tier definitions ─────────────────────────────────────────────────
      type TierDef = {
        key: string; label: string; planType: string
        classCount: number | null | 'any'
      }
      const TIERS: TierDef[] = [
        { key: 'intro',     label: 'Intro / Trial',      planType: 'INTRO',      classCount: 'any' },
        { key: 'dropIn',    label: 'Drop-In',             planType: 'DROP_IN',    classCount: 'any' },
        { key: 'pack5',     label: '5-Class Pack',        planType: 'CLASS_PACK', classCount: 5     },
        { key: 'pack10',    label: '10-Class Pack',       planType: 'CLASS_PACK', classCount: 10    },
        { key: 'pack20',    label: '20-Class Pack',       planType: 'CLASS_PACK', classCount: 20    },
        { key: 'mo4',       label: '4 Classes / Month',   planType: 'MONTHLY',    classCount: 4     },
        { key: 'mo8',       label: '8 Classes / Month',   planType: 'MONTHLY',    classCount: 8     },
        { key: 'mo12',      label: '12 Classes / Month',  planType: 'MONTHLY',    classCount: 12    },
        { key: 'unlimited', label: 'Monthly Unlimited',   planType: 'MONTHLY',    classCount: null  },
      ]

      function roundToFive(n: number): number { return Math.round(n / 5) * 5 }

      function pct(sorted: number[], p: number): number {
        if (!sorted.length) return 0
        const i = Math.floor(sorted.length * p)
        return sorted[Math.min(i, sorted.length - 1)]
      }

      const recommendations: PricingRecommendationRow[] = TIERS.map((tier) => {
        // Filter plans for this tier
        const matches = allPlans.filter((p) => {
          if (p.planType !== tier.planType) return false
          if (tier.classCount === 'any') return true
          if (tier.classCount === null) return p.classCount === null
          return p.classCount === tier.classCount
        })

        if (matches.length === 0) {
          return {
            key: tier.key, label: tier.label,
            planType: tier.planType as any,
            classCount: tier.classCount === 'any' ? null : tier.classCount,
            dataPoints: 0,
            recommended: null, low: null, high: null, rawMedian: null,
          }
        }

        // Normalise each plan's price to the national baseline
        const normalised = matches
          .map((p) => {
            const city  = p.studio.locations[0]?.city  ?? null
            const state = p.studio.locations[0]?.state ?? null
            const srcCOL = getCOLIndex(city, state)
            return p.priceAmount * (100 / srcCOL)
          })
          .sort((a, b) => a - b)

        const rawMedian = pct(normalised, 0.5)
        const rawLow    = pct(normalised, 0.25)
        const rawHigh   = pct(normalised, 0.75)

        const scale = targetCOL / 100

        return {
          key: tier.key, label: tier.label,
          planType: tier.planType as any,
          classCount: tier.classCount === 'any' ? null : tier.classCount,
          dataPoints:  matches.length,
          recommended: roundToFive(rawMedian * scale),
          low:         roundToFive(rawLow    * scale),
          high:        roundToFive(rawHigh   * scale),
          rawMedian:   Math.round(rawMedian),
        }
      })

      const response: PricingRecommendationResponse = {
        zipcode,
        city:           targetCity,
        state:          targetState,
        colIndex:       targetCOL,
        colDescription: colDescription(targetCOL),
        totalStudios,
        recommendations,
      }

      return reply.send(response)
    }
  )
}

export default pricingRoutes
