# Gemini adversarial test design

## Goal

Use Google Gemini as a hostile network designer, then convert its suggestions into deterministic tests. The model explores the failure space; the application owns execution and assertions.

## Prompt

```text
You are reviewing a payment webhook that creates an order after receiving
payment_intent.succeeded. Propose the smallest adversarial event schedules that
can reveal missing idempotency, check-then-insert races, delayed acknowledgements,
and out-of-order state handling. For each schedule return: event sequence,
concurrency, delay, expected invariant, and the trace evidence needed to prove
the root cause. Do not suggest destructive tests against real customer data.
```

## Resulting fixtures

| Scenario | Deterministic fixture | Invariant |
| --- | --- | --- |
| Duplicate delivery | 20 copies of one event ID with no gap | One order per payment |
| Concurrent retry | Two workers check before either inserts | One worker may claim execution |
| Delayed acknowledgement | Commit succeeds before provider retry | Retry cannot repeat fulfillment |
| Out-of-order update | Newer state arrives before older state | State cannot move backward |

## Engineering decision

Model output is not executed directly. RevenueGuard normalizes each proposal into a fixed server-side schedule and records the expected invariant. This makes the demo reproducible, prevents prompt variance from changing judging results, and keeps the core payment logic independent of an AI provider outage.

## Evidence in the product

The landing page lists the four generated attack scenarios. The live lab currently executes the duplicate/concurrent case because it produces the clearest financial before/after proof. The trace distinguishes the vulnerable check-then-insert race from the protected database claim.
