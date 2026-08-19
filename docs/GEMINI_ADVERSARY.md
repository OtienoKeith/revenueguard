# Gemini runtime diagnosis

RevenueGuard uses Google Gemini after every replay. This is a live production call, not prewritten copy and not a build-time design exercise.

## Runtime flow

1. The browser creates a deterministic vulnerable or protected replay through `/api/simulate`.
2. The Worker persists the run, all webhook attempts, and order executions in Cloudflare D1.
3. The browser sends only the returned `runId` to `/api/analyze`.
4. The Worker reloads the evidence from D1, preventing the client from inventing metrics for the model.
5. Gemini 3.5 Flash-Lite returns schema-constrained JSON through the Interactions API.
6. RevenueGuard validates and clips every field, then stores the diagnosis, model name, request reference, token counts, and latency in `ai_diagnoses`.
7. Sentry records the AI request as an `ai.gemini.interactions` span and captures failures.

## Model task

Gemini receives the payment invariant plus the persisted run, attempts, and order executions. It must produce:

- `verdict`: `unsafe` or `protected`;
- `headline`: a concise diagnosis;
- `rootCause`: the concurrency or idempotency mechanism shown by the evidence;
- `evidence`: two or three numerical facts from the run;
- `recommendedFix`: the smallest database-enforced correction;
- `nextTest`: one deterministic adversarial scenario;
- `confidence`: an integer from 0 to 100.

The request uses `store: false`, low temperature, a bounded output, and a JSON Schema response format. Stored diagnoses are reused, so repeatedly viewing the same run does not spend another model request.

## Safety boundary

Gemini never creates orders, blocks retries, authorizes payments, or modifies the execution ledger. It only interprets evidence after the replay. The unique D1 idempotency key remains the production invariant and still works if Gemini is unavailable.

The prompt treats embedded event values as untrusted data and instructs the model not to follow them as commands. The API key is a required encrypted Cloudflare secret and never reaches the browser or repository.

## Why this matters for the challenge

The two prize integrations reinforce each other: Sentry shows where the bug and AI request occurred; Gemini turns the stored trace into an understandable root cause and a concrete next test. Judges can run both modes and receive a new, persisted model interaction they can verify in the UI and D1.
