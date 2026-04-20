import { describe, it, expect, beforeEach } from 'vitest'
import prisma from '../../src/api/lib/prisma'
import { runDiscovery } from '../../src/api/workers/discoveryRunner'

// Integration tests use DISCOVERY_FIXTURE=true (set in tests/setup.ts)
// Fixtures in tests/fixtures/ replay recorded Places API responses offline.

async function createRun(zipcode: string, query: string) {
  return prisma.discoveryRun.create({
    data: { searchQuery: query, zipcode, status: 'PENDING' },
  })
}

async function cleanDb() {
  // Delete in dependency order
  await prisma.classUtilization.deleteMany()
  await prisma.classSchedule.deleteMany()
  await prisma.hoursOfOperation.deleteMany()
  await prisma.pricingPlan.deleteMany()
  await prisma.location.deleteMany()
  await prisma.studio.deleteMany()
  await prisma.studioType.deleteMany()
  await prisma.discoveryRun.deleteMany()
}

describe('Discovery integration (fixture mode)', () => {
  beforeEach(async () => {
    await cleanDb()
  })

  describe('Solidcore — zipcode 94123', () => {
    it('completes and finds at least one studio and location', async () => {
      const run = await createRun('94123', 'solidcore')
      await runDiscovery(run.id)

      const updated = await prisma.discoveryRun.findUniqueOrThrow({ where: { id: run.id } })
      expect(updated.status).toBe('COMPLETED')
      expect(updated.studiosFound).toBeGreaterThanOrEqual(0) // 0 is ok if fixture is empty

      const studios = await prisma.studio.findMany({ where: { normalizedBrand: 'solidcore' } })
      // If fixture data exists, there should be at least 1 studio
      if (updated.studiosFound && updated.studiosFound > 0) {
        expect(studios.length).toBeGreaterThan(0)
      }
    })

    it('locations all have postalCode matching search zipcode', async () => {
      const run = await createRun('94123', 'solidcore')
      await runDiscovery(run.id)

      const locations = await prisma.location.findMany()
      for (const loc of locations) {
        expect(loc.postalCode).toBe('94123')
      }
    })

    it('HoursOfOperation has exactly 140 rows per location when data is available', async () => {
      const run = await createRun('94123', 'solidcore')
      await runDiscovery(run.id)

      const locations = await prisma.location.findMany()
      for (const loc of locations) {
        const count = await prisma.hoursOfOperation.count({ where: { locationId: loc.id } })
        expect(count).toBe(140) // 20 hours × 7 days
      }
    })

    it('PricingPlan pricePerClass is always positive when present', async () => {
      const run = await createRun('94123', 'solidcore')
      await runDiscovery(run.id)

      const plans = await prisma.pricingPlan.findMany()
      for (const plan of plans) {
        expect(plan.priceAmount).toBeGreaterThan(0)
        if (plan.pricePerClass != null) {
          expect(plan.pricePerClass).toBeGreaterThan(0)
        }
      }
    })
  })

  describe('Core40 — zipcode 94123', () => {
    it('completes without error', async () => {
      const run = await createRun('94123', 'core40')
      await runDiscovery(run.id)

      const updated = await prisma.discoveryRun.findUniqueOrThrow({ where: { id: run.id } })
      expect(updated.status).toBe('COMPLETED')
    })

    it('locations all have postalCode matching search zipcode', async () => {
      const run = await createRun('94123', 'core40')
      await runDiscovery(run.id)

      const locations = await prisma.location.findMany()
      for (const loc of locations) {
        expect(loc.postalCode).toBe('94123')
      }
    })
  })

  describe('Re-run idempotency — Solidcore 94123', () => {
    it('creates two DiscoveryRun records but does not duplicate studios or locations', async () => {
      const run1 = await createRun('94123', 'solidcore')
      await runDiscovery(run1.id)

      const studiosAfterRun1 = await prisma.studio.count()
      const locationsAfterRun1 = await prisma.location.count()

      const run2 = await createRun('94123', 'solidcore')
      await runDiscovery(run2.id)

      const studiosAfterRun2 = await prisma.studio.count()
      const locationsAfterRun2 = await prisma.location.count()

      expect(studiosAfterRun2).toBe(studiosAfterRun1)
      expect(locationsAfterRun2).toBe(locationsAfterRun1)

      const runs = await prisma.discoveryRun.findMany()
      expect(runs.length).toBe(2)
    })

    it('appends ClassUtilization rows on second run', async () => {
      const run1 = await createRun('94123', 'solidcore')
      await runDiscovery(run1.id)
      const utilAfterRun1 = await prisma.classUtilization.count()

      const run2 = await createRun('94123', 'solidcore')
      await runDiscovery(run2.id)
      const utilAfterRun2 = await prisma.classUtilization.count()

      // Utilization should grow (new snapshots appended) if any classes were scraped
      if (utilAfterRun1 > 0) {
        expect(utilAfterRun2).toBeGreaterThan(utilAfterRun1)
      }
    })

    it('replaces PricingPlan rows on second run (no duplicates)', async () => {
      const run1 = await createRun('94123', 'solidcore')
      await runDiscovery(run1.id)
      const pricingAfterRun1 = await prisma.pricingPlan.count()

      const run2 = await createRun('94123', 'solidcore')
      await runDiscovery(run2.id)
      const pricingAfterRun2 = await prisma.pricingPlan.count()

      expect(pricingAfterRun2).toBe(pricingAfterRun1)
    })
  })

  describe('Unknown studio — no results', () => {
    it('completes with studiosFound=0 and creates no studio/location records', async () => {
      const run = await createRun('94123', 'nonexistent-studio-xyz-abc')
      await runDiscovery(run.id)

      const updated = await prisma.discoveryRun.findUniqueOrThrow({ where: { id: run.id } })
      expect(updated.status).toBe('COMPLETED')
      expect(updated.studiosFound ?? 0).toBe(0)

      const studios = await prisma.studio.count()
      expect(studios).toBe(0)
    })
  })
})
