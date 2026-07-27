import { requireUser, toRouteErrorMessage, writeAudit } from "@/app/api/_lib";
import type { Seller, SellerRole } from "@/app/deriveMetrics";
import { env } from "cloudflare:workers";
import { addSellerToRoster, readSellerRoster } from "@/db/commercial-data";

const ROLES: SellerRole[] = ["Vendedor", "SDR"];

export async function GET() {
  try {
    if (!env.DB) {
      return Response.json(
        { error: "Banco de dados indisponível neste ambiente." },
        { status: 503 },
      );
    }
    const sellers = await readSellerRoster(env.DB);
    return Response.json({ sellers });
  } catch (error) {
    return Response.json({ error: toRouteErrorMessage(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;

  try {
    if (!env.DB) {
      return Response.json(
        { error: "Banco de dados indisponível neste ambiente." },
        { status: 503 },
      );
    }

    const payload = (await request.json()) as Record<string, unknown>;
    const name = typeof payload.name === "string" ? payload.name.trim() : "";
    const role = payload.role === "SDR" ? "SDR" : "Vendedor";

    if (!name) {
      return Response.json({ error: "Nome é obrigatório." }, { status: 400 });
    }
    if (!ROLES.includes(role)) {
      return Response.json({ error: "Papel inválido." }, { status: 400 });
    }

    const seller: Seller = { name, role };
    const sellers = await addSellerToRoster(env.DB, seller);

    await writeAudit({
      actorEmail: user.email,
      action: "seller.create",
      entity: "seller",
      entityId: name,
      detail: { name, role },
    });

    return Response.json({ seller, sellers }, { status: 201 });
  } catch (error) {
    return Response.json({ error: toRouteErrorMessage(error) }, { status: 500 });
  }
}
