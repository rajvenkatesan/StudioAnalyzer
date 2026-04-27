import { chromium, Browser, Page } from 'playwright'
import type { DayOfWeek } from '../../shared/types'
import { loadStudioHints, type StudioHint } from './studioHints'

const CRAWL_DELAY = parseInt(process.env.SCRAPER_CRAWL_DELAY_MS ?? '1500', 10)

export interface ScrapedScheduleRow {
  className: string
  dayOfWeek: DayOfWeek
  startTime: string // "HH:MM"
  durationMinutes: number
  instructor?: string
  totalSpots?: number
  spotsAvailable?: number
  dataAvailable: boolean
}

export interface ScrapedPricingRow {
  planName: string
  planType: 'INTRO' | 'DROP_IN' | 'CLASS_PACK' | 'MONTHLY' | 'ANNUAL'
  priceAmount: number
  currency: string
  classCount?: number
  validityDays?: number
  notes?: string
}

export interface ScrapeResult {
  schedule: ScrapedScheduleRow[]
  pricing: ScrapedPricingRow[]
  hoursOfOperation: Record<DayOfWeek, { open: number; close: number } | null>
  scheduleDataAvailable: boolean
  pricingDataAvailable: boolean
  hoursDataAvailable: boolean
  warningMessage?: string
  studioStatus?: 'open' | 'upcoming' | 'unknown'
}

let browserInstance: Browser | null = null

async function getBrowser(): Promise<Browser> {
  if (!browserInstance || !browserInstance.isConnected()) {
    browserInstance = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    })
  }
  return browserInstance
}

export async function closeBrowser(): Promise<void> {
  if (browserInstance?.isConnected()) {
    await browserInstance.close()
    browserInstance = null
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function scrapeStudioWebsite(
  websiteUrl: string,
  normalizedBrand: string
): Promise<ScrapeResult> {
  const browser = await getBrowser()
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 900 },
  })

  const empty: ScrapeResult = {
    schedule: [],
    pricing: [],
    hoursOfOperation: emptyHours(),
    scheduleDataAvailable: false,
    pricingDataAvailable: false,
    hoursDataAvailable: false,
  }

  // Load per-brand hints from StudioHelper.md (re-read on every scrape so edits take effect).
  // Try exact match first, then prefix match so that a hint keyed "jetsetpilates" also
  // applies when the normalizedBrand is "jetsetpilatessoho" (location-suffixed Place name).
  const hints = loadStudioHints()
  let hint: StudioHint | undefined = hints.get(normalizedBrand)
  if (!hint) {
    for (const [key, val] of hints) {
      if (normalizedBrand.startsWith(key)) { hint = val; break }
    }
  }

  try {
    const page = await context.newPage()
    let result: ScrapeResult

    if (hint?.locationsPage) {
      // If the websiteUrl is already a location-specific page (path depth ≥ 1,
      // e.g. /montclair/ or /ca/irvine-crossroads/), scrape it directly using
      // schedule/pricing hints. Only spider the locations listing when we have
      // the bare brand root URL (no path segments, depth = 0).
      const urlPath = (() => { try { return new URL(websiteUrl).pathname } catch { return '/' } })()
      const pathDepth = urlPath.split('/').filter(Boolean).length
      if (pathDepth >= 1) {
        result = await scrapeGeneric(page, websiteUrl, hint)
      } else {
        // Brand root URL — spider the locations listing to find individual pages
        result = await scrapeWithLocationsHint(page, hint.locationsPage, hint, websiteUrl)
      }
    } else if (normalizedBrand === 'solidcore' || normalizedBrand === 'solidcoremarina') {
      result = await scrapeSolidcore(page, websiteUrl)
    } else if (normalizedBrand === 'core40' || normalizedBrand === 'core40marina') {
      result = await scrapeCore40(page, websiteUrl)
    } else {
      result = await scrapeGeneric(page, websiteUrl, hint)
    }

    await context.close()
    return result
  } catch (err: any) {
    await context.close().catch(() => {})
    return { ...empty, warningMessage: `Scraping blocked or failed: ${err?.message ?? String(err)}` }
  }
}

// ── Solidcore ─────────────────────────────────────────────────────────────────
//
// Entry point: studio-specific page (e.g. /studios/marina)
//   Pricing: click "View All Pricing & Packages" → navigates to
//     /membership-perks?siteId=&locationId= with studio pre-selected.
//   Schedule: horizontal day-button strip (class "w-[90px]"). Button 0 = today.
//     Click buttons 1–7 for tomorrow + 6 more days and extract class cards
//     (data-testid="class-card-*").

function solidcoreDayToWeekday(abbrev: string): import('../../shared/types').DayOfWeek {
  const map: Record<string, import('../../shared/types').DayOfWeek> = {
    mon: 'MON', tue: 'TUE', wed: 'WED', thu: 'THU', fri: 'FRI', sat: 'SAT', sun: 'SUN',
  }
  return map[abbrev.toLowerCase()] ?? 'MON'
}

async function extractSolidcoreScheduleForDay(
  page: Page,
  dayOfWeek: import('../../shared/types').DayOfWeek,
): Promise<ScrapedScheduleRow[]> {
  return page.evaluate(
    ({ dow }) => {
      const cards = Array.from(document.querySelectorAll('[data-testid^="class-card-"]'))
      const rows: {
        className: string
        dayOfWeek: string
        startTime: string
        durationMinutes: number
        instructor?: string
        dataAvailable: boolean
      }[] = []

      for (const card of cards) {
        // Only include cards that are currently visible (the selected day's cards)
        if ((card as HTMLElement).offsetHeight === 0) continue

        const tid = card.getAttribute('data-testid')!.replace('class-card-', '')
        const timeEl = card.querySelector(`[data-testid="class-time-${tid}"]`) as HTMLElement | null
        const rawTime = timeEl?.innerText?.trim() ?? ''
        const tm = rawTime.match(
          /(\d{1,2}):(\d{2})\s*(AM|PM)\s*-\s*(\d{1,2}):(\d{2})\s*(AM|PM)/i,
        )
        if (!tm) continue

        let sh = parseInt(tm[1])
        const sm = parseInt(tm[2])
        const sa = tm[3].toUpperCase()
        let eh = parseInt(tm[4])
        const em = parseInt(tm[5])
        const ea = tm[6].toUpperCase()
        if (sa === 'PM' && sh !== 12) sh += 12
        if (sa === 'AM' && sh === 12) sh = 0
        if (ea === 'PM' && eh !== 12) eh += 12
        if (ea === 'AM' && eh === 12) eh = 0

        const startMins = sh * 60 + sm
        const duration = eh * 60 + em - startMins
        const startTime = `${String(sh).padStart(2, '0')}:${String(sm).padStart(2, '0')}`

        const classNameEl = card.querySelector('button.text-2xl') as HTMLElement | null
        const className = classNameEl?.innerText?.trim() ?? ''
        if (!className) continue

        const allBtns = Array.from(card.querySelectorAll('button')) as HTMLElement[]
        const instBtn = allBtns.find((b) => (b.innerText ?? '').trim().startsWith('w/'))
        const instRaw = instBtn?.innerText?.trim() ?? ''
        const instructor = instRaw.replace(/^w\/\s*/, '').split('view coach')[0].trim() || undefined

        rows.push({ className, dayOfWeek: dow, startTime, durationMinutes: duration, instructor, dataAvailable: true })
      }
      return rows
    },
    { dow: dayOfWeek },
  ) as Promise<ScrapedScheduleRow[]>
}

