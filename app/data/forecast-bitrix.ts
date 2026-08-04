/**
 * Dataset do relatório "Atlas GR — Forecast Comercial".
 *
 * Fonte: Bitrix24, webhook AUDITORIA_COMERCIAL_MENSAL_ATLASGR, com a carteira
 * (pendentes de assinatura / forecast em negociação) e as vendas confirmadas
 * reconciliadas contra a planilha Julho_Consolidado.html em 03/08/2026.
 *
 * Competência 2026-07. Vendas confirmadas: 20 empresas / R$ 38.934,50 —
 * reconciliado 1x1 contra o board "Contrato Assinado" do Bitrix24 (fonte
 * mais recente), que corrigiu o valor da Agrolog (R$ 11.194,50, não
 * R$ 11.316,00), trocou o responsável de Trift Transportes (Matheus, não
 * Murilo) e de Das Neves Transportes (João, não Murilo), e trouxe um 2º
 * negócio da Similog (R$ 225,00) ausente na planilha.
 *
 * Todos os números aqui são transcrição literal da extração — nenhum valor é
 * estimado ou interpolado.
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

export type ForecastPortfolio = "pending" | "forecast" | "won";

export type ForecastOpportunity = {
  company: string;
  owner: string;
  value: number;
  origin?: string;
};

export const CURRENT_FORECAST = {
  updatedAtLabel: "03/08/2026",
  source: "Julho_Consolidado.html (fechamento de julho) + auditoria Bitrix24",
  portfolios: {
    pending: {
      label: "Pendentes de assinatura",
      caption: "Contratos no Financeiro que pedem ação imediata",
      tone: "warning",
      items: [
        { company: "Transportadora Calezani", owner: "Murilo Marques", value: 171.1 },
        { company: "RDR Comercio e Serviços", owner: "Millena", value: 109.5 },
        { company: "Copercana", owner: "Matheus Hernandes", value: 2130.6 },
        { company: "Transmaion", owner: "Millena", value: 100 },
        { company: "Multiportlog", owner: "João Reis", value: 1967.4 },
        { company: "NRT Factual", owner: "Murilo Marques", value: 1573.3 },
        { company: "Expresso Sulmatogrossense", owner: "Valdir Fernandes", value: 575.3 },
        { company: "CHR Transportes", owner: "Valdir Fernandes", value: 170.9 },
        { company: "Ams Transporte", owner: "Murilo Marques", value: 59.9 },
        { company: "GSM Agronegócios e Transportes", owner: "Valdir Fernandes", value: 779.8 },
        { company: "Cond Rural Grupo Duda", owner: "Murilo Marques", value: 239 },
        { company: "MHF Logística", owner: "Murilo Marques", value: 897 },
        { company: "Pirangi", owner: "Murilo Marques", value: 453 },
        { company: "Valério & Valério", owner: "Murilo Marques", value: 47.8 },
      ] satisfies ForecastOpportunity[],
    },
    forecast: {
      label: "Forecast em negociação",
      caption: "Oportunidades comerciais ativas para os próximos fechamentos",
      tone: "accent",
      items: [
        { company: "Transluc", owner: "João Reis", value: 2101.4, origin: "SDR" },
        { company: "Sabugi Logística", owner: "Murilo Marques", value: 15873.9, origin: "Feira/Evento" },
        { company: "Nardini Agroindustrial", owner: "Matheus Hernandes", value: 2241.6, origin: "SDR" },
        { company: "JCL Transportes e Logística", owner: "Murilo Marques", value: 1200, origin: "Prospecção Ativa" },
        { company: "Terra Nova Logística", owner: "Murilo Marques", value: 8093, origin: "Prospecção Ativa" },
        { company: "Terra Indústria de Acumuladores Elétricos", owner: "Murilo Marques", value: 485.3, origin: "Prospecção Ativa" },
        { company: "Rodomacro Transportes", owner: "Murilo Marques", value: 119.6, origin: "Prospecção Ativa" },
        { company: "Ferrari Agroindústria S/A", owner: "Matheus Hernandes", value: 1004.9, origin: "SDR" },
        { company: "CRV", owner: "Matheus Hernandes", value: 1543.1, origin: "SDR" },
        { company: "Transflorio", owner: "Murilo Marques", value: 11000, origin: "Prospecção Ativa" },
        { company: "Facilcargo", owner: "Murilo Marques", value: 1765.8, origin: "SDR" },
        { company: "Pedra Agroindustrial", owner: "Matheus Hernandes", value: 1204.9, origin: "SDR" },
        { company: "Rodopenha", owner: "Murilo Marques", value: 19000, origin: "Prospecção Ativa" },
        { company: "Trans Bacini Transportes", owner: "Murilo Marques", value: 6600, origin: "Prospecção Ativa" },
      ] satisfies ForecastOpportunity[],
    },
    won: {
      label: "Vendas confirmadas",
      caption: "Fechamento consolidado de julho, sem duplicidade entre funis",
      tone: "success",
      count: 20,
      value: 38934.5,
      items: [] satisfies ForecastOpportunity[],
    },
  },
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
    value: "20",
    caption: "R$ 38.934,50 em receita confirmada",
    tone: "won",
  },
  {
    id: "pipeline-aberto",
    label: "Pipeline em aberto (forecast)",
    value: "39",
    caption: "R$ 66.570,60 em potencial",
    tone: "open",
  },
  {
    id: "conversao-geral",
    label: "Taxa de conversão geral",
    value: "19.7%",
    caption: "lead → contrato assinado",
    tone: "neutral",
  },
  {
    id: "cobertura-cnpj",
    label: "Cobertura de CNPJ no CRM",
    value: "2/28",
    caption: "clientes do Financeiro com CNPJ cadastrado no Bitrix24",
    tone: "risk",
  },
];

/** Números crus por trás dos KPIs, para a análise não precisar parsear texto. */
export const HEADLINE_FIGURES = {
  confirmedDeals: 20,
  confirmedRevenue: 38934.5,
  openDeals: 39,
  openPipeline: 66570.6,
  overallConversion: 0.197,
  cnpjCovered: 2,
  cnpjTotal: 28,
} as const;

