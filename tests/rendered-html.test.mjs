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

test("server-renders the RevenueGuard experiment and public metadata", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>RevenueGuard — Chaos testing for the money path<\/title>/i);
  assert.match(html, /One payment\.<br\/><em>Twenty webhooks\.<\/em><br\/>One order\./);
  assert.match(html, /Live backend experiment/);
  assert.match(html, /aria-label="Choose payment processor mode"/);
  assert.match(html, /aria-pressed="true"/);
  assert.match(html, /aria-busy="false"/);
  assert.match(html, /https:\/\/revenueguard-lab\.sunny-seal-4213\.chatgpt\.site\/og\.png/);
  assert.doesNotMatch(html, /revenueguard\.dev/);
  assert.doesNotMatch(html, /pricing|after hackathon/i);
});

test("keeps the backend proof and keyboard accessibility in source", async () => {
  const [page, css, route, worker] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/api/simulate/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../worker/index.ts", import.meta.url), "utf8"),
  ]);

  assert.match(page, /fetch\("\/api\/health"/);
  assert.match(page, /fetch\("\/api\/simulate"/);
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
  assert.match(worker, /Sentry\.withSentry\(/);
  assert.match(worker, /sendDefaultPii:\s*false/);
});
