/**
 * Dataset do relatório "Atlas GR — Forecast Comercial".
 *
 * Fonte: Bitrix24, webhook AUDITORIA_COMERCIAL_MENSAL_ATLASGR.
 * Competência 2026-07, extração gerada em 01/08/2026 02:40.
 *
 * Todos os números aqui são transcrição literal da extração — nenhum valor é
 * estimado ou interpolado. O que a extração não trouxe fica `null`, nunca zero,
 * para que a análise saiba distinguir "ausente" de "vazio".
 */

export type FunnelSource = "avaligis" | "avan" | "financeiro";

export const FUNNEL_SOURCE_LABELS: Record<FunnelSource, string> = {
  avaligis: "Avaligis",
  avan: "Avan Negócios",
  financeiro: "Financeiro",
};

export const FORECAST_META = {
  title: "Atlas GR — Forecast Comercial",
  flow: "Bitrix24 · Avaligis → Avan Negócios → Financeiro",
  competence: "2026-07",
  competenceLabel: "julho/2026",
  generatedAt: "2026-08-01T02:40:00",
  generatedAtLabel: "01/08/2026, 02:40:00",
  webhook: "AUDITORIA_COMERCIAL_MENSAL_ATLASGR",
} as const;

/**
 * A regra de contagem é o contrato semântico do relatório: sem ela, "Aprovado
 * Internamente" e "Contrato Assinado" seriam somados e a receita apareceria
 * duplicada.
 */
export const COUNTING_RULE = {
  headline: "Regra de contagem",
  body:
    'uma venda só é contabilizada 1x, no momento em que o contrato é assinado no Financeiro. ' +
    '"Aprovado internamente" (Avan Negócios) é uma etapa interna e não deve ser somado como venda. ' +
    "Os cards de Financeiro trazem evidência real do Bitrix24 (empresa, CNPJ quando cadastrado no CRM, " +
    "contato e link do registro) — quando o CNPJ não aparece, é porque o cadastro no Bitrix24 não tem " +
    "esse campo preenchido, não uma omissão deste relatório.",
} as const;

export type HeadlineKpi = {
  id: string;
  label: string;
  value: string;
  caption: string;
  tone: "won" | "open" | "neutral" | "risk";
};

export const HEADLINE_KPIS: HeadlineKpi[] = [
  {
    id: "vendas-confirmadas",
    label: "Vendas confirmadas",
    value: "21",
    caption: "R$ 54.358,65 em receita confirmada",
    tone: "won",
  },
  {
    id: "pipeline-aberto",
    label: "Pipeline em aberto (forecast)",
    value: "45",
    caption: "R$ 77.994,10 em potencial",
    tone: "open",
  },
  {
    id: "conversao-geral",
    label: "Taxa de conversão geral",
    value: "17.2%",
    caption: "lead → contrato assinado",
    tone: "neutral",
  },
  {
    id: "cobertura-cnpj",
    label: "Cobertura de CNPJ no CRM",
    value: "6/36",
    caption: "clientes do Financeiro com CNPJ cadastrado no Bitrix24",
    tone: "risk",
  },
];

/** Números crus por trás dos KPIs, para a análise não precisar parsear texto. */
export const HEADLINE_FIGURES = {
  confirmedDeals: 21,
  confirmedRevenue: 54358.65,
  openDeals: 45,
  openPipeline: 77994.1,
  overallConversion: 0.172,
  cnpjCovered: 6,
  cnpjTotal: 36,
} as const;

export type ConversionRate = {
  id: string;
  source: FunnelSource;
  from: string;
  to: string;
  rate: number;
};

export const CONVERSION_RATES: ConversionRate[] = [
  { id: "lead-reuniao", source: "avaligis", from: "Lead Recebido", to: "Reunião Agendada", rate: 0.246 },
  { id: "reuniao-oportunidade", source: "avaligis", from: "Reunião Agendada", to: "Convertido em Oportunidade", rate: 0.767 },
  { id: "lead-oportunidade", source: "avaligis", from: "Lead Recebido", to: "Oportunidade (geral)", rate: 0.189 },
  { id: "oportunidade-proposta", source: "avan", from: "Nova Oportunidade", to: "Proposta Enviada", rate: 0.6 },
  { id: "proposta-aprovado", source: "avan", from: "Proposta Enviada", to: "Aprovado Internamente", rate: 0.754 },
  { id: "processo-assinado", source: "financeiro", from: "Em Processo", to: "Contrato Assinado", rate: 0.694 },
];

