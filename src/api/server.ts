import Fastify from 'fastify'
import cors from '@fastify/cors'
import discoveryRoutes from './routes/discovery'
import studioRoutes from './routes/studios'
import locationRoutes from './routes/locations'
import pricingRoutes from './routes/pricing'
import analysisRoutes from './routes/analysis'
import hintsRoutes from './routes/hints'
import instructorRoutes from './routes/instructors'

export function buildServer() {
  const app = Fastify({ logger: { level: 'info' } })

  // CORS — allow the Vite dev server and any local origin
  app.register(cors, {
    origin: (origin, cb) => {
      // Allow requests with no origin (curl, Playwright) and localhost origins
      if (!origin || /^http:\/\/localhost(:\d+)?$/.test(origin)) {
        cb(null, true)
      } else {
        cb(new Error('Not allowed by CORS'), false)
      }
    },
  })

  // Health check
  app.get('/health', async () => ({ ok: true }))

  // API routes
  app.register(discoveryRoutes, { prefix: '/api/v1' })
  app.register(studioRoutes, { prefix: '/api/v1' })
  app.register(locationRoutes, { prefix: '/api/v1' })
  app.register(pricingRoutes, { prefix: '/api/v1' })
  app.register(analysisRoutes, { prefix: '/api/v1' })
  app.register(hintsRoutes,       { prefix: '/api/v1' })
  app.register(instructorRoutes, { prefix: '/api/v1' })

  return app
}
