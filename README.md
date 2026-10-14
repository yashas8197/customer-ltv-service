# Customer LTV Service

A backend service that loads e-commerce purchase events for five brands into Postgres, calculates customer lifetime value per acquisition cohort, and returns it as a retention cohort table.

Built with Express 5, TypeScript, Prisma and Postgres.

Video walkthrough: https://www.loom.com/share/6658ed7b4d86480aba062ba53b1d5192

## Setup

You need Node.js 20+ and a Postgres database (a free Aiven instance works).

1. **Create `.env`** from the example and set your connection string. Do this before installing, because `npm install` generates the Prisma client and reads `DATABASE_URL`.
   ```bash
   cp .env.example .env
   ```
   ```
   DATABASE_URL="postgresql://USER:PASSWORD@HOST:PORT/DATABASE?sslmode=require"
   PORT=3000
   DATA_DIR=data
   ```
2. **Install dependencies**
   ```bash
   npm install
   ```
3. **Run the migrations** to create the tables
   ```bash
   npm run db:migrate
   ```
4. **Add the data files.** They are not in the repository because of their size. Put them in `data/` (or point `DATA_DIR` somewhere else):
   ```
   data/
   ├── brands.json
   ├── brand_01.ndjson
   ├── brand_02.ndjson
   ├── brand_03.ndjson
   ├── brand_04.ndjson
   └── brand_05.ndjson
   ```
5. **Start the server**
   ```bash
   npm run dev
   ```

| Script | Does |
|---|---|
| `npm run dev` | Starts the server with auto-reload |
| `npm start` | Starts the server |
| `npm test` | Runs the unit tests |
| `npm run typecheck` | Type-checks the project |
| `npm run db:migrate` | Applies the committed migrations |

## Using the API

Call the three endpoints in this order. Each one reads what the previous one stored.

### 1. `POST /api/v1/ingest-data`

Streams every `brand_XX.ndjson` file listed in `brands.json` and stores the purchase events. No request body.

```bash
curl -X POST http://localhost:3000/api/v1/ingest-data
```
```json
{
  "success": true,
  "data": {
    "durationMs": 90310,
    "brands": 5,
    "totals": { "linesRead": 5000000, "purchaseEvents": 418445, "inserted": 418445, "alreadyPresent": 0, "invalid": 0 },
    "files": [
      { "file": "brand_01.ndjson", "linesRead": 1000000, "purchaseEvents": 83803, "inserted": 83803, "alreadyPresent": 0, "invalid": 0 }
    ]
  }
}
```
Running it again inserts nothing: `inserted` is 0 and `alreadyPresent` is 418445.

### 2. `POST /api/v1/calculate-ltv`

Builds the cohort, monthly revenue and LTV tables from the purchase events. No request body.

```bash
curl -X POST http://localhost:3000/api/v1/calculate-ltv
```
```json
{
  "success": true,
  "data": { "durationMs": 33930, "customerCohorts": 287695, "customerMonthlyRevenueRows": 380905, "cohortLtvRows": 325 }
}
```

### 3. `GET /api/v1/ltv-retention-cohort`

| Query param | Meaning |
|---|---|
| `brandId` | Brand to report on, e.g. `brand_01` |
| `startMonth` | First acquisition cohort to include. Must be the first day of a month (`YYYY-MM-01`) |
| `endMonth` | Last acquisition cohort to include. Same rule |

```bash
curl "http://localhost:3000/api/v1/ltv-retention-cohort?brandId=brand_01&startMonth=2025-01-01&endMonth=2025-03-01"
```
```json
{
  "success": true,
  "data": {
    "brandId": "brand_01",
    "startMonth": "2025-01-01",
    "endMonth": "2025-03-01",
    "currency": "₹",
    "monthGaps": [0, 1, 2],
    "cohorts": [
      { "cohortMonth": "2025-01-01", "values": [18638016.97, 3935629.06, 2163582.18] },
      { "cohortMonth": "2025-02-01", "values": [15990810.19, 4041863.67, 1962917.5] },
      { "cohortMonth": "2025-03-01", "values": [18278076.41, 4370322.82, 2337498.55] }
    ]
  }
}
```

Errors use the shape `{ "success": false, "error": "message" }`:

| Case | Status |
|---|---|
| Missing `brandId`, `startMonth` or `endMonth` | 400 |
| Month not in `YYYY-MM-DD` format, or not a real date | 400 |
| Month not the first day of a month (e.g. `2025-01-14`) | 400 |
| `startMonth` after `endMonth` | 400 |
| Unknown `brandId` | 404 |
| Ingestion or calculation already running | 409 |
| `calculate-ltv` called before any data is ingested | 409 |

## Database tables

All tables are created by the migration in `src/prisma/migrations/`.

| Brief | Table | Primary key | Contents |
|---|---|---|---|
| (brands.json) | `brands` | `brand_id` | Currency per brand |
| Table A | `purchase_events` | `event_id` | Raw purchase events |
| Table B | `customer_cohorts` | `brand_id, user_id` | First order date and acquisition cohort per customer |
| Table C | `customer_monthly_revenue` | `brand_id, user_id, transaction_month` | Revenue per customer per month |
| Table D | `cohort_ltv` | `brand_id, acquisition_cohort, month_gap` | Revenue per cohort per month gap |

## How it works

