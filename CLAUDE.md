# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project state

This is a take-home project. All three endpoints are implemented and have been run against the hosted Postgres with the real data; `README.md` documents setup, the API and the decisions made. Prisma config is `prisma.config.ts` at the root, with the schema and migrations under `src/prisma/` and the client generated into `src/generated/prisma`. The spec is `take-home-assigment.txt` (a PDF-to-text dump, so words are broken across lines around underscores, e.g. `brand` / `_` / `01`); the screenshot in the repo root shows the frontend cohort table the final endpoint feeds.

The input data lives in the gitignored `data/` folder: `brand_01.ndjson` … `brand_05.ndjson` (~1M events, ~204MB each) and `brands.json`, which holds only `brand_id` and `currency` per brand (an ISO code such as `INR` or `AUD`).

## Submission requirements

These come from the reviewer's email, not the spec document.

- The project is submitted as a GitHub repository.
- Every table must be created through a committed migration (`src/prisma/migrations/`), because the reviewer will run the migrations on their own database to test. Use `npx prisma migrate dev`, never `prisma db push`, and do not create or alter tables from application code.
- Never commit `.env`. Keep a `.env.example` with placeholder values so the reviewer knows what to set.
- Postgres is expected to be a hosted instance (the reviewer suggests Aiven's free 5GB tier), so connections need SSL and bulk work should be batched to keep network round trips down. Table A across all five brands must fit comfortably within 5GB.
- AI usage is allowed provided the author understands the code, and the reviewer wants snippets of the AI conversation shared. Prefer straightforward, explainable code over clever code, and explain the reasoning behind non-obvious choices when making them.

## Tooling

- Express 5, TypeScript (strict, CommonJS, `noEmit`), Prisma 6 on Postgres, `tsx` for running TS directly.
- `npm run dev` (tsx watch) / `npm start` run `src/index.ts` directly with tsx; there is no compiled build step. `npm run typecheck` runs `tsc --noEmit` over `src/` and `tests/`.
- `npm test` runs the unit tests with Node's built-in runner through tsx (`tsx --test tests/*.test.ts`); a single file is `npx tsx --test tests/date.test.ts`. Tests cover pure functions only and do not touch the database. No linter is installed.
- `npx prisma migrate dev --name <name>` creates a migration after a schema change; `npm run db:migrate` (`prisma migrate deploy`) applies committed migrations; `npm run db:generate` regenerates the client (also runs on `npm install`).

## Code structure

Layered: `routes/` → `controllers/` → `services/` → `repositories/`, with files named `<feature>.<layer>.ts` (e.g. `ingest.service.ts`). The three features are `ingest`, `ltv` and `cohort`. `src/index.ts` only starts the server; `src/app.ts` builds the Express app and mounts `router` from `routes/routes.ts` under `/api/v1`.

Naming the user has set: controller functions end in `Controller` (`ingestDataController`), each feature exports `<feature>Router` from `<feature>.routes.ts`, and routers carry an explicit `: Router` type annotation.

Rules the user has fixed for this layout:

1. A layer only calls the layer directly below it. Controllers parse the request, call a service and shape the response; they hold no business logic and never import Prisma. Only repositories talk to the database (Prisma and raw SQL).
2. One shared `PrismaClient`, exported from `src/lib/prisma.ts` (it imports from `src/generated/prisma/client`, not `@prisma/client`).
3. Services throw `AppError(message, statusCode)` from `src/utils/errors.ts`. Handlers are plain `async` functions with no per-case try/catch; Express 5 forwards thrown errors to `middleware/errorHandler.middleware.ts`, which returns `{ success: false, error }`.
4. Request validation lives in `validators/` and runs before the service. Validators are hand-written; ask before installing zod or any other package.
5. `process.env` is read only in `src/config/env.ts`; everything else imports `env`. (`prisma.config.ts` at the repo root is Prisma CLI config and reads `DATABASE_URL` itself.)
6. Services take and return plain types from `src/types/`, not Prisma types.
7. Do not change the schema or existing migrations as part of a refactor.

Shared helpers go in `src/utils/` (`date.ts` for UTC month helpers) and tests in `tests/` at the repo root. Create a file when it has real content rather than as an empty placeholder.

## What is being built

A backend-only service with three endpoints forming a pipeline; each stage reads the table(s) produced by the previous one.

1. `POST /api/v1/ingest-data` reads the NDJSON files line by line (they are not JSON arrays, and are too large to load whole) and stores **only `purchase` events** in Table A. From `properties`, only `order_id` and `amount` are persisted.
2. `POST /api/v1/calculate-ltv` derives Tables B, C and D from Table A.
3. `GET /api/v1/ltv-retention-cohort?brandId=&startMonth=&endMonth=` reads Table D and returns the cohort grid.

Both POST endpoints must be idempotent: re-running must not duplicate rows (upsert on the unique key, or delete and rebuild).

### Tables

| Table | Contents | Unique key |
|---|---|---|
| A | Raw purchase events: `event_id, brand_id, user_id, event_type, customer_type, received_at, order_id, amount` | `event_id` |
| B | Acquisition cohort per customer: `brand_id, userId, firstOrderDate, acquisitionCohort` | `brand_id + userId` |
| C | Monthly revenue per customer: `brand_id, userId, transactionMonth, totalRevenue` | `brand_id + userId + transactionMonth` |
| D | LTV per cohort: `brand_id, acquisitionCohort, monthGap, totalRevenue` | `brand_id + acquisitionCohort + monthGap` |

Table structures in the spec are marked tentative.

### Calculation rules

- A customer's first purchase is the event with `event_type = purchase` and `customer_type = first-time`. Its month is the acquisition cohort, stored as the first of the month.
- `received_at` carries a local UTC offset. **Convert to UTC before extracting the month**, for both the acquisition cohort and `transactionMonth`; an event near a month boundary can land in a different month than its local timestamp suggests.
- `user_id` is unique only within a brand, so every join and grouping must include `brand_id`.
- `amount` is a decimal string; keep it as a decimal type, not a float.
- Table D is C joined to B on `brand_id + userId`, with `monthGap` = whole months between `acquisitionCohort` and `transactionMonth` (0 when equal), grouped by `brand_id + acquisitionCohort + monthGap`.

### Retention cohort response

- `startMonth` and `endMonth` bound `acquisitionCohort` and must each be the first of a month; anything else (e.g. `2025-01-14`) is an error.
- Response shape: `{ success, data: { brandId, startMonth, endMonth, currency, monthGaps: number[], cohorts: [{ cohortMonth, values }] } }`. There is no `cohortSize`; the coordinator removed it from the brief.
- Each value is the total revenue of that cohort in that month gap, straight from Table D (confirmed by the coordinator on 2026-10-13: not divided by cohort size and not cumulative), with at most 2 decimals. A past month with no purchases is `0`.
- `monthGaps` is `0..N`, where N is the months between `startMonth` and `endMonth` (confirmed by the coordinator on 2026-10-14: `2025-01-01` to `2025-10-01` gives `0..9`). It does not depend on how far the data runs.
- `values` is aligned to `monthGaps`, with `null` only for month gaps after the current calendar month in UTC (confirmed by the coordinator on 2026-10-14). Months that have passed are numbers, `0` if there were no purchases, even after the data ends in January 2026. "Now" is the real date, not the latest month in the data.
- `currency` comes from `brands.json`.

## Ambiguities in the spec and how they were resolved

The brief says explicitly that handling unspecified details is part of the evaluation. The decisions below are also recorded in `README.md`; keep the two in step if one changes.

- The retention endpoint is listed as `GET` in the summary table and `POST` in section 4.3; it takes query params, so it is implemented as `GET`.
- `customer_type` is `first-time` in the schema and example JSON but written `first_time` in the calculation steps. The data uses `first-time`.
- The spec never defined how `values` is computed and its sample JSON shows 4-decimal per-customer figures. The coordinator confirmed those came from a different project: return total revenue per cohort and month gap (`buildCohortGrid` in `src/services/cohort.service.ts`). The screenshot's per-customer numbers no longer apply.
- `currency` is returned as a symbol (`A$`, `₹`) mapped from the ISO code in `brands.json`, matching the brief's sample.
- Users with purchases but no `first-time` event, users with more than one, and duplicate `event_id`s do not occur in the provided data (all 5M lines were checked). A user without a `first-time` event would drop out of Tables B–D through the inner join.
- Known data facts used for verification: 418,445 purchases, 287,695 customers, 380,905 Table C rows, 325 Table D rows; in UTC the purchases span 2024-12-31 to 2026-01-02.
- The spec says `brands.json` includes an API key per brand, but the actual file has none, so there is nothing to authenticate against.
