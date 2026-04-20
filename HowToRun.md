# How to Run StudioAnalyzer

## Prerequisites

| Tool | Version | Install |
|---|---|---|
| Node.js | 20+ | https://nodejs.org or `brew install node` |
| pnpm | 9+ | `npm install -g pnpm` |
| Google Places API key | — | https://console.cloud.google.com → Enable "Places API" and "Geocoding API" |

---

## 1. First-time Setup

```bash
# Clone / enter the project
cd ~/Documents/Raj-GitRepo/StudioAnalyzer

# Install all dependencies
pnpm install

# Copy environment file and fill in your API key
cp .env.example .env
```

Edit `.env`:
```
GOOGLE_PLACES_API_KEY=your_actual_key_here
DATABASE_URL="file:./dev.db"
PORT=3001
SCRAPER_CRAWL_DELAY_MS=1500
DISCOVERY_FIXTURE=false
```

```bash
# Run Prisma migrations to create the database schema
pnpm db:migrate
```

Prisma will prompt for a migration name — type anything (e.g. `init`) and press Enter.

---

## 2. Running the Backend (API)

```bash
pnpm dev:api
```

The API starts at **http://localhost:3001**.

Verify it's running:
```bash
curl http://localhost:3001/health
# → {"ok":true}
```

---

## 3. Running the Frontend (UI)

Open a second terminal:

```bash
pnpm dev:web
```

The UI opens at **http://localhost:5173**.

> The Vite dev server proxies `/api/*` requests to the API at port 3001, so both must be running.

---

## 4. Running Both Together

```bash
pnpm dev
```

This starts the API and UI concurrently in one terminal using `concurrently`.

---

## 5. Typical First-use Workflow

1. Open **http://localhost:5173** in your browser.
2. On the Dashboard, enter a zipcode (e.g. `94123`) and a studio name or type (e.g. `solidcore`).
3. Click **Run Discovery**.
4. Watch the status tracker: `Pending → Running → Completed`.
5. Navigate to **Studios** to see discovered studios, or **Compare** for side-by-side analysis.

---

## 6. Running Tests

### Unit + Integration tests (offline-safe, no API key needed)

```bash
pnpm test
```

These use fixture data (`DISCOVERY_FIXTURE=true`) and a separate `test.db`. No Google API calls are made.

### Live scraper E2E tests (requires network + API key)

```bash
pnpm test:e2e
```

Tests in `tests/e2e/` visit real studio websites (solidcore.com, core40.com). They are slow (~30–60s) and may fail if a website changes its structure.

---

## 7. Database Management

```bash
# Open Prisma Studio (visual DB browser) in your browser
pnpm db:studio

# Apply migrations (after schema changes)
pnpm db:migrate

# Regenerate the Prisma client (after schema changes without a migration)
pnpm db:generate
```

Database files:
- `dev.db` — development database (created by `pnpm db:migrate`)
- `test.db` — test database (created automatically when tests run)

---

## 8. Project Structure Reference

```
StudioAnalyzer/
├── src/
│   ├── api/              # Fastify backend
│   │   ├── index.ts      # Entry point (port 3001)
│   │   ├── server.ts     # Fastify setup + route registration
│   │   ├── lib/
│   │   │   └── prisma.ts # Shared Prisma client
│   │   ├── routes/       # discovery, studios, locations, pricing, analysis
│   │   └── workers/      # geocode, places, scraper, discoveryRunner
│   ├── db/
│   │   └── schema.prisma # Database schema (8 models)
│   ├── shared/
│   │   └── types.ts      # Types shared between API and UI
│   └── web/              # React + Vite frontend (port 5173)
│       ├── index.html
│       ├── vite.config.ts
│       └── src/
│           ├── pages/    # Dashboard, Studios, StudioDetail, Comparison, Runs
│           └── components/ # DiscoverPanel, HoursGrid, UtilizationHeatmap, PricingCompareTable
├── tests/
│   ├── unit/             # Pure function tests (pricing, utilization, normalization)
│   ├── integration/      # API + DB tests using fixtures
│   ├── e2e/              # Live Playwright scraper tests
│   └── fixtures/         # Recorded Places API responses for offline tests
├── HowToRun.md           # This file
├── .env.example
└── package.json
```

---

## 9. Environment Variables Reference

| Variable | Default | Description |
|---|---|---|
| `GOOGLE_PLACES_API_KEY` | — | Required for discovery. Enable Places API + Geocoding API in Google Cloud. |
| `DATABASE_URL` | `file:./dev.db` | SQLite file path. Change to a PostgreSQL URL when migrating to cloud. |
| `PORT` | `3001` | API server port. |
| `SCRAPER_CRAWL_DELAY_MS` | `1500` | Milliseconds between Playwright page requests. Reduce if scraping is slow; increase if getting blocked. |
| `DISCOVERY_FIXTURE` | `false` | Set `true` to replay recorded Places API responses instead of calling Google. Used automatically in tests. |

---

## 10. Troubleshooting

| Problem | Fix |
|---|---|
| `GOOGLE_PLACES_API_KEY is not set` | Add the key to your `.env` file and restart the API. |
| `Cannot find module '@prisma/client'` | Run `pnpm db:generate` then `pnpm db:migrate`. |
| UI shows "Failed to load" errors | Make sure the API is running (`pnpm dev:api`) before opening the UI. |
| Discovery run stays PENDING | Check API logs in the terminal — the worker may have crashed with an error. |
| Scraper returns no data | The studio website may have blocked automated access. The location is still saved; try again later or add a fixture. |
| Port 3001 already in use | Change `PORT` in `.env`, or kill the existing process: `lsof -ti:3001 \| xargs kill`. |
