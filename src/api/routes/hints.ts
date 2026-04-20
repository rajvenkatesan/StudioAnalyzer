import { FastifyPluginAsync } from 'fastify'
import { readHintsFile, writeHintsFile } from '../workers/studioHints'

const hintsRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/v1/hints — return current StudioHelper.md content
  app.get('/hints', async (_request, reply) => {
    const content = readHintsFile()
    return reply.send({ content })
  })

  // PUT /api/v1/hints — overwrite StudioHelper.md with new content
  app.put<{ Body: { content: string } }>('/hints', async (request, reply) => {
    const { content } = request.body ?? {}
    if (typeof content !== 'string') {
      return reply.status(400).send({ error: 'content string required' })
    }
    writeHintsFile(content)
    return reply.send({ ok: true })
  })
}

export default hintsRoutes
