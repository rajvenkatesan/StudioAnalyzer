# StudioAnalyzer — Product Specification v1

## Original Requirements

> The product will have a database of various studios along with their location, class schedules, pricing etc. so that we can run competitive analysis and pricing information. The product will search studio types mentioned by user to discover all their locations, class schedules and their pricing and create appropriate tables to store all that information. Assume the product will be run locally on desktop first and migrated to cloud later. Needs a prisma type database and accessed via browser based UI. It should also have API based backend. Authentication can be added later.

**Refinements (2026-04-16 — round 1):**
> 1. Discovery is zipcode-driven: user provides a zipcode; search is bounded to that zipcode's geographic area.
> 2. The Dashboard includes an inline Discover panel — given a zipcode and studio name or type, it searches that area and updates the database. The same zipcode/studio combination can be run multiple times over time.
> 3. Tests must validate discovery for known studios — e.g., Solidcore and Core40 near zipcode 94213.

**Refinements (2026-04-16 — round 2):**
> 1. Discovery bounded to the zipcode's own boundary. Deduplicate by googlePlaceId when available.
> 2. One table for recurring weekly schedules (day-of-week + time slot, 1-hour default). Separate ClassUtilization table for spots-available snapshots to enable per-class, per-day, per-week utilization analysis and busy vs. low-demand identification.
> 3. Mindbody / ClassPass API deferred to later revision (low priority).
> 4. Pricing: no history in v1 — upsert all current pricing options per studio on each run. No intro/trial offers.
> 5. Primary user: personal use; UI should be user-friendly from the start.

**Refinements (2026-04-16 — round 3):**
> 1. If spots data is unavailable, record as unavailable and surface clearly in UI (not zero, not skipped).
> 2. Utilization heatmap shows latest run data only (not averaged across runs).
> 3. Pricing normalization: unlimited plans assume 16 classes/month to compute $/class.
> 4. HoursOfOperation is a separate table with 1-hour slots from 4 AM to 11 PM (20 slots/day × 7 days per location).
> 5. Scraping posture: add a configurable crawl delay (default 1–2 sec between page requests) to avoid rate-limiting. robots.txt not enforced in v1 (personal use, low volume). Revisit if product becomes multi-user.
> 6. Mindbody integration: low priority, deferred indefinitely.

---

## 1. Product Overview

StudioAnalyzer is a personal competitive intelligence tool for fitness and wellness studios. A user provides a **zipcode** and a **studio name or type** and the system discovers all matching studios within that zipcode's geographic boundary, then populates the database with their locations, hours of operation, recurring class schedules, real-time class utilization (spots available vs. total), and current pricing options.

The resulting data enables analysis such as:
- Which studios are busiest by day of week or hour?
- Which time slots are underutilized across the market?
- How do pricing structures compare across studios in the same zipcode?
- What are each studio's operating hours and when are they open?

Discovery can be re-run at any time. Studios and locations are upserted (no duplicates); utilization snapshots accumulate over time; pricing and schedules are replaced with the latest observed values.

The initial target deployment is a local desktop environment, with a clear migration path to cloud hosting.

---

## 2. Goals

- Discover all studios of a given name or type within a zipcode boundary.
- Capture structured hours of operation per location (4 AM–11 PM in 1-hour slots).
- Capture recurring weekly class schedules and per-class utilization snapshots for time-slot analysis.
- Capture all current regular pricing options per studio; normalize to $/class for comparison.
- Allow re-runs without creating duplicate studio/location records.
- Show unavailable data clearly in the UI rather than hiding or zeroing it.
- Provide a clean, user-friendly browser UI with Discover on the Dashboard.
- Expose all data and operations through a REST API backend.

---

## 3. Non-Goals (v1)

- User authentication (deferred).
- Mobile or native desktop app — browser UI only.
- Mindbody / ClassPass API integration (deferred, low priority).
- Pricing history / change tracking.
- Intro or trial offer capture.
- Export to CSV/Excel (deferred).
- Scheduled / automatic recurring discovery (always user-triggered in v1).
- International postal codes (US zipcodes only).
- Enforcing robots.txt (personal use, low volume — revisit if multi-user).

---

## 4. Architecture

### 4.1 Deployment (Local-first)

```
Browser UI  ──►  API Backend  ──►  Prisma ORM  ──►  SQLite (local)
                     │
                     └──►  Discovery Worker
                                 ├── Google Places API  (location discovery)
                                 └── Playwright scraper (schedule, utilization, pricing)
                                           └── Crawl delay: 1–2 sec between requests
```