export type FunnelStage = {
  label: string;
  count: number;
  /** Conversão em relação à etapa imediatamente anterior. `null` no topo. */
  rateFromPrevious: number | null;
};

export type FunnelPipeline = {
  source: FunnelSource;
  note: string;
  /** Quantos vendedores têm funil próprio dentro deste pipeline. */
  sellerCount: number;
  stages: FunnelStage[];
};

/**
 * Base histórica completa já auditada — mesma base das taxas oficiais acima.
 * Não é filtrada por mês (diferente dos cards de item, que são de julho/2026).
 */
export const FUNNEL_PIPELINES: FunnelPipeline[] = [
  {
    source: "avaligis",
    note: "Base histórica completa já auditada (mesma base das taxas oficiais acima) — não filtrada por mês.",
    sellerCount: 6,
    stages: [
      { label: "Leads Recebidos", count: 122, rateFromPrevious: null },
      { label: "Reunião Agendada", count: 30, rateFromPrevious: 0.246 },
      { label: "Convertido em Oportunidade", count: 23, rateFromPrevious: 0.767 },
    ],
  },
  {
    source: "avan",
    note: "Base histórica completa já auditada (mesma base das taxas oficiais acima) — não filtrada por mês.",
    sellerCount: 12,
    stages: [
      { label: "Nova Oportunidade", count: 95, rateFromPrevious: null },
      { label: "Proposta Enviada", count: 57, rateFromPrevious: 0.6 },
      { label: "Aprovado Internamente", count: 43, rateFromPrevious: 0.754 },
    ],
  },
  {
    source: "financeiro",
    note: "Base histórica completa já auditada (mesma base das taxas oficiais acima) — não filtrada por mês.",
    sellerCount: 9,
    stages: [
      { label: "Em Análise de Documentos", count: 49, rateFromPrevious: null },
      { label: "Aguardando Assinatura", count: 42, rateFromPrevious: 0.857 },
      { label: "Contrato Assinado", count: 34, rateFromPrevious: 0.81 },
    ],
  },
];

export type SellerBreakdown = {
  seller: string;
  count: number;
  /** `null` quando a extração não trouxe valor monetário para o vendedor. */
  value: number | null;
};

export type ItemCardTone = "neutral" | "open" | "pending" | "won" | "lost";

export type ItemCard = {
  id: string;
  source: FunnelSource;
  title: string;
  description: string;
  records: number;
  value: number | null;
  tone: ItemCardTone;
  sellers: SellerBreakdown[];
};

