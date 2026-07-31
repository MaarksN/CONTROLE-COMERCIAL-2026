import { requireChatGPTUser } from "@/app/chatgpt-auth";
import { writeAudit } from "@/app/api/_lib";
import { env } from "cloudflare:workers";
import { readIntegrationSettings, upsertGoogleOAuthToken } from "@/db/commercial-data";
import { exchangeGoogleAuthCode, fetchGoogleAccountEmail, GOOGLE_CALLBACK_PATH } from "../_client";

/** Finishes the Google OAuth flow: exchanges the code for tokens and stores them. */
export async function GET(request: Request) {
  const user = await requireChatGPTUser("/");

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const oauthError = url.searchParams.get("error");

  if (oauthError) {
    return Response.redirect(new URL(`/?googleError=${encodeURIComponent(oauthError)}`, request.url), 302);
  }
  if (!code) {
    return Response.redirect(new URL("/?googleError=codigo_ausente", request.url), 302);
  }
  if (!env.DB) {
    return Response.redirect(new URL("/?googleError=banco_indisponivel", request.url), 302);
  }

  try {
    const settings = await readIntegrationSettings(env.DB);
    if (!settings.googleClientId || !settings.googleClientSecret) {
      return Response.redirect(new URL("/?googleError=credenciais_ausentes", request.url), 302);
    }

    const redirectUri = new URL(GOOGLE_CALLBACK_PATH, request.url).toString();
    const tokens = await exchangeGoogleAuthCode(
      settings.googleClientId,
      settings.googleClientSecret,
      code,
      redirectUri,
    );
    const googleAccountEmail = await fetchGoogleAccountEmail(tokens.access_token);

    await upsertGoogleOAuthToken(env.DB, {
      userEmail: user.email,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? null,
      expiresAt: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      scopes: tokens.scope ?? "",
      googleAccountEmail,
    });

    await writeAudit({
      actorEmail: user.email,
      action: "google.connect",
      entity: "google_oauth_tokens",
      detail: { googleAccountEmail },
    });

    return Response.redirect(new URL("/?googleConnected=1", request.url), 302);
  } catch (error) {
    console.error("GET /api/integrations/google/callback failed:", error);
    return Response.redirect(new URL("/?googleError=falha_na_conexao", request.url), 302);
  }
}
