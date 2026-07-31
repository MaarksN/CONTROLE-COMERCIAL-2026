import { requireUser, toRouteErrorMessage, writeAudit } from "@/app/api/_lib";
import { env } from "cloudflare:workers";
import { getValidGoogleAccessToken } from "../_client";

const CALENDAR_EVENTS_URL = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

/** Creates a Google Calendar follow-up reminder for an alert's deals. */
export async function POST(request: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;

  try {
    if (!env.DB) {
      return Response.json({ error: "Banco de dados indisponível neste ambiente." }, { status: 503 });
    }

    const payload = (await request.json()) as { title?: string; description?: string };
    const title = typeof payload.title === "string" ? payload.title.trim() : "";
    if (!title) {
      return Response.json({ error: "Título do lembrete é obrigatório." }, { status: 400 });
    }

    const accessToken = await getValidGoogleAccessToken(env.DB, user.email);

    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const date = tomorrow.toISOString().slice(0, 10);

    const res = await fetch(CALENDAR_EVENTS_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        summary: `Follow-up: ${title}`,
        description: payload.description ?? "",
        start: { date },
        end: { date },
      }),
    });
    const json = (await res.json()) as { htmlLink?: string; error?: { message?: string } };
    if (!res.ok) {
      throw new Error(json.error?.message ?? "Falha ao criar evento no Google Calendar.");
    }

    await writeAudit({
      actorEmail: user.email,
      action: "google.calendar.create_reminder",
      entity: "commercial_deal",
      detail: { title },
    });

    return Response.json({ ok: true, htmlLink: json.htmlLink ?? null });
  } catch (error) {
    console.error("POST /api/integrations/google/calendar failed:", error);
    return Response.json({ error: toRouteErrorMessage(error) }, { status: 500 });
  }
}
