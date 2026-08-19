import { sql } from "drizzle-orm";
import { integer, sqliteTable, text, uniqueIndex, index } from "drizzle-orm/sqlite-core";

export const simulationRuns = sqliteTable("simulation_runs", {
  id: text("id").primaryKey(),
  mode: text("mode", { enum: ["vulnerable", "protected"] }).notNull(),
  eventCount: integer("event_count").notNull(),
  orderCount: integer("order_count").notNull(),
  duplicatesBlocked: integer("duplicates_blocked").notNull().default(0),
  revenueAtRisk: integer("revenue_at_risk").notNull().default(0),
  paymentRef: text("payment_ref").notNull(),
  eventRef: text("event_ref").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const webhookAttempts = sqliteTable("webhook_attempts", {
  id: text("id").primaryKey(),
  runId: text("run_id").notNull().references(() => simulationRuns.id, { onDelete: "cascade" }),
  sequence: integer("sequence").notNull(),
  span: text("span").notNull(),
  outcome: text("outcome").notNull(),
  durationMs: integer("duration_ms").notNull(),
}, (table) => [
  index("idx_webhook_attempts_run_id").on(table.runId),
]);

export const orderExecutions = sqliteTable("order_executions", {
  id: text("id").primaryKey(),
  runId: text("run_id").notNull().references(() => simulationRuns.id, { onDelete: "cascade" }),
  paymentRef: text("payment_ref").notNull(),
  idempotencyKey: text("idempotency_key"),
  amountCents: integer("amount_cents").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("idx_order_executions_run_id").on(table.runId),
  uniqueIndex("idx_order_executions_idempotency_key").on(table.idempotencyKey),
]);
