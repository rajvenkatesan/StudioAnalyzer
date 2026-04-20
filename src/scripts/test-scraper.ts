import { scrapeStudioWebsite, normalizeBrandName } from '../api/workers/scraper'

const testCases = [
  { url: 'https://www.jandjpilates.com/', name: 'Jack and Jill Pilates' },
  { url: 'https://mntstudio.co/marina', name: 'MNTSTUDIO' },
  { url: 'https://www.sagepilatessf.com/', name: 'Sage Pilates' },
]

async function main() {
  for (const tc of testCases) {
    console.log(`\n=== ${tc.name} ===`)
    const result = await scrapeStudioWebsite(tc.url, normalizeBrandName(tc.name))
    console.log(`pricing: ${result.pricing.length} | schedule: ${result.schedule.length}`)
    if (result.warningMessage) console.log('WARNING:', result.warningMessage)
    if (result.pricing.length) console.log('pricing:', JSON.stringify(result.pricing))
    if (result.schedule.length) console.log('schedule:', JSON.stringify(result.schedule))
  }
  process.exit(0)
}
main()