function solidcoreClassCount(planName: string): number | undefined {
  const s = planName.toLowerCase()
  if (/\bsingle\b/.test(s) || /\bcoach[- ]in[- ]training\b/.test(s)) return 1
  // "2 week unlimited" → 2*7 = 14
  const weekMatch = s.match(/(\d+)\s*[- ]?week[- ]?unlimited/)
  if (weekMatch) return parseInt(weekMatch[1]) * 7
  if (/\bunlimited\b/.test(s)) return 16  // monthly unlimited → assume 16
  // "4/mo" or "8/mo" → 4 or 8
  const moMatch = s.match(/(\d+)\s*\/\s*mo/)
  if (moMatch) return parseInt(moMatch[1])
  // "10-class pack", "5-class pack", "4 pack"
  const packMatch = s.match(/(\d+)[- ]*class[- ]*pack/) ?? s.match(/(\d+)[- ]*pack/)
  if (packMatch) return parseInt(packMatch[1])
  return undefined
}

function solidcoreValidityDays(notesOrDescription: string | undefined): number | undefined {
  if (!notesOrDescription) return undefined
  const m = notesOrDescription.match(/[Ee]xpires\s+(\d+)\s+days/)
  return m ? parseInt(m[1]) : undefined
}

async function extractSolidcorePricing(page: Page): Promise<ScrapedPricingRow[]> {
  // Prices are loaded asynchronously; wait until at least one "$" appears in the page
  try {
    await page.waitForFunction(
      () => /\$\d+/.test(document.body.innerText ?? ''),
      { timeout: 8_000 },
    )
  } catch { return [] }

  const lines = await page.evaluate(() =>
    (document.body.innerText ?? '').split('\n').map((l: string) => l.trim()).filter((l: string) => l),
  )

  const plans: ScrapedPricingRow[] = []
  let planType: ScrapedPricingRow['planType'] = 'DROP_IN'

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (/^NEW CLIENT/i.test(line)) { planType = 'INTRO'; continue }
    if (/^MEMBERSHIPS$/i.test(line)) { planType = 'MONTHLY'; continue }
    if (/^12-Month$/i.test(line)) { planType = 'ANNUAL'; continue }
    if (/^(6-Month|Monthly)$/i.test(line)) { planType = 'MONTHLY'; continue }
    if (/^PACKAGES$/i.test(line)) { planType = 'CLASS_PACK'; continue }

    const pm = line.match(/^\$([0-9,]+)(?:\/mo)?/)
    if (!pm) continue
    const planName = lines[i - 1] ?? ''
    if (!planName || /^(Buy|Expires|Auto|Max|Valid|Subject|\*|SELECT)/i.test(planName)) continue

    const amount = parseFloat(pm[1].replace(/,/g, ''))
    // Notes are 2 lines below (line i+1 is "Buy", line i+2 is the description)
    const notes = lines[i + 2] && !/^(Buy|\*)/.test(lines[i + 2]) ? lines[i + 2].substring(0, 200) : undefined

    const classCount = solidcoreClassCount(planName)
    const validityDays = solidcoreValidityDays(notes)

    plans.push({ planName, planType, priceAmount: amount, currency: 'USD', classCount, validityDays, notes })
  }
  return plans
}

async function scrapeSolidcore(page: Page, baseUrl: string): Promise<ScrapeResult> {
  const result: ScrapeResult = {
    schedule: [],
    pricing: [],
    hoursOfOperation: emptyHours(),
    scheduleDataAvailable: false,
    pricingDataAvailable: false,
    hoursDataAvailable: false,
  }

  const urlPath = (() => { try { return new URL(baseUrl).pathname } catch { return '/' } })()
  const pathDepth = urlPath.split('/').filter(Boolean).length

  if (pathDepth >= 1) {
    // ── Studio page ───────────────────────────────────────────────────────────
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 15_000 })
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2))
    await sleep(CRAWL_DELAY + 4_000)
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    await sleep(2_000)

    // ── Pricing: click "View All Pricing & Packages" ──────────────────────────
    const pricingBtn = page.locator('button').filter({ hasText: /View All Pricing/i }).first()
    if (await pricingBtn.count() > 0) {
      try {
        await Promise.all([
          page.waitForURL('**/membership-perks**', { timeout: 8_000 }),
          pricingBtn.click(),
        ])
        await sleep(CRAWL_DELAY + 2_000)
        result.pricing = await extractSolidcorePricing(page)
        result.pricingDataAvailable = result.pricing.length > 0
        await page.goBack({ waitUntil: 'domcontentloaded', timeout: 15_000 })
        // Re-wait for schedule widget after navigating back
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2))
        await sleep(CRAWL_DELAY + 3_000)
      } catch { /* pricing unavailable */ }
    }

    // ── Schedule: click tomorrow + 6 more days ────────────────────────────────
    const DAY_BTN = 'button.w-\\[90px\\]'
    const dayBtnCount = await page.locator(DAY_BTN).count()
    // Button 0 = today, scrape buttons 1–7 (tomorrow through 7 days)
    const limit = Math.min(dayBtnCount, 8) // indices 1..7

    for (let i = 1; i < limit; i++) {
      const btn = page.locator(DAY_BTN).nth(i)
      if (await btn.count() === 0) break
      const btnText = ((await btn.textContent()) ?? '').trim().replace(/\s+/g, '')
      const abbrev = btnText.match(/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)/i)?.[1] ?? ''
      const dayOfWeek = solidcoreDayToWeekday(abbrev)

      await btn.click()
      await sleep(1_500)

      const classes = await extractSolidcoreScheduleForDay(page, dayOfWeek)
      result.schedule.push(...classes)
    }

    result.scheduleDataAvailable = result.schedule.length > 0
    return result
  }

  // ── Brand root — try /membership-perks for pricing, /studios for schedule ───
  try {
    await page.goto(new URL('/membership-perks', baseUrl).toString(), { waitUntil: 'domcontentloaded', timeout: 15_000 })
    await sleep(CRAWL_DELAY)
    result.pricing = await extractSolidcorePricing(page)
    result.pricingDataAvailable = result.pricing.length > 0
  } catch { result.pricingDataAvailable = false }

  try {
    await page.goto(new URL('/studios', baseUrl).toString(), { waitUntil: 'domcontentloaded', timeout: 15_000 })
    await sleep(CRAWL_DELAY)
    result.schedule = await extractScheduleWithDays(page)
    result.scheduleDataAvailable = result.schedule.length > 0
  } catch { result.scheduleDataAvailable = false }

  return result
}

