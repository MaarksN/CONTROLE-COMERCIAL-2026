import { requireUser, toRouteErrorMessage, writeAudit } from "@/app/api/_lib";
import { env } from "cloudflare:workers";
import { upsertAlertState } from "@/db/commercial-data";

type RouteContext = { params: Promise<{ key: string }> };

const VALID_STATUSES = new Set(["aberto", "dispensado", "resolvido"]);

export async function PATCH(request: Request, context: RouteContext) {
  const { user, response } = await requireUser();
  if (!user) return response;

  try {
    if (!env.DB) {
      return Response.json({ error: "Banco de dados indisponível neste ambiente." }, { status: 503 });
    }

    const { key: keyParam } = await context.params;
    const key = decodeURIComponent(keyParam).trim();
    if (!key) {
      return Response.json({ error: "Alerta inválido." }, { status: 400 });
    }

    const payload = (await request.json()) as Record<string, unknown>;
    const status = typeof payload.status === "string" ? payload.status : "";
    if (!VALID_STATUSES.has(status)) {
      return Response.json({ error: "Status inválido." }, { status: 400 });
    }
    if (status === "dispensado" && !String(payload.justification ?? "").trim()) {
      return Response.json(
        { error: "Informe uma justificativa para dispensar o alerta." },
        { status: 400 },
      );
    }

    const justification =
      typeof payload.justification === "string" && payload.justification.trim()
        ? payload.justification.trim()
        : null;

    const alertState = await upsertAlertState(env.DB, {
      key,
      status: status as "aberto" | "dispensado" | "resolvido",
      justification,
      actorEmail: user.email,
    });

    await writeAudit({
      actorEmail: user.email,
      action: status === "dispensado" ? "alert.dismiss" : status === "resolvido" ? "alert.resolve" : "alert.reopen",
      entity: "alert_state",
      entityId: key,
      detail: { status, justification },
    });

    return Response.json({ alertState });
  } catch (error) {
    console.error("PATCH /api/alerts/[key] failed:", error);
    return Response.json({ error: toRouteErrorMessage(error) }, { status: 500 });
  }
}
