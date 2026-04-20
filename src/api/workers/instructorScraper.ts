import { chromium } from 'playwright'

export interface ScrapedInstructor {
  fullName:        string
  profileSlug:     string | null  // raw URL slug e.g. "margaret-bb299aff" — used as dedupKey
  bio:             string
  photoUrl:        string
  instagramHandle: string | null
  email:           string | null
  phone:           string | null
  linkedinUrl:     string | null
  classTypes:      string[]
  hometown:        string | null
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
    var phone = null;
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

    // Phone number from text (US formats)
    // Note: double backslashes required — this string is eval'd in the browser
    var phoneMatch = allText.match(/(?:\\+?1[\\s\\-.]?)?\\(?([2-9]\\d{2})\\)?[\\s\\-.]?(\\d{3})[\\s\\-.]?(\\d{4})/);
    if (phoneMatch) phone = phoneMatch[0].trim();
    // Also check tel: links
    var telLink = Array.from(card.querySelectorAll('a[href^="tel:"]'))[0];
    if (telLink) phone = telLink.href.replace('tel:', '').trim();

    // Class type pills / tags
    var tagEls = Array.from(card.querySelectorAll(
      '[class*="tag"],[class*="Tag"],[class*="pill"],[class*="Pill"],[class*="chip"],[class*="Chip"],' +
      '[class*="service"],[class*="Service"],[class*="class-type"],[class*="specialty"],[class*="Specialty"]'
    ));
    tagEls.forEach(function(el) {
      var t = el.textContent.trim();
      if (t && t.length > 0 && t.length < 50) classTypes.push(t);
    });

