import { MONTH_NAMES, type MonthlyMetric } from "./deriveMetrics";

export type HistoricalDeal = {
  id: string;
  year: number;
  semester: number;
  company: string;
  sold: number;
  billed: number;
  soldAt: string | null;
  owner: string;
};

export type MonthComparison = {
  monthNumber: number;
  month: string;
  sold2025: number;
  billed2025: number;
  target2026: number;
  sold2026: number;
  adjusted2026: number;
  attainment2026: number;
  health2026: MonthlyMetric["health"] | null;
  deltaPct: number | null;
};

export type DashboardInsights = {
  monthlyComparison: MonthComparison[];
  yoy: {
    sold2025PeriodTotal: number;
    sold2026PeriodTotal: number;
    growthPct: number | null;
    monthsAboveTarget2026: number;
    monthsAtOrBelowTarget2026: number;
    totalMonths2026: number;
  };
  progression: Array<{
    monthNumber: number;
    month: string;
    cumulativeAdjusted: number;
    cumulativeTarget: number;
  }>;
};

function round(value: number, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function buildDashboardInsights({
  monthlyMetrics,
  historicalDeals,
}: {
  monthlyMetrics: MonthlyMetric[];
  historicalDeals: HistoricalDeal[];
}): DashboardInsights {
  const sold2025ByMonth = new Map<number, number>();
  const billed2025ByMonth = new Map<number, number>();
  for (const deal of historicalDeals) {
    if (!deal.soldAt) continue;
    const monthNumber = new Date(`${deal.soldAt}T00:00:00`).getMonth() + 1;
    sold2025ByMonth.set(monthNumber, (sold2025ByMonth.get(monthNumber) ?? 0) + deal.sold);
    billed2025ByMonth.set(monthNumber, (billed2025ByMonth.get(monthNumber) ?? 0) + deal.billed);
  }

  const monthlyComparison: MonthComparison[] = monthlyMetrics.map((metric) => {
    const sold2025 = round(sold2025ByMonth.get(metric.monthNumber) ?? 0);
    const deltaPct = sold2025 > 0 ? round((metric.sold - sold2025) / sold2025, 4) : null;
    return {
      monthNumber: metric.monthNumber,
      month: metric.month,
      sold2025,
      billed2025: round(billed2025ByMonth.get(metric.monthNumber) ?? 0),
      target2026: metric.target,
      sold2026: metric.sold,
      adjusted2026: metric.adjusted,
      attainment2026: metric.attainment,
      health2026: metric.health,
      deltaPct,
    };
  });

  // "Aumento do batimento da meta" não é comparável 1:1 com 2025 (não há meta
  // 2025 nos dados) — reportamos crescimento de receita YoY no período coberto
  // por 2026 e quantos meses de 2026 bateram a própria meta.
  const monthsWithBoth2025And2026 = monthlyComparison.filter(
    (row) => row.sold2025 > 0 && row.sold2026 > 0,
  );
  const sold2025PeriodTotal = round(
    monthsWithBoth2025And2026.reduce((sum, row) => sum + row.sold2025, 0),
  );
  const sold2026PeriodTotal = round(
    monthsWithBoth2025And2026.reduce((sum, row) => sum + row.sold2026, 0),
  );
  const growthPct =
    sold2025PeriodTotal > 0
      ? round((sold2026PeriodTotal - sold2025PeriodTotal) / sold2025PeriodTotal, 4)
      : null;
  const monthsAboveTarget2026 = monthlyMetrics.filter((m) => m.attainment >= 1).length;

  let cumulativeAdjusted = 0;
  let cumulativeTarget = 0;
  const progression = monthlyMetrics.map((metric) => {
    cumulativeAdjusted += metric.adjusted;
    cumulativeTarget += metric.target;
    return {
      monthNumber: metric.monthNumber,
      month: metric.month,
      cumulativeAdjusted: round(cumulativeAdjusted),
      cumulativeTarget: round(cumulativeTarget),
    };
  });

  return {
    monthlyComparison,
    yoy: {
      sold2025PeriodTotal,
      sold2026PeriodTotal,
      growthPct,
      monthsAboveTarget2026,
      monthsAtOrBelowTarget2026: monthlyMetrics.length - monthsAboveTarget2026,
      totalMonths2026: monthlyMetrics.length,
    },
    progression,
  };
}

/**
 * Referência externa estática: achados da Auditoria Enterprise Bitrix24 da
 * Atlas GR (24/07/2026), lida em
 * https://atlas-gr-enterprise-hub.marceloatlasgr.chatgpt.site/#resumo.
 * Não é dado ao vivo do Controle Comercial 2026 — é um diagnóstico externo,
 * de outro sistema (Bitrix24, ~3.280 negócios), datado e citado como tal.
 */
export const BITRIX_AUDIT_REFERENCE = {
  source: "Auditoria Enterprise Bitrix24 · Atlas GR · 24/07/2026",
  summary: {
    negociosAuditados: 3280,
    valorTotalRegistrado: 6950000,
    valorGanho: 927000,
    pipelineAberto: 2999000,
    valorPerdido: 2691000,
    cicloMedioDias: 19.8,
    retrabalhoPct: 0.084,
    gargalosCriticos: 38,
    pipelines: 13,
    winRatePct: 0.808,
    lossRatePct: 0.192,
    ticketMedio: 529.8,
    coberturaPipeline: 3.24,
    leadTimeDias: 4.2,
    dealsGanhos: 1750,
    dealsPerdidos: 417,
    dealsAbertos: 690,
    dealsSemReconciliacao: 423,
  },
  riscos: [
    {
      label: "Receita em risco",
      value: "R$ 839.818,93",
      detail: "28,0% do pipeline aberto; atribuída a follow-up ausente por mais de 15 dias.",
    },
    {
      label: "Perda mensal estimada",
      value: "R$ 941.915,47",
      detail: "101,6% do valor ganho exportado; exige validação financeira antes de uso orçamentário.",
    },
    {
      label: "Capital estagnado",
      value: "R$ 1.259.728,40",
      detail: "42,0% do pipeline aberto retido em oportunidades sem progressão adequada.",
    },
    {
      label: "Ganho ARR potencial",
      value: "R$ 719.021,71",
      detail: "77,6% do valor ganho exportado; cenário de otimização, não resultado realizado.",
    },
  ],
  // Tabela completa de process mining por pipeline (13 de 13).
  pipelines: [
    { nome: "Comercial", negocios: 767, valorTotal: 4001590.03, valorGanho: 524759.83, winRatePct: 0.5, retrabalhoPct: 0.394, retrabalhoCount: 302, etapasPuladas: 619, gargalos: 5, piorEtapa: "Proposta Enviada", piorEtapaDias: 102.0 },
    { nome: "Financeiro", negocios: 126, valorTotal: 260457.58, valorGanho: 148804.08, winRatePct: 0.953, retrabalhoPct: 0.032, retrabalhoCount: 4, etapasPuladas: 121, gargalos: 4, piorEtapa: "Aguardando Assinatura", piorEtapaDias: 309.0 },
    { nome: "Implantação", negocios: 14, valorTotal: 15655.2, valorGanho: 3464.5, winRatePct: 1.0, retrabalhoPct: 0, retrabalhoCount: 0, etapasPuladas: 8, gargalos: 2, piorEtapa: "Implantação Cancelada", piorEtapaDias: 140.2 },
    { nome: "Implantação Logística", negocios: 3, valorTotal: 37234.9, valorGanho: 0, winRatePct: 0, retrabalhoPct: 0.667, retrabalhoCount: 2, etapasPuladas: 2, gargalos: 2, piorEtapa: "Implantação Logística", piorEtapaDias: 127.4 },
    { nome: "Perfil Securitário", negocios: 4, valorTotal: 443.4, valorGanho: 368.4, winRatePct: 1.0, retrabalhoPct: 0, retrabalhoCount: 0, etapasPuladas: 3, gargalos: 2, piorEtapa: "Projeto Piloto", piorEtapaDias: 22.8 },
    { nome: "Sucesso do Cliente", negocios: 32, valorTotal: 65886.55, valorGanho: 0, winRatePct: 0, retrabalhoPct: 0, retrabalhoCount: 0, etapasPuladas: 22, gargalos: 3, piorEtapa: "3ª Etapa — 60 dias", piorEtapaDias: 42.2 },
    { nome: "Pós-Vendas", negocios: 550, valorTotal: 891286.9, valorGanho: 155756.4, winRatePct: 0.524, retrabalhoPct: 0.073, retrabalhoCount: 40, etapasPuladas: 457, gargalos: 11, piorEtapa: "Pedido de Cancelamento", piorEtapaDias: 778.6 },
    { nome: "T.I", negocios: 10, valorTotal: 16538.9, valorGanho: 16538.9, winRatePct: 1.0, retrabalhoPct: 0, retrabalhoCount: 0, etapasPuladas: 4, gargalos: 3, piorEtapa: "Projeto Concluído", piorEtapaDias: 620.1 },
    { nome: "RH", negocios: 0, valorTotal: 0, valorGanho: 0, winRatePct: 0, retrabalhoPct: 0, retrabalhoCount: 0, etapasPuladas: 0, gargalos: 0, piorEtapa: "Sem negócios", piorEtapaDias: null },
    { nome: "Financeiro — Reembolsos", negocios: 1167, valorTotal: 78026.31, valorGanho: 76213.65, winRatePct: 0.965, retrabalhoPct: 0.034, retrabalhoCount: 40, etapasPuladas: 1153, gargalos: 2, piorEtapa: "Recusado", piorEtapaDias: 56.1 },
    { nome: "Negócios Perdidos", negocios: 366, valorTotal: 1585210.9, valorGanho: 1248.0, winRatePct: 1.0, retrabalhoPct: 0, retrabalhoCount: 0, etapasPuladas: 0, gargalos: 2, piorEtapa: "Negócios Fechados", piorEtapaDias: 11.8 },
    { nome: "Área de Teste", negocios: 23, valorTotal: 645.0, valorGanho: 0, winRatePct: 0.444, retrabalhoPct: 0.217, retrabalhoCount: 5, etapasPuladas: 11, gargalos: 1, piorEtapa: "Lead desqualificado", piorEtapaDias: 257.9 },
    { nome: "Chamados SC", negocios: 218, valorTotal: 0, valorGanho: 0, winRatePct: 0.889, retrabalhoPct: 0.11, retrabalhoCount: 24, etapasPuladas: 217, gargalos: 1, piorEtapa: "Concluído improcedente", piorEtapaDias: 2.7 },
  ],
  // Concentração operacional completa (6 de 6 pessoas destacadas na auditoria).
  concentracao: [
    { owner: "Murilo Marques", value: "R$ 1.602.390,80", detail: "147 abertos · 53,4% de todo o pipeline aberto · sobrecarregado" },
    { owner: "Valdir Fernandes", value: "R$ 420.032,15", detail: "64 abertos · 577 negócios · sobrecarregado" },
    { owner: "Dejailton Alves", value: "R$ 268.407,50", detail: "29 abertos · win rate 53,2% · carga moderada" },
    { owner: "Vinicius Pinghera", value: "2.355 atividades", detail: "maior volume de atividades · 40 negócios abertos" },
    { owner: "Luiz Camarozano", value: "2.131 atividades", detail: "54 abertos · win rate 49,6% · sobrecarregado" },
    { owner: "João Reis", value: "1.514 atividades", detail: "43 abertos · R$ 113.773,30 · sobrecarregado" },
  ],
  qualidade: {
    duplicidades: 542,
    impactoDuplicidades: "R$ 145 mil",
    usuariosSobrecarregados: 7,
    impactoSobrecarga: "R$ 899,8 mil",
  },
  maturidade: [
    { dominio: "Estratégia", nivel: 3 },
    { dominio: "Comercial", nivel: 3 },
    { dominio: "CRM", nivel: 2 },
    { dominio: "RevOps", nivel: 2 },
    { dominio: "Dados", nivel: 2 },
    { dominio: "IA", nivel: 1 },
    { dominio: "Tecnologia", nivel: 2 },
    { dominio: "Governança", nivel: 2 },
    { dominio: "Operações", nivel: 3 },
    { dominio: "Logística", nivel: 3 },
  ],
  mediaMaturidade: 2.2,
};

export type ActionHorizon = "h0" | "h1" | "h2" | "h3";
export type ActionStatus = "pendente" | "andamento" | "concluido";

export type ActionItem = {
  id: string;
  title: string;
  description: string;
  owner: string | null;
  horizon: ActionHorizon;
  status: ActionStatus;
  source: string | null;
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  updatedBy: string | null;
};

export const HORIZON_LABELS: Record<ActionHorizon, string> = {
  h0: "H0 · 0-30 dias · Governar",
  h1: "H1 · 31-90 dias · Sanear",
  h2: "H2 · 3-6 meses · Integrar",
  h3: "H3 · 6-12 meses · Escalar",
};

/** Semente inicial do plano de ação: as 6 frentes do plano executivo de 90
 * dias da auditoria Bitrix24, prontas para editar/concluir pela equipe. */
export const DEFAULT_ACTION_PLAN: Array<{
  title: string;
  description: string;
  owner: string;
  horizon: ActionHorizon;
  source: string;
}> = [
  {
    title: "Governança do Bitrix24",
    description:
      "Entrega: taxonomia, catálogo de pipelines, política de campos e fluxo de mudança. Aceite: cada pipeline com propósito, owner, entrada, saída, SLA e regra de exceção aprovados.",
    owner: "Owner corporativo de CRM + RevOps",
    horizon: "h0",
    source: BITRIX_AUDIT_REFERENCE.source,
  },
  {
    title: "Saneamento e capacidade",
    description:
      "Entrega: fila de deduplicação, regra de merge, rebalanceamento e cadência mínima. Aceite: casos críticos tratados, owner único por oportunidade e atividade futura obrigatória.",
    owner: "CRM Ops + líderes comerciais",
    horizon: "h1",
    source: BITRIX_AUDIT_REFERENCE.source,
  },
  {
    title: "Automação nativa",
    description:
      "Entrega: inventário de robots, retirada de regras órfãs e implantação dos gates prioritários. Aceite: cada regra com objetivo, condição, responsável, exceção, evidência e plano de reversão.",
    owner: "CRM Ops + donos dos processos",
    horizon: "h1",
    source: BITRIX_AUDIT_REFERENCE.source,
  },
  {
    title: "Dados e indicadores",
    description:
      "Entrega: dicionário, fórmulas oficiais, reconciliação e painel de baseline. Aceite: win rate, pipeline, perda e receita em risco com fonte, fórmula, periodicidade e owner.",
    owner: "Data Owner + Controladoria + RevOps",
    horizon: "h1",
    source: BITRIX_AUDIT_REFERENCE.source,
  },
  {
    title: "IA assistiva governada",
    description:
      "Entrega: primeiro caso de uso controlado para resumo, classificação ou recomendação. Aceite: IA não executa decisão irreversível; confiança, aprovação e saída registradas no Bitrix24.",
    owner: "Data & AI Ops + Segurança + negócio",
    horizon: "h2",
    source: BITRIX_AUDIT_REFERENCE.source,
  },
  {
    title: "Ritual executivo",
    description:
      "Entrega: reunião quinzenal com riscos, decisões, dependências e valor realizado. Aceite: toda decisão com owner, prazo, evidência, status e impacto verificado.",
    owner: "Sponsor executivo + Governance Office",
    horizon: "h0",
    source: BITRIX_AUDIT_REFERENCE.source,
  },
];

export { MONTH_NAMES };
