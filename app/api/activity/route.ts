import { toRouteErrorMessage } from "@/app/api/_lib";
import { desc } from "drizzle-orm";
import { getDb } from "@/db";
import { auditLog } from "@/db/schema";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const limitParam = Number(url.searchParams.get("limit"));
    const limit = Number.isInteger(limitParam) && limitParam > 0 ? Math.min(limitParam, 100) : 20;

    const db = getDb();
    const rows = await db
      .select()
      .from(auditLog)
      .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
      .limit(limit);

    return Response.json({ activity: rows });
  } catch (error) {
    console.error("GET /api/activity failed:", error);
    return Response.json({ error: toRouteErrorMessage(error) }, { status: 500 });
  }
}
