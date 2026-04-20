/**
 * @e2e — live scraper test. Requires network access.
 * Run with: pnpm test:e2e
 */
import { test, expect } from '@playwright/test'
import { scrapeStudioWebsite } from '../../src/api/workers/scraper'

test.describe('Core40 live scraper', () => {
  test('scrapes Core40 website without throwing', async () => {
    const result = await scrapeStudioWebsite('https://www.core40.com', 'core40')
    expect(result).toBeDefined()

    if (result.pricingDataAvailable) {
      expect(result.pricing.length).toBeGreaterThan(0)
      for (const plan of result.pricing) {
        expect(plan.priceAmount).toBeGreaterThan(0)
      }
    } else {
      console.warn('Core40 pricing not available:', result.warningMessage)
    }
  })

  test('schedule rows have valid time format when available', async () => {
    const result = await scrapeStudioWebsite('https://www.core40.com', 'core40')

    if (result.scheduleDataAvailable) {
      for (const row of result.schedule) {
        expect(row.startTime).toMatch(/^\d{2}:\d{2}$/)
        expect(row.durationMinutes).toBeGreaterThan(0)
      }
    }
  })
})
