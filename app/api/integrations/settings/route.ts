import { requireUser, toRouteErrorMessage, writeAudit } from "@/app/api/_lib";
import { env } from "cloudflare:workers";
import { readIntegrationSettings, upsertIntegrationSettings } from "@/db/commercial-data";

/** Never return the raw secret — only whether it's set and its last 4 characters. */
function maskSecret(value: string | null): string | null {
  if (!value) return null;
  if (value.length <= 4) return "•".repeat(value.length);
  return `••••${value.slice(-4)}`;
}

/** A blank string from the form means "leave unchanged", not "clear the key". */
function toUpdate(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

export async function GET() {
  const { user, response } = await requireUser();
  if (!user) return response;

  try {
    if (!env.DB) {
      return Response.json({ error: "Banco de dados indisponível neste ambiente." }, { status: 503 });
    }

    const settings = await readIntegrationSettings(env.DB);
    return Response.json({
      bitrixConfigured: Boolean(settings.bitrixWebhookUrl),
      bitrixWebhookMasked: maskSecret(settings.bitrixWebhookUrl),
      apolloConfigured: Boolean(settings.apolloApiKey),
      apolloKeyMasked: maskSecret(settings.apolloApiKey),
      googleConfigured: Boolean(settings.googleApiKey),
      googleKeyMasked: maskSecret(settings.googleApiKey),
      aiProvider: settings.aiProvider,
      openaiConfigured: Boolean(settings.openaiApiKey),
      openaiKeyMasked: maskSecret(settings.openaiApiKey),
      anthropicConfigured: Boolean(settings.anthropicApiKey),
      anthropicKeyMasked: maskSecret(settings.anthropicApiKey),
    });
  } catch (error) {
    console.error("GET /api/integrations/settings failed:", error);
    return Response.json({ error: toRouteErrorMessage(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;

  try {
    if (!env.DB) {
      return Response.json({ error: "Banco de dados indisponível neste ambiente." }, { status: 503 });
    }

    const payload = (await request.json()) as Record<string, unknown>;

    const aiProvider =
      payload.aiProvider === "openai" || payload.aiProvider === "anthropic"
        ? payload.aiProvider
        : payload.aiProvider === "auto"
          ? "auto"
          : undefined;

    await upsertIntegrationSettings(env.DB, {
      bitrixWebhookUrl: toUpdate(payload.bitrixWebhookUrl),
      apolloApiKey: toUpdate(payload.apolloApiKey),
      googleApiKey: toUpdate(payload.googleApiKey),
      aiProvider,
      openaiApiKey: toUpdate(payload.openaiApiKey),
      anthropicApiKey: toUpdate(payload.anthropicApiKey),
      updatedBy: user.email,
    });

    await writeAudit({
      actorEmail: user.email,
      action: "integration_settings.update",
      entity: "integration_settings",
      detail: {
        bitrixWebhookUrl: toUpdate(payload.bitrixWebhookUrl) ? "updated" : undefined,
        apolloApiKey: toUpdate(payload.apolloApiKey) ? "updated" : undefined,
        googleApiKey: toUpdate(payload.googleApiKey) ? "updated" : undefined,
        aiProvider,
        openaiApiKey: toUpdate(payload.openaiApiKey) ? "updated" : undefined,
        anthropicApiKey: toUpdate(payload.anthropicApiKey) ? "updated" : undefined,
      },
    });

    return Response.json({ ok: true });
  } catch (error) {
    console.error("POST /api/integrations/settings failed:", error);
    return Response.json({ error: toRouteErrorMessage(error) }, { status: 500 });
  }
}
