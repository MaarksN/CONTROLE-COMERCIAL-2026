import { toRouteErrorMessage } from "@/app/api/_lib";
import { env } from "cloudflare:workers";
import { readIntegrationSyncStates } from "@/db/commercial-data";

/**
 * Reports the outcome of each integration's most recent sync attempt (e.g.
 * Bitrix24 import/export), so the dashboard poll can feed it into
 * computeAlerts (app/deriveAlerts.ts) and the Integrações tab can show a
 * "last synced" / error status.
 */
export async function GET() {
  try {
    if (!env.DB) {
      return Response.json(
        { error: "Banco de dados indisponível neste ambiente." },
        { status: 503 },
      );
    }
    const integrationSyncStates = await readIntegrationSyncStates(env.DB);
    return Response.json({ integrationSyncStates });
  } catch (error) {
    return Response.json({ error: toRouteErrorMessage(error) }, { status: 500 });
  }
}
