# StudioAnalyzer — Architecture & Stack

## Overview

StudioAnalyzer is a single-developer research tool that discovers boutique fitness studios,
scrapes their class schedules and pricing, and surfaces competitive intelligence through a
local web UI. The architecture is deliberately minimal: one process for the API, one process
for the web dev server, and a single SQLite file for persistence. Everything runs on a
developer's laptop with a single `pnpm dev` command.

```
┌──────────────────────────────────────────────────────────┐
│  Browser  (localhost:5173)                               │
│  React + Vite SPA                                        │
│  Tabs: Discover · Studios · Pricing · Your Pricing · Hints│
└──────────────┬───────────────────────────────────────────┘
               │  HTTP  /api/v1/*  (proxied by Vite dev server)
               ▼
┌──────────────────────────────────────────────────────────┐
│  Fastify REST API  (localhost:3001)                      │
│  Routes: discovery · studios · locations ·               │
│          pricing · analysis · hints                      │
│                                                          │
│  Workers (in-process, async):                            │
│    discoveryRunner → places → scraper                    │
│    geocode (Google Maps API)                             │
└──────────────┬───────────────────────────────────────────┘
               │  Prisma ORM
               ▼
┌──────────────────────────────────────────────────────────┐
│  SQLite  (dev.db)                                        │
│  StudioType · Studio · Location · ClassSchedule ·        │
│  HoursOfOperation · ClassUtilization · PricingPlan ·     │
│  DiscoveryRun                                            │
└──────────────────────────────────────────────────────────┘

External services (outbound only):
  Google Places API  →  studio discovery by zip code
  Google Maps API    →  geocoding / place enrichment
  Studio websites    →  Playwright headless scraper
```

---

## Technology Stack

### Runtime & Language

| Choice | Alternative considered | Reason chosen |
|---|---|---|
| **TypeScript** (strict) | Plain JavaScript | Shared types between API and frontend catch entire classes of bugs at compile time — especially important when the scraper, API, and UI all pass `PricingPlanRow`/`PricingRecommendationRow` objects across process boundaries. |
| **Node.js 22 / ES2022** | Deno, Bun | Broadest ecosystem compatibility; Playwright, Prisma, and `zipcodes` all have first-class Node support. Deno and Bun were ruled out to avoid ecosystem friction on a solo project. |
| **tsx** (dev) | ts-node, tsc + node | Near-instant TypeScript execution without a compilation step; `tsx watch` gives hot-reload for the API during development. |
| **pnpm** | npm, yarn | Disk-efficient symlinked `node_modules`; faster installs; strict dependency isolation prevents phantom imports. |

### Backend

| Choice | Alternative considered | Reason chosen |
|---|---|---|
| **Fastify 4** | Express, Hono, Elysia | 2–3× lower overhead than Express on raw throughput benchmarks; built-in JSON schema validation; plugin architecture keeps route files self-contained. Express was ruled out for its lack of async-by-default and verbose error handling. Hono/Elysia are excellent but have smaller ecosystems and fewer Prisma integration examples. |
| **Prisma 5** | Drizzle ORM, Knex, raw SQL | Type-safe query builder with auto-generated client; migration history in SQL files; Prisma Studio GUI for ad-hoc inspection. Drizzle has a smaller bundle and faster queries but requires more manual type wiring. For a solo tool where developer ergonomics outweigh micro-benchmarks, Prisma wins. |
| **SQLite** (via `better-sqlite3`) | PostgreSQL, MySQL | Zero-ops: no server process, no connection pool, the DB is a single file next to the code. A research tool with one user and <10k rows has no need for a networked database. SQLite's write serialization is invisible at this scale. Migrating to Postgres later requires only a `schema.prisma` datasource change and a data export. |
| **Playwright** | Puppeteer, Cheerio + axios | First-party browser automation with a stable, well-maintained API. Handles JavaScript-heavy studio booking pages that Cheerio cannot parse. Supports `chromium` in headless mode with minimal overhead. Puppeteer was considered but Playwright's multi-browser support and better TypeScript types tipped the balance. |
| **Google Places API** | Yelp API, manual URL entry | Returns structured studio data (name, address, website, phone) with a single API call; coverage across the US is comprehensive for boutique fitness. The free tier (≈$200/month credit) comfortably covers research-scale queries. Yelp's fitness category data is less reliable for niche studios. |

### Frontend

| Choice | Alternative considered | Reason chosen |
|---|---|---|
| **React 18** | Svelte, Vue, plain HTML | Largest ecosystem; TanStack Query and TanStack Table are both React-native and save significant boilerplate. For a solo project with complex, nested state (studio list → location detail → schedule + utilization), React's composability is valuable. |
| **Vite 5** | Create React App, Next.js, Parcel | Sub-second HMR; native ESM in development; minimal config. CRA is deprecated. Next.js adds SSR/routing infrastructure that a local-only tool does not need. Vite also proxies `/api` to the Fastify server, eliminating CORS complexity in development. |
| **Tailwind CSS 3** | CSS Modules, styled-components, MUI | Utility-first approach is fast for prototyping dense data tables and grids without leaving JSX. No runtime style injection. MUI and Chakra were considered but their opinionated component designs conflict with bespoke table layouts. |
| **TanStack Table 8** | react-table v7, AG Grid | Headless; composable sort/filter logic with zero opinion on markup; the same `ColumnDef` structure powers both the Studios list and the Pricing matrix without any component coupling. AG Grid's free tier limits were a concern. |
| **TanStack Query 5** | SWR, Redux Toolkit Query | Declarative data fetching with automatic caching and background refresh; fewer lines than SWR for the multi-query patterns used in `StudioDetail`. |
| **Recharts 2** | Chart.js, Victory, D3 | React-native SVG charts with sensible defaults; works well for the utilization heat-map and pricing range visualization. D3 offers more flexibility but requires significantly more code for standard chart types. |
| **react-leaflet + Leaflet** | Google Maps React, Mapbox GL | Open-source tile rendering with no API key required for basic display; sufficient for plotting studio locations on a city-level map. |

