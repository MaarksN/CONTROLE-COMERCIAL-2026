import { requireUser, toFiniteNonNegative, toRouteErrorMessage, writeAudit } from "@/app/api/_lib";
import { MONTH_NAMES } from "@/app/deriveMetrics";
import { env } from "cloudflare:workers";

type RouteContext = { params: Promise<{ year: string; monthNumber: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const { user, response } = await requireUser();
  if (!user) return response;

  try {
    if (!env.DB) {
      return Response.json({ error: "Banco de dados indisponível neste ambiente." }, { status: 503 });
    }

    const { year: yearParam, monthNumber: monthNumberParam } = await context.params;
    const year = Number(yearParam);
    const monthNumber = Number(monthNumberParam);

    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      return Response.json({ error: "Ano inválido." }, { status: 400 });
    }
    if (!Number.isInteger(monthNumber) || monthNumber < 1 || monthNumber > 12) {
      return Response.json({ error: "Mês inválido." }, { status: 400 });
    }

    const payload = (await request.json()) as Record<string, unknown>;
    const target = toFiniteNonNegative(payload.target);
    if (target === null) {
      return Response.json({ error: "Meta inválida." }, { status: 400 });
    }
    const sold = payload.sold === undefined ? null : toFiniteNonNegative(payload.sold);
    if (payload.sold !== undefined && sold === null) {
      return Response.json({ error: "Valor vendido inválido." }, { status: 400 });
    }
    const adjusted = payload.adjusted === undefined ? null : toFiniteNonNegative(payload.adjusted);
    if (payload.adjusted !== undefined && adjusted === null) {
      return Response.json({ error: "Valor ajustado inválido." }, { status: 400 });
    }

    const month = MONTH_NAMES[monthNumber - 1];
    const existing = await env.DB.prepare(
      "SELECT sold, adjusted FROM monthly_metrics WHERE year = ? AND month_number = ?",
    )
      .bind(year, monthNumber)
      .first<{ sold: number; adjusted: number }>();
    const nextSold = sold ?? existing?.sold ?? 0;
    const nextAdjusted = adjusted ?? existing?.adjusted ?? 0;

    await env.DB.prepare(
      `INSERT INTO monthly_metrics (year, month_number, month, target, sold, adjusted, payload_json)
       VALUES (?, ?, ?, ?, ?, ?, '{}')
       ON CONFLICT(year, month_number) DO UPDATE SET target = excluded.target, sold = excluded.sold, adjusted = excluded.adjusted`,
    )
      .bind(year, monthNumber, month, target, nextSold, nextAdjusted)
      .run();

    await writeAudit({
      actorEmail: user.email,
      action: "target.update",
      entity: "monthly_target",
      entityId: `${year}-${monthNumber}`,
      detail: { year, monthNumber, month, target, sold: nextSold, adjusted: nextAdjusted },
    });

    return Response.json({
      target: { year, monthNumber, month, target, sold: nextSold, adjusted: nextAdjusted },
    });
  } catch (error) {
    console.error("PATCH /api/targets failed:", error);
    return Response.json({ error: toRouteErrorMessage(error) }, { status: 500 });
  }
}
