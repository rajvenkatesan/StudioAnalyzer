import { FastifyPluginAsync } from 'fastify'
import prisma from '../lib/prisma'
import { computeUtilizationRate } from '../workers/discoveryRunner'
import { DAYS_OF_WEEK, OPERATING_HOURS } from '../../shared/types'
import type { DayOfWeek, StudioComparison, UtilizationCell } from '../../shared/types'

const analysisRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/v1/analysis/compare?zipcode=&query=
  // Full side-by-side: hours, class counts, utilization grid, pricing — up to 50 studios
  app.get<{ Querystring: { zipcode?: string; query?: string } }>(
    '/analysis/compare',
    async (request, reply) => {
      const { zipcode, query } = request.query
      if (!zipcode) return reply.status(400).send({ error: 'zipcode required' })

      const studios = await prisma.studio.findMany({
        where: {
          ...(query ? { normalizedBrand: { contains: query.toLowerCase() } } : {}),
          locations: { some: { postalCode: zipcode } },
        },
        include: {
          locations: {
            where: { postalCode: zipcode },
          },
          pricingPlans: { orderBy: [{ planType: 'asc' }, { priceAmount: 'asc' }] },
        },
        take: 50,
      })

      const comparisons = await Promise.all(
        studios.map(async (studio) => {
          // Collect schedules and utilization for the latest run per location
          const locationIds = studio.locations.map((l) => l.id)

          // Latest run across all locations for this studio
          const latestUtil = await prisma.classUtilization.findFirst({
            where: { locationId: { in: locationIds } },
            orderBy: { discoveryRunId: 'desc' },
            select: { discoveryRunId: true },
          })

          const utilRows = latestUtil
            ? await prisma.classUtilization.findMany({
                where: {
                  locationId: { in: locationIds },
                  discoveryRunId: latestUtil.discoveryRunId,
                },
              })
            : []

          // Build utilization grid (day × hour), averaged across locations
          const grid: UtilizationCell[] = []
          for (const day of DAYS_OF_WEEK) {
            for (const hour of OPERATING_HOURS) {
              const startTime = `${String(hour).padStart(2, '0')}:00`
              const matching = utilRows.filter(
                (r) => r.dayOfWeek === day && r.startTime === startTime
              )
              const available = matching.filter((r) => r.dataAvailable)
              const rates = available
                .map((r) => computeUtilizationRate(r.spotsAvailable, r.totalSpots))
                .filter((r): r is number => r !== null)

              grid.push({
                dayOfWeek: day,
                hour,
                classCount: matching.length,
                dataAvailable: available.length > 0,
                avgUtilizationRate: rates.length > 0
                  ? rates.reduce((a, b) => a + b, 0) / rates.length
                  : null,
              })
            }
          }

          // Class counts per day from schedules
          const latestSched = await prisma.classSchedule.findFirst({
            where: { locationId: { in: locationIds } },
            orderBy: { discoveryRunId: 'desc' },
            select: { discoveryRunId: true },
          })

          const schedRows = latestSched
            ? await prisma.classSchedule.findMany({
                where: {
                  locationId: { in: locationIds },
                  discoveryRunId: latestSched.discoveryRunId,
                },
              })
            : []

          const dailyCounts: Record<DayOfWeek, number> = {
            MON: 0, TUE: 0, WED: 0, THU: 0, FRI: 0, SAT: 0, SUN: 0,
          }
          for (const s of schedRows) {
            dailyCounts[s.dayOfWeek as DayOfWeek]++
          }

          // Hours of operation
          const hoursRows = await prisma.hoursOfOperation.findMany({
            where: { locationId: { in: locationIds } },
            orderBy: [{ dayOfWeek: 'asc' }, { hour: 'asc' }],
          })

          return {
            studioId: studio.id,
            studioName: studio.name,
            normalizedBrand: studio.normalizedBrand,
            locations: studio.locations.map((l) => ({
              id: l.id,
              studioId: l.studioId,
              addressLine1: l.addressLine1,
              addressLine2: l.addressLine2,
              city: l.city,
              state: l.state,
              postalCode: l.postalCode,
              latitude: l.latitude,
              longitude: l.longitude,
              googlePlaceId: l.googlePlaceId,
            })),
            weeklyClassCount: schedRows.length,
            dailyClassCounts: dailyCounts,
            utilizationGrid: grid,
            pricingPlans: studio.pricingPlans.map((p) => ({
              id: p.id,
              studioId: p.studioId,
              locationId: p.locationId,
              planName: p.planName,
              planType: p.planType as any,
              priceAmount: p.priceAmount,
              currency: p.currency,
              classCount: p.classCount,
              validityDays: p.validityDays,
              pricePerClass: p.pricePerClass,
              notes: p.notes,
            })),
            hoursGrid: hoursRows.map((h) => ({
              dayOfWeek: h.dayOfWeek as DayOfWeek,
              hour: h.hour,
              isOpen: h.isOpen,
            })),
          } as StudioComparison
        })
      )

      return reply.send(comparisons)
    }
  )

  // GET /api/v1/analysis/busy-slots?locationId=
  app.get<{ Querystring: { locationId?: string } }>(
    '/analysis/busy-slots',
    async (request, reply) => {
      const locationId = parseInt(request.query.locationId ?? '', 10)
      if (isNaN(locationId)) return reply.status(400).send({ error: 'locationId required' })

      const latestRun = await prisma.classUtilization.findFirst({
        where: { locationId },
        orderBy: { discoveryRunId: 'desc' },
        select: { discoveryRunId: true },
      })

      if (!latestRun) return reply.send([])

      const rows = await prisma.classUtilization.findMany({
        where: { locationId, discoveryRunId: latestRun.discoveryRunId, dataAvailable: true },
        include: { classSchedule: { select: { className: true } } },
        orderBy: { observedAt: 'desc' },
      })

      const ranked = rows
        .map((r) => ({
          dayOfWeek: r.dayOfWeek,
          startTime: r.startTime,
          className: r.classSchedule.className,
          utilizationRate: computeUtilizationRate(r.spotsAvailable, r.totalSpots),
          spotsAvailable: r.spotsAvailable,
          totalSpots: r.totalSpots,
        }))
        .filter((r) => r.utilizationRate !== null)
        .sort((a, b) => (b.utilizationRate ?? 0) - (a.utilizationRate ?? 0))

      return reply.send(ranked)
    }
  )
}

export default analysisRoutes
