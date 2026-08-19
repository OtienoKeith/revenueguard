import { getDb } from "../../../db";
import { simulationRuns } from "../../../db/schema";

export async function GET() {
  const startedAt = Date.now();
  try {
    const db = getDb();
    await db.select({ id: simulationRuns.id }).from(simulationRuns).limit(1);
    return Response.json({
      status: "ok",
      backend: "cloudflare-worker",
      database: "d1-connected",
      latencyMs: Date.now() - startedAt,
      checkedAt: new Date().toISOString(),
    });
  } catch (error) {
    return Response.json({
      status: "degraded",
      database: "unavailable",
      message: error instanceof Error ? error.message : "Database check failed",
    }, { status: 503 });
  }
}
