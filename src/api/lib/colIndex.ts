/**
 * Cost of Living (COL) index lookup.
 * US national average = 100. Higher = more expensive.
 *
 * Values are approximate, based on ACCRA/COLI composite data and
 * publicly available metro cost-of-living surveys.
 *
 * Lookup priority: city name → state abbreviation → 100 (national avg).
 */

// ── City-level index ──────────────────────────────────────────────────────────
// Keys are lowercase. Order matters only when two keys could prefix-match.

const CITY_COL: Record<string, number> = {
  // ── New York ──────────────────────────────────────────────────────────────
  'manhattan':           235,
  'new york':            200,  // outer boroughs / generic "NYC"
  'brooklyn':            178,
  'queens':              150,
  'bronx':               135,
  'hoboken':             160,
  'jersey city':         150,
  'latham':              108,  // Albany NY suburb

  // ── New Jersey ────────────────────────────────────────────────────────────
  'verona':              130,  // Essex County
  'montclair':           132,
  'florham park':        132,
  'morristown':          128,
  'princeton':           145,
  'short hills':         148,
  'summit':              145,
  'westfield':           138,

  // ── Connecticut ───────────────────────────────────────────────────────────
  'darien':              168,
  'greenwich':           192,
  'stamford':            158,
  'westport':            178,
  'fairfield':           148,
  'new canaan':          175,

  // ── Massachusetts ─────────────────────────────────────────────────────────
  'boston':              162,
  'cambridge':           172,
  'wellesley':           156,
  'newton':              148,
  'brookline':           155,
  'lexington':           148,

  // ── DC Metro ──────────────────────────────────────────────────────────────
  'washington':          161,
  'arlington':           158,
  'mclean':              168,
  'bethesda':            162,
  'chevy chase':         165,

  // ── California ────────────────────────────────────────────────────────────
  'san francisco':       186,
  'san jose':            172,
  'santa clara':         168,
  'los angeles':         173,
  'santa monica':        198,
  'beverly hills':       210,
  'pasadena':            155,
  'san diego':           152,
  'la jolla':            165,
  'irvine':              155,
  'newport beach':       175,
  'palo alto':           220,
  'menlo park':          200,
  'mountain view':       185,

  // ── Seattle / Pacific NW ──────────────────────────────────────────────────
  'seattle':             150,
  'bellevue':            158,
  'kirkland':            148,
  'portland':            128,

  // ── Colorado ──────────────────────────────────────────────────────────────
  'denver':              120,
  'boulder':             132,
  'cherry creek':        125,

  // ── Texas ─────────────────────────────────────────────────────────────────
  'austin':              118,
  'dallas':              103,
  'houston':              95,
  'league city':          98,
  'mckinney':            103,
  'heath':               108,
  'missouri city':        95,
  'flower mound':        108,
  'fort worth':           98,
  'plano':               106,
  'frisco':              110,

  // ── Florida ───────────────────────────────────────────────────────────────
  'miami':               124,
  'miami beach':         132,
  'aventura':            125,
  'brickell':            128,  // Miami neighborhood
  'coral gables':        130,
  'coral springs':       112,
  'boca raton':          118,
  'fort lauderdale':     112,
  'west palm beach':     114,
  'palm beach gardens':  116,
  'palm beach':          138,
  'weston':              115,
  'estero':              108,
  'naples':              122,
  'tallahassee':          97,
  'jacksonville':        100,
  'jacksonville beach':  103,
  'tampa':               105,
  'orlando':             102,
  'winter park':         108,
  'clearwater':          105,
  'sarasota':            112,

  // ── Georgia ───────────────────────────────────────────────────────────────
  'atlanta':             108,
  'alpharetta':          110,
  'buckhead':            115,
  'sandy springs':       112,

  // ── North Carolina ────────────────────────────────────────────────────────
  'raleigh':             105,
  'charlotte':           100,
  'chapel hill':         108,
  'durham':              103,
  'cary':                105,
  'huntersville':         98,
  'holly springs':       100,

  // ── Tennessee ─────────────────────────────────────────────────────────────
  'nashville':           103,
  'brentwood':           108,

  // ── Illinois ──────────────────────────────────────────────────────────────
  'chicago':             108,
  'naperville':          112,
  'northbrook':          115,
  'evanston':            118,
  'edwardsville':         88,

  // ── Missouri ──────────────────────────────────────────────────────────────
  'st. louis':            88,
  'saint louis':          88,
  'creve coeur':          95,
  'clayton':             100,

  // ── South Carolina ────────────────────────────────────────────────────────
  'greenville':           92,
  'charleston':          105,
  'columbia':             90,

  // ── Utah ──────────────────────────────────────────────────────────────────
  'salt lake city':      103,
  'park city':           130,

  // ── Pennsylvania ──────────────────────────────────────────────────────────
  'philadelphia':        120,
  'pittsburgh':           90,

  // ── Maryland ──────────────────────────────────────────────────────────────
  'baltimore':           110,
  'annapolis':           120,

  // ── Minnesota ─────────────────────────────────────────────────────────────
  'minneapolis':         102,
  'edina':               112,

  // ── Ohio ──────────────────────────────────────────────────────────────────
  'columbus':             90,
  'cleveland':            88,
  'cincinnati':           90,

  // ── Michigan ──────────────────────────────────────────────────────────────
  'detroit':              82,
  'ann arbor':           105,

  // ── Arizona ───────────────────────────────────────────────────────────────
  'phoenix':             105,
  'scottsdale':          115,
  'tempe':               102,
}

// ── State-level fallback ──────────────────────────────────────────────────────
const STATE_COL: Record<string, number> = {
  AK: 132, AL:  85, AR:  85, AZ: 105, CA: 155, CO: 118, CT: 140, DC: 161,
  DE: 110, FL: 108, GA: 100, HI: 192, IA:  90, ID: 103, IL: 108, IN:  88,
  KS:  88, KY:  88, LA:  92, MA: 145, MD: 130, ME: 115, MI:  90, MN: 102,
  MO:  90, MS:  82, MT: 100, NC:  98, ND:  95, NE:  90, NH: 125, NJ: 125,
  NM:  92, NV: 105, NY: 140, OH:  90, OK:  88, OR: 130, PA: 105, RI: 130,
  SC:  92, SD:  92, TN:  95, TX:  95, UT: 103, VA: 115, VT: 120, WA: 130,
  WI:  95, WV:  82, WY:  95,
}

/**
 * Return the COL index for a given city + state.
 * Falls back: exact city → partial city → state → 100 (national average).
 */
export function getCOLIndex(city: string | null, state: string | null): number {
  if (city) {
    const key = city.toLowerCase().trim()

    // Exact match
    if (CITY_COL[key] !== undefined) return CITY_COL[key]

    // Partial: check if any known city key is a prefix of (or contained in) the lookup key
    for (const [k, v] of Object.entries(CITY_COL)) {
      if (key === k || key.startsWith(k + ' ') || key.includes(k)) return v
    }
  }

  if (state) {
    const s = state.trim().toUpperCase()
    if (STATE_COL[s] !== undefined) return STATE_COL[s]
  }

  return 100 // national average
}

export function colDescription(col: number): string {
  const diff = col - 100
  if (Math.abs(diff) < 3) return 'at the US average'
  const pct = Math.abs(diff)
  return diff > 0 ? `${pct}% above the US average` : `${pct}% below the US average`
}
