import { requireUser, toRouteErrorMessage } from "@/app/api/_lib";
import { env } from "cloudflare:workers";
import { readIntegrationSettings } from "@/db/commercial-data";
import { callBitrix, type BitrixDealListItem } from "../_client";

const MAX_IMPORT_PREVIEW = 200;

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

    const items: BitrixDealListItem[] = [];
    let start = 0;
    while (items.length < MAX_IMPORT_PREVIEW) {
      const page = await callBitrix<BitrixDealListItem[]>(settings.bitrixWebhookUrl, "crm.deal.list", {
        select: ["ID", "TITLE", "OPPORTUNITY", "STAGE_ID", "DATE_CREATE"],
        start,
      });
      items.push(...page);
      if (page.length < 50) break;
      start += 50;
    }

    return Response.json({
      items: items.slice(0, MAX_IMPORT_PREVIEW).map((item) => ({
        bitrixId: item.ID,
        title: item.TITLE,
        amount: Number(item.OPPORTUNITY) || 0,
        stageId: item.STAGE_ID,
        dateCreate: item.DATE_CREATE,
      })),
    });
  } catch (error) {
    console.error("POST /api/integrations/bitrix/import failed:", error);
    return Response.json({ error: toRouteErrorMessage(error) }, { status: 500 });
  }
}
