import { requireUser, toRouteErrorMessage, writeAudit } from "@/app/api/_lib";
import { getDb } from "@/db";
import { commercialDeals } from "@/db/schema";
import { eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { readIntegrationSettings, recordIntegrationSyncResult } from "@/db/commercial-data";
import { callBitrix } from "../_client";

type DealRow = { id: string; payload_json: string };

export async function POST(request: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;

  try {
    if (!env.DB) {
      return Response.json({ error: "Banco de dados indisponível neste ambiente." }, { status: 503 });
    }

    const settings = await readIntegrationSettings(env.DB);
    if (!settings.bitrixWebhookUrl) {
      return Response.json(
        { error: "Webhook do Bitrix24 não configurado. Configure em Integrações." },
        { status: 400 },
      );
    }
    const webhookUrl = settings.bitrixWebhookUrl;

    const payload = (await request.json()) as { dealIds?: string[] };
    const dealIds = Array.isArray(payload.dealIds) ? payload.dealIds : [];
    if (dealIds.length === 0) {
      return Response.json({ error: "Nenhum negócio selecionado para exportar." }, { status: 400 });
    }

    let created = 0;
    let updated = 0;
    let failed = 0;

    for (const dealId of dealIds) {
      try {
        const db = getDb();
        const row = await db.select({ id: commercialDeals.id, payload_json: commercialDeals.payloadJson })
          .from(commercialDeals)
          .where(eq(commercialDeals.id, dealId))
          .get();
        if (!row) {
          failed += 1;
          continue;
        }

        const deal = JSON.parse(row.payload_json) as Record<string, unknown> & {
          bitrixId?: string;
        };
        const fields = {
          TITLE: deal.company,
          OPPORTUNITY: deal.adjusted,
        };

        if (deal.bitrixId) {
          await callBitrix(webhookUrl, "crm.deal.update", { id: deal.bitrixId, fields });
          updated += 1;
        } else {
          const newId = await callBitrix<number>(webhookUrl, "crm.deal.add", { fields });
          deal.bitrixId = String(newId);
          await db.update(commercialDeals)
            .set({ payloadJson: JSON.stringify(deal) })
            .where(eq(commercialDeals.id, dealId))
            .run();
          created += 1;
        }
      } catch (itemError) {
        console.error(`Bitrix export failed for deal ${dealId}:`, itemError);
        failed += 1;
      }
    }

    await writeAudit({
      actorEmail: user.email,
      action: "bitrix.export",
      entity: "commercial_deal",
      detail: { created, updated, failed },
    });

    await recordIntegrationSyncResult(env.DB, {
      id: "bitrix",
      ok: failed === 0,
      error: failed > 0 ? `${failed} de ${dealIds.length} negócio(s) falharam ao exportar.` : null,
    });

    return Response.json({ created, updated, failed });
  } catch (error) {
    console.error("POST /api/integrations/bitrix/export failed:", error);
    if (env.DB) {
      await recordIntegrationSyncResult(env.DB, {
        id: "bitrix",
        ok: false,
        error: toRouteErrorMessage(error),
      });
    }
    return Response.json({ error: toRouteErrorMessage(error) }, { status: 500 });
  }
}