### Testing

| Choice | Alternative considered | Reason chosen |
|---|---|---|
| **Vitest** | Jest | Native ESM support; shares the same Vite config as the frontend; watch mode is fast. Jest requires `ts-jest` or Babel transform and has rougher ESM support. |
| **Playwright Test** (e2e) | Cypress | Same browser engine already used by the scraper; shares fixture infrastructure. Cypress has a friendlier UI but is slower and requires a separate install. |

---

## Key Architectural Decisions

### Shared types via path alias

`src/shared/types.ts` is imported by both `src/api/**` (CommonJS, compiled to Node) and
`src/web/**` (ESM, bundled by Vite) through the `@shared` alias. A single source of truth
for `PricingPlanRow`, `PricingRecommendationResponse`, etc. means the compiler catches
API/UI mismatches before runtime.

### In-process background worker

Discovery jobs run as `async` functions inside the same Node process as the Fastify server,
tracked via `DiscoveryRun` rows in SQLite. This avoids the operational overhead of a message
queue (Redis/BullMQ) for a tool with one concurrent user. The trade-off is that a long-
running scrape blocks graceful shutdown; acceptable at this scale.

### COL index as a static lookup table

Cost-of-living normalisation uses a hand-curated table of ~80 cities and all 50 US state
abbreviations (`src/api/lib/colIndex.ts`). This was chosen over a live API (BLS, Numbeo)
to keep the tool fully offline-capable after an initial data load, with no API keys or rate
limits for the recommendation engine. The table can be updated periodically as a source-
code change.

### Scraper string-literal eval pattern

Playwright page evaluations that run inside the browser context are stored as raw string
literals (`SCHEDULE_EVAL`, `PRICING_EVAL`) rather than inlined arrow functions. This
prevents esbuild/tsx from renaming variables during compilation — a subtle bug where
`__name(fn, "classifyType")` wrapping broke in-browser `eval`. The trade-off is losing
IDE refactor support inside those strings.

### No authentication

The tool is intentionally localhost-only. Fastify's CORS policy rejects any origin that is
not `localhost:*`. Adding authentication (JWT, sessions) would add operational complexity
with no security benefit for a single-developer local tool.

---

## Data Flow: Discovery → Storage → UI

```
User enters zip + query
        │
        ▼
POST /api/v1/discovery/run
        │
        ├─► Google Places API  →  list of studios (name, website, address)
        │
        ├─► For each studio:
        │     geocode.ts        →  lat/lng, city, state
        │     scraper.ts        →  hours, schedule, utilization, pricing
        │         │
        │         ├── Spider mode (brand-root URLs only, pathDepth = 0)
        │         │     visits /locations listing, scrapes each sub-page
        │         └── Single-page mode (location-specific URLs, pathDepth ≥ 1)
        │
        └─► Prisma upsert → SQLite
              Studio / Location / ClassSchedule / PricingPlan / DiscoveryRun

GET /api/v1/pricing/recommendations?zipcode=XXXXX
        │
        ├─► zipcodes npm package → city + state for target zip
        ├─► getCOLIndex()        → target COL index
        ├─► All PricingPlans from DB, grouped by tier
        ├─► Each plan normalised: price × (100 / sourceCOL)
        ├─► P25 / median / P75 computed on normalised values
        └─► Scaled back: recommended = median × (targetCOL / 100), rounded to $5
```

---

## Local Development Setup

```bash
# Prerequisites: Node 22+, pnpm 9+
pnpm install

# Environment
cp .env.example .env
# Fill in GOOGLE_PLACES_API_KEY and GOOGLE_MAPS_API_KEY

# Database
pnpm db:migrate          # creates dev.db and runs migrations

# Start API + web in parallel
pnpm dev                 # API on :3001, UI on :5173

# Tests
pnpm test                # Vitest unit + integration
pnpm test:e2e            # Playwright e2e
```

---

## Upgrade Paths

| Current choice | When to reconsider | Migration path |
|---|---|---|
| SQLite | Multi-user deployment or >1M rows | Change `datasource` in `schema.prisma` to `postgresql`; run `prisma migrate` |
| In-process worker | Concurrent multi-user or long-running jobs | Drop in BullMQ + Redis; keep the same worker function signatures |
| Static COL table | Need finer zip-level granularity | Replace `getCOLIndex()` with a BLS or HUD API call; cache results in SQLite |
| Playwright scraper | Studios block headless browsers | Add stealth plugin (`playwright-extra`) or switch specific studios to an API-based source |
