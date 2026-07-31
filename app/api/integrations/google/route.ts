import { requireUser, toRouteErrorMessage, writeAudit } from "@/app/api/_lib";
import { env } from "cloudflare:workers";
import { deleteGoogleOAuthToken, readGoogleOAuthToken } from "@/db/commercial-data";

/** Reports whether the current user has a connected Google account. */
export async function GET() {
  const { user, response } = await requireUser();
  if (!user) return response;

  try {
    if (!env.DB) {
      return Response.json({ error: "Banco de dados indisponível neste ambiente." }, { status: 503 });
    }
    const token = await readGoogleOAuthToken(env.DB, user.email);
    return Response.json({
      connected: Boolean(token),
      googleAccountEmail: token?.googleAccountEmail ?? null,
    });
  } catch (error) {
    return Response.json({ error: toRouteErrorMessage(error) }, { status: 500 });
  }
}

/** Disconnects the current user's Google account. */
export async function DELETE() {
  const { user, response } = await requireUser();
  if (!user) return response;

  try {
    if (!env.DB) {
      return Response.json({ error: "Banco de dados indisponível neste ambiente." }, { status: 503 });
    }
    await deleteGoogleOAuthToken(env.DB, user.email);
    await writeAudit({ actorEmail: user.email, action: "google.disconnect", entity: "google_oauth_tokens" });
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: toRouteErrorMessage(error) }, { status: 500 });
  }
}