When migrated to cloud:

```
Browser UI  ──►  API Backend  ──►  Prisma ORM  ──►  PostgreSQL (cloud)
                     │
                     └──►  Worker service + BullMQ + Redis
```

### 4.2 Component Summary

| Component | Technology | Notes |
|---|---|---|
| Database ORM | Prisma | Schema-first, migration support |
| Local database | SQLite | Zero-config for desktop |
| Cloud database | PostgreSQL | Same Prisma schema, env-switch |
| API backend | Node.js + Fastify | REST endpoints |
| Browser UI | React + Vite | localhost in desktop mode |
| Location discovery | Google Places API | Nearby search + geocoding |
| Schedule / utilization / pricing | Playwright scraper | Crawls studio websites; 1–2 sec crawl delay |

---

## 5. Data Model

### 5.1 `StudioType`

A category or brand name used as a search query (e.g., "yoga", "solidcore", "pilates").

| Column | Type | Notes |
|---|---|---|
| `id` | Int (PK, autoincrement) | |
| `name` | String | e.g., "Solidcore", "Yoga", "Barre" |
| `slug` | String (unique) | URL-safe identifier |
| `createdAt` | DateTime | |
| `updatedAt` | DateTime | |

### 5.2 `Studio`

A studio brand or chain. One brand may have multiple `Location` records.

**Deduplication key**: `(normalizedBrand, studioTypeId)`

| Column | Type | Notes |
|---|---|---|
| `id` | Int (PK, autoincrement) | |
| `studioTypeId` | Int (FK → StudioType) | |
| `name` | String | Display name |
| `normalizedBrand` | String | Lowercased, stripped for dedup (e.g., `"solidcore"`) |
| `websiteUrl` | String? | |
| `phone` | String? | |
| `createdAt` | DateTime | |
| `updatedAt` | DateTime | |

### 5.3 `Location`

One physical address for a studio. A `Studio` may have many `Location` records.

**Deduplication key**: `googlePlaceId` when available; fallback `(normalizedBrand, addressLine1, postalCode)`.

| Column | Type | Notes |
|---|---|---|
| `id` | Int (PK, autoincrement) | |
| `studioId` | Int (FK → Studio) | |
| `addressLine1` | String | |
| `addressLine2` | String? | |
| `city` | String | |
| `state` | String | |
| `postalCode` | String | Must match search zipcode |
| `country` | String | Default: "US" |
| `latitude` | Float? | |
| `longitude` | Float? | |
| `googlePlaceId` | String? (unique) | Primary dedup key |
| `createdAt` | DateTime | |
| `updatedAt` | DateTime | |

### 5.4 `HoursOfOperation`

Operating hours per location, represented as 1-hour time slots from 4 AM to 11 PM (20 slots/day × 7 days = 140 rows per location). Replaced on each discovery re-run.

| Column | Type | Notes |
|---|---|---|
| `id` | Int (PK, autoincrement) | |
| `locationId` | Int (FK → Location) | |
| `dayOfWeek` | Enum | `MON`, `TUE`, `WED`, `THU`, `FRI`, `SAT`, `SUN` |
| `hour` | Int | 4–23 (4 AM = 4, 11 PM = 23) |
| `isOpen` | Boolean | True if studio is open during this hour slot |
| `createdAt` | DateTime | |
| `updatedAt` | DateTime | |

**Unique constraint**: `(locationId, dayOfWeek, hour)`

**Example rows for a location open Mon 6 AM–8 PM:**
```
locationId=1, MON, hour=4,  isOpen=false
locationId=1, MON, hour=5,  isOpen=false
locationId=1, MON, hour=6,  isOpen=true
...
locationId=1, MON, hour=19, isOpen=true
locationId=1, MON, hour=20, isOpen=false
...
```

This structure enables queries like:
- "Which studios are open before 7 AM on weekdays?"
- "Which studios have Saturday evening hours (after 6 PM)?"
- "What is the total open-hours count per studio per week?"

### 5.5 `ClassSchedule`

Recurring weekly class schedule entries for a location. Each row is one repeating class slot. **1-hour duration assumed** unless scraped data says otherwise. Replaced in full on each re-run.

