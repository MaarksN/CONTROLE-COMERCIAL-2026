import { toRouteErrorMessage } from "@/app/api/_lib";
import { env } from "cloudflare:workers";
import { readSellerGrowthTargets } from "@/db/commercial-data";

export async function GET() {
  try {
    if (!env.DB) {
      return Response.json(
        { error: "Banco de dados indisponível neste ambiente." },
        { status: 503 },
      );
    }
    const growthTargets = await readSellerGrowthTargets(env.DB);
    return Response.json({ growthTargets });
  } catch (error) {
    return Response.json({ error: toRouteErrorMessage(error) }, { status: 500 });
  }
}
