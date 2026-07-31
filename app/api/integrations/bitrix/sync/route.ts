import { requireUser, toRouteErrorMessage, writeAudit } from "@/app/api/_lib";
import { getDb } from "@/db";
import { commercialDeals } from "@/db/schema";
import { eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { readIntegrationSettings, recordIntegrationSyncResult } from "@/db/commercial-data";
import { callBitrix, type BitrixDealListItem } from "../_client";

const MAX_PULL_PAGE = 200;

/**
 * Runs both sync directions in one call so the Integrações tab (and its
 * background timer) can keep Bitrix24 current without a manual click:
 *  - push: every local deal is created/updated in Bitrix24 (same fields as
 *    the manual "Exportar" action).
 *  - pull: local deals already linked to a Bitrix24 deal (have a bitrixId)
 *    get their amount refreshed from Bitrix24's current OPPORTUNITY value.
 * Deals that exist in Bitrix24 but were never imported locally are
 * intentionally NOT auto-created here — that still goes through the manual
 * "Importar" preview/confirm flow so a human reviews new deals before they
 * count toward revenue. Stage/pipeline is not synced (Bitrix24 STAGE_ID
 * values are portal-specific and don't map cleanly onto the local
 * aberto/ganho/faturado/pago stages without per-portal configuration).
 */
export async function POST() {
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
    const db = getDb();

    const localRows = await db
      .select({ id: commercialDeals.id, payloadJson: commercialDeals.payloadJson })
      .from(commercialDeals)
      .all();

    let pushed = 0;
    let pulled = 0;
    let failed = 0;

    // Push: create/update every local deal in Bitrix24.
    for (const row of localRows) {
      try {
        const deal = JSON.parse(row.payloadJson) as Record<string, unknown> & { bitrixId?: string };
        const fields = { TITLE: deal.company, OPPORTUNITY: deal.adjusted };

        if (deal.bitrixId) {
          await callBitrix(webhookUrl, "crm.deal.update", { id: deal.bitrixId, fields });
        } else {
          const newId = await callBitrix<number>(webhookUrl, "crm.deal.add", { fields });
          deal.bitrixId = String(newId);
          await db
            .update(commercialDeals)
            .set({ payloadJson: JSON.stringify(deal) })
            .where(eq(commercialDeals.id, row.id))
            .run();
        }
        pushed += 1;
      } catch (itemError) {
        console.error(`Bitrix sync push failed for deal ${row.id}:`, itemError);
        failed += 1;
      }
    }

    // Pull: refresh amounts for deals already linked to Bitrix24.
    const bitrixAmountById = new Map<string, number>();
    let start = 0;
    while (bitrixAmountById.size < MAX_PULL_PAGE) {
      const page = await callBitrix<BitrixDealListItem[]>(webhookUrl, "crm.deal.list", {
        select: ["ID", "OPPORTUNITY"],
        start,
      });
      for (const item of page) bitrixAmountById.set(item.ID, Number(item.OPPORTUNITY) || 0);
      if (page.length < 50) break;
      start += 50;
    }

    for (const row of localRows) {
      try {
        const deal = JSON.parse(row.payloadJson) as Record<string, unknown> & {
          bitrixId?: string;
          adjusted?: number;
          sold?: number;
        };
        if (!deal.bitrixId) continue;
        const remoteAmount = bitrixAmountById.get(deal.bitrixId);
        if (remoteAmount === undefined || remoteAmount === deal.adjusted) continue;

        deal.sold = remoteAmount;
        deal.adjusted = remoteAmount;
        await db
          .update(commercialDeals)
          .set({ sold: remoteAmount, adjusted: remoteAmount, payloadJson: JSON.stringify(deal) })
          .where(eq(commercialDeals.id, row.id))
          .run();
        pulled += 1;
      } catch (itemError) {
        console.error(`Bitrix sync pull failed for deal ${row.id}:`, itemError);
        failed += 1;
      }
    }

    await writeAudit({
      actorEmail: user.email,
      action: "bitrix.sync",
      entity: "commercial_deal",
      detail: { pushed, pulled, failed },
    });

    await recordIntegrationSyncResult(env.DB, {
      id: "bitrix",
      ok: failed === 0,
      error: failed > 0 ? `${failed} negócio(s) falharam durante a sincronização automática.` : null,
    });

    return Response.json({ pushed, pulled, failed });
  } catch (error) {
    console.error("POST /api/integrations/bitrix/sync failed:", error);
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
