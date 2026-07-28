import { requireUser, toRouteErrorMessage } from "@/app/api/_lib";
import { env } from "cloudflare:workers";
import { readIntegrationSettings } from "@/db/commercial-data";

type EnrichedLead = {
  name: string | null;
  company: string | null;
  title: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  website: string | null;
  source: "apollo" | "google";
};

async function enrichWithApollo(
  apiKey: string,
  query: { email?: string; company?: string; domain?: string },
): Promise<EnrichedLead> {
  if (query.email) {
    const res = await fetch("https://api.apollo.io/v1/people/match", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey },
      body: JSON.stringify({ email: query.email }),
    });
    if (!res.ok) throw new Error(`Apollo respondeu ${res.status} ao buscar a pessoa.`);
    const json = (await res.json()) as { person?: Record<string, unknown> };
    const person = json.person ?? {};
    const org = (person.organization as Record<string, unknown> | undefined) ?? {};
    return {
      name: (person.name as string) ?? null,
      company: (org.name as string) ?? null,
      title: (person.title as string) ?? null,
      email: (person.email as string) ?? query.email ?? null,
      phone: (person.sanitized_phone as string) ?? null,
      address: (org.raw_address as string) ?? null,
      website: (org.website_url as string) ?? null,
      source: "apollo",
    };
  }

  const domain = query.domain || query.company;
  if (!domain) throw new Error("Informe um e-mail ou uma empresa/domínio para buscar no Apollo.");

  const url = new URL("https://api.apollo.io/v1/organizations/enrich");
  url.searchParams.set(query.domain ? "domain" : "name", domain);
  const res = await fetch(url, { headers: { "x-api-key": apiKey } });
  if (!res.ok) throw new Error(`Apollo respondeu ${res.status} ao buscar a empresa.`);
  const json = (await res.json()) as { organization?: Record<string, unknown> };
  const org = json.organization ?? {};
  return {
    name: null,
    company: (org.name as string) ?? null,
    title: null,
    email: null,
    phone: (org.phone as string) ?? null,
    address: (org.raw_address as string) ?? null,
    website: (org.website_url as string) ?? null,
    source: "apollo",
  };
}

async function enrichWithGoogle(
  apiKey: string,
  query: { company?: string; domain?: string; city?: string },
): Promise<EnrichedLead> {
  const textQuery = [query.company || query.domain, query.city].filter(Boolean).join(" ");
  if (!textQuery) throw new Error("Informe o nome da empresa para buscar no Google.");

  const findUrl = new URL("https://maps.googleapis.com/maps/api/place/findplacefromtext/json");
  findUrl.searchParams.set("input", textQuery);
  findUrl.searchParams.set("inputtype", "textquery");
  findUrl.searchParams.set("fields", "place_id,name");
  findUrl.searchParams.set("key", apiKey);
  const findRes = await fetch(findUrl);
  if (!findRes.ok) throw new Error(`Google respondeu ${findRes.status} ao buscar o local.`);
  const findJson = (await findRes.json()) as {
    status: string;
    candidates?: Array<{ place_id: string; name: string }>;
  };
  const candidate = findJson.candidates?.[0];
  if (!candidate) {
    throw new Error(`Nenhum resultado encontrado no Google para "${textQuery}".`);
  }

  const detailsUrl = new URL("https://maps.googleapis.com/maps/api/place/details/json");
  detailsUrl.searchParams.set("place_id", candidate.place_id);
  detailsUrl.searchParams.set(
    "fields",
    "name,formatted_address,formatted_phone_number,website",
  );
  detailsUrl.searchParams.set("key", apiKey);
  const detailsRes = await fetch(detailsUrl);
  if (!detailsRes.ok) throw new Error(`Google respondeu ${detailsRes.status} ao buscar detalhes.`);
  const detailsJson = (await detailsRes.json()) as {
    result?: {
      name?: string;
      formatted_address?: string;
      formatted_phone_number?: string;
      website?: string;
    };
  };
  const result = detailsJson.result ?? {};

  return {
    name: null,
    company: result.name ?? candidate.name ?? null,
    title: null,
    email: null,
    phone: result.formatted_phone_number ?? null,
    address: result.formatted_address ?? null,
    website: result.website ?? null,
    source: "google",
  };
}

export async function POST(request: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;

  try {
    if (!env.DB) {
      return Response.json({ error: "Banco de dados indisponível neste ambiente." }, { status: 503 });
    }

    const payload = (await request.json()) as {
      provider?: string;
      query?: { email?: string; company?: string; domain?: string; city?: string };
    };
    const provider = payload.provider;
    const query = payload.query ?? {};

    if (provider !== "apollo" && provider !== "google") {
      return Response.json({ error: "Provedor inválido." }, { status: 400 });
    }

    const settings = await readIntegrationSettings(env.DB);

    if (provider === "apollo") {
      if (!settings.apolloApiKey) {
        return Response.json(
          { error: "Chave do Apollo não configurada. Configure em Integrações." },
          { status: 400 },
        );
      }
      const lead = await enrichWithApollo(settings.apolloApiKey, query);
      return Response.json({ lead });
    }

    if (!settings.googleApiKey) {
      return Response.json(
        { error: "Chave do Google não configurada. Configure em Integrações." },
        { status: 400 },
      );
    }
    const lead = await enrichWithGoogle(settings.googleApiKey, query);
    return Response.json({ lead });
  } catch (error) {
    console.error("POST /api/leads/enrich failed:", error);
    return Response.json({ error: toRouteErrorMessage(error) }, { status: 500 });
  }
}
