import { requireUser, toRouteErrorMessage, writeAudit } from "@/app/api/_lib";
import type { ActionHorizon } from "@/app/deriveDashboard";
import { env } from "cloudflare:workers";
import { addActionItem, readActionItems } from "@/db/commercial-data";

const HORIZONS: ActionHorizon[] = ["h0", "h1", "h2", "h3"];

export async function GET() {
  try {
    if (!env.DB) {
      return Response.json(
        { error: "Banco de dados indisponível neste ambiente." },
        { status: 503 },
      );
    }
    const actionItems = await readActionItems(env.DB);
    return Response.json({ actionItems });
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
    const title = typeof payload.title === "string" ? payload.title.trim() : "";
    const description =
      typeof payload.description === "string" ? payload.description.trim() : "";
    const owner = typeof payload.owner === "string" && payload.owner.trim() ? payload.owner.trim() : null;
    const horizon = HORIZONS.includes(payload.horizon as ActionHorizon)
      ? (payload.horizon as ActionHorizon)
      : "h1";

    if (!title) {
      return Response.json({ error: "Título é obrigatório." }, { status: 400 });
    }

    const actionItem = await addActionItem(env.DB, {
      title,
      description,
      owner,
      horizon,
      source: "Interno",
      actorEmail: user.email,
    });

    await writeAudit({
      actorEmail: user.email,
      action: "action_item.create",
      entity: "action_item",
      entityId: actionItem.id,
      detail: { title: actionItem.title, horizon: actionItem.horizon },
    });

    return Response.json({ actionItem }, { status: 201 });
  } catch (error) {
    return Response.json({ error: toRouteErrorMessage(error) }, { status: 500 });
  }
}
