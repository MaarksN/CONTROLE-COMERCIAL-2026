import { requireChatGPTUser } from "@/app/chatgpt-auth";
import { env } from "cloudflare:workers";
import { readIntegrationSettings } from "@/db/commercial-data";
import { buildGoogleAuthUrl, GOOGLE_CALLBACK_PATH } from "../_client";

/** Starts the Google OAuth consent flow — redirects the browser to Google. */
export async function GET(request: Request) {
  await requireChatGPTUser("/");

  if (!env.DB) {
    return Response.json({ error: "Banco de dados indisponível neste ambiente." }, { status: 503 });
  }

  const settings = await readIntegrationSettings(env.DB);
  if (!settings.googleClientId) {
    return Response.json(
      { error: "Client ID do Google não configurado. Configure em Integrações." },
      { status: 400 },
    );
  }

  const redirectUri = new URL(GOOGLE_CALLBACK_PATH, request.url).toString();
  const authUrl = buildGoogleAuthUrl(settings.googleClientId, redirectUri);
  return Response.redirect(authUrl, 302);
}
