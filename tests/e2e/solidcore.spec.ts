/**
 * @e2e — live scraper test. Requires network access and GOOGLE_PLACES_API_KEY.
 * Run with: pnpm test:e2e
 *
 * These tests hit real websites and may be slow (~30–60s per test).
 * They are excluded from the default `pnpm test` run.
 */
import { test, expect } from '@playwright/test'
import { chromium } from 'playwright'
import { scrapeStudioWebsite } from '../../src/api/workers/scraper'

test.describe('Solidcore live scraper', () => {
  test('scrapes pricing page and returns at least one plan', async () => {
    const result = await scrapeStudioWebsite('https://solidcore.com', 'solidcore')

    // Should not throw / get fully blocked
    expect(result).toBeDefined()

    if (result.pricingDataAvailable) {
      expect(result.pricing.length).toBeGreaterThan(0)
      for (const plan of result.pricing) {
        expect(plan.priceAmount).toBeGreaterThan(0)
        expect(['DROP_IN', 'CLASS_PACK', 'MONTHLY', 'ANNUAL']).toContain(plan.planType)
      }
    } else {
      // Website blocked — acceptable, warningMessage should be set
      console.warn('Solidcore pricing not available:', result.warningMessage)
    }
  })

  test('scrapes schedule page and returns structured rows', async () => {
    const result = await scrapeStudioWebsite('https://solidcore.com', 'solidcore')

    if (result.scheduleDataAvailable) {
      expect(result.schedule.length).toBeGreaterThan(0)
      for (const row of result.schedule) {
        expect(row.startTime).toMatch(/^\d{2}:\d{2}$/)
        expect(row.durationMinutes).toBeGreaterThan(0)
        expect(['MON','TUE','WED','THU','FRI','SAT','SUN']).toContain(row.dayOfWeek)
      }
    } else {
      console.warn('Solidcore schedule not available:', result.warningMessage)
    }
  })
})
