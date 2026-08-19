"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type Mode = "vulnerable" | "protected";
type RunState = "idle" | "running" | "complete";
type RunResponse = {
  runId: string;
  eventRef: string;
  mode: Mode;
  persisted: boolean;
  metrics: { deliveries: number; orders: number; duplicates: number; risk: string };
  logs: string[][];
  trace: (string | number)[][];
};

const previewTrace: Record<Mode, (string | number)[][]> = {
  vulnerable: [
    ["worker.a · lookup", 4, 29, "violet"],
    ["worker.b · lookup", 11, 34, "violet"],
    ["worker.a · create", 34, 42, "red"],
    ["worker.b · create", 43, 44, "red"],
  ],
  protected: [
    ["worker.a · claim", 4, 22, "lime"],
    ["worker.a · upsert", 27, 38, "lime"],
    ["worker.b · ignored", 11, 19, "muted"],
    ["worker.a · fulfill", 70, 22, "lime"],
  ],
};

export default function Home() {
  const [mode, setMode] = useState<Mode>("vulnerable");
  const [runState, setRunState] = useState<RunState>("idle");
  const [visibleLogs, setVisibleLogs] = useState(0);
  const [serverRun, setServerRun] = useState<RunResponse | null>(null);
  const [backendHealthy, setBackendHealthy] = useState<boolean | null>(null);
  const [error, setError] = useState("");
  const logs = useMemo(() => serverRun?.logs ?? [], [serverRun]);

  useEffect(() => {
    fetch("/api/health", { cache: "no-store" })
      .then((response) => setBackendHealthy(response.ok))
      .catch(() => setBackendHealthy(false));
  }, []);

  useEffect(() => {
    if (runState !== "running" || !serverRun) return;
    const timers = logs.map((_, index) =>
      window.setTimeout(() => setVisibleLogs(index + 1), 240 * (index + 1)),
    );
    const done = window.setTimeout(() => setRunState("complete"), 240 * (logs.length + 1));
    return () => {
      timers.forEach(window.clearTimeout);
      window.clearTimeout(done);
    };
  }, [runState, serverRun, logs]);

  const result = useMemo(() => {
    if (!serverRun) return { deliveries: 0, orders: 0, duplicates: 0, risk: "$0" };
    if (runState !== "running") return serverRun.metrics;
    const progress = Math.min(1, visibleLogs / Math.max(1, serverRun.logs.length));
    return {
      deliveries: Math.round(serverRun.metrics.deliveries * progress),
      orders: Math.round(serverRun.metrics.orders * progress),
      duplicates: Math.round(serverRun.metrics.duplicates * progress),
      risk: progress > 0.55 ? serverRun.metrics.risk : "$0",
    };
  }, [runState, serverRun, visibleLogs]);

  function selectMode(nextMode: Mode) {
    setMode(nextMode);
    setRunState("idle");
    setServerRun(null);
    setVisibleLogs(0);
    setError("");
  }

  async function runStorm() {
    if (runState === "running") return;
    setRunState("running");
    setServerRun(null);
    setVisibleLogs(0);
    setError("");
    try {
      const response = await fetch("/api/simulate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode, eventCount: 20 }),
      });
      const payload = await response.json() as RunResponse & { error?: string };
      if (!response.ok) throw new Error(payload.error || "The server rejected this run.");
      setServerRun(payload);
      setBackendHealthy(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The backend experiment failed.");
      setBackendHealthy(false);
      setRunState("idle");
    }
  }

  const trace = serverRun?.trace ?? previewTrace[mode];
  const eventRef = serverRun?.eventRef ?? "evt_waiting";

  return (
    <main className="app-shell">
      <header className="topbar">
        <Link className="brand" href="/" aria-label="RevenueGuard home">
          <span className="brand-mark">RG</span>
          <span>RevenueGuard</span>
        </Link>
        <div className="service-status" role="status">
          <span className={`status-dot ${backendHealthy === false ? "offline" : ""}`} />
          {backendHealthy === null ? "Checking backend" : backendHealthy ? "Live · D1 connected" : "Backend unavailable"}
        </div>
        <a className="source-link" href="https://github.com/OtienoKeith/revenueguard" target="_blank" rel="noreferrer">
          Source ↗
        </a>
      </header>

      <section className="workspace" aria-labelledby="lab-title" aria-busy={runState === "running"}>
        <div className="workspace-head">
          <div>
            <p className="kicker">Payment webhook replay</p>
            <h1 id="lab-title">One payment. Twenty deliveries.</h1>
          </div>
          <div className="mode-switch" role="group" aria-label="Choose payment processor mode">
            <button className={mode === "vulnerable" ? "active" : ""} aria-pressed={mode === "vulnerable"} onClick={() => selectMode("vulnerable")}>Vulnerable</button>
            <button className={mode === "protected" ? "active" : ""} aria-pressed={mode === "protected"} onClick={() => selectMode("protected")}>Protected</button>
          </div>
        </div>

        <div className="runbar">
          <p>{mode === "vulnerable" ? "Reproduce the duplicate-order race." : "Replay the same event with an idempotency claim."}</p>
          <button className="run-button" onClick={runStorm} disabled={runState === "running"}>
            {runState === "running" ? "Running…" : runState === "complete" ? "Run again" : "Run 20 events"}
            <span aria-hidden="true">→</span>
          </button>
        </div>

        {error && <div className="backend-error" role="alert"><strong>Run failed.</strong> {error}</div>}

        <div className="metric-grid" aria-live="polite">
          <article><span>Payments</span><strong>1</strong><small>fixed input</small></article>
          <article><span>Deliveries</span><strong>{result.deliveries}</strong><small>same event ID</small></article>
          <article className={mode === "vulnerable" && result.orders > 1 ? "danger" : mode === "protected" && result.orders === 1 ? "safe" : ""}>
            <span>Orders</span><strong>{result.orders}</strong><small>expected: 1</small>
          </article>
          <article className={mode === "protected" && result.duplicates > 0 ? "safe" : ""}>
            <span>{mode === "vulnerable" ? "Revenue at risk" : "Blocked"}</span>
            <strong>{mode === "vulnerable" ? result.risk : result.duplicates}</strong>
            <small>{mode === "vulnerable" ? "duplicate value" : "duplicate events"}</small>
          </article>
        </div>

        <div className="evidence-grid">
          <article className="panel trace-panel">
            <div className="panel-head">
              <div><span>Trace</span><h2>{eventRef}</h2></div>
              <b className={mode}>{mode === "vulnerable" ? "race detected" : "idempotent"}</b>
            </div>
            <div className="trace-ruler"><span>0 ms</span><span>50</span><span>100 ms</span></div>
            <div className="waterfall" aria-label="Webhook processing trace">
              {trace.map(([label, left, width, color]) => (
                <div className="trace-row" key={String(label)}>
                  <span>{label}</span>
                  <div><i className={String(color)} style={{ left: `${left}%`, width: `${width}%` }} /></div>
                </div>
              ))}
            </div>
            <p className={`finding ${mode}`}>
              {mode === "vulnerable"
                ? "Two workers read before either write completed, so both created an order."
                : "The unique idempotency key allowed one execution and rejected every retry."}
            </p>
          </article>

          <article className="panel event-panel">
            <div className="panel-head">
              <div><span>Persisted event stream</span><h2>Cloudflare D1</h2></div>
              <b className="live"><i /> live</b>
            </div>
            <div className="console" aria-live="polite">
              <div className="console-head"><span>SPAN</span><span>RESULT</span><span>TIME</span></div>
              {logs.slice(0, visibleLogs).map((row, index) => (
                <div className="console-row" key={`${row[1]}-${index}`}><span>{row[1]}</span><span>{row[2]}</span><span>{row[3]}</span></div>
              ))}
              {runState === "idle" && <div className="console-empty">Waiting for a replay.</div>}
              {runState === "running" && <div className="console-empty">{serverRun ? "Streaming stored spans…" : "Calling Worker…"}</div>}
            </div>
          </article>
        </div>

        {runState === "complete" && serverRun && (
          <div className={`result-bar ${mode}`} role="status">
            <span>{mode === "vulnerable" ? "FAIL" : "PASS"}</span>
            <strong>{mode === "vulnerable" ? `${serverRun.metrics.orders} orders created from one payment.` : `${serverRun.metrics.deliveries} deliveries produced exactly one order.`}</strong>
            <small>Stored run {serverRun.runId.slice(0, 8)}</small>
            {mode === "vulnerable" && <button onClick={() => selectMode("protected")}>Apply fix →</button>}
          </div>
        )}
      </section>

      <footer className="footer-line">
        <span>Cloudflare Worker</span><span>Cloudflare D1</span><span>Sentry</span>
      </footer>
    </main>
  );
}
