import 'dotenv/config'
import { buildServer } from './server'

const port = parseInt(process.env.PORT ?? '3001', 10)
const app = buildServer()

app.listen({ port, host: '0.0.0.0' }, (err) => {
  if (err) {
    app.log.error(err)
    process.exit(1)
  }
  console.log(`StudioAnalyzer API running at http://localhost:${port}`)
})
