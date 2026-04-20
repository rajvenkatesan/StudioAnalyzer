import { execSync } from 'child_process'
import path from 'path'

// Point Prisma at the test database
process.env.DATABASE_URL = 'file:./test.db'
process.env.DISCOVERY_FIXTURE = 'true'
process.env.SCRAPER_CRAWL_DELAY_MS = '0'

// Run migrations against test DB before each suite
execSync('npx prisma migrate deploy --schema src/db/schema.prisma', {
  stdio: 'inherit',
  env: { ...process.env, DATABASE_URL: 'file:./test.db' },
})
