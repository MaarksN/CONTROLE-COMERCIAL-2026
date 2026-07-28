import { requireUser, toRouteErrorMessage } from "@/app/api/_lib";
import { env } from "cloudflare:workers";
import { readIntegrationSettings } from "@/db/commercial-data";

const REPORT_PROMPT =
  "Você é um analista comercial sênior. A partir dos dados JSON de um dashboard de vendas " +
  "(resumo executivo, health score, alertas ativos e desempenho por vendedor), escreva um " +
  "relatório executivo em markdown, em português do Brasil, com as seções: `## Resumo`, " +
  "`## Destaques`, `## Riscos`, `## Recomendações`. Seja objetivo, cite os números relevantes " +
  "e não invente dados que não estão no JSON fornecido.";

async function callOpenAI(apiKey: string, context: unknown): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.4,
      messages: [
        { role: "system", content: REPORT_PROMPT },
        { role: "user", content: JSON.stringify(context) },
      ],
    }),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`OpenAI respondeu ${res.status}: ${detail.slice(0, 300)}`);
  }
  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new Error("OpenAI não retornou conteúdo.");
  return content;
}

async function callAnthropic(apiKey: string, context: unknown): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-5",
      max_tokens: 2000,
      system: REPORT_PROMPT,
      messages: [{ role: "user", content: JSON.stringify(context) }],
    }),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Anthropic respondeu ${res.status}: ${detail.slice(0, 300)}`);
  }
  const json = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
  const text = json.content?.find((block) => block.type === "text")?.text;
  if (!text) throw new Error("Anthropic não retornou conteúdo.");
  return text;
}

export async function POST(request: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;

  try {
    if (!env.DB) {
      return Response.json({ error: "Banco de dados indisponível neste ambiente." }, { status: 503 });
    }

    const payload = (await request.json()) as { context?: unknown };
    if (!payload.context) {
      return Response.json({ error: "Contexto do relatório ausente." }, { status: 400 });
    }

    const settings = await readIntegrationSettings(env.DB);
    const wantsOpenAI =
      settings.aiProvider === "openai" ||
      (settings.aiProvider === "auto" && Boolean(settings.openaiApiKey));
    const wantsAnthropic =
      settings.aiProvider === "anthropic" ||
      (settings.aiProvider === "auto" && !settings.openaiApiKey && Boolean(settings.anthropicApiKey));

    if (wantsOpenAI && settings.openaiApiKey) {
      const report = await callOpenAI(settings.openaiApiKey, payload.context);
      return Response.json({ report, provider: "openai" });
    }
    if (wantsAnthropic && settings.anthropicApiKey) {
      const report = await callAnthropic(settings.anthropicApiKey, payload.context);
      return Response.json({ report, provider: "anthropic" });
    }

    return Response.json(
      {
        error:
          "Nenhuma chave de IA configurada (OpenAI ou Anthropic). Configure em Integrações.",
      },
      { status: 400 },
    );
  } catch (error) {
    console.error("POST /api/ai/report failed:", error);
    return Response.json({ error: toRouteErrorMessage(error) }, { status: 500 });
  }
}
