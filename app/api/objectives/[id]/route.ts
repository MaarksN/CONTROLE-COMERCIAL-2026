import { requireUser, toFiniteNonNegative, toRouteErrorMessage, writeAudit } from "@/app/api/_lib";
import { env } from "cloudflare:workers";
import { readObjectives, updateObjective } from "@/db/commercial-data";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const { user, response } = await requireUser();
  if (!user) return response;

  try {
    if (!env.DB) {
      return Response.json({ error: "Banco de dados indisponível neste ambiente." }, { status: 503 });
    }

    const { id } = await context.params;
    const objectives = await readObjectives(env.DB);
    const existing = objectives.find((objective) => objective.id === id);
    if (!existing) {
      return Response.json({ error: "Objetivo não encontrado." }, { status: 404 });
    }

    const payload = (await request.json()) as {
      title?: unknown;
      owner?: unknown;
      cadence?: unknown;
      keyResults?: unknown;
    };

    const title = typeof payload.title === "string" ? payload.title.trim() : "";
    const owner = typeof payload.owner === "string" ? payload.owner.trim() : "";
    const cadence = typeof payload.cadence === "string" ? payload.cadence.trim() : "";
    if (!title) return Response.json({ error: "Título é obrigatório." }, { status: 400 });
    if (!owner) return Response.json({ error: "Responsável é obrigatório." }, { status: 400 });
    if (!cadence) return Response.json({ error: "Cadência é obrigatória." }, { status: 400 });

    const incomingKeyResults = Array.isArray(payload.keyResults) ? payload.keyResults : [];
    if (incomingKeyResults.length !== existing.keyResults.length) {
      return Response.json(
        { error: "Não é possível adicionar ou remover resultados-chave, só editar os valores." },
        { status: 400 },
      );
    }

    const keyResults = existing.keyResults.map((keyResult, index) => {
      const incoming = incomingKeyResults[index] as Record<string, unknown>;
      const actual = toFiniteNonNegative(incoming?.actual);
      const target = toFiniteNonNegative(incoming?.target);
      if (actual === null || target === null) {
        throw new Error(`Valores inválidos para o resultado-chave "${keyResult.title}".`);
      }
      return { ...keyResult, actual, target };
    });

    const objective = await updateObjective(env.DB, id, { title, owner, cadence, keyResults });

    await writeAudit({
      actorEmail: user.email,
      action: "objective.update",
      entity: "objective",
      entityId: id,
      detail: { title: objective.title, owner: objective.owner, progress: objective.progress },
    });

    return Response.json({ objective });
  } catch (error) {
    console.error("PATCH /api/objectives/[id] failed:", error);
    return Response.json({ error: toRouteErrorMessage(error) }, { status: 500 });
  }
}
