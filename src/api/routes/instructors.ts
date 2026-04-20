import { FastifyPluginAsync } from 'fastify'
import prisma from '../lib/prisma'
import type { InstructorRow } from '../../shared/types'

type PrismaInstructor = {
  id: number
  dedupKey: string
  fullName: string
  studioId: number | null
  workZipcode: string | null
  email: string | null
  phone: string | null
  instagramHandle: string | null
  linkedinUrl: string | null
  bio: string | null
  address: string | null
  photoUrl: string | null
  classTypes: string | null
  studioNameRaw: string | null
  sourceUrl: string | null
  studio: { name: string } | null
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
    id:              i.id,
    dedupKey:        i.dedupKey,
    fullName:        i.fullName,
    studioId:        i.studioId,
    studioName:      i.studio?.name ?? i.studioNameRaw ?? null,
    workZipcode:     i.workZipcode,
    email:           i.email,
    phone:           i.phone,
    instagramHandle: i.instagramHandle,
    linkedinUrl:     i.linkedinUrl,
    bio:             i.bio,
    address:         i.address,
    photoUrl:        i.photoUrl,
    classTypes:      parseClassTypes(i.classTypes),
    sourceUrl:       i.sourceUrl,
  }
}

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
          { fullName: { contains: query } },
          { studio: { name: { contains: query } } },
          { classTypes: { contains: query } },
        ]
      }

      const instructors = await (prisma as any).instructor.findMany({
        where,
        include: { studio: { select: { name: true } } },
        orderBy: { fullName: 'asc' },
        take: 200,
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
      where: { id },
      include: { studio: { select: { name: true } } },
    }) as PrismaInstructor | null

    if (!instructor) return reply.status(404).send({ error: 'Instructor not found' })

    return reply.send(toRow(instructor))
  })
}

export default instructorRoutes
