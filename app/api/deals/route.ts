import { isValidDateInput, isValidStage, requireUser, toFiniteNonNegative, toRouteErrorMessage, writeAudit } from "@/app/api/_lib";
import { MONTH_NAMES } from "@/app/deriveMetrics";
import { env } from "cloudflare:workers";
import { readDealsAndTargets } from "@/db/commercial-data";

export async function GET() {
  try {
    if (!env.DB) {
      return Response.json(
        { error: "Banco de dados indisponível neste ambiente." },
        { status: 503 },
      );
    }
    const { deals, targets } = await readDealsAndTargets(env.DB);
    return Response.json({ deals, targets });
  } catch (error) {
    console.error("GET /api/deals failed:", error);
    return Response.json({ error: toRouteErrorMessage(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;

  try {
    if (!env.DB) {
      return Response.json(
        { error: "Banco de dados indisponível neste ambiente." },
        { status: 503 },
      );
    }

    const payload = (await request.json()) as Record<string, unknown>;

    const company = typeof payload.company === "string" ? payload.company.trim() : "";
    const owner = typeof payload.owner === "string" ? payload.owner.trim() : "";
    const monthNumber = Number(payload.monthNumber);
    const sold = toFiniteNonNegative(payload.sold);

    if (!company) {
      return Response.json({ error: "Empresa é obrigatória." }, { status: 400 });
    }
    if (!owner) {
      return Response.json({ error: "Responsável é obrigatório." }, { status: 400 });
    }
    if (!Number.isInteger(monthNumber) || monthNumber < 1 || monthNumber > 12) {
      return Response.json({ error: "Mês inválido." }, { status: 400 });
    }
    if (sold === null) {
      return Response.json({ error: "Valor vendido inválido." }, { status: 400 });
    }

    const origin = typeof payload.origin === "string" ? payload.origin.trim() : "";
    const adjusted = payload.adjusted === undefined ? sold : toFiniteNonNegative(payload.adjusted);
    const billed = payload.billed === undefined ? 0 : toFiniteNonNegative(payload.billed);
    const stage = payload.stage === undefined ? "aberto" : payload.stage;
    const notes = typeof payload.notes === "string" ? payload.notes.trim() : null;
    const year = Number.isInteger(Number(payload.year)) ? Number(payload.year) : 2026;

    if (adjusted === null) {
      return Response.json({ error: "Valor ajustado inválido." }, { status: 400 });
    }
    if (billed === null) {
      return Response.json({ error: "Valor faturado inválido." }, { status: 400 });
    }
    if (!isValidStage(stage)) {
      return Response.json({ error: "Etapa inválida." }, { status: 400 });
    }
    if (!isValidDateInput(payload.proposalAcceptedAt)) {
      return Response.json({ error: "Data de proposta inválida." }, { status: 400 });
    }
    if (!isValidDateInput(payload.contractSignedAt)) {
      return Response.json({ error: "Data de contrato inválida." }, { status: 400 });
    }

    const proposalAcceptedAt = (payload.proposalAcceptedAt as string | null) ?? null;
    const contractSignedAt = (payload.contractSignedAt as string | null) ?? null;

    const deal = {
      id: crypto.randomUUID(),
      year,
      monthNumber,
      month: MONTH_NAMES[monthNumber - 1],
      owner,
      company,
      origin,
      sold,
      governedSold: sold,
      adjusted,
      billed,
      variance: billed - sold,
      billingStatus: stage === "pago" ? "Pago" : stage === "faturado" ? "Faturado" : "Sem status",
      stage,
      notes,
      proposalAcceptedAt,
      contractSignedAt,
      contractSigned: contractSignedAt ? "V" : "X",
      products: {},
      sourceSheet: null,
      sourceRow: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: user.email,
      updatedBy: user.email,
    };

    await env.DB.prepare(
      "INSERT INTO commercial_deals (id, year, month_number, month, owner, company, origin, sold, adjusted, billed, stage, notes, created_by, updated_by, payload_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
      .bind(
        deal.id,
        deal.year,
        deal.monthNumber,
        deal.month,
        deal.owner,
        deal.company,
        deal.origin,
        deal.sold,
        deal.adjusted,
        deal.billed,
        deal.stage,
        deal.notes,
        user.email,
        user.email,
        JSON.stringify(deal),
      )
      .run();

    await writeAudit({
      actorEmail: user.email,
      action: "deal.create",
      entity: "commercial_deal",
      entityId: deal.id,
      detail: { company: deal.company, owner: deal.owner, adjusted: deal.adjusted },
    });

    return Response.json({ deal }, { status: 201 });
  } catch (error) {
    console.error("POST /api/deals failed:", error);
    return Response.json({ error: toRouteErrorMessage(error) }, { status: 500 });
  }
}
