import { chromium } from 'playwright'

export interface ScrapedInstructor {
  fullName:        string
  bio:             string
  photoUrl:        string
  instagramHandle: string | null
  email:           string | null
  linkedinUrl:     string | null
  classTypes:      string[]
  studioName:      string
  studioUrl:       string
  workZipcode:     string
}

// ── Instructor extraction eval ────────────────────────────────────────────────
// Stored as a raw string literal to prevent esbuild from wrapping the inner
// functions with __name(), which breaks execution inside page.evaluate().
//
// Targets MindBody's explore studio detail pages.  The page renders with
// hashed CSS-module class names, so we look for semantic structure:
//   – a parent element whose heading text contains "staff" or "instructor"
//   – individual cards: any block with both an <img> and a heading tag
//
// Also falls back to a loose card scan across the whole document.
const INSTRUCTOR_EVAL = `(function() {
  var results = [];

  function extractFromCard(card) {
    var name = '';
    var bio  = '';
    var photo = '';
    var instagram = null;
    var email = null;
    var linkedin = null;
    var classTypes = [];

    // Name — prefer the first heading; fall back to [class*=name]
    var nameEl = card.querySelector('h1,h2,h3,h4,h5,h6')
                 || card.querySelector('[class*="name"],[class*="Name"],[class*="title"],[class*="Title"]');
    if (nameEl) name = nameEl.textContent.trim();

    // Bio — first <p> or [class*=bio/desc]
    var bioEl = card.querySelector('p,[class*="bio"],[class*="Bio"],[class*="desc"],[class*="Desc"],[class*="about"],[class*="About"]');
    if (bioEl) bio = bioEl.textContent.trim();

    // Photo
    var imgEl = card.querySelector('img');
    if (imgEl) {
      photo = imgEl.src
              || imgEl.getAttribute('data-src')
              || imgEl.getAttribute('data-lazy')
              || imgEl.getAttribute('data-original')
              || '';
      // Skip tiny icons / placeholders
      if (photo && (photo.includes('icon') || photo.includes('placeholder') || photo.includes('logo'))) photo = '';
    }

    // Social from all visible text + anchor hrefs
    var allText = card.innerText || card.textContent || '';
    var links = Array.from(card.querySelectorAll('a[href]'));

    // Instagram handle — from @mention in text first, then href
    var igTextMatch = allText.match(/@([A-Za-z0-9_.]{2,30})/);
    if (igTextMatch) instagram = igTextMatch[1];
    links.forEach(function(a) {
      var href = a.href || '';
      if (href.includes('instagram.com/')) {
        var m = href.match(/instagram\\.com\\/([A-Za-z0-9_.]+)\\/?/);
        if (m && m[1] && m[1] !== 'p' && m[1] !== 'explore' && m[1] !== 'reel') instagram = m[1];
      }
      if (href.includes('linkedin.com/in/')) linkedin = href.split('?')[0];
    });

    // Email from text
    var emailMatch = allText.match(/[a-zA-Z0-9._%+\\-]+@[a-zA-Z0-9.\\-]+\\.[a-zA-Z]{2,}/);
    if (emailMatch) email = emailMatch[0];

    // Class type pills / tags
    var tagEls = Array.from(card.querySelectorAll(
      '[class*="tag"],[class*="Tag"],[class*="pill"],[class*="Pill"],[class*="chip"],[class*="Chip"],' +
      '[class*="service"],[class*="Service"],[class*="class-type"],[class*="specialty"],[class*="Specialty"]'
    ));
    tagEls.forEach(function(el) {
      var t = el.textContent.trim();
      if (t && t.length > 0 && t.length < 50) classTypes.push(t);
    });

    return { name: name, bio: bio, photo: photo, instagram: instagram, email: email, linkedin: linkedin, classTypes: classTypes };
  }

  // Strategy 1: find the Staff / Instructors section heading, then scan sibling/child cards
  var headings = Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6,section'));
  var staffSection = null;
  for (var i = 0; i < headings.length; i++) {
    var txt = (headings[i].textContent || '').toLowerCase();
    if (txt.includes('staff') || txt.includes('instructor') || txt.includes('trainer') || txt.includes('teacher')) {
      staffSection = headings[i].closest('section') || headings[i].parentElement || headings[i];
      break;
    }
  }

  var cards = [];
  if (staffSection) {
    // Cards within the staff section
    cards = Array.from(staffSection.querySelectorAll(
      'article, [class*="card"],[class*="Card"],[class*="member"],[class*="Member"],[class*="profile"],[class*="Profile"],[class*="bio"],[class*="Bio"],[class*="staff"],[class*="Staff"]'
    ));
    // If that found nothing, try direct children with an img
    if (cards.length === 0) {
      cards = Array.from(staffSection.children).filter(function(el) {
        return el.querySelector('img');
      });
    }
  }

  // Strategy 2: known MindBody widget selectors
  if (cards.length === 0) {
    cards = Array.from(document.querySelectorAll(
      '.bw-widget__staff-bio, [data-qa="staff-card"], [class*="StaffCard"], [class*="staff-card"],' +
      '[class*="InstructorCard"], [class*="instructor-card"], [class*="TrainerCard"]'
    ));
  }

  // Strategy 3: broad fallback — any block that has both an <img> and a heading
  if (cards.length === 0) {
    var candidates = Array.from(document.querySelectorAll('article, li, [class*="card"],[class*="Card"],[class*="item"],[class*="Item"]'));
    cards = candidates.filter(function(el) {
      return el.querySelector('img') && el.querySelector('h1,h2,h3,h4,h5,h6');
    });
    // Limit to avoid grabbing every list item on the page
    cards = cards.slice(0, 50);
  }

  // Deduplicate by name
  var seen = {};
  cards.forEach(function(card) {
    var d = extractFromCard(card);
    if (!d.name || d.name.length < 2 || d.name.length > 100) return;
    if (seen[d.name]) return;
    seen[d.name] = true;
    results.push({
      fullName:        d.name,
      bio:             d.bio,
      photoUrl:        d.photo,
      instagramHandle: d.instagram,
      email:           d.email,
      linkedinUrl:     d.linkedin,
      classTypes:      d.classTypes,
    });
  });

  return results;
})()`

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Try to dismiss common cookie/GDPR banners so they don't block content. */
async function dismissBanners(page: import('playwright').Page): Promise<void> {
  const bannerSelectors = [
    'button[id*="accept"], button[class*="accept"], button[aria-label*="Accept"]',
    'button:has-text("Accept"), button:has-text("Accept All"), button:has-text("Got it")',
    'button:has-text("OK"), button:has-text("Agree"), button:has-text("Allow")',
    '[class*="cookie"] button, [id*="cookie"] button, [class*="consent"] button',
  ]
  for (const sel of bannerSelectors) {
    try {
      const btn = page.locator(sel).first()
      if (await btn.isVisible({ timeout: 1500 })) {
        await btn.click()
        await sleep(500)
        break
      }
    } catch { /* ignore */ }
  }
}

