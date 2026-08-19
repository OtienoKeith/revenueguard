import * as Sentry from "@sentry/cloudflare";
import { desc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { orderExecutions, simulationRuns, webhookAttempts } from "../../../db/schema";

type Mode = "vulnerable" | "protected";

function publicRun(run: typeof simulationRuns.$inferSelect) {
  return {
    id: run.id,
    mode: run.mode,
    eventCount: run.eventCount,
    orderCount: run.orderCount,
    duplicatesBlocked: run.duplicatesBlocked,
    revenueAtRisk: run.revenueAtRisk,
    paymentRef: run.paymentRef,
    eventRef: run.eventRef,
    createdAt: run.createdAt,
  };
}

export async function GET() {
  try {
    const db = getDb();
    const runs = await db.select().from(simulationRuns).orderBy(desc(simulationRuns.createdAt)).limit(8);
    return Response.json({ runs: runs.map(publicRun) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to load runs" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const payload = await request.json().catch(() => ({})) as { mode?: string; eventCount?: number };
    const mode: Mode = payload.mode === "protected" ? "protected" : "vulnerable";
    const eventCount = Math.max(2, Math.min(50, Number(payload.eventCount) || 20));
    const runId = crypto.randomUUID();
    const shortId = runId.slice(0, 8);
    const paymentRef = `pi_demo_${shortId}`;
    const eventRef = `evt_demo_${shortId}`;
    const orderCount = mode === "vulnerable" ? Math.min(7, Math.max(2, Math.ceil(eventCount / 3))) : 1;
    const duplicatesBlocked = mode === "protected" ? eventCount - 1 : 0;
    const revenueAtRisk = mode === "vulnerable" ? (orderCount - 1) * 149 : 0;
    const db = getDb();

    Sentry.setTags({
      "revenueguard.mode": mode,
      "revenueguard.event_count": eventCount,
    });

    const runWrite = db.insert(simulationRuns).values({
      id: runId,
      mode,
      eventCount,
      orderCount,
      duplicatesBlocked,
      revenueAtRisk,
      paymentRef,
      eventRef,
    });

    const attempts = Array.from({ length: eventCount }, (_, index) => ({
      id: crypto.randomUUID(),
      runId,
      sequence: index + 1,
      span: mode === "protected"
        ? index === 0 ? "ledger.claim" : "webhook.duplicate"
        : index < orderCount ? "order.create" : "webhook.acknowledge",
      outcome: mode === "protected"
        ? index === 0 ? "acquired" : "duplicate_ignored"
        : index < orderCount ? `order_${String(index + 1).padStart(2, "0")}` : "acknowledged",
      durationMs: mode === "protected" ? 8 + (index % 5) : 34 + (index % 17),
    }));
    const orders = Array.from({ length: orderCount }, () => ({
      id: crypto.randomUUID(),
      runId,
      paymentRef,
      idempotencyKey: mode === "protected" ? `${runId}:${eventRef}` : null,
      amountCents: 14900,
    }));
    // D1 limits bound parameters per statement, so attempts stay chunked.
    // Execute all writes in one D1 batch to avoid a round trip per chunk.
    const attemptWrites = Array.from(
      { length: Math.ceil(attempts.length / 10) },
      (_, chunkIndex) => db.insert(webhookAttempts).values(attempts.slice(chunkIndex * 10, chunkIndex * 10 + 10)),
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
      () => db.batch([runWrite, ...attemptWrites, db.insert(orderExecutions).values(orders)]),
    );

    const storedOrders = await db.select().from(orderExecutions).where(eq(orderExecutions.runId, runId));
    const logs = mode === "vulnerable"
      ? [
          [eventRef, "order.lookup", "not found", "12 ms"],
          [eventRef, "order.lookup", "not found", "14 ms"],
          [eventRef, "order.create", "order_01", "46 ms"],
          [eventRef, "order.create", "order_02", "51 ms"],
          [eventRef, "fulfillment", `${storedOrders.length} executions`, "88 ms"],
        ]
      : [
          [eventRef, "ledger.claim", "acquired", "8 ms"],
          [eventRef, "order.upsert", "order_01", "31 ms"],
          [eventRef, "fulfillment", "completed", "62 ms"],
          [eventRef, "ledger.claim", "duplicate", "9 ms"],
          [eventRef, "webhook", `${duplicatesBlocked} ignored`, "12 ms"],
        ];
    const trace = mode === "vulnerable"
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
        ];

    Sentry.logger.info("RevenueGuard simulation completed", {
      run_id: runId,
      mode,
      event_count: eventCount,
      order_count: storedOrders.length,
      duplicates_blocked: duplicatesBlocked,
      revenue_at_risk: revenueAtRisk,
    });

    return Response.json({
      runId,
      eventRef,
      mode,
      persisted: true,
      metrics: {
        deliveries: eventCount,
        orders: storedOrders.length,
        duplicates: duplicatesBlocked,
        risk: `$${revenueAtRisk}`,
      },
      logs,
      trace,
    }, { status: 201 });
  } catch (error) {
    Sentry.captureException(error);
    return Response.json({ error: error instanceof Error ? error.message : "Simulation failed" }, { status: 500 });
  }
}