| Column | Type | Notes |
|---|---|---|
| `id` | Int (PK, autoincrement) | |
| `locationId` | Int (FK → Location) | |
| `discoveryRunId` | Int (FK → DiscoveryRun) | Which run last set this schedule |
| `className` | String | e.g., "45-min Strengthening Pilates" |
| `dayOfWeek` | Enum | `MON`, `TUE`, `WED`, `THU`, `FRI`, `SAT`, `SUN` |
| `startTime` | String | 24h format, e.g., `"07:00"` |
| `durationMinutes` | Int | Default: 60 |
| `instructor` | String? | |
| `totalSpots` | Int? | Maximum class capacity (null if not scraped) |
| `createdAt` | DateTime | |
| `updatedAt` | DateTime | |

### 5.6 `ClassUtilization`

Utilization snapshot for a specific recurring class slot at a specific point in time. **Appended** on each re-run — never replaced — to accumulate history.

**Availability status**: if the studio website does not expose spots data, `dataAvailable` is set to `false` and `spotsAvailable` is `null`. The UI shows "N/A" rather than zero or hiding the row.

| Column | Type | Notes |
|---|---|---|
| `id` | Int (PK, autoincrement) | |
| `classScheduleId` | Int (FK → ClassSchedule) | |
| `locationId` | Int (FK → Location) | Denormalized for query efficiency |
| `discoveryRunId` | Int (FK → DiscoveryRun) | |
| `dayOfWeek` | Enum | Copied from ClassSchedule |
| `startTime` | String | Copied from ClassSchedule |
| `spotsAvailable` | Int? | Null when `dataAvailable = false` |
| `totalSpots` | Int? | Copied from ClassSchedule.totalSpots at snapshot time |
| `dataAvailable` | Boolean | False if website did not expose spots data |
| `observedAt` | DateTime | Timestamp of scrape |

**Derived metrics** (computed at query time):
- `spotsTaken = totalSpots - spotsAvailable` (when `dataAvailable = true`)
- `utilizationRate = spotsTaken / totalSpots` (when both are non-null)

**Heatmap rendering**: uses the latest `DiscoveryRun`'s snapshot rows only (not averaged across runs).

**Enabled analyses:**

| Analysis | Query |
|---|---|
| Classes per day (for a location) | `COUNT(*) GROUP BY locationId, dayOfWeek` on ClassSchedule |
| Classes per week (for a location) | `COUNT(*) GROUP BY locationId` on ClassSchedule |
| Utilization by day of week | `AVG(utilizationRate) GROUP BY dayOfWeek` on latest run's utilization |
| Utilization by hour | `AVG(utilizationRate) GROUP BY startTime` on latest run |
| Busiest slots | ORDER BY `utilizationRate DESC` |
| Low-demand slots | ORDER BY `utilizationRate ASC` |
| Cross-studio comparison | JOIN with Location/Studio, GROUP BY normalizedBrand |

### 5.7 `PricingPlan`

Current pricing options for a studio. **Replaced** on each re-run (no history). Captures all regular membership and class-pack options; excludes intro/trial promos.

Pricing is normalized to $/class for comparison using these assumptions:
- `DROP_IN`: priceAmount / 1
- `CLASS_PACK`: priceAmount / classCount
- `MONTHLY`: priceAmount / 16  *(16 classes/month assumed for unlimited)*
- `ANNUAL`: (priceAmount / 12) / 16  *(annualized then per-class)*

| Column | Type | Notes |
|---|---|---|
| `id` | Int (PK, autoincrement) | |
| `studioId` | Int (FK → Studio) | |
| `locationId` | Int? (FK → Location) | Null = applies to all locations |
| `planName` | String | e.g., "Drop-in", "10-Class Pack", "Monthly Unlimited" |
| `planType` | Enum | `DROP_IN`, `CLASS_PACK`, `MONTHLY`, `ANNUAL` |
| `priceAmount` | Decimal | |
| `currency` | String | Default: "USD" |
| `classCount` | Int? | For class packs |
| `validityDays` | Int? | Expiry window (e.g., 60 days for a 10-pack) |
| `pricePerClass` | Decimal? | Computed and stored at insert time using normalization rules above |
| `notes` | String? | Any caveats scraped from the pricing page |
| `scrapedAt` | DateTime | Timestamp of last observation |
| `createdAt` | DateTime | |
| `updatedAt` | DateTime | |

### 5.8 `DiscoveryRun`

