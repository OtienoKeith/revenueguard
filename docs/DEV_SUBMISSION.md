---
title: "One Payment, Seven Orders: Fixing a D1 Webhook Storm with Sentry and Gemini"
published: true
description: "A 20-event payment webhook storm exposed a D1 parameter overflow. Here is the measured fix, with Sentry traces and a Gemini diagnosis grounded in persisted evidence."
tags: devchallenge, bugsmash, sentry, gemini
---

*This is a submission for [DEV's Summer Bug Smash: Clear the Lineup](https://dev.to/bugsmash) powered by [Sentry](https://sentry.io/).*

## Project Overview

[RevenueGuard](https://revenueguard.otienomkeith.workers.dev/) is a live payment-webhook replay lab. It sends 20 deliveries of the same payment event, records every attempt in Cloudflare D1, and checks one invariant:

> One payment reference must create exactly one order.

The vulnerable path reproduces the kind of concurrency race that quietly charges a customer once but creates multiple orders. The protected path claims a database-backed idempotency key before fulfillment and proves that duplicate deliveries are ignored.

- [Live demo](https://revenueguard.otienomkeith.workers.dev/)
- [Public source](https://github.com/OtienoKeith/revenueguard)
- [Bug-fix comparison](https://github.com/OtienoKeith/revenueguard/compare/4d1f4d1...f24b3d2)

## Bug Fix or Performance Improvement

The first implementation tried to persist all 20 webhook attempts in one multi-row D1 statement. Each row had six bound values:

```text
20 attempts × 6 bound values = 120 parameters
```

[D1 permits at most 100 bound parameters in one query](https://developers.cloudflare.com/d1/platform/limits/). The evidence recorder therefore failed during the exact webhook storm it was meant to diagnose. That failure was especially dangerous: the duplicate-order bug still existed, but the observability layer could not preserve its proof.

I fixed it in two steps:

1. Split attempt inserts into deterministic chunks of ten, keeping every generated statement at 60 bound parameters.
2. Submit the run, attempt chunks, and order writes together with `db.batch(...)`, preserving the safe statement size without adding a network round trip per chunk.

The production result, using the same 20-event input in both modes:

| Mode | Deliveries | Stored orders | Duplicates blocked | Revenue at risk |
| --- | ---: | ---: | ---: | ---: |
| Vulnerable | 20 | 7 | 0 | $894 |
| Protected | 20 | 1 | 19 | $0 |

![Vulnerable run: 20 deliveries created 7 orders and put $894 at risk](https://raw.githubusercontent.com/OtienoKeith/revenueguard/main/docs/evidence/revenueguard-vulnerable.png)

## Code

Before, all attempts were placed in one generated insert:

```ts
await db.insert(webhookAttempts).values(attempts);
```

After, each statement stays below D1's parameter ceiling and all statements travel in one batch:

```ts
const attemptWrites = Array.from(
  { length: Math.ceil(attempts.length / 10) },
  (_, chunkIndex) =>
    db.insert(webhookAttempts).values(
      attempts.slice(chunkIndex * 10, chunkIndex * 10 + 10),
    ),
);

await Sentry.startSpan(
  {
    name: "Persist webhook storm",
    op: "db.d1.batch",
    attributes: {
      "revenueguard.mode": mode,
      "revenueguard.event_count": eventCount,
      "revenueguard.order_count": orderCount,
    },
  },
  () => db.batch([
    runWrite,
    ...attemptWrites,
    db.insert(orderExecutions).values(orders),
  ]),
);
```

The complete evolution is visible in the [public comparison from the failing implementation to the batched fix](https://github.com/OtienoKeith/revenueguard/compare/4d1f4d1...f24b3d2).

## My Improvements

- Removed the 120-parameter statement that could not survive the headline replay.
- Kept each attempt insert at 60 parameters, safely below D1's 100-parameter maximum.
- Batched the writes so correctness did not trade away latency.
- Read order executions back from D1 before reporting the result; the UI does not invent the proof client-side.
- Added automated checks for server rendering, API wiring, D1 batching, Sentry instrumentation, metadata, and accessibility state.
- Deployed the complete Worker, D1 database, AI endpoint, and rate limiter on Cloudflare's free tiers.

## Best Use of Sentry

Sentry is part of the diagnostic path, not a badge in the footer. The Worker is wrapped with `Sentry.withSentry`, with default PII disabled. The persistence fix creates a `db.d1.batch` span carrying the replay mode, delivery count, and order count. The Gemini call creates a separate `ai.gemini.interactions` span. Both routes capture exceptions, and successful runs emit structured logs with the saved business impact.

The trace below is from the public production deployment. It shows `POST /api/analyze`, the child `ai.gemini.interactions` span, the `gemini-3.5-flash-lite` model, and a 1.47-second model call.

![Sentry production trace for the Gemini diagnosis](https://raw.githubusercontent.com/OtienoKeith/revenueguard/main/docs/evidence/sentry-ai-traces.png)

This makes the failure observable at three levels: database persistence, business invariant, and AI-analysis latency.

## Best Use of Google AI

Gemini is used after every replay to diagnose the actual stored D1 evidence. The browser sends only a run ID. The Worker loads the corresponding run, all webhook attempts, and every order execution from D1, then asks Gemini to check the one-order-per-payment invariant.

The response is schema-constrained JSON containing:

- verdict;
- root cause;
- two or three numerical evidence points;
- smallest database-enforced fix;
- next adversarial test; and
- confidence score.

The server validates and clips the response, persists it in D1 with token counts and latency, and serves later reads from the cache. Gemini is intentionally advisory: it never authorizes a payment or fulfillment decision. The database constraint remains the authority.

Here is the protected production run. Gemini independently identified that one order was created while 19 duplicate webhooks were blocked, with 100% confidence and a traceable request reference.

![Protected run with persisted Gemini diagnosis](https://raw.githubusercontent.com/OtienoKeith/revenueguard/main/docs/evidence/revenueguard-protected-ai.png)

## Verification

You can reproduce the result without signing in or entering billing details:

1. Open the [live RevenueGuard lab](https://revenueguard.otienomkeith.workers.dev/).
2. Run **Vulnerable** and observe 7 stored orders and $894 at risk.
3. Run **Protected** with the same 20 deliveries and observe 1 stored order, 19 blocked duplicates, and $0 at risk.
4. Read Gemini's diagnosis, generated from the persisted run.

The repository's test suite passes, the production health endpoint reports D1 and Gemini ready, and production runtime dependencies report zero known vulnerabilities.

The most important lesson was simple: an observability tool must be strongest during the failure it claims to explain. Chunking made the evidence reliable; batching made it practical; Sentry made it traceable; and Gemini made the stored evidence understandable without placing AI in the payment path.
