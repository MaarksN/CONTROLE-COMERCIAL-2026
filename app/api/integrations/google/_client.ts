import { readGoogleOAuthToken, readIntegrationSettings, upsertGoogleOAuthToken } from "@/db/commercial-data";

export const GOOGLE_CALLBACK_PATH = "/api/integrations/google/callback";

/**
 * Scopes for every Google Workspace feature this app wires up (Calendar
 * follow-up reminders, Gmail alert digests, Sheets export), requested
 * up front on first connect so the user only has to consent once.
 */
export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/spreadsheets",
].join(" ");

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";

export function buildGoogleAuthUrl(clientId: string, redirectUri: string): string {
  const url = new URL(GOOGLE_AUTH_URL);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GOOGLE_SCOPES);
  url.searchParams.set("access_type", "offline");
  // Always show consent so a refresh_token is (re)issued — Google only
  // returns one on the first-ever consent otherwise.
  url.searchParams.set("prompt", "consent");
  return url.toString();
}

type GoogleTokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
  error?: string;
  error_description?: string;
};

async function requestToken(clientId: string, clientSecret: string, body: Record<string, string>) {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, ...body }),
  });
  const json = (await res.json()) as GoogleTokenResponse;
  if (!res.ok || json.error) {
    throw new Error(`Google OAuth respondeu com erro: ${json.error_description ?? json.error ?? res.status}`);
  }
  return json;
}

export async function exchangeGoogleAuthCode(
  clientId: string,
  clientSecret: string,
  code: string,
  redirectUri: string,
) {
  return requestToken(clientId, clientSecret, {
    code,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });
}

export async function fetchGoogleAccountEmail(accessToken: string): Promise<string | null> {
  const res = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { email?: string };
  return json.email ?? null;
}

/**
 * Returns a valid access token for the given app user, transparently
 * refreshing it first if it's expired. Throws if the user hasn't connected
 * a Google account or the stored refresh token has been revoked.
 */
export async function getValidGoogleAccessToken(
  database: D1Database,
  userEmail: string,
): Promise<string> {
  const token = await readGoogleOAuthToken(database, userEmail);
  if (!token) {
    throw new Error("Conta Google não conectada. Conecte em Integrações.");
  }

  const expiresInMs = new Date(token.expiresAt).getTime() - Date.now();
  if (expiresInMs > 60_000) return token.accessToken;

  if (!token.refreshToken) {
    throw new Error("Sessão Google expirada. Reconecte a conta em Integrações.");
  }

  const settings = await readIntegrationSettings(database);
  if (!settings.googleClientId || !settings.googleClientSecret) {
    throw new Error("Credenciais Google (Client ID/Secret) não configuradas em Integrações.");
  }

  const refreshed = await requestToken(settings.googleClientId, settings.googleClientSecret, {
    refresh_token: token.refreshToken,
    grant_type: "refresh_token",
  });

  const expiresAt = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
  await upsertGoogleOAuthToken(database, {
    userEmail,
    accessToken: refreshed.access_token,
    refreshToken: refreshed.refresh_token ?? token.refreshToken,
    expiresAt,
    scopes: refreshed.scope ?? token.scopes,
    googleAccountEmail: token.googleAccountEmail,
  });

  return refreshed.access_token;
}