### Ingestion
- Each file is read as a Node stream, one line at a time, so the 204MB files are never loaded into memory.
- Only `purchase` events are kept. From `properties`, only `order_id` and `amount` are stored.
- A purchase line is rejected and counted as `invalid` if it is not valid JSON, an id is missing, `customer_type` is not `first-time` or `returning`, `received_at` is not a valid date, `amount` is not a decimal string, or its `brand_id` does not match the file.
- Rows are inserted in batches of 2,000. The read pauses while each batch is written.
- **Idempotency:** inserts use `ON CONFLICT DO NOTHING` on the `event_id` primary key, so a second run adds no rows.

### LTV calculation
- Tables B, C and D are built by three `INSERT ... SELECT` statements, so Postgres does the aggregation rather than Node.
- **Idempotency:** the three tables are emptied and rebuilt inside one transaction. A second run produces identical tables, and a failure leaves the previous data in place.
- **UTC:** `received_at` is stored as `timestamptz`, and months are taken with `AT TIME ZONE 'UTC'`, as the brief requires.

### Retention cohort
- Each value is the **total revenue** of one acquisition cohort in one month gap, read straight from Table D, with at most 2 decimal places.
- A month that has already started, up to and including the current calendar month (UTC), is a number. It is `0` if the cohort made no purchases in it, including months after the data ends.
- A month after the current month has not happened yet and is `null`.
- `monthGaps` runs from 0 to the number of months between `startMonth` and `endMonth`, and every `values` array has that many entries. For `2025-01-01` to `2025-10-01` that is `[0, …, 9]`, so 10 values per cohort.
- For example, in October 2026, `startMonth=2025-01-01&endMonth=2027-03-01` gives `monthGaps` `[0, …, 26]`. The `2025-01-01` cohort has numbers up to gap 21 (October 2026) and `null` from gap 22 (November 2026). The data ends in January 2026, so gaps 13 to 21 are `0`.

## Decisions and assumptions

The brief leaves some details open. These are the choices made.

- **`GET` for the retention endpoint.** The brief lists it as `GET` in the summary table and `POST` in section 4.3. It only reads data and takes query params, so it is `GET`.
- **How `values` is calculated.** The brief does not give a formula, and its sample shows 4-decimal figures, so this was confirmed with the coordinator: the API returns the total revenue for each acquisition cohort and month gap, not a per-customer or cumulative figure. `cohortSize` was removed from the response for the same reason.
- **Number of month gaps.** The brief does not say how many columns to return. This was confirmed with the coordinator: `monthGaps` is set by the range between `startMonth` and `endMonth`, not by how much data exists.
- **`0` versus `null`.** This was confirmed with the coordinator. A month that has passed is a number, `0` if there were no purchases, because it happened and earned nothing. A month after the current calendar month has not happened yet and is `null`. "Now" is today's date, not the last month in the data, so the response changes as months pass.
- **Currency symbol.** `brands.json` holds ISO codes (`INR`, `AUD`) but the brief's sample response shows a symbol (`A$`). The codes are mapped to symbols (`₹`, `$`, `£`, `A$`); an unmapped code is returned as is.
- **`customer_type` value.** The brief writes `first_time` in the calculation steps, but the schema, the example and the data all use `first-time`. The data's value is used.
- **No API keys.** The brief says `brands.json` contains an API key per brand, but the file provided only has `brand_id` and `currency`, so there is no authentication.
- **UTC changes the result.** 1,706 purchases fall in a different month in UTC than in local time. In UTC the purchases run from 31 December 2024 to 2 January 2026, so some brands have a small December 2024 cohort and there is a short January 2026 month.
- **Customers without a `first-time` event** would be left out of the LTV tables, because they have no acquisition cohort. This does not occur in the data provided.

### What the data looks like

All 5,000,000 lines were checked before writing the ingestion code.

- 418,445 purchase events (about 83,000 per brand): 287,695 `first-time` and 130,750 `returning`.
- The other 4,581,555 lines are page views, product views, add-to-cart and checkout events, which are not stored.
- No malformed lines, no duplicate `event_id`s, no missing or non-positive amounts.
- Every customer has exactly one `first-time` purchase, and no `returning` purchase comes before it.

## Project structure

```
src/
├── index.ts          starts the server
├── app.ts            builds the Express app
├── routes/           URL to controller
├── controllers/      read the request, call a service, send the response
├── services/         business logic
├── repositories/     all database access
├── validators/       request validation
├── middleware/       error and 404 handling
├── config/env.ts     the only place environment variables are read
├── lib/prisma.ts     shared Prisma client
├── utils/            date helpers, AppError
├── types/            shared types
└── prisma/           schema and migrations
tests/                unit tests
```

Each layer only calls the one below it: routes → controllers → services → repositories.

## Tests

```bash
npm test
```
Unit tests cover the date helpers, the query validation and the cohort grid calculation (per-month totals, `0` for empty months, `null` padding). They use Node's built-in test runner and do not touch the database.

The SQL was checked separately: the row counts and the first cohort's values returned by the API match figures computed independently from the raw files.

## AI usage

This project was built with Claude Code as a pair programmer, working one step at a time: setup, schema, ingestion, restructuring into layers, LTV calculation, then the cohort endpoint.

Snippets of those conversations are in [docs/ai-conversations.md](docs/ai-conversations.md).
