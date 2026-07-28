import { toRouteErrorMessage } from "@/app/api/_lib";
import { env } from "cloudflare:workers";
import { readObjectives } from "@/db/commercial-data";

export async function GET() {
  try {
    if (!env.DB) {
      return Response.json({ error: "Banco de dados indisponível neste ambiente." }, { status: 503 });
    }
    const objectives = await readObjectives(env.DB);
    return Response.json({ objectives });
  } catch (error) {
    console.error("GET /api/objectives failed:", error);
    return Response.json({ error: toRouteErrorMessage(error) }, { status: 500 });
  }
}
