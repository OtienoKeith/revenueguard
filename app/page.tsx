"use client";

import { useEffect, useMemo, useState } from "react";

type Mode = "vulnerable" | "protected";
type RunState = "idle" | "running" | "complete";

const attackCases = [
  { label: "Duplicate delivery", detail: "20 copies · 0 ms gap", risk: "critical" },
  { label: "Concurrent retry", detail: "2 workers · same event", risk: "critical" },
  { label: "Delayed acknowledgement", detail: "commit + provider retry", risk: "high" },
  { label: "Out-of-order update", detail: "newer state arrives first", risk: "high" },
];

const vulnerableLogs = [
  ["evt_7r91", "order.lookup", "not found", "12 ms"],
  ["evt_7r91", "order.lookup", "not found", "14 ms"],
  ["evt_7r91", "order.create", "ord_8101", "46 ms"],
  ["evt_7r91", "order.create", "ord_8102", "51 ms"],
  ["evt_7r91", "fulfillment", "duplicate", "88 ms"],
];

const protectedLogs = [
  ["evt_7r91", "ledger.claim", "acquired", "8 ms"],
  ["evt_7r91", "order.upsert", "ord_8101", "31 ms"],
  ["evt_7r91", "fulfillment", "completed", "62 ms"],
  ["evt_7r91", "ledger.claim", "duplicate", "9 ms"],
  ["evt_7r91", "webhook", "ignored safely", "12 ms"],
];

