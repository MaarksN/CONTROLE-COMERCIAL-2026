import { toRouteErrorMessage } from "@/app/api/_lib";
import { env } from "cloudflare:workers";
import { readAlertStates } from "@/db/commercial-data";

/**
 * Alerts themselves are computed live client-side (`computeAlerts` in
 * app/deriveAlerts.ts) from the same deals/targets/etc. already polled by
 * the dashboard — recomputing them here would just duplicate that logic.
 * This route only serves the persisted human interaction (dismiss/resolve)
 * so it survives across recomputation and across sessions.
 */
export async function GET() {
  try {
    if (!env.DB) {
      return Response.json(
        { error: "Banco de dados indisponível neste ambiente." },
        { status: 503 },
      );
    }
    const alertStates = await readAlertStates(env.DB);
    return Response.json({ alertStates });
  } catch (error) {
    return Response.json({ error: toRouteErrorMessage(error) }, { status: 500 });
  }
}
