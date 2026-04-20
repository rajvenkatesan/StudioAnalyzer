import { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import prisma from '../lib/prisma'
import { runDiscovery, runFranchiseDiscovery, cancelRun } from '../workers/discoveryRunner'
import { verifyApiKey } from '../workers/geocode'
import { scrapeInstructorsFromMindBody } from '../workers/instructorScraper'
import { normalizeBrandName } from '../workers/scraper'
import type { DiscoverRequest, DiscoverResponse, DiscoveryRunSummary, FranchiseDiscoverRequest, InstructorDiscoverRequest } from '../../shared/types'

const DiscoverBodySchema = z.object({
  zipcode: z.string().regex(/^\d{5}$/, 'Must be a 5-digit US zipcode'),
  query: z.string().min(1).max(100),
})

const FranchiseBodySchema = z.object({
  studioName: z.string().min(1).max(100),
})

const InstructorBodySchema = z.object({
  zipcode: z.string().regex(/^\d{5}$/, 'Must be a 5-digit US zipcode'),
  classType: z.string().max(50).optional(),
})

const discoveryRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/v1/discovery/verify-key — test that the Google API key works
  app.get('/discovery/verify-key', async (_request, reply) => {
    const result = await verifyApiKey()
    return reply.status(result.ok ? 200 : 400).send(result)
  })

  // POST /api/v1/discovery/run — start a discovery job
  app.post<{ Body: DiscoverRequest; Reply: DiscoverResponse }>(
    '/discovery/run',
    async (request, reply) => {
      const parsed = DiscoverBodySchema.safeParse(request.body)
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.flatten() } as any)
      }

      const { zipcode, query } = parsed.data

      const run = await prisma.discoveryRun.create({
        data: { searchQuery: query, zipcode, status: 'PENDING' },
      })

      // Fire and forget — runs async in the background
      setImmediate(() => runDiscovery(run.id).catch((err) => {
        app.log.error({ runId: run.id, err }, 'Discovery run failed unexpectedly')
      }))

      return reply.status(202).send({ runId: run.id, status: 'PENDING' })
    }
  )

  // POST /api/v1/discovery/franchise — search all US locations for a named studio brand
  app.post<{ Body: FranchiseDiscoverRequest; Reply: DiscoverResponse }>(
    '/discovery/franchise',
    async (request, reply) => {
      const parsed = FranchiseBodySchema.safeParse(request.body)
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.flatten() } as any)
      }

      const { studioName } = parsed.data

      const run = await prisma.discoveryRun.create({
        data: { searchQuery: studioName, zipcode: 'NATIONWIDE', status: 'PENDING' },
      })

      setImmediate(() => runFranchiseDiscovery(run.id).catch((err) => {
        app.log.error({ runId: run.id, err }, 'Franchise discovery run failed unexpectedly')
      }))

      return reply.status(202).send({ runId: run.id, status: 'PENDING' })
    }
  )

  // POST /api/v1/discovery/runs/:id/cancel — cancel a PENDING or RUNNING job
  app.post<{ Params: { id: string } }>('/discovery/runs/:id/cancel', async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    if (isNaN(id)) return reply.status(400).send({ error: 'Invalid id' })

    const run = await prisma.discoveryRun.findUnique({ where: { id } })
    if (!run) return reply.status(404).send({ error: 'Run not found' })

    if (run.status !== 'PENDING' && run.status !== 'RUNNING') {
      return reply.status(409).send({ error: `Run is already ${run.status}` })
    }

    // Signal the in-process runner to stop at its next iteration
    cancelRun(id)

    // For PENDING jobs that haven't started yet, cancel immediately in DB
    if (run.status === 'PENDING') {
      await prisma.discoveryRun.update({
        where: { id },
        data: { status: 'CANCELLED', completedAt: new Date() },
      })
    }

    return reply.send({ ok: true })
  })

  // POST /api/v1/discovery/instructors — scrape MindBody for instructors near a zipcode
  app.post<{ Body: InstructorDiscoverRequest; Reply: DiscoverResponse }>(
    '/discovery/instructors',
    async (request, reply) => {
      const parsed = InstructorBodySchema.safeParse(request.body)
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.flatten() } as any)
      }

      const { zipcode, classType } = parsed.data

      const run = await prisma.discoveryRun.create({
        data: {
          searchQuery: classType ?? 'all',
          zipcode: `INSTRUCTORS:${zipcode}`,
          status: 'PENDING',
        },
      })

      setImmediate(() => runInstructorDiscovery(run.id, zipcode, classType).catch((err) => {
        app.log.error({ runId: run.id, err }, 'Instructor discovery run failed unexpectedly')
      }))

      return reply.status(202).send({ runId: run.id, status: 'PENDING' })
    }
  )

  // GET /api/v1/discovery/runs — list all runs, newest first
  app.get('/discovery/runs', async (request, reply) => {
    const runs = await prisma.discoveryRun.findMany({
      orderBy: { startedAt: 'desc' },
      take: 100,
    })

    const summaries: DiscoveryRunSummary[] = runs.map((r) => ({
      id: r.id,
      searchQuery: r.searchQuery,
      zipcode: r.zipcode,
      discoveryMode: r.zipcode === 'NATIONWIDE' ? 'franchise'
                   : r.zipcode === 'REFRESH'    ? 'refresh'
                   : r.zipcode.startsWith('INSTRUCTORS:') ? 'instructors'
                   : 'zipcode',
      status: r.status as DiscoveryRunSummary['status'],
      studiosFound: r.studiosFound,
      locationsFound: r.locationsFound,
      newLocations: r.newLocations,
      updatedLocations: r.updatedLocations,
      errorMessage: r.errorMessage,
      startedAt: r.startedAt.toISOString(),
      completedAt: r.completedAt?.toISOString() ?? null,
      durationMs: r.completedAt ? r.completedAt.getTime() - r.startedAt.getTime() : null,
    }))

    return reply.send(summaries)
  })

  // GET /api/v1/discovery/runs/:id — single run status
  app.get<{ Params: { id: string } }>('/discovery/runs/:id', async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    if (isNaN(id)) return reply.status(400).send({ error: 'Invalid id' })

    const r = await prisma.discoveryRun.findUnique({ where: { id } })
    if (!r) return reply.status(404).send({ error: 'Run not found' })

    const summary: DiscoveryRunSummary = {
      id: r.id,
      searchQuery: r.searchQuery,
      zipcode: r.zipcode,
      discoveryMode: r.zipcode === 'NATIONWIDE' ? 'franchise'
                   : r.zipcode === 'REFRESH'    ? 'refresh'
                   : r.zipcode.startsWith('INSTRUCTORS:') ? 'instructors'
                   : 'zipcode',
      status: r.status as DiscoveryRunSummary['status'],
      studiosFound: r.studiosFound,
      locationsFound: r.locationsFound,
      newLocations: r.newLocations,
      updatedLocations: r.updatedLocations,
      errorMessage: r.errorMessage,
      startedAt: r.startedAt.toISOString(),
      completedAt: r.completedAt?.toISOString() ?? null,
      durationMs: r.completedAt ? r.completedAt.getTime() - r.startedAt.getTime() : null,
    }

    return reply.send(summary)
  })
}

