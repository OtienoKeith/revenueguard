# Bug Smash: D1 parameter overflow and slow webhook persistence

## Impact

RevenueGuard's headline scenario replays 20 deliveries of one payment webhook. The first server implementation inserted every attempt in one statement. Each attempt contains six bound values, so the generated statement could exceed the database's parameter ceiling and return a server error instead of evidence.

This is a particularly damaging failure mode: the observability tool fails during the exact concurrency storm it is meant to diagnose.

## Reproduction

1. Send `POST /api/simulate` with `{ "mode": "vulnerable", "eventCount": 20 }`.
2. Observe the oversized multi-row insert generated for `webhook_attempts`.
3. The route fails before it can return the stored order count.

## Root cause

The application treated a provider-specific bound-parameter limit as if it were an ORM implementation detail. Drizzle correctly generated the query, but the resulting statement was larger than D1 accepts.

## Fix

The fix has two layers:

1. Split attempt inserts into deterministic chunks of ten, keeping each SQL statement below D1's ceiling.
2. Submit the run write, attempt chunks, and order writes through `db.batch(...)`, avoiding a network round trip for every chunk while preserving the safe statement size.

The final code also wraps the batch in a Sentry span with mode, event count, and order count attributes. Failures are captured explicitly, and successful simulations emit a structured log.

## Verification

Production checks on the public deployment:

| Mode | Deliveries | Orders | Duplicates blocked | Revenue at risk |
| --- | ---: | ---: | ---: | ---: |
| Vulnerable | 20 | 7 | 0 | $894 |
| Protected | 20 | 1 | 19 | $0 |

Both results are read back from persisted D1 order records. The production interaction—including the deliberate UI stream animation—completes in roughly 2.3 seconds.

Automated checks cover server rendering, metadata, accessibility state, API wiring, D1 batching, and Sentry instrumentation. Runtime dependencies report zero known vulnerabilities with `npm audit --omit=dev`.
