import { isValidDateInput, isValidStage, requireUser, toFiniteNonNegative, toRouteErrorMessage, writeAudit } from "@/app/api/_lib";
import { MONTH_NAMES } from "@/app/deriveMetrics";
import { getDb } from "@/db";
import { commercialDeals } from "@/db/schema";
import { eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { rowToDeal } from "@/db/commercial-data";

type RouteContext = { params: Promise<{ id: string }> };

type ExistingRow = {
  id: string;
  year: number;
  month_number: number;
  month: string;
  owner: string;
  company: string;
  origin: string;
  sold: number;
  adjusted: number;
  billed: number;
  stage: string;
  notes: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  payload_json: string;
};

async function fetchRow(id: string): Promise<ExistingRow | null> {
  const db = getDb();
  const row = await db.select().from(commercialDeals).where(eq(commercialDeals.id, id)).get();
  if (!row) return null;
  return {
    id: row.id,
    year: row.year,
    month_number: row.monthNumber,
    month: row.month,
    owner: row.owner,
    company: row.company,
    origin: row.origin,
    sold: row.sold,
    adjusted: row.adjusted,
    billed: row.billed,
    stage: row.stage,
    notes: row.notes,
    created_by: row.createdBy,
    updated_by: row.updatedBy,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
    payload_json: row.payloadJson,
  };
}

export async function PATCH(request: Request, context: RouteContext) {
  const { user, response } = await requireUser();
  if (!user) return response;

  try {
    if (!env.DB) {
      return Response.json({ error: "Banco de dados indisponível neste ambiente." }, { status: 503 });
    }

    const { id } = await context.params;
    const existing = await fetchRow(id);
    if (!existing) {
      return Response.json({ error: "Negócio não encontrado." }, { status: 404 });
    }

    const payload = (await request.json()) as Record<string, unknown>;
    const existingDeal = rowToDeal(existing);

    const next = { ...existingDeal };
    const isStageOnlyMove =
      Object.keys(payload).length === 1 && Object.prototype.hasOwnProperty.call(payload, "stage");

    if (payload.company !== undefined) {
      const company = typeof payload.company === "string" ? payload.company.trim() : "";
      if (!company) return Response.json({ error: "Empresa é obrigatória." }, { status: 400 });
      next.company = company;
    }
    if (payload.owner !== undefined) {
      const owner = typeof payload.owner === "string" ? payload.owner.trim() : "";
      if (!owner) return Response.json({ error: "Responsável é obrigatório." }, { status: 400 });
      next.owner = owner;
    }
    if (payload.origin !== undefined) {
      next.origin = typeof payload.origin === "string" ? payload.origin.trim() : "";
    }
    if (payload.monthNumber !== undefined) {
      const monthNumber = Number(payload.monthNumber);
      if (!Number.isInteger(monthNumber) || monthNumber < 1 || monthNumber > 12) {
        return Response.json({ error: "Mês inválido." }, { status: 400 });
      }
      next.monthNumber = monthNumber;
      next.month = MONTH_NAMES[monthNumber - 1];
    }
    if (payload.sold !== undefined) {
      const sold = toFiniteNonNegative(payload.sold);
      if (sold === null) return Response.json({ error: "Valor vendido inválido." }, { status: 400 });
      next.sold = sold;
    }
    if (payload.adjusted !== undefined) {
      const adjusted = toFiniteNonNegative(payload.adjusted);
      if (adjusted === null)
        return Response.json({ error: "Valor ajustado inválido." }, { status: 400 });
      next.adjusted = adjusted;
    }
    if (payload.billed !== undefined) {
      const billed = toFiniteNonNegative(payload.billed);
      if (billed === null)
        return Response.json({ error: "Valor faturado inválido." }, { status: 400 });
      next.billed = billed;
    }
    if (payload.stage !== undefined) {
      if (!isValidStage(payload.stage)) {
        return Response.json({ error: "Etapa inválida." }, { status: 400 });
      }
      next.stage = payload.stage;
    }
    if (payload.notes !== undefined) {
      next.notes = typeof payload.notes === "string" ? payload.notes.trim() : null;
    }
    if (payload.proposalAcceptedAt !== undefined) {
      if (!isValidDateInput(payload.proposalAcceptedAt)) {
        return Response.json({ error: "Data de proposta inválida." }, { status: 400 });
      }
      next.proposalAcceptedAt = payload.proposalAcceptedAt as string | null;
    }
    if (payload.contractSignedAt !== undefined) {
      if (!isValidDateInput(payload.contractSignedAt)) {
        return Response.json({ error: "Data de contrato inválida." }, { status: 400 });
      }
      next.contractSignedAt = payload.contractSignedAt as string | null;
    }

    next.variance = next.billed - next.sold;
    next.updatedAt = new Date().toISOString();
    next.updatedBy = user.email;

    const db = getDb();
    await db.update(commercialDeals).set({
      year: next.year,
      monthNumber: next.monthNumber,
      month: next.month,
      owner: next.owner,
      company: next.company,
      origin: next.origin,
      sold: next.sold,
      adjusted: next.adjusted,
      billed: next.billed,
      stage: next.stage,
      notes: next.notes,
      updatedBy: user.email,
      updatedAt: next.updatedAt,
      payloadJson: JSON.stringify(next),
    }).where(eq(commercialDeals.id, id)).run();

    await writeAudit({
      actorEmail: user.email,
      action: isStageOnlyMove ? "deal.stage_move" : "deal.update",
      entity: "commercial_deal",
      entityId: id,
      detail: isStageOnlyMove
        ? { from: existingDeal.stage, to: next.stage }
        : { company: next.company, owner: next.owner },
    });

    return Response.json({ deal: next });
  } catch (error) {
    console.error("PATCH /api/deals/[id] failed:", error);
    return Response.json({ error: toRouteErrorMessage(error) }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { user, response } = await requireUser();
  if (!user) return response;

  try {
    if (!env.DB) {
      return Response.json({ error: "Banco de dados indisponível neste ambiente." }, { status: 503 });
    }

    const { id } = await context.params;
    const existing = await fetchRow(id);
    if (!existing) {
      return Response.json({ error: "Negócio não encontrado." }, { status: 404 });
    }

    await writeAudit({
      actorEmail: user.email,
      action: "deal.delete",
      entity: "commercial_deal",
      entityId: id,
      detail: { company: existing.company, owner: existing.owner, adjusted: existing.adjusted },
    });

    const db = getDb();
    await db.delete(commercialDeals).where(eq(commercialDeals.id, id)).run();

    return Response.json({ ok: true });
  } catch (error) {
    console.error("DELETE /api/deals/[id] failed:", error);
    return Response.json({ error: toRouteErrorMessage(error) }, { status: 500 });
  }
}