// ── Core40 ────────────────────────────────────────────────────────────────────

async function scrapeCore40(page: Page, baseUrl: string): Promise<ScrapeResult> {
  const result: ScrapeResult = {
    schedule: [],
    pricing: [],
    hoursOfOperation: emptyHours(),
    scheduleDataAvailable: false,
    pricingDataAvailable: false,
    hoursDataAvailable: false,
  }

  try {
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 15_000 })
    await sleep(CRAWL_DELAY)
    result.pricing = await extractPricingGeneric(page)
    result.pricingDataAvailable = result.pricing.length > 0
    result.schedule = await extractScheduleWithDays(page)
    result.scheduleDataAvailable = result.schedule.length > 0
    const hours = await extractHoursGeneric(page)
    if (Object.values(hours).some((v) => v !== null)) { result.hoursOfOperation = hours; result.hoursDataAvailable = true }
  } catch (err: any) { result.warningMessage = err?.message }

  return result
}

// ── Generic ───────────────────────────────────────────────────────────────────

// Common sub-paths where studios publish pricing and schedule data
const PRICING_PATHS = ['/pricing', '/rates', '/packages', '/memberships', '/join', '/plans', '/membership']
const SCHEDULE_PATHS = ['/schedule', '/classes', '/timetable', '/class-schedule', '/book', '/book-a-class']

// Nav links to skip when spidering a locations listing page
const SPIDER_SKIP_PATTERN =
  /\/(about|contact|blog|faq|press|careers|jobs|team|privacy|terms|news|home|gift|shop|store|buy|cart|checkout|login|signup|register|account|refer|affiliate|franchise|search|tag|category|author)\b/i

/**
 * Evaluates on the locations listing page and returns a map of
 * { pathname (lowercased, trailing-slash stripped) → "open" | "upcoming" }.
 * Tries ARIA tablist/tabpanel first, then falls back to scanning for elements
 * whose direct text content is exactly "Open" or "Upcoming" and reading their
 * nearest sibling container for anchor links.
 */
const STATUS_EVAL = `(function() {
  var results = {};

  // Strategy 1: ARIA tablist / tabpanel
  var tabBtns = Array.from(document.querySelectorAll('[role="tab"]'));
  if (tabBtns.length > 0) {
    for (var i = 0; i < tabBtns.length; i++) {
      var btn = tabBtns[i];
      var txt = (btn.textContent || '').trim().toLowerCase();
      var st = txt === 'open' ? 'open' : txt === 'upcoming' ? 'upcoming' : null;
      if (!st) continue;
      var panelId = btn.getAttribute('aria-controls');
      var panel = panelId ? document.getElementById(panelId) : null;
      if (!panel) {
        var panels = document.querySelectorAll('[role="tabpanel"]');
        if (panels[i]) panel = panels[i];
      }
      if (panel) {
        var as = panel.querySelectorAll('a[href]');
        for (var j = 0; j < as.length; j++) {
          var path = as[j].pathname.replace(/\\/$/, '').toLowerCase();
          if (path && path !== '/') results[path] = st;
        }
      }
    }
  }

  // Strategy 2: elements whose own text is "open" or "upcoming" — sibling container
  if (Object.keys(results).length === 0) {
    var els = Array.from(document.querySelectorAll('*'));
    for (var k = 0; k < els.length; k++) {
      var el = els[k];
      var directText = Array.from(el.childNodes)
        .filter(function(n) { return n.nodeType === 3; })
        .map(function(n) { return (n.textContent || '').trim(); })
        .join('').trim().toLowerCase();
      if (directText !== 'open' && directText !== 'upcoming') continue;
      var sect = directText === 'open' ? 'open' : 'upcoming';
      var container = el.nextElementSibling ||
        (el.parentElement && el.parentElement.nextElementSibling);
      if (container) {
        var links = container.querySelectorAll('a[href]');
        for (var m = 0; m < links.length; m++) {
          var lp = links[m].pathname.replace(/\\/$/, '').toLowerCase();
          if (lp && lp !== '/') results[lp] = sect;
        }
      }
    }
  }

  return results;
})()`

/**
 * Navigate to the brand's locations listing page and determine whether the
 * given locationUrl is listed under the "Open" or "Upcoming" tab.
 * Returns 'unknown' when no tab structure is found or the URL isn't listed.
 */
async function detectLocationStatus(
  page: Page,
  locationsPageUrl: string,
  locationUrl: string
): Promise<'open' | 'upcoming' | 'unknown'> {
  try {
    const ok = await tryGoto(page, locationsPageUrl)
    if (!ok) return 'unknown'
    const statusMap = await page.evaluate(STATUS_EVAL) as Record<string, string>
    const targetPath = (() => {
      try { return new URL(locationUrl).pathname.replace(/\/$/, '').toLowerCase() }
      catch { return '' }
    })()
    const found = statusMap[targetPath]
    if (found === 'open' || found === 'upcoming') return found
    return 'unknown'
  } catch {
    return 'unknown'
  }
}

/**
 * Evaluate string that collects all same-origin links from the current page,
 * excluding common navigation / non-location destinations.
 * Written as a string literal so esbuild never injects __name into it.
 */
const SPIDER_LINKS_EVAL = `(function(skipPattern) {
  var links = Array.from(document.querySelectorAll('a[href]'));
  var origin = window.location.origin;
  var currentPath = window.location.pathname;
  var seen = {};
  var result = [];
  for (var i = 0; i < links.length; i++) {
    var href = links[i].href;
    if (!href || !href.startsWith(origin)) continue;
    var path = links[i].pathname;
    if (!path || path === '/' || path === currentPath) continue;
    if (skipPattern.test(path)) continue;
    // Skip external anchors, query-only URLs
    if (href.includes('#') && links[i].hash === href.slice(href.indexOf('#'))) {
      var noHash = href.split('#')[0];
      if (!noHash || noHash === origin + currentPath) continue;
    }
    var canonical = origin + path;
    if (seen[canonical]) continue;
    seen[canonical] = true;
    result.push(canonical);
  }
  return result;
})(` + '/' + SPIDER_SKIP_PATTERN.source + '/i' + `)`

/**
 * Spider a locations listing page: visit each location sub-page and aggregate
 * schedule + pricing data. Stops after MAX_LOCATION_PAGES individual pages.
 */
const MAX_LOCATION_PAGES = 20

