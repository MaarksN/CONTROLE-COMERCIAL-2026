import { requireUser, toRouteErrorMessage, writeAudit } from "@/app/api/_lib";
import type { ActionHorizon, ActionStatus } from "@/app/deriveDashboard";
import { env } from "cloudflare:workers";
import { deleteActionItem, updateActionItem } from "@/db/commercial-data";

type RouteContext = { params: Promise<{ id: string }> };

const HORIZONS: ActionHorizon[] = ["h0", "h1", "h2", "h3"];
const STATUSES: ActionStatus[] = ["pendente", "andamento", "concluido"];

export async function PATCH(request: Request, context: RouteContext) {
  const { user, response } = await requireUser();
  if (!user) return response;

  try {
    if (!env.DB) {
      return Response.json({ error: "Banco de dados indisponível neste ambiente." }, { status: 503 });
    }

    const { id } = await context.params;
    const payload = (await request.json()) as Record<string, unknown>;

    const patch: Partial<{
      title: string;
      description: string;
      owner: string | null;
      horizon: ActionHorizon;
      status: ActionStatus;
      dueDate: string | null;
    }> = {};

    if (payload.title !== undefined) {
      const title = typeof payload.title === "string" ? payload.title.trim() : "";
      if (!title) return Response.json({ error: "Título é obrigatório." }, { status: 400 });
      patch.title = title;
    }
    if (payload.description !== undefined) {
      patch.description = typeof payload.description === "string" ? payload.description.trim() : "";
    }
    if (payload.owner !== undefined) {
      patch.owner =
        typeof payload.owner === "string" && payload.owner.trim() ? payload.owner.trim() : null;
    }
    if (payload.horizon !== undefined) {
      if (!HORIZONS.includes(payload.horizon as ActionHorizon)) {
        return Response.json({ error: "Horizonte inválido." }, { status: 400 });
      }
      patch.horizon = payload.horizon as ActionHorizon;
    }
    if (payload.status !== undefined) {
      if (!STATUSES.includes(payload.status as ActionStatus)) {
        return Response.json({ error: "Status inválido." }, { status: 400 });
      }
      patch.status = payload.status as ActionStatus;
    }
    if (payload.dueDate !== undefined) {
      patch.dueDate =
        typeof payload.dueDate === "string" && payload.dueDate.trim() ? payload.dueDate.trim() : null;
    }

    const actionItem = await updateActionItem(env.DB, id, patch, user.email);
    if (!actionItem) {
      return Response.json({ error: "Item não encontrado." }, { status: 404 });
    }

    await writeAudit({
      actorEmail: user.email,
      action: "action_item.update",
      entity: "action_item",
      entityId: id,
      detail: { title: actionItem.title, status: actionItem.status },
    });

    return Response.json({ actionItem });
  } catch (error) {
    return Response.json({ error: toRouteErrorMessage(error) }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { user, response } = await requireUser();
  if (!user) return response;

  try {
    if (!env.DB) {
      return Response.json({ error: "Banco de dados indisponível neste ambiente." }, { status: 503 });
    }

    const { id } = await context.params;
    const deleted = await deleteActionItem(env.DB, id);
    if (!deleted) {
      return Response.json({ error: "Item não encontrado." }, { status: 404 });
    }

    await writeAudit({
      actorEmail: user.email,
      action: "action_item.delete",
      entity: "action_item",
      entityId: id,
      detail: { title: deleted.title },
    });

    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: toRouteErrorMessage(error) }, { status: 500 });
  }
}