Audit log for every user-triggered discovery job.

| Column | Type | Notes |
|---|---|---|
| `id` | Int (PK, autoincrement) | |
| `searchQuery` | String | Studio name or type entered by user |
| `zipcode` | String | User-provided zipcode |
| `status` | Enum | `PENDING`, `RUNNING`, `COMPLETED`, `FAILED` |
| `studiosFound` | Int? | Distinct studios discovered |
| `locationsFound` | Int? | Distinct locations discovered |
| `newLocations` | Int? | Locations added (not previously in DB) |
| `updatedLocations` | Int? | Locations that existed and were refreshed |
| `errorMessage` | String? | |
| `startedAt` | DateTime | |
| `completedAt` | DateTime? | |

---

## 6. Discovery Behavior on Re-runs

| Data type | Re-run behavior |
|---|---|
| `Studio` | Upserted by `(normalizedBrand, studioTypeId)` — no duplicates |
| `Location` | Upserted by `googlePlaceId` (or address composite key) — `updatedAt` refreshed |
| `HoursOfOperation` | **Replaced** per location (140 rows deleted + re-inserted) |
| `ClassSchedule` | **Replaced** per location — old entries deleted, new ones inserted |
| `ClassUtilization` | **Appended** — new snapshot rows added, accumulating over time |
| `PricingPlan` | **Replaced** per studio — old plans deleted, current plans inserted |
| `DiscoveryRun` | Always a new record |

---

## 7. Discovery Layer

### 7.1 Zipcode Boundary Search

1. **Geocode zipcode** — resolve to centroid lat/lng and bounding box via Google Geocoding API (`components=postal_code:<zip>`).
2. **Derive search radius** — compute half the bounding-box diagonal in meters to use as the Places API search radius.
3. **Google Places Nearby Search** — search using centroid + radius + query string.
4. **Filter by postalCode** — keep only results where the returned place address includes the search zipcode. This ensures only studios actually within the zipcode boundary are stored.

### 7.2 Scraping Posture

- The Playwright scraper adds a **configurable crawl delay** between page requests (default: `SCRAPER_CRAWL_DELAY_MS=1500`). This reduces the risk of rate-limiting or IP blocking by studio websites.
- `robots.txt` is **not enforced** in v1. This is acceptable for personal use at low volume (one studio at a time, infrequent runs). If StudioAnalyzer ever becomes a multi-user or higher-volume product, robots.txt compliance must be revisited.
- The scraper uses a real browser user-agent via Playwright (Chromium) to reduce bot-detection friction on sites using Cloudflare or similar protections.
- If a page fails to load or is blocked, the scraper records the failure in `DiscoveryRun.errorMessage` and continues with the next location.

### 7.3 Discovery Flow

```
User submits { zipcode, query }
    │
    ▼
Geocode zipcode → { lat, lng, boundingBox }
Derive radius from boundingBox diagonal
    │
    ▼
POST /discovery/run → DiscoveryRun created (PENDING)
    │
    ▼  (async worker)
Google Places Nearby Search (lat/lng, radius, query)
    Filter: keep only results where place.postalCode === zipcode
    │
    For each matching place:
    ├── Upsert Studio (normalizedBrand dedup)
    └── Upsert Location (googlePlaceId dedup)
    │
    For each Location.websiteUrl (with crawl delay between each):
    ├── Playwright: scrape hours-of-operation page/section
    │       └── Replace HoursOfOperation rows (20 slots × 7 days)
    ├── Playwright: scrape schedule page
    │       └── Replace ClassSchedule rows
    │           Append ClassUtilization snapshot
    │               (spotsAvailable or dataAvailable=false if not shown)
    └── Playwright: scrape pricing page
            └── Replace PricingPlan rows
                Compute and store pricePerClass for each plan
    │
    ▼
DiscoveryRun → status=COMPLETED, counts filled
```

### 7.4 Known Scraping Targets (for v1 tests)

| Brand | Website | Schedule / utilization | Pricing |
|---|---|---|---|
| Solidcore | solidcore.com | Location schedule page (spots shown per class) | `/pricing` page |
| Core40 | core40.com | Studio detail/schedule page | Studio pricing page |

---

## 8. API Specification

### 8.1 Base URL

```
http://localhost:3001/api/v1        (local)
https://api.studioanalyzer.app/v1  (cloud, future)
```

### 8.2 Endpoints

#### Discovery

