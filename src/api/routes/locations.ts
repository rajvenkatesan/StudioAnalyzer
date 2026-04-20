import { FastifyPluginAsync } from 'fastify'
import prisma from '../lib/prisma'
import { computeUtilizationRate } from '../workers/discoveryRunner'
import type { DayOfWeek, HourSlot, ClassScheduleRow, UtilizationSnapshot } from '../../shared/types'
import { OPERATING_HOURS, DAYS_OF_WEEK } from '../../shared/types'

const locationRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/v1/studios/:id/locations
  app.get<{ Params: { id: string } }>('/studios/:id/locations', async (request, reply) => {
    const studioId = parseInt(request.params.id, 10)
    if (isNaN(studioId)) return reply.status(400).send({ error: 'Invalid id' })

    const locations = await prisma.location.findMany({
      where: { studioId },
      orderBy: { city: 'asc' },
    })
    return reply.send(locations)
  })

  // GET /api/v1/locations/:id/hours — all 140 hour slots for a location
  app.get<{ Params: { id: string } }>('/locations/:id/hours', async (request, reply) => {
    const locationId = parseInt(request.params.id, 10)
    if (isNaN(locationId)) return reply.status(400).send({ error: 'Invalid id' })

    const rows = await prisma.hoursOfOperation.findMany({
      where: { locationId },
      orderBy: [{ dayOfWeek: 'asc' }, { hour: 'asc' }],
    })

    // If no hours scraped, return all slots as dataAvailable=false
    if (rows.length === 0) {
      const slots: (HourSlot & { dataAvailable: boolean })[] = []
      for (const day of DAYS_OF_WEEK) {
        for (const hour of OPERATING_HOURS) {
          slots.push({ dayOfWeek: day, hour, isOpen: false, dataAvailable: false })
        }
      }
      return reply.send(slots)
    }

    const slots: (HourSlot & { dataAvailable: boolean })[] = rows.map((r) => ({
      dayOfWeek: r.dayOfWeek as DayOfWeek,
      hour: r.hour,
      isOpen: r.isOpen,
      dataAvailable: true,
    }))
    return reply.send(slots)
  })

  // GET /api/v1/locations/:id/schedule — current (latest run) class schedule
  app.get<{ Params: { id: string } }>('/locations/:id/schedule', async (request, reply) => {
    const locationId = parseInt(request.params.id, 10)
    if (isNaN(locationId)) return reply.status(400).send({ error: 'Invalid id' })

    // Latest discoveryRunId for this location
    const latestRun = await prisma.classSchedule.findFirst({
      where: { locationId },
      orderBy: { discoveryRunId: 'desc' },
      select: { discoveryRunId: true },
    })

    if (!latestRun) return reply.send([])

    const schedules = await prisma.classSchedule.findMany({
      where: { locationId, discoveryRunId: latestRun.discoveryRunId },
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
    })

    const rows: ClassScheduleRow[] = schedules.map((s) => ({
      id: s.id,
      locationId: s.locationId,
      className: s.className,
      dayOfWeek: s.dayOfWeek as DayOfWeek,
      startTime: s.startTime,
      durationMinutes: s.durationMinutes,
      instructor: s.instructor,
      totalSpots: s.totalSpots,
    }))

    return reply.send(rows)
  })

  // GET /api/v1/locations/:id/utilization — latest run utilization snapshots
  app.get<{ Params: { id: string } }>('/locations/:id/utilization', async (request, reply) => {
    const locationId = parseInt(request.params.id, 10)
    if (isNaN(locationId)) return reply.status(400).send({ error: 'Invalid id' })

    // Latest discoveryRunId for this location's utilization
    const latestRun = await prisma.classUtilization.findFirst({
      where: { locationId },
      orderBy: { discoveryRunId: 'desc' },
      select: { discoveryRunId: true },
    })

    if (!latestRun) return reply.send([])

    const rows = await prisma.classUtilization.findMany({
      where: { locationId, discoveryRunId: latestRun.discoveryRunId },
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
    })

    const snapshots: UtilizationSnapshot[] = rows.map((r) => {
      const rate = computeUtilizationRate(r.spotsAvailable, r.totalSpots)
      return {
        id: r.id,
        classScheduleId: r.classScheduleId,
        dayOfWeek: r.dayOfWeek as DayOfWeek,
        startTime: r.startTime,
        spotsAvailable: r.spotsAvailable,
        totalSpots: r.totalSpots,
        dataAvailable: r.dataAvailable,
        utilizationRate: rate,
        spotsTaken: r.totalSpots != null && r.spotsAvailable != null
          ? r.totalSpots - r.spotsAvailable
          : null,
        observedAt: r.observedAt.toISOString(),
      }
    })

    return reply.send(snapshots)
  })
}

export default locationRoutes