export type ConversionRate = {
  id: string;
  source: FunnelSource;
  from: string;
  to: string;
  rate: number;
};

export const CONVERSION_RATES: ConversionRate[] = [
  { id: "lead-reuniao", source: "avaligis", from: "Lead Recebido", to: "Reunião Agendada", rate: 0.256 },
  { id: "reuniao-oportunidade", source: "avaligis", from: "Reunião Agendada", to: "Convertido em Oportunidade", rate: 0.767 },
  { id: "lead-oportunidade", source: "avaligis", from: "Lead Recebido", to: "Oportunidade (geral)", rate: 0.197 },
  { id: "oportunidade-proposta", source: "avan", from: "Nova Oportunidade", to: "Proposta Enviada", rate: 0.634 },
  { id: "proposta-aprovado", source: "avan", from: "Proposta Enviada", to: "Aprovado Internamente", rate: 0.635 },
  { id: "processo-assinado", source: "financeiro", from: "Em Processo", to: "Contrato Assinado", rate: 0.5 },
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

/** Funil por etapa — julho/2026, mesma base das taxas de conversão oficiais acima. */
export const FUNNEL_PIPELINES: FunnelPipeline[] = [
  {
    source: "avaligis",
    note: "Pipeline Leads — julho/2026.",
    sellerCount: 5,
    stages: [
      { label: "Leads Recebidos", count: 117, rateFromPrevious: null },
      { label: "Reunião Agendada", count: 30, rateFromPrevious: 0.256 },
      { label: "Convertido em Oportunidade", count: 23, rateFromPrevious: 0.767 },
    ],
  },
  {
    source: "avan",
    note: "Pipeline Negócios — julho/2026.",
    sellerCount: 6,
    stages: [
      { label: "Nova Oportunidade", count: 82, rateFromPrevious: null },
      { label: "Proposta Enviada", count: 52, rateFromPrevious: 0.634 },
      { label: "Aprovado Internamente", count: 33, rateFromPrevious: 0.635 },
    ],
  },
  {
    source: "financeiro",
    note: "Pipeline Financeiro — julho/2026.",
    sellerCount: 4,
    stages: [
      { label: "Em Análise de Documentos", count: 40, rateFromPrevious: null },
      { label: "Aguardando Assinatura", count: 37, rateFromPrevious: 0.925 },
      { label: "Contrato Assinado", count: 30, rateFromPrevious: 0.811 },
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
    records: 117,
    value: 25.9,
    tone: "neutral",
    sellers: [
      { seller: "Valdir Fernandes", count: 8, value: 25.9 },
      { seller: "Matheus Hernandes", count: 26, value: 0 },
      { seller: "João Reis", count: 74, value: 0 },
      { seller: "Marcelo Nascimento", count: 3, value: 0 },
      { seller: "Murilo Marques", count: 6, value: 0 },
    ],
  },
  {
    id: "reunioes-agendadas",
    source: "avaligis",
    title: "Reuniões Agendadas",
    description: "leads com reunião marcada ou convertidos direto, em julho/2026",
    records: 30,
    value: 0,
    tone: "neutral",
    sellers: [
      { seller: "Valdir Fernandes", count: 7, value: 0 },
      { seller: "João Reis", count: 12, value: 0 },
      { seller: "Matheus Hernandes", count: 4, value: 0 },
      { seller: "Murilo Marques", count: 6, value: 0 },
      { seller: "Marcelo Nascimento", count: 1, value: 0 },
    ],
  },
  {
    id: "em-negociacao",
    source: "avan",
    title: "Em Negociação",
    description: "oportunidades e propostas em aberto agora",
    records: 29,
    value: 63736.5,
    tone: "open",
    sellers: [
      { seller: "Murilo Marques", count: 5, value: 30556.4 },
      { seller: "João Reis", count: 17, value: 26098.4 },
      { seller: "Marcelo Nascimento", count: 5, value: 6767.7 },
      { seller: "Matheus Hernandes", count: 2, value: 314.0 },
    ],
  },
  {
    id: "aprovado-internamente",
    source: "avan",
    title: "Aprovado Internamente",
    description: '"Negócios Ganhos" no Avan em julho/2026 — ainda NÃO é venda',
    records: 18,
    value: 15706.2,
    tone: "pending",
    sellers: [
      { seller: "Valdir Fernandes", count: 7, value: 12462.2 },
      { seller: "Murilo Marques", count: 6, value: 1789.4 },
      { seller: "Matheus Hernandes", count: 3, value: 794.6 },
      { seller: "João Reis", count: 2, value: 660.0 },
    ],
  },
  {
    id: "em-processo-financeiro",
    source: "financeiro",
    title: "Em Processo no Pipeline Financeiro",
    description: "análise de documentos + aguardando assinatura, agora",
    records: 10,
    value: 2834.1,
    tone: "open",
    sellers: [
      { seller: "Murilo Marques", count: 5, value: 1664.8 },
      { seller: "Valdir Fernandes", count: 1, value: 779.8 },
      { seller: "Matheus Hernandes", count: 3, value: 389.5 },
      { seller: "João Reis", count: 1, value: 0 },
    ],
  },
  {
    id: "contratos-assinados",
    source: "financeiro",
    title: "Contratos Assinados",
    description: "vendas confirmadas em julho/2026 — contadas 1x",
    records: 20,
    value: 38934.5,
    tone: "won",
    sellers: [
      { seller: "Valdir Fernandes", count: 9, value: 25710.2 },
      { seller: "Matheus Hernandes", count: 3, value: 9489.9 },
      { seller: "Murilo Marques", count: 5, value: 2969.4 },
      { seller: "João Reis", count: 2, value: 660.0 },
      { seller: "Millena", count: 1, value: 105.0 },
    ],
  },
  {
    id: "negocios-perdidos",
    source: "avan",
    title: "Negócios Perdidos",
    description: "perdidos em julho/2026",
    records: 19,
    value: 547192.0,
    tone: "lost",
    sellers: [
      { seller: "Murilo Marques", count: 10, value: 493253.7 },
      { seller: "João Reis", count: 5, value: 52878.9 },
      { seller: "Matheus Hernandes", count: 3, value: 630.9 },
      { seller: "Valdir Fernandes", count: 1, value: 428.5 },
    ],
  },
];

export const FORECAST_FOOTNOTE =
  "Gerado a partir de dados reais extraídos do Bitrix24 (webhook " +
  `${FORECAST_META.webhook}). Nenhum valor nesta página é estimado ou inventado.`;

export function findItemCard(id: string): ItemCard | undefined {
  return ITEM_CARDS.find((card) => card.id === id);
}
