import { MONTH_NAMES, type Deal, type MonthlyMetric, type OwnerPerformance } from "./deriveMetrics";

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

export type Bottleneck = {
  label: string;
  detail: string;
  severity: "alta" | "média" | "baixa";
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
  internalBottlenecks: Bottleneck[];
};

function round(value: number, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function buildDashboardInsights({
  deals,
  monthlyMetrics,
  historicalDeals,
  ownerPerformance,
  asOf,
}: {
  deals: Deal[];
  monthlyMetrics: MonthlyMetric[];
  historicalDeals: HistoricalDeal[];
  ownerPerformance: OwnerPerformance[];
  asOf: string;
}): DashboardInsights {
  const now = new Date(asOf).getTime();

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

  const internalBottlenecks: Bottleneck[] = [];

  const criticalMonths = monthlyMetrics.filter((m) => m.health === "crítico");
  if (criticalMonths.length > 0) {
    internalBottlenecks.push({
      label: `${criticalMonths.length} mês(es) crítico(s)`,
      detail: `${criticalMonths.map((m) => m.month).join(", ")} — atingimento abaixo de 70% da meta.`,
      severity: "alta",
    });
  }
  const attentionMonths = monthlyMetrics.filter((m) => m.health === "atenção");
  if (attentionMonths.length > 0) {
    internalBottlenecks.push({
      label: `${attentionMonths.length} mês(es) em atenção`,
      detail: `${attentionMonths.map((m) => m.month).join(", ")} — entre 70% e 100% da meta.`,
      severity: "média",
    });
  }

  const totalAdjusted = ownerPerformance.reduce((sum, o) => sum + o.adjusted, 0);
  const topOwner = ownerPerformance[0];
  if (topOwner && totalAdjusted > 0) {
    const share = topOwner.adjusted / totalAdjusted;
    if (share >= 0.35) {
      internalBottlenecks.push({
        label: `Concentração de carteira em ${topOwner.owner}`,
        detail: `${topOwner.owner} responde por ${(share * 100).toFixed(1).replace(".", ",")}% da receita ajustada (${topOwner.deals} negócios).`,
        severity: share >= 0.5 ? "alta" : "média",
      });
    }
  }

  const staleDeals = deals
    .filter((deal) => deal.stage !== "pago")
    .map((deal) => ({
      deal,
      daysSinceUpdate: Math.round((now - new Date(deal.updatedAt).getTime()) / 86_400_000),
    }))
    .filter((row) => row.daysSinceUpdate >= 30)
    .sort((a, b) => b.daysSinceUpdate - a.daysSinceUpdate);
  if (staleDeals.length > 0) {
    const oldest = staleDeals[0];
    internalBottlenecks.push({
      label: `${staleDeals.length} negócio(s) parado(s) há 30+ dias`,
      detail: `Mais antigo: "${oldest.deal.company}" (${oldest.deal.owner}) sem atualização há ${oldest.daysSinceUpdate} dias, etapa "${oldest.deal.stage}".`,
      severity: staleDeals.length >= 5 ? "alta" : "média",
    });
  }

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
    internalBottlenecks,
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
  pioresEtapas: [
    { pipeline: "Comercial", etapa: "Proposta Enviada", dias: 102.0 },
    { pipeline: "Financeiro", etapa: "Aguardando Assinatura", dias: 309.0 },
    { pipeline: "Pós-Vendas", etapa: "Pedido de Cancelamento", dias: 778.6 },
    { pipeline: "T.I", etapa: "Projeto Concluído", dias: 620.1 },
  ],
  concentracao: [
    { owner: "Murilo Marques", detail: "R$ 1.602.390,80 · 147 abertos · 53,4% de todo o pipeline aberto · sobrecarregado" },
    { owner: "Valdir Fernandes", detail: "R$ 420.032,15 · 64 abertos · 577 negócios · sobrecarregado" },
    { owner: "Luiz Camarozano", detail: "2.131 atividades · 54 abertos · win rate 49,6% · sobrecarregado" },
    { owner: "João Reis", detail: "1.514 atividades · 43 abertos · R$ 113.773,30 · sobrecarregado" },
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