async function scrapeWithLocationsHint(
  page: Page,
  locationsPageUrl: string,
  hint: StudioHint,
  fallbackBaseUrl: string
): Promise<ScrapeResult> {
  const result: ScrapeResult = {
    schedule: [],
    pricing: [],
    hoursOfOperation: emptyHours(),
    scheduleDataAvailable: false,
    pricingDataAvailable: false,
    hoursDataAvailable: false,
  }

  // Navigate to the locations listing page
  const listOk = await tryGoto(page, locationsPageUrl)
  if (!listOk) {
    return { ...result, warningMessage: `Could not load locations page: ${locationsPageUrl}` }
  }

  // Capture Open/Upcoming status map before navigating away
  let statusMap: Record<string, string> = {}
  try {
    statusMap = await page.evaluate(STATUS_EVAL) as Record<string, string>
  } catch { /* status detection is best-effort */ }

  // Collect all same-origin links from the listing page
  let locationLinks: string[] = []
  try {
    locationLinks = await page.evaluate(SPIDER_LINKS_EVAL) as string[]
  } catch {
    locationLinks = []
  }

  // If no links found, fall back to scraping the locations page itself
  if (locationLinks.length === 0) {
    locationLinks = [locationsPageUrl]
  }

  // Visit each location page (up to MAX_LOCATION_PAGES)
  const seenScheduleKeys = new Set<string>()
  const seenPricingKeys = new Set<string>()
  let usedLocationUrl: string | null = null

  for (const locationUrl of locationLinks.slice(0, MAX_LOCATION_PAGES)) {
    // Determine which URLs to visit for schedule and pricing
    const scheduleUrl = hint.schedulePage
      ? resolveUrl(hint.schedulePage, locationUrl)
      : locationUrl
    const pricingUrl = hint.pricingPage
      ? resolveUrl(hint.pricingPage, locationUrl)
      : locationUrl

    // Scrape schedule — stop after the first page that yields results.
    // We only want ONE location's schedule (each studio in the DB is a specific
    // location). Aggregating from multiple pages inflates the class count.
    if (result.schedule.length === 0 && await tryGotoContent(page, scheduleUrl)) {
      const sched = await extractScheduleWithDays(page)
      for (const row of sched) {
        const key = `${row.dayOfWeek}_${row.startTime}`
        if (!seenScheduleKeys.has(key)) {
          seenScheduleKeys.add(key)
          result.schedule.push(row)
        }
      }
      if (sched.length > 0) usedLocationUrl = locationUrl

      // Also grab pricing opportunistically if same URL
      if (pricingUrl === scheduleUrl && result.pricing.length === 0) {
        const pricing = await extractPricingGeneric(page)
        for (const row of pricing) {
          const key = `${row.planType}_${row.priceAmount}`
          if (!seenPricingKeys.has(key)) {
            seenPricingKeys.add(key)
            result.pricing.push(row)
          }
        }
      }
    }

    // Scrape pricing (separate page)
    if (pricingUrl !== scheduleUrl && result.pricing.length === 0) {
      if (await tryGotoContent(page, pricingUrl)) {
        const pricing = await extractPricingGeneric(page)
        for (const row of pricing) {
          const key = `${row.planType}_${row.priceAmount}`
          if (!seenPricingKeys.has(key)) {
            seenPricingKeys.add(key)
            result.pricing.push(row)
          }
        }
      }
    }
  }

  // If we got nothing from the spidered pages, fall back to the base website
  if (result.schedule.length === 0 && result.pricing.length === 0) {
    return scrapeGeneric(page, fallbackBaseUrl, hint)
  }

  result.scheduleDataAvailable = result.schedule.length > 0
  result.pricingDataAvailable  = result.pricing.length > 0

  // Resolve Open/Upcoming status for the location that supplied the schedule
  if (usedLocationUrl) {
    const targetPath = (() => {
      try { return new URL(usedLocationUrl).pathname.replace(/\/$/, '').toLowerCase() }
      catch { return '' }
    })()
    const found = statusMap[targetPath]
    result.studioStatus = (found === 'open' || found === 'upcoming') ? found : 'unknown'
  }

  return result
}

/** Resolve a path or full URL against a base URL. */
function resolveUrl(pathOrUrl: string, baseUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl
  try { return new URL(pathOrUrl, baseUrl).toString() } catch { return baseUrl }
}

// Used for navigation/listing pages where we only need links — fast, no JS wait.
async function tryGoto(page: Page, url: string): Promise<boolean> {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 10_000 })
    await sleep(CRAWL_DELAY)
    return true
  } catch {
    return false
  }
}

// Used for schedule/pricing content pages — waits for network activity to settle
// so that JS-rendered booking widgets (Mindbody, etc.) have time to populate.
async function tryGotoContent(page: Page, url: string): Promise<boolean> {
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 20_000 })
    await sleep(CRAWL_DELAY)
    return true
  } catch {
    // networkidle can time out on pages with continuous polling; fall back to
    // domcontentloaded + extra delay so we still attempt extraction.
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 10_000 })
      await sleep(CRAWL_DELAY + 3_000)
      return true
    } catch {
      return false
    }
  }
}

async function scrapeGeneric(page: Page, baseUrl: string, hint?: StudioHint): Promise<ScrapeResult> {
  const result: ScrapeResult = {
    schedule: [],
    pricing: [],
    hoursOfOperation: emptyHours(),
    scheduleDataAvailable: false,
    pricingDataAvailable: false,
    hoursDataAvailable: false,
  }

  // ── 1. Homepage ──────────────────────────────────────────────────────────
  const homeOk = await tryGotoContent(page, baseUrl)
  if (homeOk) {
    result.pricing  = await extractPricingGeneric(page)
    // Skip homepage schedule when a dedicated hint page is configured — homepages
    // often only show a partial upcoming-classes widget, not the full weekly schedule.
    if (!hint?.schedulePage) {
      result.schedule = await extractScheduleWithDays(page)
    }
    const hours = await extractHoursGeneric(page)
    if (Object.values(hours).some((v) => v !== null)) {
      result.hoursOfOperation = hours
      result.hoursDataAvailable = true
    }
  }

  // ── 2. Try pricing sub-pages if nothing found yet ────────────────────────
  if (result.pricing.length === 0) {
    // Use hint path first, then fall back to common paths
    const pricingCandidates: string[] = hint?.pricingPage
      ? [resolveUrl(hint.pricingPage, baseUrl)]
      : PRICING_PATHS.map((p) => { try { return new URL(p, baseUrl).toString() } catch { return '' } }).filter(Boolean)

    for (const url of pricingCandidates) {
      if (!await tryGotoContent(page, url)) continue
      const pricing = await extractPricingGeneric(page)
      if (pricing.length > 0) {
        result.pricing = pricing
        // Opportunistically grab schedule from the same page if still missing
        if (result.schedule.length === 0) {
          const sched = await extractScheduleWithDays(page)
          if (sched.length > 0) result.schedule = sched
        }
        break
      }
    }
  }

  // ── 3. Schedule page — always visit when a hint is set; fall back to common
  //       paths only when nothing was found yet from the homepage.
  if (result.schedule.length === 0 || hint?.schedulePage) {
    const scheduleCandidates: string[] = hint?.schedulePage
      ? [resolveUrl(hint.schedulePage, baseUrl)]
      : SCHEDULE_PATHS.map((p) => { try { return new URL(p, baseUrl).toString() } catch { return '' } }).filter(Boolean)

    for (const url of scheduleCandidates) {
      if (!await tryGotoContent(page, url)) continue
      const schedule = await extractScheduleWithDays(page)
      if (schedule.length > 0) {
        result.schedule = schedule
        // Opportunistically grab pricing from the same page if still missing
        if (result.pricing.length === 0) {
          const pricing = await extractPricingGeneric(page)
          if (pricing.length > 0) result.pricing = pricing
        }
        break
      }
    }
  }

  result.pricingDataAvailable  = result.pricing.length > 0
  result.scheduleDataAvailable = result.schedule.length > 0

  // If this brand has a locations page, detect whether this location is Open or Upcoming
  if (hint?.locationsPage) {
    result.studioStatus = await detectLocationStatus(page, hint.locationsPage, baseUrl)
  }

  return result
}