| Method | Path | Description |
|---|---|---|
| `POST` | `/discovery/run` | Start a run: `{ zipcode, query }` |
| `GET` | `/discovery/runs` | List all runs (paginated, newest first) |
| `GET` | `/discovery/runs/:id` | Status and counts for one run |

**Request:**
```json
{ "zipcode": "94213", "query": "solidcore" }
```
**Response (immediate — run is async):**
```json
{ "runId": 42, "status": "PENDING" }
```

#### Studios & Locations

| Method | Path | Description |
|---|---|---|
| `GET` | `/studios?zipcode=&query=` | List studios (filterable) |
| `GET` | `/studios/:id` | Studio with locations + current pricing |
| `GET` | `/studios/:id/locations` | Locations for a studio |
| `GET` | `/locations/:id/hours` | Hours of operation (all 140 slots) |
| `GET` | `/locations/:id/schedule` | Current class schedule |
| `GET` | `/locations/:id/utilization` | Latest utilization snapshots |

#### Pricing

| Method | Path | Description |
|---|---|---|
| `GET` | `/studios/:id/pricing` | Current pricing plans (includes `pricePerClass`) |
| `GET` | `/pricing/compare?zipcode=&query=` | Side-by-side pricing for all studios in a market |

#### Analysis

| Method | Path | Description |
|---|---|---|
| `GET` | `/analysis/utilization?zipcode=&query=` | Aggregated utilization by day/hour across studios; latest run only |
| `GET` | `/analysis/busy-slots?locationId=` | Time slots ranked by utilization for one location |
| `GET` | `/analysis/compare?zipcode=&query=` | Full comparison: hours open, class count/day, utilization, pricing |

**Unavailable data in responses**: any field where data could not be scraped is returned as `null` with a sibling `"<field>Available": false` flag. Example:

```json
{
  "spotsAvailable": null,
  "spotsAvailableAvailable": false,
  "utilizationRate": null
}
```

The UI renders "N/A" for these fields, not "0%" or blank.

---

## 9. Browser UI

### 9.1 Dashboard

**Discover Panel** (top, always visible):
- Zipcode input (required)
- Studio name or type input (required)
- "Run Discovery" button
- Inline status: `Pending → Running → Completed` with live counts
- Re-running same inputs is explicitly allowed; each run is a new `DiscoveryRun` record

**Recent Runs table**: last 10 runs — query, zipcode, status, studios found, new/updated locations, duration.

**Summary stats**: total studio types, studios, locations, total runs.

### 9.2 Studios View

Filterable table of all studios: brand, type, location count, latest avg utilization, pricing range, last discovered. Click row → Studio Detail.

### 9.3 Studio Detail View

- **Info**: name, website, phone
- **Locations tab**: list with addresses + map; click location → hours and schedule
- **Hours of operation**: 7-column (day) × 20-row (4 AM–11 PM) grid; open slots highlighted, closed slots dimmed. If hours not scraped, row shows "Hours unavailable."
- **Class Schedule tab**: weekly grid color-coded by utilization rate. Cells with `dataAvailable=false` shown with "N/A" indicator in a neutral color (not colored as 0%).
- **Pricing tab**: table of all current plans with `pricePerClass` column for each; normalization assumptions shown as a footnote ("Unlimited plans assume 16 classes/month").

### 9.4 Comparison View

Side-by-side comparison across all studios for a given zipcode + studio type:

| Panel | Content |
|---|---|
| **Pricing table** | Studios as columns, plan types as rows, price + $/class. N/A where not scraped. |
| **Utilization heatmap** | Day × hour grid per studio (latest run). N/A cells shown in neutral gray. |
| **Hours of operation** | Visual timeline (4 AM–11 PM) per studio per day |
| **Class volume** | Classes per day and classes per week per studio |

### 9.5 Discovery Runs View

Full history: all runs, status, query, zipcode, counts, timestamps, error messages.

### 9.6 UI Stack

| Concern | Technology |
|---|---|
| Framework | React + Vite |
| Server state | TanStack Query (polling for run status) |
| Data grids | TanStack Table |
| Components | shadcn/ui + Tailwind CSS |
| Maps | Leaflet (free, no API key needed) |
| Charts / heatmaps | Recharts or Nivo |

**N/A rendering rule**: any value where `dataAvailable=false` is rendered with the text "N/A" in a muted gray style. It is never rendered as "0", "0%", or left blank.

