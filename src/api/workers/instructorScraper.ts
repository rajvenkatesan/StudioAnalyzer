import { chromium } from 'playwright'

export interface ScrapedInstructor {
  fullName: string
  bio: string
  photoUrl: string
  instagramHandle: string | null
  email: string | null
  linkedinUrl: string | null
  classTypes: string[]
  studioName: string
  studioUrl: string
  workZipcode: string
}

const INSTRUCTOR_EVAL = `(function() {
  var results = [];
  // Try multiple selector patterns MindBody uses for staff cards
  var cards = Array.from(document.querySelectorAll(
    '[data-qa="staff-card"], .bw-widget__staff-bio, [class*="StaffCard"], [class*="staff-card"], [class*="instructor-card"]'
  ));
  // Fallback: any section that has both an image and a heading near each other
  if (cards.length === 0) {
    cards = Array.from(document.querySelectorAll('section, article, li')).filter(function(el) {
      return el.querySelector('img') && (el.querySelector('h2,h3,h4,h5'));
    });
  }
  cards.forEach(function(card) {
    var name = '';
    var bio = '';
    var photo = '';
    var instagram = null;
    var email = null;
    var linkedin = null;
    var classTypes = [];

    var nameEl = card.querySelector('h2,h3,h4,h5,[class*="name"],[class*="Name"]');
    if (nameEl) name = nameEl.textContent.trim();

    var bioEl = card.querySelector('p,[class*="bio"],[class*="Bio"],[class*="description"],[class*="Description"]');
    if (bioEl) bio = bioEl.textContent.trim();

    var imgEl = card.querySelector('img');
    if (imgEl) photo = imgEl.src || imgEl.getAttribute('data-src') || imgEl.getAttribute('data-lazy') || '';

    // Extract social handles from bio text and links
    var allText = card.innerText || card.textContent || '';
    var igMatch = allText.match(/@([A-Za-z0-9_.]{2,30})/);
    if (igMatch) instagram = igMatch[1];

    var emailMatch = allText.match(/[a-zA-Z0-9._%+\\-]+@[a-zA-Z0-9.\\-]+\\.[a-zA-Z]{2,}/);
    if (emailMatch) email = emailMatch[0];

    // LinkedIn from anchor tags
    var links = Array.from(card.querySelectorAll('a[href]'));
    links.forEach(function(a) {
      var href = a.href || '';
      if (href.includes('linkedin.com/in/')) linkedin = href;
      if (href.includes('instagram.com/')) {
        var m = href.match(/instagram\\.com\\/([A-Za-z0-9_.]+)/);
        if (m && m[1] !== 'p') instagram = m[1];
      }
    });

    // Class types: look for pill/tag elements
    var tagEls = Array.from(card.querySelectorAll('[class*="tag"],[class*="Tag"],[class*="service"],[class*="Service"],[class*="class-type"],[class*="specialty"]'));
    tagEls.forEach(function(el) {
      var t = el.textContent.trim();
      if (t && t.length < 50) classTypes.push(t);
    });

    if (name && name.length > 1 && name.length < 100) {
      results.push({ fullName: name, bio: bio, photoUrl: photo, instagramHandle: instagram, email: email, linkedinUrl: linkedin, classTypes: classTypes });
    }
  });
  return results;
})()`

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function scrapeInstructorsFromMindBody(
  zipcode: string,
  classTypeFilter: string | undefined,
  onProgress: (msg: string) => void
): Promise<ScrapedInstructor[]> {
  const browser = await chromium.launch({ headless: true })
  const results: ScrapedInstructor[] = []

  try {
    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 900 },
    })

    const page = await context.newPage()

    // 1. Navigate to MindBody explore
    onProgress('Navigating to MindBody Explore...')
    try {
      await page.goto('https://www.mindbodyonline.com/explore', {
        waitUntil: 'domcontentloaded',
        timeout: 30_000,
      })
      await sleep(2000)
    } catch (err: any) {
      onProgress(`Failed to load MindBody: ${err?.message}`)
      await context.close()
      return results
    }

    // 2. Fill location search
    onProgress(`Searching for studios near zipcode ${zipcode}...`)
    try {
      const locationInput = await page.waitForSelector(
        'input[placeholder*="location"], input[placeholder*="zip"], input[name*="location"], input[aria-label*="location"], input[type="search"]',
        { timeout: 10_000 }
      )
      if (locationInput) {
        await locationInput.fill(zipcode)
        await sleep(1000)
        await locationInput.press('Enter')
        await sleep(3000)
      }
    } catch {
      onProgress('Could not find location input — attempting direct URL approach...')
      try {
        await page.goto(`https://www.mindbodyonline.com/explore?location=${zipcode}`, {
          waitUntil: 'domcontentloaded',
          timeout: 20_000,
        })
        await sleep(3000)
      } catch (err2: any) {
        onProgress(`Failed with direct URL too: ${err2?.message}`)
        await context.close()
        return results
      }
    }

    // 3. Collect studio hrefs
    onProgress('Collecting studio page links...')
    let studioUrls: string[] = []
    try {
      await page.waitForSelector('a[href*="/explore/"]', { timeout: 8_000 })
      studioUrls = await page.evaluate(() => {
        const anchors = Array.from(document.querySelectorAll('a[href]')) as HTMLAnchorElement[]
        const seen: Record<string, boolean> = {}
        const urls: string[] = []
        for (const a of anchors) {
          const href = a.href || ''
          if (
            href.includes('/explore/') &&
            !href.endsWith('/explore/') &&
            !href.includes('?') &&
            !seen[href]
          ) {
            seen[href] = true
            urls.push(href)
          }
        }
        return urls
      }) as string[]
    } catch {
      onProgress('No studio cards found on MindBody explore page')
    }

    studioUrls = studioUrls.slice(0, 20)
    onProgress(`Found ${studioUrls.length} studio pages to check`)

    // 4. For each studio URL, extract instructors
    for (const studioUrl of studioUrls) {
      try {
        onProgress(`Visiting: ${studioUrl}`)
        await page.goto(studioUrl, { waitUntil: 'domcontentloaded', timeout: 15_000 })
        await sleep(2000)

        const studioName = await page.title().then((t) => t.split('|')[0].trim()).catch(() => studioUrl)

        const rawInstructors = await page.evaluate(INSTRUCTOR_EVAL) as Array<{
          fullName: string
          bio: string
          photoUrl: string
          instagramHandle: string | null
          email: string | null
          linkedinUrl: string | null
          classTypes: string[]
        }>

        for (const raw of rawInstructors) {
          if (
            classTypeFilter &&
            raw.classTypes.length > 0 &&
            !raw.classTypes.some((ct) =>
              ct.toLowerCase().includes(classTypeFilter.toLowerCase())
            )
          ) {
            continue
          }

          results.push({
            fullName: raw.fullName,
            bio: raw.bio,
            photoUrl: raw.photoUrl,
            instagramHandle: raw.instagramHandle,
            email: raw.email,
            linkedinUrl: raw.linkedinUrl,
            classTypes: raw.classTypes,
            studioName,
            studioUrl,
            workZipcode: zipcode,
          })
        }

        onProgress(`Found ${rawInstructors.length} instructors at ${studioName}`)
      } catch (err: any) {
        onProgress(`Error visiting ${studioUrl}: ${err?.message ?? String(err)}`)
        // Continue to next studio
      }
    }

    // 5. Optionally visit Instagram profiles to enrich bio/contact
    for (const instructor of results) {
      if (!instructor.instagramHandle) continue
      try {
        onProgress(`Enriching Instagram @${instructor.instagramHandle}...`)
        await page.goto(
          `https://www.instagram.com/${instructor.instagramHandle}/`,
          { waitUntil: 'domcontentloaded', timeout: 10_000 }
        )
        await sleep(1500)

        const igBio = await page.evaluate(() => {
          const bioEl = document.querySelector('meta[name="description"]')
          return bioEl ? (bioEl as HTMLMetaElement).content : ''
        }) as string

        if (igBio && !instructor.bio) {
          instructor.bio = igBio
        }
      } catch {
        // Ignore Instagram errors — just continue
      }
    }

    await context.close()
  } finally {
    await browser.close()
  }

  return results
}
