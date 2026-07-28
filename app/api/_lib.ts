import { getChatGPTUser } from "@/app/chatgpt-auth";
import { STAGES, type Stage } from "@/app/deriveMetrics";
import { getDb } from "@/db";
import { resolveCanEdit } from "@/db/commercial-data";
import { auditLog } from "@/db/schema";

/**
 * Gates every write route: must be signed in AND hold an editable role in
 * `user_roles` (checked here, not just in the UI — the UI hiding a button
 * is not access control by itself; this is what actually enforces it).
 */
export async function requireUser() {
  const user = await getChatGPTUser();
  if (!user) {
    return {
      user: null,
      response: Response.json(
        { error: "Autenticação necessária para editar." },
        { status: 401 },
      ),
    };
  }

  const canEdit = await resolveCanEdit(user.email);
  if (!canEdit) {
    return {
      user: null,
      response: Response.json(
        {
          error:
            "Sua conta não tem permissão de edição. Peça a um administrador para liberar seu acesso em user_roles.",
        },
        { status: 403 },
      ),
    };
  }

  return { user, response: null };
}

export function toRouteErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "Erro inesperado";
  const detail =
    error instanceof Error && error.cause instanceof Error ? error.cause.message : "";
  const combined = `${message}\n${detail}`;

  if (combined.includes("no such table") || combined.includes("no such column")) {
    return "O banco de dados ainda não tem essa estrutura. Rode `npm run db:generate` e implante a migração antes de tentar de novo.";
  }

  return message;
}

export async function writeAudit(params: {
  actorEmail: string;
  action: string;
  entity: string;
  entityId?: string | null;
  detail?: Record<string, unknown>;
}) {
  const db = getDb();
  await db.insert(auditLog).values({
    actorEmail: params.actorEmail,
    action: params.action,
    entity: params.entity,
    entityId: params.entityId ?? null,
    detailJson: JSON.stringify(params.detail ?? {}),
  });
}

export function isValidStage(value: unknown): value is Stage {
  return typeof value === "string" && STAGES.includes(value as Stage);
}

export function toFiniteNonNegative(value: unknown): number | null {
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) return null;
  return num;
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** Validates a `YYYY-MM-DD` date string. `undefined`/`null`/`""` all mean "no date". */
export function isValidDateInput(value: unknown): value is string | null | undefined {
  if (value === undefined || value === null || value === "") return true;
  return typeof value === "string" && DATE_ONLY.test(value);
}
