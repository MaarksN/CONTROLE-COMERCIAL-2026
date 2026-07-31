import { requireUser, toRouteErrorMessage, writeAudit } from "@/app/api/_lib";
import { env } from "cloudflare:workers";
import { getValidGoogleAccessToken } from "../_client";

const GMAIL_SEND_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";

type AlertSummary = {
  title: string;
  description: string;
  severity: string;
  recommendation: string;
};

function toBase64Url(value: string): string {
  const base64 = btoa(unescape(encodeURIComponent(value)));
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function buildDigestEmail(to: string, alerts: AlertSummary[]): string {
  const lines = alerts.map(
    (alert, index) =>
      `${index + 1}. [${alert.severity}] ${alert.title}\n   ${alert.description}\n   Recomendação: ${alert.recommendation}`,
  );
  const body = alerts.length
    ? `Resumo de alertas abertos no Atlas Comercial 360:\n\n${lines.join("\n\n")}`
    : "Nenhum alerta aberto no momento.";

  return [
    `To: ${to}`,
    "Subject: Atlas Comercial 360 — Resumo de alertas",
    "Content-Type: text/plain; charset=utf-8",
    "",
    body,
  ].join("\r\n");
}

/** Sends the currently open alerts as an email digest via Gmail. */
export async function POST(request: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;

  try {
    if (!env.DB) {
      return Response.json({ error: "Banco de dados indisponível neste ambiente." }, { status: 503 });
    }

    const payload = (await request.json()) as { alerts?: AlertSummary[] };
    const alerts = Array.isArray(payload.alerts) ? payload.alerts : [];

    const accessToken = await getValidGoogleAccessToken(env.DB, user.email);
    const raw = toBase64Url(buildDigestEmail(user.email, alerts));

    const res = await fetch(GMAIL_SEND_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ raw }),
    });
    const json = (await res.json()) as { id?: string; error?: { message?: string } };
    if (!res.ok) {
      throw new Error(json.error?.message ?? "Falha ao enviar e-mail via Gmail.");
    }

    await writeAudit({
      actorEmail: user.email,
      action: "google.gmail.send_alert_digest",
      entity: "alert",
      detail: { count: alerts.length },
    });

    return Response.json({ ok: true });
  } catch (error) {
    console.error("POST /api/integrations/google/gmail failed:", error);
    return Response.json({ error: toRouteErrorMessage(error) }, { status: 500 });
  }
}
