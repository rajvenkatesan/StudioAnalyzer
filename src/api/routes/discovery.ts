import { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import prisma from '../lib/prisma'
import { runDiscovery, runFranchiseDiscovery, cancelRun } from '../workers/discoveryRunner'
import { verifyApiKey } from '../workers/geocode'
import type { DiscoverRequest, DiscoverResponse, DiscoveryRunSummary, FranchiseDiscoverRequest } from '../../shared/types'

const DiscoverBodySchema = z.object({
  zipcode: z.string().regex(/^\d{5}$/, 'Must be a 5-digit US zipcode'),
  query: z.string().min(1).max(100),
})

const FranchiseBodySchema = z.object({
  studioName: z.string().min(1).max(100),
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
      discoveryMode: r.zipcode === 'NATIONWIDE' ? 'franchise' : r.zipcode === 'REFRESH' ? 'refresh' : 'zipcode',
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
      discoveryMode: r.zipcode === 'NATIONWIDE' ? 'franchise' : r.zipcode === 'REFRESH' ? 'refresh' : 'zipcode',
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

export default discoveryRoutes