/** Visão geral por item — recorte de julho/2026 (ou "agora", conforme a descrição). */
export const ITEM_CARDS: ItemCard[] = [
  {
    id: "leads-recebidos",
    source: "avaligis",
    title: "Leads Recebidos",
    description: "topo do funil — julho/2026",
    records: 122,
    value: null,
    tone: "neutral",
    sellers: [
      { seller: "Valdir Fernandes", count: 8, value: 25.9 },
      { seller: "Matheus Hernandes", count: 26, value: null },
      { seller: "João Reis", count: 74, value: null },
      { seller: "Spiner", count: 5, value: null },
      { seller: "MARCELO NASCIMENTO", count: 3, value: null },
      { seller: "Murilo Marques", count: 6, value: null },
    ],
  },
  {
    id: "reunioes-agendadas",
    source: "avaligis",
    title: "Reuniões Agendadas",
    description: "leads com reunião marcada ou convertidos direto, em julho/2026",
    records: 30,
    value: null,
    tone: "neutral",
    sellers: [
      { seller: "Valdir Fernandes", count: 7, value: null },
      { seller: "João Reis", count: 12, value: null },
      { seller: "Matheus Hernandes", count: 4, value: null },
      { seller: "Murilo Marques", count: 6, value: null },
      { seller: "MARCELO NASCIMENTO", count: 1, value: null },
    ],
  },
  {
    id: "em-negociacao",
    source: "avan",
    title: "Em Negociação",
    description: "oportunidades e propostas em aberto agora",
    records: 30,
    value: 63846.0,
    tone: "open",
    sellers: [
      { seller: "Murilo Marques", count: 5, value: 30556.4 },
      { seller: "João Reis", count: 17, value: 26098.4 },
      { seller: "MARCELO NASCIMENTO", count: 5, value: 6767.7 },
      { seller: "Matheus Hernandes", count: 2, value: 314.0 },
      { seller: "Millena Gomes", count: 1, value: 109.5 },
    ],
  },
  {
    id: "aprovado-internamente",
    source: "avan",
    title: "Aprovado Internamente",
    description: '"Negócios Ganhos" no Avan em julho/2026 — ainda NÃO é venda',
    records: 22,
    value: 26806.2,
    tone: "pending",
    sellers: [
      { seller: "Valdir Fernandes", count: 7, value: 12462.2 },
      { seller: "Ricardo Vieira", count: 1, value: 9900.0 },
      { seller: "Murilo Marques", count: 6, value: 1789.4 },
      { seller: "Lorena Bueno", count: 1, value: 1200.0 },
      { seller: "Matheus Hernandes", count: 3, value: 794.6 },
      { seller: "João Reis", count: 2, value: 660.0 },
      { seller: "Millena Gomes", count: 2, value: null },
    ],
  },
  {
    id: "em-processo-financeiro",
    source: "financeiro",
    title: "Em Processo no Financeiro",
    description: "análise de documentos + aguardando assinatura, agora",
    records: 15,
    value: 14148.1,
    tone: "open",
    sellers: [
      { seller: "Ricardo Vieira", count: 1, value: 9900.0 },
      { seller: "Murilo Marques", count: 5, value: 1664.8 },
      { seller: "Lorena Bueno", count: 1, value: 1200.0 },
      { seller: "Valdir Fernandes", count: 1, value: 779.8 },
      { seller: "Matheus Hernandes", count: 3, value: 389.5 },
      { seller: "Millena Gomes", count: 3, value: 214.0 },
      { seller: "João Reis", count: 1, value: null },
    ],
  },
  {
    id: "contratos-assinados",
    source: "financeiro",
    title: "Contratos Assinados",
    description: "vendas confirmadas em julho/2026 — contadas 1x",
    records: 21,
    value: 54358.65,
    tone: "won",
    sellers: [
      { seller: "Valdir Fernandes", count: 9, value: 33290.35 },
      { seller: "Murilo Marques", count: 7, value: 19137.6 },
      { seller: "Matheus Hernandes", count: 2, value: 1165.7 },
      { seller: "João Reis", count: 2, value: 660.0 },
      { seller: "Millena Gomes", count: 1, value: 105.0 },
    ],
  },
  {
    id: "negocios-perdidos",
    source: "avan",
    title: "Negócios Perdidos",
    description: "perdidos em julho/2026",
    records: 22,
    value: 547192.0,
    tone: "lost",
    sellers: [
      { seller: "Murilo Marques", count: 10, value: 493253.7 },
      { seller: "João Reis", count: 5, value: 52878.9 },
      { seller: "Matheus Hernandes", count: 3, value: 630.9 },
      { seller: "Valdir Fernandes", count: 1, value: 428.5 },
      { seller: "Adilson Fernandes", count: 3, value: null },
    ],
  },
];

export const FORECAST_FOOTNOTE =
  "Gerado a partir de dados reais extraídos do Bitrix24 (webhook " +
  `${FORECAST_META.webhook}). Nenhum valor nesta página é estimado ou inventado.`;

export function findItemCard(id: string): ItemCard | undefined {
  return ITEM_CARDS.find((card) => card.id === id);
}
