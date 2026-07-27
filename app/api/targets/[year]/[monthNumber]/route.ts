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

    const month = MONTH_NAMES[monthNumber - 1];

    await env.DB.prepare(
      `INSERT INTO monthly_metrics (year, month_number, month, target, sold, adjusted, payload_json)
       VALUES (?, ?, ?, ?, 0, 0, '{}')
       ON CONFLICT(year, month_number) DO UPDATE SET target = excluded.target`,
    )
      .bind(year, monthNumber, month, target)
      .run();

    await writeAudit({
      actorEmail: user.email,
      action: "target.update",
      entity: "monthly_target",
      entityId: `${year}-${monthNumber}`,
      detail: { year, monthNumber, month, target },
    });

    return Response.json({ target: { year, monthNumber, month, target } });
  } catch (error) {
    console.error("PATCH /api/targets failed:", error);
    return Response.json({ error: toRouteErrorMessage(error) }, { status: 500 });
  }
}
