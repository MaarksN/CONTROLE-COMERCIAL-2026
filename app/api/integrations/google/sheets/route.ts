import { requireUser, toRouteErrorMessage, writeAudit } from "@/app/api/_lib";
import { env } from "cloudflare:workers";
import { getValidGoogleAccessToken } from "../_client";

const SHEETS_BASE_URL = "https://sheets.googleapis.com/v4/spreadsheets";

type DealRow = {
  id: string;
  month: string;
  owner: string;
  company: string;
  origin: string;
  stage: string;
  adjusted: number;
  billed: number;
};

const HEADER = ["ID", "Mês", "Responsável", "Empresa", "Origem", "Etapa", "Ajustado", "Faturado"];

/** Creates a new Google Sheet and populates it with the current deals. */
export async function POST(request: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;

  try {
    if (!env.DB) {
      return Response.json({ error: "Banco de dados indisponível neste ambiente." }, { status: 503 });
    }

    const payload = (await request.json()) as { deals?: DealRow[] };
    const deals = Array.isArray(payload.deals) ? payload.deals : [];

    const accessToken = await getValidGoogleAccessToken(env.DB, user.email);
    const title = `Atlas Comercial 360 — Negócios (${new Date().toISOString().slice(0, 10)})`;

    const createRes = await fetch(SHEETS_BASE_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ properties: { title } }),
    });
    const created = (await createRes.json()) as {
      spreadsheetId?: string;
      spreadsheetUrl?: string;
      error?: { message?: string };
    };
    if (!createRes.ok || !created.spreadsheetId) {
      throw new Error(created.error?.message ?? "Falha ao criar a planilha no Google Sheets.");
    }

    const rows = [
      HEADER,
      ...deals.map((deal) => [
        deal.id,
        deal.month,
        deal.owner,
        deal.company,
        deal.origin,
        deal.stage,
        deal.adjusted,
        deal.billed,
      ]),
    ];

    const writeRes = await fetch(
      `${SHEETS_BASE_URL}/${created.spreadsheetId}/values/A1?valueInputOption=RAW`,
      {
        method: "PUT",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ values: rows }),
      },
    );
    if (!writeRes.ok) {
      const writeError = (await writeRes.json()) as { error?: { message?: string } };
      throw new Error(writeError.error?.message ?? "Planilha criada, mas falhou ao preencher os dados.");
    }

    await writeAudit({
      actorEmail: user.email,
      action: "google.sheets.export_deals",
      entity: "commercial_deal",
      detail: { count: deals.length, spreadsheetId: created.spreadsheetId },
    });

    return Response.json({ ok: true, spreadsheetUrl: created.spreadsheetUrl ?? null });
  } catch (error) {
    console.error("POST /api/integrations/google/sheets failed:", error);
    return Response.json({ error: toRouteErrorMessage(error) }, { status: 500 });
  }
}