// ── Schedule extractor (day-aware) ────────────────────────────────────────────

/**
 * Extracts recurring schedule rows. Only stores rows where the day-of-week can
 * be reliably determined from the surrounding DOM structure. Rows without a
 * detected day are DISCARDED rather than assigned a fake default — this prevents
 * inflated counts and incorrect day attribution.
 */
// Passed as a string literal so esbuild never transforms it — avoids the
// "__name is not defined" error that occurs when esbuild's keepNames injects
// its runtime helper into code that runs inside the Playwright browser sandbox.
const SCHEDULE_EVAL = `(function() {
  var DAY_MAP = {
    monday:'MON',mon:'MON',tuesday:'TUE',tue:'TUE',wednesday:'WED',wed:'WED',
    thursday:'THU',thu:'THU',friday:'FRI',fri:'FRI',saturday:'SAT',sat:'SAT',sunday:'SUN',sun:'SUN'
  };
  var DAY_WORDS = Object.keys(DAY_MAP);

  // Parse a time match into {hour, min} or null.
  // Handles: "8:30 am", "6 am", "7am", "530 pm" (HHMM compressed)
  function parseTime(tok, nextTok) {
    var h, m, ap;
    // "8:00am" or "8:00pm" — colon-separated with am/pm fused (e.g. Jetset Pilates format)
    var fusedMatch = tok.match(/^(\\d{1,2}):(\\d{2})(am|pm)$/i);
    if (fusedMatch) {
      h = parseInt(fusedMatch[1]); m = parseInt(fusedMatch[2]); ap = fusedMatch[3].toLowerCase();
    }
    // "8:30" with next token "am/pm"
    else if (/^(\\d{1,2}):(\\d{2})$/.test(tok) && /^(am|pm)$/i.test(nextTok)) {
      var colonMatch = tok.match(/^(\\d{1,2}):(\\d{2})$/);
      h = parseInt(colonMatch[1]); m = parseInt(colonMatch[2]); ap = nextTok.toLowerCase();
    }
    // "7am" or "7pm" combined
    else if (/^(\\d{1,2})(am|pm)$/i.test(tok)) {
      var cm = tok.match(/^(\\d{1,2})(am|pm)$/i);
      h = parseInt(cm[1]); m = 0; ap = cm[2].toLowerCase();
    }
    // plain hour "6" with next token "am/pm"
    else if (/^\\d{1,2}$/.test(tok) && /^(am|pm)$/i.test(nextTok)) {
      h = parseInt(tok); m = 0; ap = nextTok.toLowerCase();
    }
    // compressed "530" with next token "am/pm" (HHMM without colon, e.g. 530 = 5:30)
    else if (/^([01]?\\d)([0-5]\\d)$/.test(tok) && /^(am|pm)$/i.test(nextTok)) {
      var pm = tok.match(/^([01]?\\d)([0-5]\\d)$/);
      h = parseInt(pm[1]); m = parseInt(pm[2]); ap = nextTok.toLowerCase();
    }
    else return null;
    if (ap === 'pm' && h !== 12) h += 12;
    if (ap === 'am' && h === 12) h = 0;
    if (h < 4 || h > 23) return null;
    return { hour: h, min: m };
  }

  // Token-based parser: scan text token by token, tracking current day,
  // emitting (day, time) pairs. Handles multi-day-multi-time on one line.
  function parseTextTokens(text) {
    var results = [];
    var curDay = null;
    var tokens = text.split(/\\s+/);
    for (var i = 0; i < tokens.length; i++) {
      var tok = tokens[i];
      // Check if this token IS a day name
      var tokLow = tok.replace(/[^a-z]/gi,'').toLowerCase();
      if (DAY_MAP[tokLow]) { curDay = DAY_MAP[tokLow]; continue; }
      // Check if this token starts a time expression
      if (!curDay) continue;
      var nextTok = tokens[i+1] || '';
      var t = parseTime(tok, nextTok);
      if (t) {
        // consume the am/pm token if it was a separate token
        if (/^(am|pm)$/i.test(nextTok) && !/^(\\d{1,2})(am|pm)$/i.test(tok)) i++;
        var startTime = (t.hour<10?'0':'') + t.hour + ':' + (t.min<10?'0':'') + t.min;
        // If the next token is a range separator (e.g. "8:00am - 8:50am"), skip
        // past the separator AND the end-time tokens so only the START is recorded.
        var sepTok = tokens[i+1] || '';
        if (/^[\\u2013\\u2014-]$/.test(sepTok) || /^to$/i.test(sepTok)) {
          i++; // skip separator
          var eTok = tokens[i+1] || '', eNext = tokens[i+2] || '';
          if (eTok && parseTime(eTok, eNext)) {
            i++; // skip end-time token
            if (/^(am|pm)$/i.test(eNext) && !/^(\\d{1,2})(am|pm)$/i.test(eTok)) i++;
          }
        }
        var dup = false;
        for (var ri = 0; ri < results.length; ri++) {
          if (results[ri].day === curDay && results[ri].startTime === startTime) { dup = true; break; }
        }
        if (!dup) results.push({ day: curDay, startTime: startTime });
      }
    }
    return results;
  }

  // DOM-based extraction: look for elements with schedule-related class names,
  // try to detect day from element text and ancestors.
  function detectDayInText(text) {
    var lower = text.toLowerCase();
    for (var i = 0; i < DAY_WORDS.length; i++) {
      var w = DAY_WORDS[i];
      if (new RegExp('\\\\b' + w + '\\\\b').test(lower)) return DAY_MAP[w];
    }
    return null;
  }
  function walkAncestorsForDay(el) {
    var current = el;
    for (var i = 0; i < 6; i++) {
      current = current && current.parentElement;
      if (!current) break;
      var attrs = ['aria-label','data-day','data-weekday','title','id'];
      for (var ai = 0; ai < attrs.length; ai++) {
        var val = current.getAttribute(attrs[ai]);
        if (val) { var d = detectDayInText(val); if (d) return d; }
      }
      var ownText = Array.from(current.childNodes)
        .filter(function(n){ return n.nodeType === 3; })
        .map(function(n){ return n.textContent || ''; }).join(' ');
      var d2 = detectDayInText(ownText);
      if (d2) return d2;
    }
    return null;
  }

  var results = [];
  var seen = {};
  var spotsRegex = /(\\d+)\\s+(?:spots?|spaces?|openings?)\\s+(?:available|left|remaining|open)/i;
  // Lines that look like business hours rather than class schedule
  var HOURS_LINE = /\\bopen\\b|\\bclosed\\b|\\bhours\\b|\\bthru\\b|\\bthrough\\b|[\\u2013\\u2014-]\\s*\\d+(am|pm)/i;

  // ── Pass 1: DOM-based (structured pages with schedule CSS classes) ────────
  var selectorHits = Array.from(document.querySelectorAll(
    '[class*="class"],[class*="schedule"],[class*="slot"],[class*="session"],[class*="booking"],[class*="event"],[class*="timetable"],[class*="workout"],[class*="lesson"]'
  ));
  for (var ci = 0; ci < selectorHits.length; ci++) {
    var el = selectorHits[ci];
    var elText = el.innerText || '';
    // Skip large containers (likely page sections, not individual schedule slots)
    if (elText.length > 300) continue;
    // Skip elements that look like business hours
    if (HOURS_LINE.test(elText)) continue;
    var dayFromEl = detectDayInText(elText);
    var day = dayFromEl || walkAncestorsForDay(el);
    if (!day) continue;
    var tokens = elText.split(/\\s+/);
    for (var ti = 0; ti < tokens.length; ti++) {
      var t = parseTime(tokens[ti], tokens[ti+1] || '');
      if (!t) continue;
      if (/^(am|pm)$/i.test(tokens[ti+1] || '') && !/^(\\d{1,2})(am|pm)$/i.test(tokens[ti])) ti++;
      // Skip end-time: "8:00am - 8:50am" → only keep start time
      var sepTok1 = tokens[ti+1] || '';
      if (/^[\u2013\u2014-]$/.test(sepTok1) || /^to$/i.test(sepTok1)) {
        ti++; // skip separator
        var eTok1 = tokens[ti+1] || '', eNext1 = tokens[ti+2] || '';
        if (eTok1 && parseTime(eTok1, eNext1)) {
          ti++; // skip end-time token
          if (/^(am|pm)$/i.test(eNext1) && !/^(\\d{1,2})(am|pm)$/i.test(eTok1)) ti++;
        }
      }
      var st = (t.hour<10?'0':'') + t.hour + ':' + (t.min<10?'0':'') + t.min;
      var key = day + '_' + st;
      if (seen[key]) continue;
      seen[key] = true;
      var spotsMatch = elText.match(spotsRegex);
      var sa = spotsMatch ? parseInt(spotsMatch[1],10) : undefined;
      var firstLine = (elText.split('\\n')[0] || 'Class').trim().substring(0,80);
      results.push({ day:day, startTime:st, className:firstLine,
        spotsAvailable:sa, dataAvailable:sa!==undefined, durationMinutes:60 });
    }
  }

  // ── Pass 1b: Sub-element strategy for card-based DOM layouts ─────────────────
  // Handles pages where each class card has separate child elements for class name
  // and time (e.g. JETSET Pilates). The parent card matches [class*="class"] but
  // HOURS_LINE filters it because the card text contains a time range
  // ("7:00am - 7:50am"). This pass finds class-name sub-elements directly,
  // looks for a sibling class-time element for the start time, and locates the
  // day by finding the nearest schedule-day ancestor and reading its day header.
  var classNameEls = Array.from(document.querySelectorAll('[class*="class-name"]'));
  for (var cni = 0; cni < classNameEls.length; cni++) {
    var nameEl = classNameEls[cni];
    var cnText = (nameEl.innerText || '').trim();
    if (!cnText || cnText.length > 100 || HOURS_LINE.test(cnText)) continue;
    var cardEl = nameEl.parentElement;
    if (!cardEl) continue;
    var timeEl1b = cardEl.querySelector('[class*="class-time"],[class*="-time"]');
    if (!timeEl1b) continue;
    var timeToks1b = ((timeEl1b.innerText || '').trim()).split(/\\s+/);
    var parsedT = parseTime(timeToks1b[0] || '', timeToks1b[1] || '');
    if (!parsedT) continue;
    var st1b = (parsedT.hour < 10 ? '0' : '') + parsedT.hour + ':' + (parsedT.min < 10 ? '0' : '') + parsedT.min;
    // Walk up to find a schedule-day ancestor, then read its day header
    var dayAncestor = cardEl.parentElement;
    var day1b = null;
    for (var dsi = 0; dsi < 5 && dayAncestor; dsi++) {
      if (/schedule.?day/i.test(dayAncestor.className || '')) {
        var dayHdrEl = dayAncestor.querySelector('[class*="day-header-day"],[class*="day-label"],[class*="day-name"],[data-day]');
        if (dayHdrEl) {
          day1b = detectDayInText(dayHdrEl.getAttribute('data-day') || (dayHdrEl.innerText || ''));
        }
        if (!day1b) {
          day1b = detectDayInText((dayAncestor.innerText || '').substring(0, 30));
        }
        break;
      }
      dayAncestor = dayAncestor.parentElement;
    }
    if (!day1b) day1b = walkAncestorsForDay(nameEl);
    if (!day1b) continue;
    var key1b = day1b + '_' + st1b;
    if (seen[key1b]) continue;
    seen[key1b] = true;
    var statusEl1b = cardEl.querySelector('[class*="class-status"],[class*="spots"],[class*="availability"]');
    var statusText1b = statusEl1b ? (statusEl1b.innerText || '') : '';
    var spotsMatch1b = statusText1b.match(spotsRegex);
    var sa1b = spotsMatch1b ? parseInt(spotsMatch1b[1], 10) : undefined;
    var teacherEl1b = cardEl.querySelector('[class*="class-teacher"],[class*="instructor"],[class*="teacher"]');
    var instructor1b = teacherEl1b ? (teacherEl1b.innerText || '').trim() : undefined;
    results.push({ day: day1b, startTime: st1b, className: cnText,
      spotsAvailable: sa1b, dataAvailable: sa1b !== undefined, durationMinutes: 60,
      instructor: instructor1b });
  }

  // ── Pass 2: Text-based sweep ──────────────────────────────────────────────
  // Always runs (not just when Pass 1 found nothing) so it can pick up days
  // whose schedule-day container exceeds the 300-char limit and was skipped
  // by Pass 1 or Pass 1b.  Deduplication via the "seen" dict prevents
  // double-counting entries already captured by earlier passes.
  //
  // Filter hours-like lines, then JOIN the remaining lines into one token stream
  // before calling parseTextTokens. This is critical for schedules like Jetset
  // where the day label ("Sun04/19") is on its own line and the class times
  // ("8:00am - 8:50am") are on the next line — if we parse line-by-line,
  // curDay resets to null on every call and times are always skipped.
  var pageLines = (document.body.innerText || '').split('\\n');
  var filteredText = pageLines
    .map(function(l){ return l.trim(); })
    .filter(function(l){ return l.length > 0 && !HOURS_LINE.test(l); })
    .join(' ');
  var pass2Results = parseTextTokens(filteredText);
  for (var lri = 0; lri < pass2Results.length; lri++) {
    var lr = pass2Results[lri];
    var key2 = lr.day + '_' + lr.startTime;
    if (seen[key2]) continue;
    seen[key2] = true;
    results.push({ day:lr.day, startTime:lr.startTime, className:'Class',
      spotsAvailable:undefined, dataAvailable:false, durationMinutes:60 });
  }

  return results;
})()`

