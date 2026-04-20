/**
 * Parses StudioHelper.md to extract per-brand scraping hints.
 *
 * Format example:
 *   ## jetsetpilates
 *   locations_page: https://jetsetpilates.com/locations
 *
 *   ## solidcore
 *   schedule_page: /classes
 *   pricing_page: /pricing
 */

import fs from 'fs'
import path from 'path'

export interface StudioHint {
  /** Full URL of a page listing all studio locations to spider. */
  locationsPage?: string
  /** Path or full URL for the class schedule page. */
  schedulePage?: string
  /** Path or full URL for the pricing/membership page. */
  pricingPage?: string
}

const HINTS_FILE = path.resolve(__dirname, '../../../StudioHelper.md')

/** Normalize a brand name the same way the DB does. */
function normalizeBrand(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9]/g, '')
}

/** Parse StudioHelper.md and return a map keyed by normalized brand name. */
export function loadStudioHints(): Map<string, StudioHint> {
  const map = new Map<string, StudioHint>()

  if (!fs.existsSync(HINTS_FILE)) return map

  const text = fs.readFileSync(HINTS_FILE, 'utf-8')

  // Split on lines starting with "## " — each is a brand section
  const sections = text.split(/^##\s+/m).slice(1)

  for (const section of sections) {
    const lines = section.split('\n')
    const brandRaw = lines[0].trim()
    if (!brandRaw) continue
    const brand = normalizeBrand(brandRaw)
    if (!brand) continue

    const hint: StudioHint = {}

    for (const line of lines.slice(1)) {
      const trimmed = line.trim()
      // Skip blank lines and comments
      if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('>') || trimmed.startsWith('|')) continue

      const colon = trimmed.indexOf(':')
      if (colon === -1) continue

      const key = trimmed.slice(0, colon).trim().toLowerCase()
      const val = trimmed.slice(colon + 1).trim()
      if (!val) continue

      if (key === 'locations_page') hint.locationsPage = val
      else if (key === 'schedule_page') hint.schedulePage = val
      else if (key === 'pricing_page') hint.pricingPage = val
    }

    if (Object.keys(hint).length > 0) {
      map.set(brand, hint)
    }
  }

  return map
}

/** Read the raw StudioHelper.md text (used by the hints API). */
export function readHintsFile(): string {
  if (!fs.existsSync(HINTS_FILE)) return getDefaultContent()
  return fs.readFileSync(HINTS_FILE, 'utf-8')
}

/** Overwrite StudioHelper.md with new content (used by the hints API). */
export function writeHintsFile(content: string): void {
  fs.writeFileSync(HINTS_FILE, content, 'utf-8')
}

function getDefaultContent(): string {
  return `# StudioHelper

Per-studio scraping hints. Add a section for each brand you want to configure.

## yourBrand
schedule_page: /classes
pricing_page: /pricing
`
}
