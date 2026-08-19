import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the focused RevenueGuard replay", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>RevenueGuard — Payment webhook replay<\/title>/i);
  assert.match(html, /One payment\. Twenty deliveries\./);
  assert.match(html, /Payment webhook replay/);
  assert.match(html, /aria-label="Choose payment processor mode"/);
  assert.match(html, /aria-pressed="true"/);
  assert.match(html, /aria-busy="false"/);
  assert.match(html, /https:\/\/github\.com\/OtienoKeith\/revenueguard/);
  assert.doesNotMatch(html, /pricing|after hackathon|business plan|Google AI adversary/i);
  assert.match(html, /revenueguard\.otienomkeith\.workers\.dev/i);
});

test("keeps the backend, Sentry, Gemini, deployment, and accessibility proof", async () => {
  const [page, css, route, analysisRoute, schema, worker, wrangler] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/api/simulate/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/analyze/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../worker/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../wrangler.jsonc", import.meta.url), "utf8"),
  ]);

  assert.match(page, /fetch\("\/api\/health"/);
  assert.match(page, /fetch\("\/api\/simulate"/);
  assert.match(page, /fetch\("\/api\/analyze"/);
  assert.match(page, /Google AI diagnosis/);
  assert.match(page, /stored in D1/);
  assert.match(page, /aria-pressed=\{mode === "vulnerable"\}/);
  assert.match(page, /aria-pressed=\{mode === "protected"\}/);
  assert.match(page, /aria-busy=\{runState === "running"\}/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /min-height:\s*44px/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(route, /db\.batch\(/);
  assert.match(route, /persisted:\s*true/);
  assert.match(route, /Sentry\.startSpan\(/);
  assert.match(route, /Sentry\.logger\.info\(/);
  assert.match(route, /Sentry\.captureException\(/);
  assert.match(analysisRoute, /generativelanguage\.googleapis\.com\/v1beta\/interactions/);
  assert.match(analysisRoute, /gemini-3\.5-flash-lite/);
  assert.match(analysisRoute, /response_format/);
  assert.match(analysisRoute, /store:\s*false/);
  assert.match(analysisRoute, /op:\s*"ai\.gemini\.interactions"/);
  assert.match(analysisRoute, /db\.insert\(aiDiagnoses\)/);
  assert.match(analysisRoute, /env\.AI_RATE_LIMIT\.limit/);
  assert.match(schema, /sqliteTable\("ai_diagnoses"/);
  assert.match(worker, /Sentry\.withSentry\(/);
  assert.match(worker, /sendDefaultPii:\s*false/);
  assert.match(wrangler, /"database_name": "revenueguard-db"/);
  assert.match(wrangler, /"observability": \{ "enabled": true \}/);
  assert.match(wrangler, /"secrets": \{ "required": \["SENTRY_DSN", "GEMINI_API_KEY"\] \}/);
  assert.match(wrangler, /"name": "AI_RATE_LIMIT"/);
});
