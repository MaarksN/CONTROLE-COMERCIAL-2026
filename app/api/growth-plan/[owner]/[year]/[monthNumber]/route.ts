import { requireUser, toFiniteNonNegative, toRouteErrorMessage, writeAudit } from "@/app/api/_lib";
import { MONTH_NAMES } from "@/app/deriveMetrics";
import { env } from "cloudflare:workers";
import { upsertSellerGrowthTarget } from "@/db/commercial-data";

type RouteContext = { params: Promise<{ owner: string; year: string; monthNumber: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const { user, response } = await requireUser();
  if (!user) return response;

  try {
    if (!env.DB) {
      return Response.json({ error: "Banco de dados indisponível neste ambiente." }, { status: 503 });
    }

    const { owner: ownerParam, year: yearParam, monthNumber: monthNumberParam } =
      await context.params;
    const owner = decodeURIComponent(ownerParam).trim();
    const year = Number(yearParam);
    const monthNumber = Number(monthNumberParam);

    if (!owner) {
      return Response.json({ error: "Vendedor inválido." }, { status: 400 });
    }
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      return Response.json({ error: "Ano inválido." }, { status: 400 });
    }
    if (!Number.isInteger(monthNumber) || monthNumber < 1 || monthNumber > 12) {
      return Response.json({ error: "Mês inválido." }, { status: 400 });
    }

    const payload = (await request.json()) as Record<string, unknown>;
    const entryTarget = toFiniteNonNegative(payload.entryTarget);
    if (entryTarget === null) {
      return Response.json({ error: "Meta de entrada inválida." }, { status: 400 });
    }
    const realizedTarget = toFiniteNonNegative(payload.realizedTarget);
    if (realizedTarget === null) {
      return Response.json({ error: "Meta de realizado inválida." }, { status: 400 });
    }

    const month = MONTH_NAMES[monthNumber - 1];
    const growthTarget = await upsertSellerGrowthTarget(env.DB, {
      owner,
      year,
      monthNumber,
      month,
      entryTarget,
      realizedTarget,
      actorEmail: user.email,
    });

    await writeAudit({
      actorEmail: user.email,
      action: "growth_target.update",
      entity: "seller_growth_target",
      entityId: `${owner}-${year}-${monthNumber}`,
      detail: { owner, year, monthNumber, month, entryTarget, realizedTarget },
    });

    return Response.json({ growthTarget });
  } catch (error) {
    console.error("PATCH /api/growth-plan failed:", error);
    return Response.json({ error: toRouteErrorMessage(error) }, { status: 500 });
  }
}
