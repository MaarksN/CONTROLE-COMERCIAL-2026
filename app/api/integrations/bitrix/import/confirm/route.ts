import { requireUser, toRouteErrorMessage, writeAudit } from "@/app/api/_lib";
import { MONTH_NAMES } from "@/app/deriveMetrics";
import { getDb } from "@/db";
import { commercialDeals } from "@/db/schema";
import { env } from "cloudflare:workers";

type ImportItem = {
  bitrixId: string;
  title: string;
  amount: number;
  stageId: string;
};

export async function POST(request: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;

  try {
    if (!env.DB) {
      return Response.json({ error: "Banco de dados indisponível neste ambiente." }, { status: 503 });
    }

    const payload = (await request.json()) as { items?: ImportItem[] };
    const items = Array.isArray(payload.items) ? payload.items : [];
    if (items.length === 0) {
      return Response.json({ error: "Nenhum negócio selecionado para importar." }, { status: 400 });
    }

    const now = new Date();
    const monthNumber = now.getMonth() + 1;
    const year = now.getFullYear();

    for (const item of items) {
      const company = (item.title || "Negócio importado do Bitrix24").trim();
      const amount = Number.isFinite(item.amount) ? item.amount : 0;
      const deal = {
        id: crypto.randomUUID(),
        year,
        monthNumber,
        month: MONTH_NAMES[monthNumber - 1],
        owner: user.email,
        company,
        origin: "Bitrix24",
        sold: amount,
        governedSold: amount,
        adjusted: amount,
        billed: 0,
        variance: -amount,
        billingStatus: "Sem status",
        stage: "aberto",
        notes: `Importado do Bitrix24 (ID ${item.bitrixId}, etapa original ${item.stageId}).`,
        proposalAcceptedAt: null,
        contractSignedAt: null,
        contractSigned: "X",
        products: {},
        sourceSheet: null,
        sourceRow: null,
        bitrixId: item.bitrixId,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
        createdBy: user.email,
        updatedBy: user.email,
      };

      const db = getDb();
      await db.insert(commercialDeals).values({
        id: deal.id,
        year: deal.year,
        monthNumber: deal.monthNumber,
        month: deal.month,
        owner: deal.owner,
        company: deal.company,
        origin: deal.origin,
        sold: deal.sold,
        adjusted: deal.adjusted,
        billed: deal.billed,
        stage: deal.stage,
        notes: deal.notes,
        createdBy: user.email,
        updatedBy: user.email,
        payloadJson: JSON.stringify(deal),
      }).run();
    }

    await writeAudit({
      actorEmail: user.email,
      action: "bitrix.import",
      entity: "commercial_deal",
      detail: { count: items.length },
    });

    return Response.json({ imported: items.length });
  } catch (error) {
    console.error("POST /api/integrations/bitrix/import/confirm failed:", error);
    return Response.json({ error: toRouteErrorMessage(error) }, { status: 500 });
  }
}
