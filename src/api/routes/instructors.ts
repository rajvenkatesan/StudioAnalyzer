import { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import prisma from '../lib/prisma'
import { scrapeInstructorProfile } from '../workers/instructorScraper'
import { normalizeBrandName } from '../workers/scraper'
import type { InstructorRow, InstructorEnrichRequest } from '../../shared/types'

type PrismaInstructor = {
  id:               number
  dedupKey:         string
  fullName:         string
  studioId:         number | null
  workZipcode:      string | null
  email:            string | null
  phone:            string | null
  instagramHandle:  string | null
  linkedinUrl:      string | null
  bio:              string | null
  address:          string | null
  photoUrl:         string | null
  classTypes:       string | null
  studioNameRaw:    string | null
  sourceUrl:        string | null
  detailsFetchedAt: Date | null
  studio:           { name: string } | null
}

function parseClassTypes(raw: string | null): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function toRow(i: PrismaInstructor): InstructorRow {
  return {
    id:               i.id,
    dedupKey:         i.dedupKey,
    fullName:         i.fullName,
    studioId:         i.studioId,
    studioName:       i.studio?.name ?? i.studioNameRaw ?? null,
    workZipcode:      i.workZipcode,
    email:            i.email,
    phone:            i.phone,
    instagramHandle:  i.instagramHandle,
    linkedinUrl:      i.linkedinUrl,
    bio:              i.bio,
    address:          i.address,
    photoUrl:         i.photoUrl,
    classTypes:       parseClassTypes(i.classTypes),
    sourceUrl:        i.sourceUrl,
    detailsFetchedAt: i.detailsFetchedAt?.toISOString() ?? null,
  }
}

const EnrichBodySchema = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(1000),
})

const instructorRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/v1/instructors?zipcode=&query=&classType=
  app.get<{ Querystring: { zipcode?: string; query?: string; classType?: string } }>(
    '/instructors',
    async (request, reply) => {
      const { zipcode, query, classType } = request.query

      const where: Record<string, unknown> = {}

      if (zipcode) {
        where['workZipcode'] = zipcode
      }

      if (query) {
        where['OR'] = [
          { fullName:   { contains: query } },
          { studio:     { name: { contains: query } } },
          { classTypes: { contains: query } },
        ]
      }

      const instructors = await (prisma as any).instructor.findMany({
        where,
        include: { studio: { select: { name: true } } },
        orderBy:  { fullName: 'asc' },
        take:     500,
      }) as PrismaInstructor[]

      let rows = instructors.map(toRow)

      if (classType) {
        const lower = classType.toLowerCase()
        rows = rows.filter((r: InstructorRow) =>
          r.classTypes.some((ct: string) => ct.toLowerCase().includes(lower))
        )
      }

      return reply.send(rows)
    }
  )

  // GET /api/v1/instructors/:id
  app.get<{ Params: { id: string } }>('/instructors/:id', async (request, reply) => {
    const id = parseInt(request.params.id, 10)
    if (isNaN(id)) return reply.status(400).send({ error: 'Invalid id' })

    const instructor = await (prisma as any).instructor.findUnique({
      where:   { id },
      include: { studio: { select: { name: true } } },
    }) as PrismaInstructor | null

    if (!instructor) return reply.status(404).send({ error: 'Instructor not found' })

    return reply.send(toRow(instructor))
  })

  // POST /api/v1/instructors/enrich
  // Body: { ids: number[] }
  // Fires background job to scrape full profile details for the given instructor IDs.
  // Returns immediately; the UI polls for detailsFetchedAt to appear.
  app.post<{ Body: InstructorEnrichRequest }>(
    '/instructors/enrich',
    async (request, reply) => {
      const parsed = EnrichBodySchema.safeParse(request.body)
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.flatten() })
      }

      const { ids } = parsed.data

      // Fetch sourceUrls for all requested IDs
      const rows = await (prisma as any).instructor.findMany({
        where:  { id: { in: ids } },
        select: { id: true, sourceUrl: true, studioNameRaw: true, workZipcode: true },
      }) as { id: number; sourceUrl: string | null; studioNameRaw: string | null; workZipcode: string | null }[]

      const toEnrich = rows.filter((r) => r.sourceUrl)
      if (toEnrich.length === 0) {
        return reply.status(400).send({ error: 'None of the selected instructors have a profile URL' })
      }

      // Fire and forget — scrape profiles in the background, update DB as each finishes
      setImmediate(() => {
        ;(async () => {
          for (const row of toEnrich) {
            try {
              const data = await scrapeInstructorProfile(
                row.sourceUrl!,
                (msg) => app.log.info({ instructorId: row.id }, msg)
              )
              if (!data) continue

              // Look up matching studio
              let studioId: number | null = null
              if (data.studioName || row.studioNameRaw) {
                const brandName = data.studioName || row.studioNameRaw || ''
                const normalized = normalizeBrandName(brandName)
                const studio = await prisma.studio.findFirst({ where: { normalizedBrand: normalized } })
                studioId = studio?.id ?? null
              }

              const normalizedName = normalizeBrandName(data.fullName)

              await (prisma as any).instructor.update({
                where: { id: row.id },
                data: {
                  fullName:         data.fullName,
                  normalizedName,
                  ...(studioId !== null
                    ? { studio: { connect: { id: studioId } } }
                    : {}),
                  email:            data.email,
                  phone:            data.phone || null,
                  instagramHandle:  data.instagramHandle,
                  linkedinUrl:      data.linkedinUrl,
                  bio:              data.bio || null,
                  address:          data.hometown || null,
                  photoUrl:         data.photoUrl || null,
                  classTypes:       JSON.stringify(data.classTypes),
                  detailsFetchedAt: new Date(),
                  updatedAt:        new Date(),
                },
              })

              app.log.info({ instructorId: row.id }, `Enriched instructor ${data.fullName}`)
            } catch (err: any) {
              app.log.error({ instructorId: row.id, err }, 'Failed to enrich instructor')
            }
          }
        })().catch((err) => app.log.error(err, 'Enrich batch failed'))
      })

      return reply.send({ ok: true, queued: toEnrich.length })
    }
  )
}

export default instructorRoutes