async function extractScheduleWithDays(page: Page): Promise<ScrapedScheduleRow[]> {
  const raw = await page.evaluate(SCHEDULE_EVAL) as any[]
  return raw.map((r: any) => ({
    className: r.className,
    dayOfWeek: r.day as DayOfWeek,
    startTime: r.startTime,
    durationMinutes: r.durationMinutes,
    spotsAvailable: r.spotsAvailable,
    dataAvailable: r.dataAvailable,
    instructor: r.instructor,
  }))
}

// ── Pricing extractor ─────────────────────────────────────────────────────────
//
// Strategy:
//   PRIMARY  — DOM-anchored: find every "Buy"-like CTA button, walk up to its
//              pricing card container, then extract name / price / classes from
//              the card's own text.  Per-class price shown on the page is used
//              to cross-check (and to infer class count when not stated).
//   FALLBACK — text scan: used only when the page has no recognisable CTAs
//              (e.g. some studios use a plain text pricing list).

const PRICING_EVAL = `(function() {
  var results = [];
  var seen    = {};

  // Regexes used throughout
  var ctaRe      = /^(buy|book|purchase|select|sign\\s*up|get\\s*started|join|enroll)$/i;
  var perClassRe = /\\$\\s*([\\d,]+(?:\\.\\d{1,2})?)\\s*\\/\\s*class/i;
  var badgeRe    = /^(best value|most popular|great value|most flexible|save|new|promo|recommended|limited|featured|\\!)/i;
  var introRe    = /\\bintro\\b|\\bintroductory\\b|\\btrial\\b|\\bfirst[- ]?time\\b|\\bnew\\s+(client|member)\\b/i;
  var annualRe   = /\\bannual\\b|\\byear(?:ly)?\\b/i;
  var monthlyRe  = /\\bmonth(?:ly)?\\b/i;
  var packRe     = /class\\s*pack|\\d+\\s*[-\\s]?class(?:es)?/i;
  var dropInRe   = /\\bsingle\\s*class\\b|\\bdrop[- ]?in\\b|\\bper\\s*class\\b/i;

  // ── Helpers ──────────────────────────────────────────────────────────────

  function parseAmt(s) {
    var n = parseFloat((s || '').replace(/,/g, ''));
    return isNaN(n) ? null : n;
  }

  // Walk up from a CTA element to find the smallest ancestor that:
  //   • contains a "$NNN" price
  //   • has at least 2 non-empty text lines
  //   • contains exactly 1 Buy-like CTA (so we don't grab the whole section)
  function findCard(ctaEl) {
    var node = ctaEl.parentElement;
    for (var d = 0; d < 12; d++) {
      if (!node) return null;
      var t = (node.innerText || '').trim();
      if (/\\$\\s*\\d/.test(t) && t.split('\\n').filter(function(l){ return l.trim(); }).length >= 2) {
        var nCtas = Array.from(node.querySelectorAll('a,button')).filter(function(e) {
          return ctaRe.test((e.textContent || '').trim());
        }).length;
        if (nCtas === 1) return node;   // perfect single-card container
        if (nCtas > 1)  return null;    // gone too high — multiple cards merged
      }
      node = node.parentElement;
    }
    return null;
  }

  // Total price = last bare "$NNN" line that is NOT a per-class rate
  function extractTotalPrice(lines) {
    for (var i = lines.length - 1; i >= 0; i--) {
      if (perClassRe.test(lines[i])) continue;
      var m = lines[i].match(/^[^\\d]*\\$\\s*([\\d,]+(?:\\.\\d{1,2})?)\\s*(?:\\/\\s*(?:mo(?:nth)?))?\\s*$/i);
      if (m) return parseAmt(m[1]);
    }
    // Looser fallback: any $ amount not followed by /class
    for (var j = 0; j < lines.length; j++) {
      if (perClassRe.test(lines[j])) continue;
      var m2 = lines[j].match(/\\$\\s*([\\d,]+(?:\\.\\d{1,2})?)/);
      if (m2) return parseAmt(m2[1]);
    }
    return null;
  }

  function extractPerClass(lines) {
    for (var k = 0; k < lines.length; k++) {
      var m = lines[k].match(perClassRe);
      if (m) return parseAmt(m[1]);
    }
    return null;
  }

  function extractClassCount(text) {
    var m = text.match(/(\\d+)\\s*[-\\s]?class(?:es)?/i);
    if (m) return parseInt(m[1], 10);
    if (/\\bsingle\\s*class\\b/i.test(text)) return 1;
    return null;
  }

  function classifyType(name, cardText) {
    var t = (name + ' ' + cardText).toLowerCase();
    if (introRe.test(t)) return 'INTRO';
    // If the price is shown as $/month, treat as MONTHLY even when the card mentions
    // "annual" (e.g. "Founders Unlimited - $199/mo, annual commitment").
    // Guard: if the plan *name itself* says annual/yearly, keep ANNUAL.
    if (/\\$[\\s\\d,.]+\\/\\s*mo(?:nth)?/i.test(cardText) && !annualRe.test(name)) return 'MONTHLY';
    if (annualRe.test(t))  return 'ANNUAL';
    if (monthlyRe.test(t)) return 'MONTHLY';
    if (packRe.test(t))    return 'CLASS_PACK';
    if (dropInRe.test(t))  return 'DROP_IN';
    return 'DROP_IN';
  }

  function addPlan(planName, planType, price, classCount, notes) {
    if (!price || price < 5 || price > 5000) return;
    var key = planType + '|' + Math.round(price * 100);
    if (seen[key]) return;
    seen[key] = true;
    var row = { planName: planName, planType: planType, priceAmount: price, currency: 'USD' };
    if (classCount != null) row.classCount = classCount;
    if (notes)              row.notes      = notes;
    results.push(row);
  }

  // ── PRIMARY: CTA-anchored DOM extraction ─────────────────────────────────

  var ctaEls = Array.from(document.querySelectorAll('a,button')).filter(function(el) {
    return ctaRe.test((el.textContent || '').trim());
  });

  var processedCards = [];

  for (var ci = 0; ci < ctaEls.length; ci++) {
    var card = findCard(ctaEls[ci]);
    if (!card || processedCards.indexOf(card) !== -1) continue;
    processedCards.push(card);

    var raw   = card.innerText || '';
    var lines = raw.split('\\n')
      .map(function(l) { return l.trim(); })
      .filter(function(l) { return l.length > 0 && !ctaRe.test(l); });

    var totalPrice = extractTotalPrice(lines);
    if (!totalPrice) continue;

    var perClass = extractPerClass(lines);

    // Plan name: first non-price, non-badge line
    var planName = '';
    for (var li = 0; li < lines.length; li++) {
      var ln = lines[li];
      if (/^\\$/.test(ln) || perClassRe.test(ln)) continue;   // price line
      if (badgeRe.test(ln))                        continue;   // marketing badge
      if (ln.length >= 3 && ln.length <= 100)    { planName = ln; break; }
    }
    if (!planName) planName = 'Package';

    var planType   = classifyType(planName, raw);
    var classCount = extractClassCount(planName) || extractClassCount(raw) || null;

    // Derive classCount from per-class price when not stated in text
    if (classCount === null && perClass && planType === 'CLASS_PACK') {
      var derived = Math.round(totalPrice / perClass);
      if (derived >= 1 && derived <= 200) classCount = derived;
    }

    // Unlimited plans carry no class count
    if (/\\bunlimited\\b/i.test(raw) && planType !== 'INTRO') classCount = null;

    // Cross-check: if page shows per-class AND we know class count, verify they agree
    var notes = null;
    if (perClass !== null && classCount !== null && planType === 'CLASS_PACK') {
      var computed = Math.round(totalPrice / classCount * 100) / 100;
      if (Math.abs(computed - perClass) > 0.50) {
        notes = 'Page: $' + perClass + '/class; computed: $' + computed + ' (' + classCount + ' classes)';
      }
    }

    addPlan(planName, planType, totalPrice, classCount, notes);
  }

  // ── FALLBACK: simple text scan (no CTA buttons found) ───────────────────
  if (results.length === 0) {
    var bodyLines = (document.body.innerText || '').split('\\n')
      .map(function(l) { return l.trim(); }).filter(Boolean);
    var introHdrRe = /\\bintro\\b|\\bintroductory\\b|\\btrial offer\\b|\\bfirst[- ]?time\\b/i;
    var regHdrRe   = /\\b(monthly|annual|memberships?|class pack|packages?|drop[- ]?in)\\b/i;
    var inIntro    = false;

    for (var bi = 0; bi < bodyLines.length; bi++) {
      var bline = bodyLines[bi];
      var bHasPrice = /\\$/.test(bline);
      if (!bHasPrice && introHdrRe.test(bline))              { inIntro = true;  continue; }
      if (!bHasPrice && inIntro && regHdrRe.test(bline))     { inIntro = false; continue; }
      if (perClassRe.test(bline))                             { continue; }  // skip /class lines
      var bm = bline.match(/\\$\\s*([\\d,]+(?:\\.\\d{1,2})?)/);
      if (!bm) continue;
      var bprice = parseAmt(bm[1]);
      if (!bprice || bprice < 5 || bprice > 5000) continue;
      var bkey = (inIntro ? 'INTRO' : 'X') + '|' + Math.round(bprice * 100);
      if (seen[bkey]) continue;
      seen[bkey] = true;
      var bprev  = bi > 0 ? bodyLines[bi - 1] : '';
      var bname  = bline.replace(/[:\\s]*\\$[\\d.,]+.*$/, '').replace(/^[-•·\\s]+/, '').trim()
                || bprev.replace(/[:\\s]*\\$[\\d.,]+.*$/, '').replace(/^[-•·\\s]+/, '').trim()
                || 'Package';
      var bctx   = bodyLines.slice(Math.max(0, bi - 2), bi + 3).join(' ');
      var bptype = inIntro ? 'INTRO' : classifyType(bname, bctx);
      var bcc    = extractClassCount(bname) || extractClassCount(bctx) || null;
      if (/\\bunlimited\\b/i.test(bctx) && bptype !== 'INTRO') bcc = null;
      addPlan(bname, bptype, bprice, bcc, null);
    }
  }

  return results;
})()`

