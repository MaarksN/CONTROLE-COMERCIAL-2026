import { toRouteErrorMessage } from "@/app/api/_lib";
import { and, desc, eq, gte, lte, type SQL } from "drizzle-orm";
import { getDb } from "@/db";
import { auditLog } from "@/db/schema";

/**
 * Governance-grade audit query: filters by actor/action/entity/date range so
 * a real "quem fez o quê, quando" investigation doesn't require scrolling
 * through an unfiltered feed. All filters are optional and additive (AND).
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const limitParam = Number(url.searchParams.get("limit"));
    const limit = Number.isInteger(limitParam) && limitParam > 0 ? Math.min(limitParam, 500) : 20;

    const actor = url.searchParams.get("actor");
    const action = url.searchParams.get("action");
    const entity = url.searchParams.get("entity");
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");

    const conditions: SQL[] = [];
    if (actor) conditions.push(eq(auditLog.actorEmail, actor));
    if (action) conditions.push(eq(auditLog.action, action));
    if (entity) conditions.push(eq(auditLog.entity, entity));
    if (from) conditions.push(gte(auditLog.createdAt, from));
    if (to) conditions.push(lte(auditLog.createdAt, to));

    const db = getDb();
    const query = db.select().from(auditLog).orderBy(desc(auditLog.createdAt), desc(auditLog.id)).limit(limit);
    const rows = conditions.length > 0 ? await query.where(and(...conditions)) : await query;

    return Response.json({ activity: rows });
  } catch (error) {
    console.error("GET /api/activity failed:", error);
    return Response.json({ error: toRouteErrorMessage(error) }, { status: 500 });
  }
}
