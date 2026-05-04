import { FastifyPluginAsync } from 'fastify'
import prisma from '../lib/prisma'
import { runRefresh } from '../workers/discoveryRunner'
import { DAYS_OF_WEEK } from '../../shared/types'
import type { DayOfWeek, StudioSummary, DiscoverResponse, CreateStudioRequest } from '../../shared/types'

const studioRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/v1/studios?zipcode=&query=&studioTypeId=
  app.get<{ Querystring: { zipcode?: string; query?: string; studioTypeId?: string } }>(
    '/studios',
    async (request, reply) => {
      const { zipcode, query, studioTypeId } = request.query

      const studios = await prisma.studio.findMany({
        where: {
          ...(studioTypeId ? { studioTypeId: parseInt(studioTypeId, 10) } : {}),
          ...(query ? { normalizedBrand: { contains: query.toLowerCase() } } : {}),
          ...(zipcode ? { locations: { some: { postalCode: zipcode } } } : {}),
        },
        include: {
          studioType: true,
          locations: {
            select: {
              id: true,
              addressLine1: true,
              addressLine2: true,
              city: true,
              state: true,
              postalCode: true,
              status: true,
              updatedAt: true,
            },
          },
        },
        orderBy: { name: 'asc' },
      })

      // For each studio, get class counts from the latest schedule run
      const summaries: StudioSummary[] = await Promise.all(
        studios.map(async (s) => {
          const locationIds = s.locations.map((l) => l.id)

          const dailyCounts: Record<DayOfWeek, number> = {
            MON: 0, TUE: 0, WED: 0, THU: 0, FRI: 0, SAT: 0, SUN: 0,
          }

          if (locationIds.length > 0) {
            // Find latest discovery run that produced schedules for this studio
            const latestSched = await prisma.classSchedule.findFirst({
              where: { locationId: { in: locationIds } },
              orderBy: { discoveryRunId: 'desc' },
              select: { discoveryRunId: true },
            })

            if (latestSched) {
              const schedRows = await prisma.classSchedule.findMany({
                where: {
                  locationId: { in: locationIds },
                  discoveryRunId: latestSched.discoveryRunId,
                },
                select: { dayOfWeek: true },
              })
              for (const row of schedRows) {
                const day = row.dayOfWeek as DayOfWeek
                if (day in dailyCounts) dailyCounts[day]++
              }
            }
          }

          const weeklyClassCount = DAYS_OF_WEEK.reduce((sum, d) => sum + dailyCounts[d], 0)

          // Min/max price-per-class — only DROP_IN and CLASS_PACK, which are the
          // only plan types that show a per-class cost in the pricing table UI.
          // INTRO has no meaningful per-class rate; MONTHLY/ANNUAL are unlimited
          // so their estimated $/class (priceAmount/16) is excluded here too.
          const priceStats = await prisma.pricingPlan.aggregate({
            where: {
              studioId: s.id,
              planType: { in: ['DROP_IN', 'CLASS_PACK'] },
              pricePerClass: { not: null },
            },
            _min: { pricePerClass: true },
            _max: { pricePerClass: true },
          })

          return {
            id: s.id,
            name: s.name,
            normalizedBrand: s.normalizedBrand,
            studioType: s.studioType.name,
            websiteUrl: s.websiteUrl,
            phone: s.phone,
            locationCount: s.locations.length,
            zipcode: s.locations[0]?.postalCode ?? null,
            locations: s.locations.map((l) => ({
              id: l.id,
              addressLine1: l.addressLine1,
              addressLine2: l.addressLine2,
              city: l.city,
              state: l.state,
              postalCode: l.postalCode,
              status: (l.status ?? 'unknown') as 'unknown' | 'open' | 'upcoming',
            })),
            weeklyClassCount,
            dailyClassCounts: dailyCounts,
            minPricePerClass: priceStats._min.pricePerClass ?? null,
            maxPricePerClass: priceStats._max.pricePerClass ?? null,
            lastDiscoveredAt: s.locations.length > 0
              ? s.locations
                  .map((l) => l.updatedAt)
                  .sort((a, b) => b.getTime() - a.getTime())[0]
                  .toISOString()
              : null,
          }
        })
      )

      return reply.send(summaries)
    }
  )

  // GET /api/v1/studios/:id — studio detail with locations and current pricing
  app.get<{ Params: { id: string } }>('/studios/:id', async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    if (isNaN(id)) return reply.status(400).send({ error: 'Invalid id' })

    const studio = await prisma.studio.findUnique({
      where: { id },
      include: {
        studioType: true,
        locations: true,
        pricingPlans: { orderBy: { planType: 'asc' } },
      },
    })

    if (!studio) return reply.status(404).send({ error: 'Studio not found' })
    return reply.send(studio)
  })

  // GET /api/v1/studio-types
  app.get('/studio-types', async (_request, reply) => {
    const types = await prisma.studioType.findMany({ orderBy: { name: 'asc' } })
    return reply.send(types)
  })

  // POST /api/v1/studio-types
  app.post<{ Body: { name: string; slug: string } }>('/studio-types', async (request, reply) => {
    const { name, slug } = request.body
    if (!name || !slug) return reply.status(400).send({ error: 'name and slug required' })
    const type = await prisma.studioType.create({ data: { name, slug } })
    return reply.status(201).send(type)
  })

  // POST /api/v1/studios — manually add a new studio + location
  app.post<{ Body: CreateStudioRequest }>('/studios', async (request, reply) => {
    const {
      name,
      websiteUrl,
      phone,
      brandName,
      addressLine1,
      addressLine2,
      city,
      state,
      postalCode,
      country = 'US',
    } = request.body

    if (!name || !brandName || !addressLine1 || !city || !state || !postalCode) {
      return reply.status(400).send({ error: 'name, brandName, addressLine1, city, state, postalCode are required' } as any)
    }

    const slug = brandName.toLowerCase().replace(/[^a-z0-9]+/g, '')
    const normalizedBrand = slug

    // Upsert StudioType by slug
    const studioType = await prisma.studioType.upsert({
      where: { slug },
      create: { name: brandName, slug },
      update: {},
    })

    // Upsert Studio by (normalizedBrand, studioTypeId)
    const studio = await prisma.studio.upsert({
      where: { normalizedBrand_studioTypeId: { normalizedBrand, studioTypeId: studioType.id } },
      create: { studioTypeId: studioType.id, name, normalizedBrand, websiteUrl, phone },
      update: { name, websiteUrl, phone },
    })

    // Create Location
    const location = await prisma.location.create({
      data: { studioId: studio.id, addressLine1, addressLine2, city, state, postalCode, country },
    })

    return reply.status(201).send({ studio, location })
  })

  // ── Shared helper: wipe all scraped data for a set of studio IDs ─────────────
  async function clearScrapedData(studioIds: number[]) {
    const locations = await prisma.location.findMany({
      where: { studioId: { in: studioIds } },
      select: { id: true },
    })
    const locationIds = locations.map((l) => l.id)
    if (locationIds.length > 0) {
      // ClassUtilization has ON DELETE RESTRICT on locationId, so must go first
      await prisma.classUtilization.deleteMany({ where: { locationId: { in: locationIds } } })
      await prisma.classSchedule.deleteMany({ where: { locationId: { in: locationIds } } })
      await prisma.hoursOfOperation.deleteMany({ where: { locationId: { in: locationIds } } })
    }
    await prisma.pricingPlan.deleteMany({ where: { studioId: { in: studioIds } } })
  }

  // DELETE /api/v1/studios/:id
  app.delete<{ Params: { id: string } }>('/studios/:id', async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    if (isNaN(id)) return reply.status(400).send({ error: 'Invalid id' })
    await clearScrapedData([id])
    await prisma.studio.delete({ where: { id } })
    return reply.status(204).send()
  })

  // POST /api/v1/studios/refresh — re-scrape pricing/schedule for selected studios
  app.post<{ Body: { ids: number[] }; Reply: DiscoverResponse }>(
    '/studios/refresh',
    async (request, reply) => {
      const { ids } = request.body ?? {}
      if (!Array.isArray(ids) || ids.length === 0) {
        return reply.status(400).send({ error: 'ids array required' } as any)
      }

      const studioNames = await prisma.studio.findMany({
        where: { id: { in: ids } },
        select: { name: true },
      })
      const label = studioNames.map((s) => s.name).join(', ')

      const run = await prisma.discoveryRun.create({
        data: { searchQuery: label, zipcode: 'REFRESH', status: 'PENDING' },
      })

      setImmediate(() => runRefresh(run.id, ids).catch((err) => {
        app.log.error({ runId: run.id, err }, 'Refresh run failed unexpectedly')
      }))

      return reply.status(202).send({ runId: run.id, status: 'PENDING' })
    }
  )

  // POST /api/v1/studios/purge — clear all scraped data then re-scrape
  app.post<{ Body: { ids: number[] }; Reply: DiscoverResponse }>(
    '/studios/purge',
    async (request, reply) => {
      const { ids } = request.body ?? {}
      if (!Array.isArray(ids) || ids.length === 0) {
        return reply.status(400).send({ error: 'ids array required' } as any)
      }

      // Immediately wipe all scraped data so the UI reflects empty state right away
      await clearScrapedData(ids)

      // Then kick off a fresh re-scrape
      const studioNames = await prisma.studio.findMany({
        where: { id: { in: ids } },
        select: { name: true },
      })
      const label = studioNames.map((s) => s.name).join(', ')

      const run = await prisma.discoveryRun.create({
        data: { searchQuery: label, zipcode: 'PURGE', status: 'PENDING' },
      })

      setImmediate(() => runRefresh(run.id, ids).catch((err) => {
        app.log.error({ runId: run.id, err }, 'Purge+refresh run failed unexpectedly')
      }))

      return reply.status(202).send({ runId: run.id, status: 'PENDING' })
    }
  )

  // DELETE /api/v1/studios — bulk delete by ids
  app.delete<{ Body: { ids: number[] } }>('/studios', async (request, reply) => {
    const { ids } = request.body ?? {}
    if (!Array.isArray(ids) || ids.length === 0) {
      return reply.status(400).send({ error: 'ids array required' })
    }
    await clearScrapedData(ids)
    await prisma.studio.deleteMany({ where: { id: { in: ids } } })
    return reply.status(204).send()
  })
}

export default studioRoutes