---

## 10. Testing

### 10.1 Test Strategy

| Layer | Framework | Scope |
|---|---|---|
| Unit | Vitest | Pure functions: geocoding, dedup, normalization, pricing math |
| Integration | Vitest + Prisma (SQLite test DB) | API endpoints, upsert logic, re-run behavior |
| Scraper E2E | Playwright Test | Live scraping of known studio pages |

### 10.2 Integration Tests

All integration tests use a fresh `test.db` reset before each suite.

#### Solidcore discovery (zipcode 94213)

```
POST /discovery/run { zipcode: "94213", query: "solidcore" }

Expect:
  - DiscoveryRun.status === "COMPLETED"
  - ≥1 Studio with normalizedBrand === "solidcore"
  - ≥1 Location with postalCode === "94213", valid lat/lng
  - HoursOfOperation: exactly 140 rows per location (20 slots × 7 days)
    with at least some isOpen=true slots
  - ≥1 ClassSchedule per location with valid dayOfWeek + startTime
  - ≥1 ClassUtilization per ClassSchedule with either
    (spotsAvailable ≥ 0 AND dataAvailable=true)
    OR (dataAvailable=false AND spotsAvailable=null)
  - ≥1 PricingPlan with planType in [DROP_IN, CLASS_PACK, MONTHLY, ANNUAL]
    AND priceAmount > 0
    AND pricePerClass > 0
```

#### Core40 discovery (zipcode 94213)

```
POST /discovery/run { zipcode: "94213", query: "core40" }

Expect:
  - DiscoveryRun.status === "COMPLETED"
  - ≥1 Studio with normalizedBrand === "core40"
  - ≥1 Location with postalCode === "94213"
  - ≥1 ClassSchedule per location
  - ≥1 PricingPlan with priceAmount > 0 AND pricePerClass > 0
```

#### Re-run idempotency (Solidcore, zipcode 94213)

```
Run 1: POST /discovery/run { zipcode: "94213", query: "solidcore" }
Run 2: POST /discovery/run { zipcode: "94213", query: "solidcore" }

After Run 2:
  - 2 DiscoveryRun records (audit trail)
  - Studio count unchanged
  - Location count unchanged
  - HoursOfOperation count unchanged (replaced, not doubled)
  - ClassSchedule count unchanged per location (replaced)
  - ClassUtilization count increased by the per-class count (new snapshot appended)
  - PricingPlan count unchanged per studio (replaced)
```

#### Zipcode boundary enforcement

```
POST /discovery/run { zipcode: "94213", query: "pilates" }

Expect:
  - ALL Location records have postalCode === "94213"
  - No location with a different postalCode stored
```

#### No results for unknown studio

```
POST /discovery/run { zipcode: "94213", query: "nonexistent-studio-xyz" }

Expect:
  - DiscoveryRun.status === "COMPLETED"
  - DiscoveryRun.studiosFound === 0
  - No Studio or Location records created
```

### 10.3 Unit Tests

| Function | Test |
|---|---|
| `geocodeZipcode("94213")` | Returns `{ lat, lng }` within Bay Area bounds |
| `deriveBoundaryRadius(boundingBox)` | Returns positive number in meters |
| `normalizeBrandName("SolidCore®")` | Returns `"solidcore"` |
| `buildLocationKey(place)` | Consistent key for same place with minor address variants |
| `parseTimeSlot("7:00 AM")` | Returns `"07:00"` |
| `computePricePerClass({ planType: "DROP_IN", priceAmount: 38 })` | Returns `38` |
| `computePricePerClass({ planType: "CLASS_PACK", priceAmount: 300, classCount: 10 })` | Returns `30` |
| `computePricePerClass({ planType: "MONTHLY", priceAmount: 200 })` | Returns `12.50` (200/16) |
| `computePricePerClass({ planType: "ANNUAL", priceAmount: 1800 })` | Returns `9.38` (1800/12/16) |
| `computeUtilizationRate(3, 12)` | Returns `0.75` |
| `computeUtilizationRate(null, 12)` | Returns `null` (data unavailable) |
| `buildHoursSlots(openTime: "06:00", closeTime: "20:00")` | Returns 20 rows, isOpen=true for hours 6–19 |

### 10.4 Test Configuration

```bash
# .env.test
DATABASE_URL="file:./test.db"
DISCOVERY_FIXTURE=true     # replay recorded API responses (offline-safe)
SCRAPER_CRAWL_DELAY_MS=0   # no delay in tests
```