/** Collect all unique /explore/locations/ hrefs visible on the current page. */
async function collectStudioUrls(page: import('playwright').Page): Promise<string[]> {
  const urls: string[] = await page.evaluate(() => {
    const seen: Record<string, boolean> = {}
    return Array.from(document.querySelectorAll('a[href]'))
      .map((a) => (a as HTMLAnchorElement).href)
      .filter((href) => {
        if (!href.includes('/explore/locations/')) return false
        if (href.includes('?') || href.includes('#')) return false
        // Must have at least one more path segment after /locations/
        const path = new URL(href).pathname
        const parts = path.split('/').filter(Boolean)
        if (parts.length < 3) return false   // need /explore/locations/{slug}
        if (seen[href]) return false
        seen[href] = true
        return true
      })
  }) as string[]
  return urls
}

/** Try to click a Staff / Instructors tab on a studio detail page. */
async function clickStaffTab(page: import('playwright').Page): Promise<boolean> {
  const staffSelectors = [
    'button:has-text("Staff")',
    'a:has-text("Staff")',
    'button:has-text("Instructors")',
    'a:has-text("Instructors")',
    'button:has-text("Trainers")',
    'a:has-text("Trainers")',
    '[role="tab"]:has-text("Staff")',
    '[role="tab"]:has-text("Instructors")',
    '[data-qa*="staff"]',
    '[class*="staff-tab"], [class*="StaffTab"]',
  ]
  for (const sel of staffSelectors) {
    try {
      const el = page.locator(sel).first()
      if (await el.isVisible({ timeout: 2000 })) {
        await el.click()
        await sleep(2000)
        return true
      }
    } catch { /* try next */ }
  }
  return false
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function scrapeInstructorsFromMindBody(
  zipcode:         string,
  classTypeFilter: string | undefined,
  onProgress:      (msg: string) => void
): Promise<ScrapedInstructor[]> {
  const browser = await chromium.launch({ headless: true })
  const results: ScrapedInstructor[] = []

  try {
    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 900 },
      locale: 'en-US',
    })
    const page = await context.newPage()

    // ── Step 1: land on MindBody explore with zipcode ─────────────────────────
    onProgress(`Navigating to MindBody Explore for ${zipcode}…`)

    let studioUrls: string[] = []

    // Try direct URL with location query param first (faster, no search interaction)
    const directUrl = `https://www.mindbodyonline.com/explore?location=${encodeURIComponent(zipcode)}`
    try {
      await page.goto(directUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 })
      await sleep(3000)
      await dismissBanners(page)
      studioUrls = await collectStudioUrls(page)
    } catch (err: any) {
      onProgress(`Direct URL failed (${err?.message}) — trying search box…`)
    }

    // Fallback: use the search input on the explore page
    if (studioUrls.length === 0) {
      try {
        await page.goto('https://www.mindbodyonline.com/explore', {
          waitUntil: 'domcontentloaded',
          timeout: 30_000,
        })
        await sleep(2000)
        await dismissBanners(page)

        // Locate the location search input
        const inputSel =
          'input[placeholder*="location" i], input[placeholder*="zip" i], ' +
          'input[placeholder*="city" i], input[name*="location" i], ' +
          'input[aria-label*="location" i], input[type="search"]'
        const locationInput = await page.waitForSelector(inputSel, { timeout: 10_000 })
        if (locationInput) {
          await locationInput.fill(zipcode)
          await sleep(1200)
          // Accept first autocomplete suggestion if visible
          try {
            const suggestion = page.locator('[role="listbox"] [role="option"], [class*="suggestion"], [class*="Suggestion"]').first()
            if (await suggestion.isVisible({ timeout: 2000 })) {
              await suggestion.click()
            } else {
              await locationInput.press('Enter')
            }
          } catch {
            await locationInput.press('Enter')
          }
          await sleep(3500)
          await dismissBanners(page)
          studioUrls = await collectStudioUrls(page)
        }
      } catch (err: any) {
        onProgress(`Search box approach also failed: ${err?.message}`)
      }
    }

    if (studioUrls.length === 0) {
      onProgress('No /explore/locations/ studio URLs found — aborting.')
      await context.close()
      return results
    }

    studioUrls = studioUrls.slice(0, 20)
    onProgress(`Found ${studioUrls.length} studio pages: ${studioUrls.slice(0, 3).join(', ')}…`)

    // ── Step 2: visit each studio page and extract instructors ────────────────
    for (const studioUrl of studioUrls) {
      try {
        onProgress(`Visiting studio: ${studioUrl}`)
        await page.goto(studioUrl, { waitUntil: 'domcontentloaded', timeout: 20_000 })
        await sleep(2000)
        await dismissBanners(page)

        // Grab studio name from page title (before the first |)
        const studioName = await page
          .title()
          .then((t) => t.split('|')[0].trim())
          .catch(() => studioUrl.split('/').pop() ?? studioUrl)

        // Click Staff/Instructors tab if present
        const tabClicked = await clickStaffTab(page)
        if (tabClicked) onProgress(`  ↳ clicked Staff tab on ${studioName}`)

        // Run the eval to extract instructor cards
        type RawInstructor = {
          fullName: string; bio: string; photoUrl: string
          instagramHandle: string | null; email: string | null
          linkedinUrl: string | null; classTypes: string[]
        }
        const rawList = (await page.evaluate(INSTRUCTOR_EVAL)) as RawInstructor[]

        onProgress(`  ↳ found ${rawList.length} instructors at ${studioName}`)

        for (const raw of rawList) {
          // Apply class-type filter if requested
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
            fullName:        raw.fullName,
            bio:             raw.bio,
            photoUrl:        raw.photoUrl,
            instagramHandle: raw.instagramHandle,
            email:           raw.email,
            linkedinUrl:     raw.linkedinUrl,
            classTypes:      raw.classTypes,
            studioName,
            studioUrl,
            workZipcode:     zipcode,
          })
        }
      } catch (err: any) {
        onProgress(`  ↳ error at ${studioUrl}: ${err?.message ?? String(err)}`)
        // Continue to next studio
      }
    }

    // ── Step 3: enrich via public Instagram profile meta descriptions ─────────
    for (const instructor of results) {
      if (!instructor.instagramHandle || instructor.bio) continue
      try {
        onProgress(`Enriching IG @${instructor.instagramHandle}…`)
        await page.goto(
          `https://www.instagram.com/${instructor.instagramHandle}/`,
          { waitUntil: 'domcontentloaded', timeout: 10_000 }
        )
        await sleep(1000)
        const igBio = await page.evaluate(() => {
          const m = document.querySelector('meta[name="description"]')
          return m ? (m as HTMLMetaElement).content : ''
        }) as string
        if (igBio) instructor.bio = igBio
      } catch { /* ignore IG errors */ }
    }

    await context.close()
  } finally {
    await browser.close()
  }

  onProgress(`Scrape complete — ${results.length} instructors total.`)
  return results
}