async function runInstructorDiscovery(
  runId: number,
  zipcode: string,
  classType: string | undefined
): Promise<void> {
  await prisma.discoveryRun.update({
    where: { id: runId },
    data: { status: 'RUNNING' },
  })

  try {
    const scraped = await scrapeInstructorsFromMindBody(
      zipcode,
      classType,
      (msg) => console.log(`[instructor-run-${runId}]`, msg)
    )

    let instructorsFound = 0

    for (const s of scraped) {
      // Find or create matching Studio by normalized brand name
      let studioId: number | null = null
      if (s.studioName) {
        const normalized = normalizeBrandName(s.studioName)
        const studio = await prisma.studio.findFirst({
          where: { normalizedBrand: normalized },
        })
        studioId = studio?.id ?? null
      }

      const normalizedName = normalizeBrandName(s.fullName)
      const dedupKey = s.instagramHandle
        ? `ig:${s.instagramHandle}`
        : `name:${normalizedName}|${studioId ?? 'unknown'}`

      await (prisma as any).instructor.upsert({
        where: { dedupKey },
        create: {
          dedupKey,
          fullName: s.fullName,
          normalizedName,
          studioId,
          workZipcode: s.workZipcode,
          email: s.email,
          phone: null,
          instagramHandle: s.instagramHandle,
          linkedinUrl: s.linkedinUrl,
          bio: s.bio || null,
          photoUrl: s.photoUrl || null,
          classTypes: JSON.stringify(s.classTypes),
          sourceUrl: s.studioUrl,
        },
        update: {
          fullName: s.fullName,
          studioId,
          workZipcode: s.workZipcode,
          email: s.email,
          instagramHandle: s.instagramHandle,
          linkedinUrl: s.linkedinUrl,
          bio: s.bio || null,
          photoUrl: s.photoUrl || null,
          classTypes: JSON.stringify(s.classTypes),
          sourceUrl: s.studioUrl,
          updatedAt: new Date(),
        },
      })

      instructorsFound++
    }

    await prisma.discoveryRun.update({
      where: { id: runId },
      data: {
        status: 'COMPLETED',
        studiosFound: instructorsFound,
        completedAt: new Date(),
      },
    })
  } catch (err: any) {
    await prisma.discoveryRun.update({
      where: { id: runId },
      data: {
        status: 'FAILED',
        errorMessage: err?.message ?? String(err),
        completedAt: new Date(),
      },
    })
    throw err
  }
}

export default discoveryRoutes