- Scraper E2E tests tagged `@e2e`, excluded from default `pnpm test`.
- `DISCOVERY_FIXTURE=true` replays recorded Google Places responses — no API quota consumed.
- Fixtures stored in `packages/db/fixtures/`.

---

## 11. Local Desktop Setup

### 11.1 Prerequisites

- Node.js 20+
- pnpm
- Google Places API key (`.env`)

### 11.2 Project Structure

```
StudioAnalyzer/
├── apps/
│   ├── api/
│   │   └── src/
│   │       ├── routes/          # discovery, studios, locations, pricing, analysis
│   │       └── workers/
│   │           ├── geocode.ts
│   │           ├── places.ts
│   │           └── scraper.ts   # Playwright; respects SCRAPER_CRAWL_DELAY_MS
│   └── web/
│       └── src/
│           ├── pages/           # Dashboard, Studios, StudioDetail, Comparison, Runs
│           └── components/
│               ├── DiscoverPanel/
│               ├── HoursGrid/          # 7×20 open/closed slot grid
│               ├── UtilizationHeatmap/ # day×hour heatmap; N/A for unavailable
│               └── PricingCompareTable/
├── packages/
│   └── db/
│       ├── schema.prisma
│       ├── migrations/
│       └── fixtures/            # recorded Places API responses for offline tests
├── docs/
│   └── StudioAnalyzer.Spec.v1.md
├── .env.example
├── pnpm-workspace.yaml
└── package.json
```

### 11.3 Environment Variables

```bash
# .env
GOOGLE_PLACES_API_KEY=your_key_here
DATABASE_URL="file:./dev.db"
PORT=3001
SCRAPER_CRAWL_DELAY_MS=1500    # ms between Playwright page requests
DISCOVERY_FIXTURE=false
```

### 11.4 Commands

```bash
pnpm install
pnpm db:migrate        # prisma migrate dev
pnpm dev               # API on :3001 + UI on :5173
pnpm test              # unit + integration (offline-safe, uses fixtures)
pnpm test:e2e          # live scraper tests (network + API key required)
```

---

## 12. Cloud Migration Path

| Concern | Local | Cloud |
|---|---|---|
| Database | SQLite (`dev.db`) | PostgreSQL (Supabase / Neon) |
| Prisma datasource | `provider = "sqlite"` | `provider = "postgresql"` |
| API hosting | localhost:3001 | Docker on Render / Railway |
| UI hosting | localhost:5173 | Vercel / Netlify |
| Discovery workers | In-process async | BullMQ + Redis worker service |
| Secrets | `.env` file | Hosting provider env vars |

No application code changes required beyond datasource switch and env vars.

---

## 13. Authentication (Deferred)

Out of scope for v1. Recommended v2 approach:
- JWT with refresh tokens, or session-based via Auth.js
- Roles: `admin` (full access), `viewer` (read-only)
- Add before any cloud / multi-user deployment

---

## 14. Resolved Design Decisions

| # | Question | Decision |
|---|---|---|
| 1 | Bot-blocked studio website | Run completes. Location is stored. Schedule/pricing fields marked `dataAvailable=false`. UI shows a warning banner on that location: "Schedule and pricing could not be retrieved." |
| 2 | Comparison View studio selection | Show all studios found in the zipcode, up to a maximum of 50. No manual selection UI needed. |
| 3 | Mindbody / ClassPass API | Deferred, low priority. |

---

## 15. Version History

| Version | Date | Author | Notes |
|---|---|---|---|
| v1 | 2026-04-16 | Raj Venkatesan | Initial spec |
| v1.1 | 2026-04-16 | Raj Venkatesan | Zipcode-driven discovery; Dashboard Discover panel; re-run idempotency; test cases |
| v1.2 | 2026-04-16 | Raj Venkatesan | Zipcode boundary search; ClassUtilization table; pricing as upsert; workflow + UI detail |
| v1.3 | 2026-04-16 | Raj Venkatesan | Unavailable data as N/A; latest-run heatmap; 16 classes/month normalization; HoursOfOperation table (4 AM–11 PM, 1-hr slots); scraping posture documented |
| v1.4 | 2026-04-16 | Raj Venkatesan | Final decisions: bot-blocked → complete with warning; Comparison View shows all studios up to 50. Spec complete. |