    return { name: name, bio: bio, photo: photo, instagram: instagram, email: email, phone: phone, linkedin: linkedin, classTypes: classTypes };
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
      phone:           d.phone,
      linkedinUrl:     d.linkedin,
      classTypes:      d.classTypes,
    });
  });

  return results;
})()`

// ── Instructor profile-page eval ─────────────────────────────────────────────
// Runs on an individual MindBody instructor profile page, e.g.
// https://www.mindbodyonline.com/explore/fitness/instructors/{slug}
// Called AFTER expandBio() has already clicked any "Show more" button so the
// full bio text is in the DOM before this runs.
const INSTRUCTOR_PROFILE_EVAL = `(function() {

  // ── Helpers ──────────────────────────────────────────────────────────────
  function text(el) { return el ? (el.innerText || el.textContent || '').trim() : ''; }

  // Walk labelled-field pairs: <dt>Label</dt><dd>Value</dd>  or
  // <span class="label">...</span><span class="value">...</span>
  function findLabelledValue(labelRe) {
    // dl / dt-dd pattern
    var dts = Array.from(document.querySelectorAll('dt,th,[class*="label"],[class*="Label"],[class*="key"],[class*="Key"]'));
    for (var i = 0; i < dts.length; i++) {
      if (labelRe.test(text(dts[i]))) {
        var val = dts[i].nextElementSibling;
        if (val) return text(val);
        // sibling inside same parent
        var p = dts[i].parentElement;
        if (p) {
          var kids = Array.from(p.children);
          var idx = kids.indexOf(dts[i]);
          if (kids[idx + 1]) return text(kids[idx + 1]);
        }
      }
    }
    return null;
  }

  // ── Name ─────────────────────────────────────────────────────────────────
  // Primary source: URL slug.
  // MindBody profile URLs end with "{first}-{optional-last}-{8hexchars}", e.g.
  //   /explore/fitness/instructors/margaret-bb299aff
  //   /explore/fitness/instructors/roxy-58b6a3b9
  // Strip the trailing hex suffix, then title-case the remaining words.
  var urlSlug = (window.location.pathname.split('/').filter(Boolean).pop() || '');

  // A pure-hex slug (e.g. "8ce8ca0b") has no human name — fall through to DOM.
  var isHexOnly = /^[a-f0-9\-]+$/.test(urlSlug);

  var name = isHexOnly ? '' : urlSlug
    .replace(/-[a-f0-9]{6,10}$/, '')          // remove trailing hex ID
    .replace(/-/g, ' ')                         // hyphens → spaces
    .replace(/\\b\\w/g, function(c) { return c.toUpperCase(); }); // title-case

  // DOM fallback — look for MindBody-specific instructor name element,
  // then <h1> (on profile pages this IS the person's name), then h2/h3.
  if (!name) {
    var nameEl =
      document.querySelector('[class*="instructorName"],[class*="InstructorName"],[class*="instructor-name"]')
      || document.querySelector('h1')
      || document.querySelector('h2')
      || document.querySelector('h3');
    if (nameEl) {
      var rawDomName = text(nameEl);
      // Skip generic page-level headings
      var skipPhrases = ['explore', 'mindbody', 'wellness', 'fitness', 'studio', 'class', 'find'];
      var isGeneric = skipPhrases.some(function(p) { return rawDomName.toLowerCase().includes(p); });
      if (!isGeneric && rawDomName.length > 1 && rawDomName.length < 60) name = rawDomName;
    }
  }

  // ── Bio — grab instructor bio text, excluding cookie banners and footer ───
  var bio = '';
  // MindBody-specific bio containers (hashed CSS module classes start with known prefixes)
  var bioEl = document.querySelector(
    '[class*="InstructorBio"],[class*="instructorBio"],' +
    '[class*="instructor-bio"],[class*="InstructorAbout"],[class*="instructorAbout"]'
  );
  // Broader fallback, but only if the container does NOT contain cookie/privacy text
  if (!bioEl) {
    var candidates = Array.from(document.querySelectorAll(
      '[class*="bio"],[class*="Bio"],[class*="about"],[class*="About"],' +
      '[class*="description"],[class*="Description"],[class*="intro"],[class*="Intro"],' +
      '[class*="summary"],[class*="Summary"]'
    ));
    for (var ci = 0; ci < candidates.length; ci++) {
      var ct = text(candidates[ci]);
      if (ct.length > 20 && !ct.includes('cookie') && !ct.includes('Cookie') && !ct.includes('Privacy')) {
        bioEl = candidates[ci]; break;
      }
    }
  }
  if (bioEl) {
    bio = text(bioEl);
    // If the selected element still has cookie/privacy boilerplate, clear it
    if (bio.includes('This site uses cookies') || bio.includes('Cookie Preferences') || bio.includes('Your Privacy Choices')) {
      bio = '';
    }
  }
  // If no explicit bio element, skip the page-longest-p fallback — it often picks
  // up cookie banners or footer text for instructors that simply have no bio.

  // ── Photo ─────────────────────────────────────────────────────────────────
  // MindBody profile pages use class "InstructorAvatar_img__*" on the instructor's photo.
  var photo = '';
  var imgEl = document.querySelector(
    'img[class*="InstructorAvatar"],img[class*="instructorAvatar"],' +
    'img[class*="photo"],img[class*="Photo"],img[class*="avatar"],img[class*="Avatar"],' +
    '[class*="photo"] img,[class*="Photo"] img,[class*="avatar"] img,[class*="Avatar"] img,' +
    '[class*="profile-image"] img,[class*="profileImage"] img,[class*="instructor"] img'
  ) || document.querySelector('img');
  if (imgEl) {
    photo = imgEl.src || imgEl.getAttribute('data-src') || imgEl.getAttribute('data-lazy') || '';
    if (photo && (photo.includes('icon') || photo.includes('placeholder') || photo.includes('logo') || photo.includes('default') || photo.includes('svg'))) photo = '';
  }

  // ── All page text (used by multiple extractors) ───────────────────────────
  var allText = document.body ? (document.body.innerText || document.body.textContent || '') : '';
  var links   = Array.from(document.querySelectorAll('a[href]'));

  // ── Instagram ─────────────────────────────────────────────────────────────
  // Brand/platform handles that appear in every MindBody page footer — skip them.
  var igBrandHandles = ['mindbody','mindbodyonline','mindbodyapp','mindbodyinc'];
  var instagram = null;

  // 1st priority: @mention inside the bio container (most specific to this person)
  if (bioEl) {
    var bioText = text(bioEl);
    var bioIgMatch = bioText.match(/@([A-Za-z0-9_.]{2,30})/);
    if (bioIgMatch && !igBrandHandles.includes(bioIgMatch[1].toLowerCase())) {
      instagram = bioIgMatch[1];
    }
  }
  // 2nd priority: explicit instagram.com href — but skip brand handles
  if (!instagram) {
    links.forEach(function(a) {
      var href = a.href || '';
      if (href.includes('instagram.com/')) {
        var m = href.match(/instagram\\.com\\/([A-Za-z0-9_.]+)\\/?/);
        if (m && m[1]
            && !['p','explore','reel','stories','tv'].includes(m[1])
            && !igBrandHandles.includes(m[1].toLowerCase())) {
          instagram = m[1];
        }
      }
    });
  }
  // 3rd priority: @mention anywhere in page text (still skip brand handles)
  if (!instagram) {
    var igTextMatch = allText.match(/@([A-Za-z0-9_.]{2,30})/);
    if (igTextMatch && !igBrandHandles.includes(igTextMatch[1].toLowerCase())) {
      instagram = igTextMatch[1];
    }
  }
  // 4th priority: labelled field
  if (!instagram) {
    var igLabel = findLabelledValue(/instagram/i);
    if (igLabel) instagram = igLabel.replace(/^@/, '').trim();
  }

  // ── LinkedIn ──────────────────────────────────────────────────────────────
  var linkedin = null;
  links.forEach(function(a) {
    if ((a.href || '').includes('linkedin.com/in/')) linkedin = a.href.split('?')[0];
  });

  // ── Email ─────────────────────────────────────────────────────────────────
  var email = null;
  var emailMatch = allText.match(/[a-zA-Z0-9._%+\\-]+@[a-zA-Z0-9.\\-]+\\.[a-zA-Z]{2,}/);
  if (emailMatch) email = emailMatch[0];
  var mailtoLink = Array.from(document.querySelectorAll('a[href^="mailto:"]'))[0];
  if (mailtoLink) email = mailtoLink.href.replace('mailto:', '').split('?')[0].trim();

  // ── Phone ─────────────────────────────────────────────────────────────────
  var phone = null;
  var phoneMatch = allText.match(/(?:\\+?1[\\s\\-.]?)?\\(?([2-9]\\d{2})\\)?[\\s\\-.]?(\\d{3})[\\s\\-.]?(\\d{4})/);
  if (phoneMatch) phone = phoneMatch[0].trim();
  var telLink = Array.from(document.querySelectorAll('a[href^="tel:"]'))[0];
  if (telLink) phone = telLink.href.replace('tel:', '').trim();

  // ── Hometown ─────────────────────────────────────────────────────────────
  var hometown = null;
  // Labelled field first (dt/dd, label+value pairs)
  hometown = findLabelledValue(/hometown|home town|city|location|based in|from/i);
  // Text pattern fallbacks
  if (!hometown) {
    var htPatterns = [
      /hometown[:\s]+([A-Za-z][^,\\n.]{1,40})/i,
      /home town[:\s]+([A-Za-z][^,\\n.]{1,40})/i,
      /originally from[:\s]+([A-Za-z][^,\\n.]{1,40})/i,
      /based in[:\s]+([A-Za-z][^,\\n.]{1,40})/i,
      /lives in[:\s]+([A-Za-z][^,\\n.]{1,40})/i,
      /from[:\s]+([A-Z][a-z][^,\\n.]{1,35})/
    ];
    for (var pi = 0; pi < htPatterns.length; pi++) {
      var hm = allText.match(htPatterns[pi]);
      if (hm) { hometown = hm[1].trim(); break; }
    }
  }

  // ── Class types ──────────────────────────────────────────────────────────
  // ONLY match against known discipline names — never grab generic tag/pill/chip
  // elements from the page, which can include promo badges ("3 intro offers" etc.).
  var classTypes = [];
  var ctSeen = {};

  var knownTypes = [
    'Pilates','Reformer Pilates','Mat Pilates','Yoga','Hot Yoga','Power Yoga',
    'Vinyasa','Hatha','Yin Yoga','Restorative Yoga','Ashtanga','Kundalini',
    'Barre','Cycling','Indoor Cycling','Spin','Spinning','HIIT','Strength',
    'Strength Training','Dance','Zumba','Meditation','Boxing','Kickboxing',
    'CrossFit','Stretching','Cardio','Bootcamp','Boot Camp','TRX','Sculpt',
    'Aerial','Trampoline','Rowing','Running','Circuit','Functional Fitness',
    'Core','Flexibility','Mobility','Prenatal','Postnatal','Senior Fitness'
  ];

  // All comparisons are case-insensitive — MindBody renders "PILATES" in all-caps.
  var allTextLower = allText.toLowerCase();

  // Strategy 1: scan the profile hero area that wraps photo → class type → name.
  // This captures the discipline label that appears directly below the photo.
  var heroArea = (imgEl && (
    imgEl.closest('[class*="hero"],[class*="Hero"],[class*="banner"],[class*="Banner"]') ||
    imgEl.closest('[class*="profile"],[class*="Profile"],[class*="instructor"],[class*="Instructor"]') ||
    (imgEl.parentElement && imgEl.parentElement.parentElement)
  )) || null;
  var heroTextLower = heroArea ? text(heroArea).toLowerCase() : '';
  if (heroTextLower) {
    knownTypes.forEach(function(t) {
      if (!ctSeen[t] && heroTextLower.includes(t.toLowerCase())) { ctSeen[t] = true; classTypes.push(t); }
    });
  }

  // Strategy 2: labelled "Classes" / "Services" / "Teaches" section —
  // only accept values that match a known discipline.
  var classSection = findLabelledValue(/classes|services|teaches|specialt/i);
  if (classSection) {
    var classSectionLower = classSection.toLowerCase();
    classSection.split(/[,;\\n]+/).forEach(function(t) {
      t = t.trim();
      var tLower = t.toLowerCase();
      var matched = knownTypes.filter(function(k) { return k.toLowerCase() === tLower; })[0];
      if (matched && !ctSeen[matched]) { ctSeen[matched] = true; classTypes.push(matched); }
    });
  }

  // Strategy 3: full page text scan — fallback when hero area yielded nothing.
  if (classTypes.length === 0) {
    knownTypes.forEach(function(t) {
      if (!ctSeen[t] && allTextLower.includes(t.toLowerCase())) { ctSeen[t] = true; classTypes.push(t); }
    });
  }

  return {
    name: name, slug: urlSlug, bio: bio, photo: photo,
    instagram: instagram, linkedin: linkedin, email: email, phone: phone,
    hometown: hometown, classTypes: classTypes
  };
})()`

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Try to dismiss common cookie/GDPR banners so they don't block content. */
async function dismissBanners(page: import('playwright').Page): Promise<void> {
  // Strategy 1: find the cookie banner CONTAINER first, then click the accept/OK button
  // within it.  This avoids false-positive matches on page buttons (e.g. "Book" contains "ok").
  const bannerContainerSelectors = [
    '[class*="cookie"], [id*="cookie"]',
    '[class*="consent"], [id*="consent"]',
    '[class*="gdpr"], [id*="gdpr"]',
    '[class*="CookieBanner"], [class*="cookieBanner"]',
  ]
  for (const containerSel of bannerContainerSelectors) {
    try {
      const container = page.locator(containerSel).first()
      if (await container.isVisible({ timeout: 1000 })) {
        // Click the first button inside this container
        const btn = container.locator('button').first()
        if (await btn.isVisible({ timeout: 500 })) {
          await btn.click()
          await sleep(500)
          return
        }
      }
    } catch { /* try next */ }
  }

  // Strategy 2: look for the exact cookie consent banner text, then find its OK button.
  // MindBody's banner always contains "This site uses cookies".
  const hasCookieBanner = await page.evaluate(() =>
    (document.body.innerText || '').includes('This site uses cookies')
  ).catch(() => false)

  if (hasCookieBanner) {
    // Find a button with EXACT text "Ok" or "OK" or "Accept" — NOT a substring match
    const exactSelectors = [
      'button:text-is("Ok")',
      'button:text-is("OK")',
      'button:text-is("Accept")',
      'button:text-is("Accept All")',
      'button:text-is("Got it")',
      'button:text-is("Agree")',
    ]
    for (const sel of exactSelectors) {
      try {
        const btn = page.locator(sel).first()
        if (await btn.isVisible({ timeout: 500 })) {
          await btn.click()
          await sleep(500)
          return
        }
      } catch { /* try next */ }
    }
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

/** Collect all unique instructor profile hrefs visible on the current page. */
async function collectInstructorProfileUrls(page: import('playwright').Page): Promise<string[]> {
  return await page.evaluate(() => {
    const seen: Record<string, boolean> = {}
    return Array.from(document.querySelectorAll('a[href]'))
      .map((a) => (a as HTMLAnchorElement).href)
      .filter((href) => {
        // Matches /explore/fitness/instructors/{slug} and similar variants
        if (
          !href.includes('/explore/fitness/instructors/') &&
          !href.includes('/explore/instructors/') &&
          !href.includes('/explore/instructor/')
        ) return false
        // Strip query-string / fragment variants — keep only clean profile URLs
        if (href.includes('?') || href.includes('#')) return false
        // Must have a slug segment after /instructors/
        const path = new URL(href).pathname
        const parts = path.split('/').filter(Boolean)
        if (parts.length < 3) return false
        if (seen[href]) return false
        seen[href] = true
        return true
      })
  }) as string[]
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

/**
 * After the staff section is visible, click any "See All / View All / Load More"
 * buttons repeatedly until no more appear (up to 10 iterations).
 * This ensures MindBody's paginated staff lists are fully expanded.
 */
async function expandAllInstructors(page: import('playwright').Page): Promise<void> {
  const expandSelectors = [
    'button:has-text("See All")',
    'button:has-text("View All")',
    'button:has-text("Show All")',
    'button:has-text("Show all")',
    'button:has-text("See all")',
    'button:has-text("View all")',
    'button:has-text("Load More")',
    'button:has-text("Load more")',
    'button:has-text("Show More")',
    'button:has-text("Show more")',
    'a:has-text("See All")',
    'a:has-text("View All")',
    '[class*="see-all"], [class*="seeAll"], [class*="SeeAll"]',
    '[class*="view-all"], [class*="viewAll"], [class*="ViewAll"]',
    '[class*="load-more"], [class*="loadMore"], [class*="LoadMore"]',
    '[class*="show-more"], [class*="showMore"], [class*="ShowMore"]',
  ]

  for (let attempt = 0; attempt < 10; attempt++) {
    let clicked = false
    for (const sel of expandSelectors) {
      try {
        const btn = page.locator(sel).first()
        if (await btn.isVisible({ timeout: 1500 })) {
          await btn.click()
          await sleep(2000)
          clicked = true
          break
        }
      } catch { /* try next selector */ }
    }
    if (!clicked) break   // no expand button found — all instructors are visible
  }
}

/**
 * On an instructor profile page, click any "Show more / Read more / See more"
 * button that gates the full bio text, then wait briefly for the DOM to settle.
 */
async function expandBio(page: import('playwright').Page): Promise<void> {
  const selectors = [
    'button:has-text("Show more")',
    'button:has-text("Show More")',
    'button:has-text("Read more")',
    'button:has-text("Read More")',
    'button:has-text("See more")',
    'button:has-text("See More")',
    'button:has-text("More")',
    '[class*="show-more"],[class*="showMore"],[class*="ShowMore"]',
    '[class*="read-more"],[class*="readMore"],[class*="ReadMore"]',
    '[class*="see-more"],[class*="seeMore"],[class*="SeeMore"]',
    '[class*="expand"],[class*="Expand"],[class*="toggle"],[class*="Toggle"]',
  ]
  for (const sel of selectors) {
    try {
      const btn = page.locator(sel).first()
      if (await btn.isVisible({ timeout: 1000 })) {
        await btn.click()
        await sleep(600)
        break
      }
    } catch { /* try next */ }
  }
}

// ── Phase 1: URL discovery ────────────────────────────────────────────────────

/**
 * PHASE 1 — Scan MindBody Explore for instructor profile URLs near `zipcode`.
 * Visits the explore page and each studio page, but does NOT visit individual
 * instructor profile pages.  For each profile URL found it calls `onBatch`
 * with minimal records so the caller can persist them immediately.
 *
 * Returns total instructor URLs found.
 */
export async function discoverInstructorUrls(
  zipcode:    string,
  onProgress: (msg: string) => void,
  onBatch:    (instructors: ScrapedInstructor[]) => Promise<void>
): Promise<number> {
  const browser = await chromium.launch({ headless: true })
  let totalFound = 0

  try {
    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 900 },
      locale: 'en-US',
    })
    const page = await context.newPage()

    // ── Step 1: get studio URLs from the explore page ─────────────────────────
    onProgress(`Navigating to MindBody Explore for ${zipcode}…`)
    let studioUrls: string[] = []

    const directUrl = `https://www.mindbodyonline.com/explore?location=${encodeURIComponent(zipcode)}`
    try {
      await page.goto(directUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 })
      await page.waitForFunction(
        () => (document.body.innerText || '').trim().length > 2000,
        { timeout: 15_000 }
      ).catch(() => {})
      await page.waitForFunction(
        () => document.querySelectorAll('a[href*="/explore/locations/"]').length > 0,
        { timeout: 10_000 }
      ).catch(() => {})
      await dismissBanners(page)
      studioUrls = await collectStudioUrls(page)
    } catch (err: any) {
      onProgress(`Direct URL failed (${err?.message})`)
    }

    if (studioUrls.length === 0) {
      onProgress('No studio URLs found — aborting.')
      await context.close()
      return totalFound
    }

    studioUrls = studioUrls.slice(0, 50)
    onProgress(`Found ${studioUrls.length} studio(s). Collecting instructor URLs…`)

    // ── Step 2: visit each studio page and collect instructor profile URLs ─────
    const MAX_PER_STUDIO = 50
    for (const studioUrl of studioUrls) {
      try {
        await page.goto(studioUrl, { waitUntil: 'domcontentloaded', timeout: 20_000 })
        await page.waitForFunction(
          () => (document.body.innerText || '').trim().length > 2000,
          { timeout: 12_000 }
        ).catch(() => {})
        await dismissBanners(page)

        const studioName = await page
          .title()
          .then((t) => t.split('|')[0].trim())
          .catch(() => studioUrl.split('/').pop() ?? studioUrl)

        const tabClicked = await clickStaffTab(page)
        if (tabClicked) onProgress(`  ${studioName}: clicked Staff tab`)

        await page.waitForFunction(
          () => document.querySelectorAll('a[href*="/explore/fitness/instructors/"]').length > 0,
          { timeout: 8_000 }
        ).catch(() => {})

        await expandAllInstructors(page)

        const profileUrls = (await collectInstructorProfileUrls(page)).slice(0, MAX_PER_STUDIO)
        onProgress(`  ${studioName}: ${profileUrls.length} instructor URL(s) found`)

        if (profileUrls.length === 0) continue

        // Build minimal records — one per profile URL, no profile page visit
        const batch: ScrapedInstructor[] = profileUrls.map((profileUrl) => {
          const slug = profileUrl.split('/').filter(Boolean).pop() ?? ''
          const isHexOnly = /^[a-f0-9-]+$/.test(slug)
          const nameFromSlug = isHexOnly ? slug : slug
            .replace(/-[a-f0-9]{6,10}$/, '')
            .replace(/-/g, ' ')
            .replace(/\b\w/g, (c) => c.toUpperCase())

          return {
            fullName:        nameFromSlug || slug,
            profileSlug:     slug,
            bio:             '',
            photoUrl:        '',
            instagramHandle: null,
            email:           null,
            phone:           null,
            linkedinUrl:     null,
            hometown:        null,
            classTypes:      [],
            studioName,
            studioUrl:       profileUrl,  // profile URL stored as studioUrl
            workZipcode:     zipcode,
          }
        })

        await onBatch(batch)
        totalFound += batch.length
        onProgress(`  ${studioName}: saved ${batch.length} records (total: ${totalFound})`)
      } catch (err: any) {
        onProgress(`  Error at ${studioUrl}: ${err?.message ?? String(err)}`)
      }
    }

    await context.close()
  } finally {
    await browser.close()
  }

  onProgress(`Discovery complete — ${totalFound} instructor URLs found.`)
  return totalFound
}

