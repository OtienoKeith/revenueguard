"use client";

import { useEffect, useMemo, useState } from "react";

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

const attackCases = [
  { label: "Duplicate delivery", detail: "20 copies · 0 ms gap", risk: "critical" },
  { label: "Concurrent retry", detail: "2 workers · same event", risk: "critical" },
  { label: "Delayed acknowledgement", detail: "commit + provider retry", risk: "high" },
  { label: "Out-of-order update", detail: "newer state arrives first", risk: "high" },
];

const previewTrace: Record<Mode, (string | number)[][]> = {
  vulnerable: [
    ["worker.a · order.lookup", 4, 29, "violet"],
    ["worker.b · order.lookup", 11, 34, "violet"],
    ["worker.a · order.create", 34, 42, "red"],
    ["worker.b · order.create", 43, 44, "red"],
  ],
  protected: [
    ["worker.a · ledger.claim", 4, 22, "lime"],
    ["worker.a · order.upsert", 27, 38, "lime"],
    ["worker.b · duplicate_ignored", 11, 19, "muted"],
    ["worker.a · fulfillment", 70, 22, "lime"],
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
      window.setTimeout(() => setVisibleLogs(index + 1), 270 * (index + 1)),
    );
    const done = window.setTimeout(() => setRunState("complete"), 270 * (logs.length + 1));
    return () => {
      timers.forEach(window.clearTimeout);
      window.clearTimeout(done);
    };
  }, [runState, serverRun, logs]);

  const result = useMemo(() => {
    if (!serverRun) return { deliveries: 0, orders: 0, duplicates: 0, risk: "$0" };
    if (runState === "running") {
      const progress = Math.min(1, visibleLogs / Math.max(1, serverRun.logs.length));
      return {
        deliveries: Math.round(serverRun.metrics.deliveries * progress),
        orders: Math.round(serverRun.metrics.orders * progress),
        duplicates: Math.round(serverRun.metrics.duplicates * progress),
        risk: progress > 0.55 ? serverRun.metrics.risk : "$0",
      };
    }
    return serverRun.metrics;
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
    <main>
      <nav className="nav-shell" aria-label="Primary navigation">
        <a className="brand" href="#top" aria-label="RevenueGuard home">
          <span className="brand-mark">RG</span>
          <span>RevenueGuard</span>
        </a>
        <div className="nav-status">
          <span className={`status-dot ${backendHealthy === false ? "offline" : ""}`} />
          {backendHealthy === null ? "Checking backend" : backendHealthy ? "Backend + D1 connected" : "Backend unavailable"}
        </div>
        <a className="nav-link" href="#proof">Technical proof <span aria-hidden="true">↗</span></a>
      </nav>

      <section className="hero" id="top">
        <div className="eyebrow"><span>01</span> Payment chaos lab</div>
        <div className="hero-grid">
          <div><h1>One payment.<br /><em>Twenty webhooks.</em><br />One order.</h1></div>
          <div className="hero-copy">
            <p>RevenueGuard runs a real server-side experiment against duplicate and concurrent payment events, then persists the evidence for inspection.</p>
            <button className="primary-button" onClick={runStorm} disabled={runState === "running"}>
              {runState === "running" ? "Storm in progress…" : runState === "complete" ? "Run it again" : "Launch webhook storm"}
              <span aria-hidden="true">→</span>
            </button>
          </div>
        </div>
      </section>

      <section className={`lab-shell ${mode}`} aria-labelledby="lab-title" aria-busy={runState === "running"}>
        <div className="lab-topbar">
          <div><span className="section-kicker">Live backend experiment</span><h2 id="lab-title">The duplicate-order race</h2></div>
          <div className="mode-switch" role="group" aria-label="Choose payment processor mode">
            <button className={mode === "vulnerable" ? "active" : ""} aria-pressed={mode === "vulnerable"} onClick={() => selectMode("vulnerable")}>Vulnerable</button>
            <button className={mode === "protected" ? "active" : ""} aria-pressed={mode === "protected"} onClick={() => selectMode("protected")}>Protected</button>
          </div>
        </div>

        {error && <div className="backend-error" role="alert"><strong>Backend run failed.</strong> {error}</div>}

        <div className="metric-grid" aria-live="polite">
          <article className="metric-card"><span>Payments received</span><strong>1</strong><small>Server-generated fixture</small></article>
          <article className="metric-card"><span>Webhook deliveries</span><strong>{result.deliveries}</strong><small>Same event ID</small></article>
          <article className={`metric-card ${mode === "vulnerable" && result.orders > 1 ? "danger-card" : "success-card"}`}>
            <span>Orders created</span><strong>{result.orders}</strong><small>{mode === "vulnerable" ? "Expected exactly one" : "Invariant protected"}</small>
          </article>
          <article className="metric-card">
            <span>{mode === "vulnerable" ? "Revenue at risk" : "Duplicates blocked"}</span>
            <strong>{mode === "vulnerable" ? result.risk : result.duplicates}</strong>
            <small>{mode === "vulnerable" ? "Calculated exposure" : "Database enforced"}</small>
          </article>
        </div>

        <div className="lab-grid">
          <article className="panel trace-panel">
            <div className="panel-header">
              <div><span className="panel-label">Sentry-ready trace</span><h3>{eventRef} · payment_intent.succeeded</h3></div>
              <span className={`trace-status ${mode}`}>{mode === "vulnerable" ? "race detected" : "idempotent"}</span>
            </div>
            <div className="trace-ruler"><span>0 ms</span><span>25</span><span>50</span><span>75</span><span>100 ms</span></div>
            <div className="waterfall" aria-label="Webhook processing trace">
              {trace.map(([label, left, width, color]) => (
                <div className="trace-row" key={String(label)}>
                  <span>{label}</span>
                  <div className="trace-track"><i className={String(color)} style={{ left: `${left}%`, width: `${width}%` }} /></div>
                </div>
              ))}
            </div>
            <div className={`finding ${mode}`}>
              <span className="finding-symbol">{mode === "vulnerable" ? "!" : "✓"}</span>
              <p>{mode === "vulnerable"
                ? "Both workers checked before either inserted. The application—not the payment provider—created the duplicate."
                : "A unique idempotency key allowed one execution. Every retry exited before fulfillment."}</p>
            </div>
          </article>

          <article className="panel event-panel">
            <div className="panel-header">
              <div><span className="panel-label">Persisted event stream</span><h3>Deterministic server replay</h3></div>
              <span className="live-chip"><span /> live</span>
            </div>
            <div className="console" aria-live="polite">
              <div className="console-head"><span>EVENT</span><span>SPAN</span><span>RESULT</span><span>TIME</span></div>
              {logs.slice(0, visibleLogs).map((row, index) => (
                <div className="console-row" key={`${row[1]}-${index}`}>{row.map((cell, cellIndex) => <span key={cellIndex}>{cell}</span>)}</div>
              ))}
              {runState === "idle" && <div className="console-empty">Ready. Launch the storm to call the backend.</div>}
              {runState === "running" && <div className="console-cursor">{serverRun ? "Streaming stored spans" : "Waiting for server"} <span /></div>}
            </div>
            <button className={`run-button ${mode}`} onClick={runStorm} disabled={runState === "running"}>
              <span>{runState === "running" ? "Running 20 server events" : mode === "vulnerable" ? "Run vulnerable flow" : "Replay protected flow"}</span>
              <b aria-hidden="true">{runState === "running" ? "•••" : "↗"}</b>
            </button>
          </article>
        </div>

        {mode === "vulnerable" && runState === "complete" && serverRun && (
          <div className="fix-banner">
            <div><span>Race reproduced</span><strong>{serverRun.metrics.orders} orders from one payment.</strong></div>
            <p>Run stored as {serverRun.runId.slice(0, 8)}. Claim the event before executing the business operation.</p>
            <button onClick={() => selectMode("protected")}>Apply database fix <span aria-hidden="true">→</span></button>
          </div>
        )}
        {mode === "protected" && runState === "complete" && serverRun && (
          <div className="fix-banner solved">
            <div><span>Invariant held</span><strong>{serverRun.metrics.deliveries} deliveries. One order.</strong></div>
            <p>Run stored as {serverRun.runId.slice(0, 8)}. A unique idempotency key enforced the result.</p>
            <button onClick={() => selectMode("vulnerable")}>Compare before <span aria-hidden="true">↗</span></button>
          </div>
        )}
      </section>

      <section className="ai-section">
        <div className="eyebrow"><span>02</span> Google AI adversary</div>
        <div className="ai-grid">
          <div>
            <h2>Gemini thinks like<br />an unreliable network.</h2>
            <p>Gemini proposes hostile schedules. The server executes deterministic fixtures. The resulting spans are ready for Sentry ingestion and root-cause analysis.</p>
            <div className="logic-line"><span>Gemini proposes</span><i>→</i><span>Backend attacks</span><i>→</i><span>Sentry proves</span></div>
          </div>
          <div className="attack-list">
            <div className="attack-head"><span>Adversarial attack suite</span><b>4 scenarios</b></div>
            {attackCases.map((item, index) => (
              <div className="attack-row" key={item.label}>
                <span className="attack-index">0{index + 1}</span>
                <div><strong>{item.label}</strong><small>{item.detail}</small></div>
                <span className={`risk ${item.risk}`}>{item.risk}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="business-section" id="proof">
        <div className="business-card">
          <span className="section-kicker">Hackathon technical proof</span>
          <h2>A real backend.<br /><em>A reproducible fix.</em></h2>
          <p>Every click calls a deployed server route, executes twenty webhook attempts, writes the run to a durable database, and returns evidence from the stored order records.</p>
          <div className="proof-row">
            <div><span>Execution</span><strong>Cloudflare Worker</strong></div>
            <div><span>Evidence</span><strong>Persistent D1 records</strong></div>
            <div><span>Guarantee</span><strong>Unique idempotency key</strong></div>
          </div>
          <div className="proof-links" aria-label="Public judging evidence">
            <a href="https://github.com/OtienoKeith/revenueguard" target="_blank" rel="noreferrer">View public source <span aria-hidden="true">↗</span></a>
            <a href="https://github.com/OtienoKeith/revenueguard/pull/1" target="_blank" rel="noreferrer">Inspect the bug-fix PR <span aria-hidden="true">↗</span></a>
          </div>
        </div>
        <footer>
          <div className="brand"><span className="brand-mark">RG</span><span>RevenueGuard</span></div>
          <p>One payment should always mean one order.</p>
          <a href="https://github.com/OtienoKeith/revenueguard" target="_blank" rel="noreferrer">Public on GitHub <span aria-hidden="true">↗</span></a>
        </footer>
      </section>
    </main>
  );
}