async function extractPricingGeneric(page: Page): Promise<ScrapedPricingRow[]> {
  return page.evaluate(PRICING_EVAL) as Promise<ScrapedPricingRow[]>
}

// ── Hours extractor ───────────────────────────────────────────────────────────

const HOURS_EVAL = `(function() {
  var days = { monday:'MON', tuesday:'TUE', wednesday:'WED', thursday:'THU',
                friday:'FRI', saturday:'SAT', sunday:'SUN' };
  var result = { MON:null, TUE:null, WED:null, THU:null, FRI:null, SAT:null, SUN:null };
  var timeRegex = /(\\d{1,2})(?::(\\d{2}))?\\s*(am|pm)/gi;
  var lines = document.body.innerText.toLowerCase().split('\\n');
  for (var li = 0; li < lines.length; li++) {
    var line = lines[li];
    for (var dayWord in days) {
      if (!new RegExp('\\\\b' + dayWord + '\\\\b').test(line)) continue;
      var matches = [];
      var m;
      var re2 = new RegExp(timeRegex.source, 'gi');
      while ((m = re2.exec(line)) !== null) matches.push(m);
      if (matches.length >= 2) {
        var toH = function(mm) {
          var h = parseInt(mm[1], 10);
          var ap = mm[3].toLowerCase();
          if (ap === 'pm' && h !== 12) h += 12;
          if (ap === 'am' && h === 12) h = 0;
          return h;
        };
        result[days[dayWord]] = { open: toH(matches[0]), close: toH(matches[1]) };
      }
    }
  }
  return result;
})()`

async function extractHoursGeneric(page: Page): Promise<Record<DayOfWeek, { open: number; close: number } | null>> {
  return page.evaluate(HOURS_EVAL) as Promise<Record<DayOfWeek, { open: number; close: number } | null>>
}

function emptyHours(): Record<DayOfWeek, { open: number; close: number } | null> {
  return { MON: null, TUE: null, WED: null, THU: null, FRI: null, SAT: null, SUN: null }
}

// ── Exported helpers (used in unit tests) ────────────────────────────────────

export function parseTimeSlot(raw: string): string {
  const m = raw.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i)
  if (!m) return '00:00'
  let hour = parseInt(m[1], 10)
  const min = m[2] ?? '00'
  const ampm = m[3].toLowerCase()
  if (ampm === 'pm' && hour !== 12) hour += 12
  if (ampm === 'am' && hour === 12) hour = 0
  return `${String(hour).padStart(2, '0')}:${min}`
}

export function normalizeBrandName(raw: string): string {
  return raw.toLowerCase().replace(/[®™©]/g, '').replace(/[^a-z0-9]/g, '').trim()
}