// ── Phase 2: profile detail scrape ───────────────────────────────────────────

/**
 * PHASE 2 — Visit a single MindBody instructor profile URL and scrape full
 * details (name, bio, photo, Instagram, LinkedIn, email, phone, hometown,
 * class types).  Returns null if the page redirects away from the profile.
 */
export async function scrapeInstructorProfile(
  profileUrl:  string,
  onProgress:  (msg: string) => void
): Promise<ScrapedInstructor | null> {
  const browser = await chromium.launch({ headless: true })
  try {
    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 900 },
      locale: 'en-US',
    })
    const page = await context.newPage()

    onProgress(`Visiting ${profileUrl}`)
    await page.goto(profileUrl, { waitUntil: 'domcontentloaded', timeout: 20_000 })

    const landedUrl = page.url()
    const isProfilePage =
      landedUrl.includes('/explore/fitness/instructors/') ||
      landedUrl.includes('/explore/instructors/')
    if (!isProfilePage) {
      onProgress(`  Redirected to ${landedUrl.split('?')[0]} — skipping`)
      await context.close()
      return null
    }

    await page.waitForFunction(
      () => (document.body.innerText || '').trim().length > 1500,
      { timeout: 12_000 }
    ).catch(() => {})

    await dismissBanners(page)
    await expandBio(page)

    type ProfileData = {
      name: string; slug: string; bio: string; photo: string
      instagram: string | null; email: string | null
      phone: string | null; linkedin: string | null
      hometown: string | null; classTypes: string[]
    }
    const data = (await page.evaluate(INSTRUCTOR_PROFILE_EVAL)) as ProfileData
    onProgress(`  Extracted: name="${data.name}" classTypes=[${data.classTypes.join(', ') || 'none'}]`)

    await context.close()

    return {
      fullName:        data.name,
      profileSlug:     data.slug || null,
      bio:             data.bio,
      photoUrl:        data.photo,
      instagramHandle: data.instagram,
      email:           data.email,
      phone:           data.phone,
      linkedinUrl:     data.linkedin,
      hometown:        data.hometown,
      classTypes:      data.classTypes,
      studioName:      '',   // caller fills this in from DB
      studioUrl:       profileUrl,
      workZipcode:     '',   // caller fills this in from DB
    }
  } finally {
    await browser.close()
  }
}