export default function Home() {
  const [mode, setMode] = useState<Mode>("vulnerable");
  const [runState, setRunState] = useState<RunState>("idle");
  const [visibleLogs, setVisibleLogs] = useState(0);
  const logs = mode === "vulnerable" ? vulnerableLogs : protectedLogs;

  useEffect(() => {
    if (runState !== "running") return;
    setVisibleLogs(0);
    const timers = logs.map((_, index) =>
      window.setTimeout(() => setVisibleLogs(index + 1), 270 * (index + 1)),
    );
    const done = window.setTimeout(() => setRunState("complete"), 270 * (logs.length + 1));
    return () => {
      timers.forEach(window.clearTimeout);
      window.clearTimeout(done);
    };
  }, [runState, logs]);

  const result = useMemo(() => {
    if (runState === "idle") return { deliveries: 0, orders: 0, duplicates: 0, risk: "$0" };
    if (runState === "running") {
      const count = Math.min(20, visibleLogs * 4);
      return {
        deliveries: count,
        orders: mode === "vulnerable" ? Math.max(0, visibleLogs - 1) : visibleLogs > 1 ? 1 : 0,
        duplicates: mode === "protected" ? Math.max(0, count - 1) : 0,
        risk: mode === "vulnerable" && visibleLogs > 2 ? `$${((visibleLogs - 2) * 149).toFixed(0)}` : "$0",
      };
    }
    return mode === "vulnerable"
      ? { deliveries: 20, orders: 7, duplicates: 0, risk: "$894" }
      : { deliveries: 20, orders: 1, duplicates: 19, risk: "$0" };
  }, [mode, runState, visibleLogs]);

  function selectMode(nextMode: Mode) {
    setMode(nextMode);
    setRunState("idle");
    setVisibleLogs(0);
  }

  function runStorm() {
    if (runState === "running") return;
    setRunState("running");
  }

  return (
    <main>
      <nav className="nav-shell" aria-label="Primary navigation">
        <a className="brand" href="#top" aria-label="RevenueGuard home">
          <span className="brand-mark">RG</span>
          <span>RevenueGuard</span>
        </a>
        <div className="nav-status"><span className="status-dot" /> Interactive proof</div>
        <a className="nav-link" href="#business">Business model <span aria-hidden="true">↗</span></a>
      </nav>

      <section className="hero" id="top">
        <div className="eyebrow"><span>01</span> Payment chaos lab</div>
        <div className="hero-grid">
          <div>
            <h1>One payment.<br /><em>Twenty webhooks.</em><br />One order.</h1>
          </div>
          <div className="hero-copy">
            <p>RevenueGuard proves your checkout survives duplicate, delayed, and concurrent payment events—before customers find out the expensive way.</p>
            <button className="primary-button" onClick={runStorm} disabled={runState === "running"}>
              {runState === "running" ? "Storm in progress…" : runState === "complete" ? "Run it again" : "Launch webhook storm"}
              <span aria-hidden="true">→</span>
            </button>
          </div>
        </div>
      </section>

      <section className={`lab-shell ${mode}`} aria-labelledby="lab-title">
        <div className="lab-topbar">
          <div>
            <span className="section-kicker">Live experiment</span>
            <h2 id="lab-title">The duplicate-order race</h2>
          </div>
          <div className="mode-switch" role="group" aria-label="Choose payment processor mode">
            <button className={mode === "vulnerable" ? "active" : ""} onClick={() => selectMode("vulnerable")}>Vulnerable</button>
            <button className={mode === "protected" ? "active" : ""} onClick={() => selectMode("protected")}>Protected</button>
          </div>
        </div>

        <div className="metric-grid" aria-live="polite">
          <article className="metric-card">
            <span>Payments received</span><strong>1</strong><small>Stripe test mode</small>
          </article>
          <article className="metric-card">
            <span>Webhook deliveries</span><strong>{result.deliveries}</strong><small>Same event ID</small>
          </article>
          <article className={`metric-card ${mode === "vulnerable" && result.orders > 1 ? "danger-card" : "success-card"}`}>
            <span>Orders created</span><strong>{result.orders}</strong><small>{mode === "vulnerable" ? "Expected exactly one" : "Invariant protected"}</small>
          </article>
          <article className="metric-card">
            <span>{mode === "vulnerable" ? "Revenue at risk" : "Duplicates blocked"}</span>
            <strong>{mode === "vulnerable" ? result.risk : result.duplicates}</strong>
            <small>{mode === "vulnerable" ? "Simulated exposure" : "Safely acknowledged"}</small>
          </article>
        </div>

        <div className="lab-grid">
          <article className="panel trace-panel">
            <div className="panel-header">
              <div><span className="panel-label">Sentry trace</span><h3>evt_7r91 · payment_intent.succeeded</h3></div>
              <span className={`trace-status ${mode}`}>{mode === "vulnerable" ? "race detected" : "idempotent"}</span>
            </div>
            <div className="trace-ruler"><span>0 ms</span><span>25</span><span>50</span><span>75</span><span>100 ms</span></div>
            <div className="waterfall" aria-label="Webhook processing trace">
              {(mode === "vulnerable"
                ? [
                    ["worker.a · order.lookup", 4, 29, "violet"],
                    ["worker.b · order.lookup", 11, 34, "violet"],
                    ["worker.a · order.create", 34, 42, "red"],
                    ["worker.b · order.create", 43, 44, "red"],
                  ]
                : [
                    ["worker.a · ledger.claim", 4, 22, "lime"],
                    ["worker.a · order.upsert", 27, 38, "lime"],
                    ["worker.b · duplicate_ignored", 11, 19, "muted"],
                    ["worker.a · fulfillment", 70, 22, "lime"],
                  ]
              ).map(([label, left, width, color]) => (
                <div className="trace-row" key={String(label)}>
                  <span>{label}</span>
                  <div className="trace-track"><i className={String(color)} style={{ left: `${left}%`, width: `${width}%` }} /></div>
                </div>
              ))}
            </div>
            <div className={`finding ${mode}`}>
              <span className="finding-symbol">{mode === "vulnerable" ? "!" : "✓"}</span>
              <p>{mode === "vulnerable"
                ? "Both workers checked before either inserted. The application—not Stripe—created the duplicate."
                : "The event ledger allowed one worker to proceed. Every retry exited safely before fulfillment."}</p>
            </div>
          </article>

          <article className="panel event-panel">
            <div className="panel-header">
              <div><span className="panel-label">Event stream</span><h3>Deterministic replay</h3></div>
              <span className="live-chip"><span /> live</span>
            </div>
            <div className="console" aria-live="polite">
              <div className="console-head"><span>EVENT</span><span>SPAN</span><span>RESULT</span><span>TIME</span></div>
              {logs.slice(0, visibleLogs).map((row, index) => (
                <div className="console-row" key={`${row[1]}-${index}`}>
                  {row.map((cell, cellIndex) => <span key={cellIndex}>{cell}</span>)}
                </div>
              ))}
              {runState === "idle" && <div className="console-empty">Ready. Launch the storm to stream traces.</div>}
              {runState === "running" && <div className="console-cursor">Processing <span /></div>}
            </div>
            <button className={`run-button ${mode}`} onClick={runStorm} disabled={runState === "running"}>
              <span>{runState === "running" ? "Running 20 events" : mode === "vulnerable" ? "Run vulnerable flow" : "Replay protected flow"}</span>
              <b aria-hidden="true">{runState === "running" ? "•••" : "↗"}</b>
            </button>
          </article>
        </div>

        {mode === "vulnerable" && runState === "complete" && (
          <div className="fix-banner">
            <div><span>Race reproduced</span><strong>7 orders from one payment.</strong></div>
            <p>Claim the Stripe event inside the same database transaction as the business operation.</p>
            <button onClick={() => selectMode("protected")}>Apply atomic fix <span aria-hidden="true">→</span></button>
          </div>
        )}
        {mode === "protected" && runState === "complete" && (
          <div className="fix-banner solved">
            <div><span>Invariant held</span><strong>20 deliveries. One order.</strong></div>
            <p>The database—not timing, memory, or luck—now guarantees exactly-once fulfillment.</p>
            <button onClick={() => selectMode("vulnerable")}>Compare before <span aria-hidden="true">↗</span></button>
          </div>
        )}
      </section>

      <section className="ai-section">
        <div className="eyebrow"><span>02</span> Google AI adversary</div>
        <div className="ai-grid">
          <div>
            <h2>Gemini thinks like<br />an unreliable network.</h2>
            <p>It proposes hostile event schedules. Our deterministic runner executes them. Sentry shows precisely where the business invariant breaks.</p>
            <div className="logic-line"><span>Gemini proposes</span><i>→</i><span>Tests attack</span><i>→</i><span>Sentry proves</span></div>
          </div>
          <div className="attack-list">
            <div className="attack-head"><span>Generated attack suite</span><b>4 scenarios</b></div>
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

      <section className="business-section" id="business">
        <div className="business-card">
          <span className="section-kicker">After the hackathon</span>
          <h2>Chaos testing for<br /><em>the money path.</em></h2>
          <p>Run RevenueGuard in CI before every release. Catch duplicate fulfillment, stale subscription state, and unsafe retries before they reach production.</p>
          <div className="price-row">
            <div><span>Open-source CLI</span><strong>$0</strong></div>
            <div><span>Startup cloud</span><strong>$99<small>/mo</small></strong></div>
            <div><span>Reliability audit</span><strong>$999</strong></div>
          </div>
        </div>
        <footer>
          <div className="brand"><span className="brand-mark">RG</span><span>RevenueGuard</span></div>
          <p>One payment should always mean one order.</p>
          <span>Built for DEV Summer Bug Smash 2026</span>
        </footer>
      </section>
    </main>
  );
}
