import type { Deal, ExecutiveSummary, MonthlyMetric } from "./deriveMetrics";

/**
 * Sales Health Score — 0-100 composite over dimensions this dataset can
 * actually back with real columns. The original enterprise spec suggests
 * nine dimensions including "Produtividade" (activities/calls) and
 * "Retenção"/"Satisfação" (CS/NPS data); those have no source in this app
 * (no activity log, no CS/NPS module) and are intentionally left out rather
 * than filled with invented numbers. Weights below are adapted from the
 * spec's suggested defaults, renormalized to the seven dimensions that do
 * have a real data source.
 */

export type DataQualityIssue = {
  severity: string;
  category: string;
  title: string;
  description: string;
  owner: string;
};

export type HealthDimension = {
  key: string;
  label: string;
  score: number;
  weight: number;
  formula: string;
  detail: string;
  dealIds?: string[];
};

export type SalesHealthScore = {
  overall: number;
  band: "excelente" | "saudável" | "atenção" | "risco" | "crítico";
  dimensions: HealthDimension[];
};

export const HEALTH_SCORE_WEIGHTS = {
  pipeline: 20,
  conversao: 15,
  receita: 15,
  crmQualidade: 15,
  followUp: 15,
  forecast: 15,
  velocidade: 5,
} as const;

const STALE_DAYS_THRESHOLD = 30;
const SEVERITY_PENALTY: Record<string, number> = {
  alta: 15,
  média: 8,
  baixa: 3,
};

function severityPenalty(severity: string): number {
  return SEVERITY_PENALTY[severity] ?? 5;
}

function bandFor(score: number): SalesHealthScore["band"] {
  if (score >= 90) return "excelente";
  if (score >= 80) return "saudável";
  if (score >= 70) return "atenção";
  if (score >= 60) return "risco";
  return "crítico";
}

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

export function computeSalesHealthScore({
  deals,
  monthlyMetrics,
  executiveSummary,
  dataQualityIssues,
  pipelineOpenTotal,
  gapToTarget,
  asOf,
}: {
  deals: Deal[];
  monthlyMetrics: MonthlyMetric[];
  executiveSummary: ExecutiveSummary;
  dataQualityIssues: DataQualityIssue[];
  pipelineOpenTotal: number;
  gapToTarget: number;
  asOf: string;
}): SalesHealthScore {
  const now = new Date(asOf).getTime();
  const openOrCommitted = deals.filter((d) => d.stage !== "pago");

  // Pipeline: how much open pipeline exists relative to what's still needed
  // to hit the target. No gap left (target already met) scores full marks.
  const pipelineRatio = gapToTarget > 0 ? pipelineOpenTotal / gapToTarget : Infinity;
  const pipelineScore = clamp(
    gapToTarget <= 0
      ? 100
      : pipelineRatio >= 3
        ? 100
        : pipelineRatio >= 2
          ? 88
          : pipelineRatio >= 1
            ? 72
            : pipelineRatio >= 0.5
              ? 50
              : 25,
  );

  // Conversão: share of all deals that reached a won-or-later stage.
  const convertedCount = deals.filter((d) => d.stage !== "aberto").length;
  const conversionRate = deals.length > 0 ? convertedCount / deals.length : 0;
  const conversionScore = clamp(conversionRate * 100);

  // Receita: YTD attainment against target, capped at 100.
  const receitaScore = clamp(executiveSummary.attainment * 100);

  // CRM / Qualidade de Dados: real flagged issues (severity-weighted) plus
  // the share of deals missing origin or key lifecycle dates.
  const issuesPenalty = dataQualityIssues.reduce((sum, issue) => sum + severityPenalty(issue.severity), 0);
  const missingOrigin = deals.filter((d) => !d.origin).length;
  const missingDates = deals.filter((d) => !d.proposalAcceptedAt || !d.contractSignedAt).length;
  const missingRatio = deals.length > 0 ? (missingOrigin + missingDates) / (deals.length * 2) : 0;
  const crmScore = clamp(100 - issuesPenalty - missingRatio * 40);

  // Follow-up: share of still-open/committed deals stale 30+ days.
  const staleDeals = openOrCommitted.filter(
    (d) => Math.round((now - new Date(d.updatedAt).getTime()) / 86_400_000) >= STALE_DAYS_THRESHOLD,
  );
  const staleRatio = openOrCommitted.length > 0 ? staleDeals.length / openOrCommitted.length : 0;
  const followUpScore = clamp(100 - staleRatio * 100);

  // Forecast: share of months (with a target set) that closed at "atenção"
  // or better — i.e. not "crítico" — as a proxy for forecast reliability.
  const monthsWithTarget = monthlyMetrics.filter((m) => m.target > 0);
  const healthyMonths = monthsWithTarget.filter((m) => m.health !== "crítico").length;
  const forecastScore = clamp(
    monthsWithTarget.length > 0 ? (healthyMonths / monthsWithTarget.length) * 100 : 50,
  );

  // Velocidade: average sales cycle vs. an assumed 30-day healthy ceiling
  // (documented business assumption, not a fitted/external benchmark).
  const cycle = executiveSummary.averageSalesCycle;
  const velocidadeScore = clamp(cycle <= 0 ? 60 : cycle <= 15 ? 100 : cycle <= 30 ? 80 : cycle <= 45 ? 55 : 30);

  const dimensions: HealthDimension[] = [
    {
      key: "pipeline",
      label: "Pipeline",
      score: Math.round(pipelineScore),
      weight: HEALTH_SCORE_WEIGHTS.pipeline,
      formula: "pipeline aberto ÷ gap para a meta do mês",
      detail:
        gapToTarget <= 0
          ? "Meta do mês já coberta pela receita realizada/comprometida."
          : `Pipeline aberto cobre ${(pipelineRatio * 100).toFixed(0)}% do gap restante (R$ ${gapToTarget.toFixed(0)}).`,
      dealIds: deals.filter((d) => d.stage === "aberto").map((d) => d.id),
    },
    {
      key: "conversao",
      label: "Conversão",
      score: Math.round(conversionScore),
      weight: HEALTH_SCORE_WEIGHTS.conversao,
      formula: "negócios em etapa ganho/faturado/pago ÷ total de negócios",
      detail: `${convertedCount} de ${deals.length} negócios avançaram além de "aberto".`,
    },
    {
      key: "receita",
      label: "Receita",
      score: Math.round(receitaScore),
      weight: HEALTH_SCORE_WEIGHTS.receita,
      formula: "receita ajustada acumulada (YTD) ÷ meta acumulada (YTD)",
      detail: `Atingimento YTD: ${(executiveSummary.attainment * 100).toFixed(1)}%.`,
    },
    {
      key: "crmQualidade",
      label: "CRM / Qualidade de dados",
      score: Math.round(crmScore),
      weight: HEALTH_SCORE_WEIGHTS.crmQualidade,
      formula: "100 − penalidade por severidade dos problemas de dados − % de campos essenciais ausentes",
      detail: `${dataQualityIssues.length} problema(s) de qualidade registrados; ${missingOrigin} negócio(s) sem origem, ${missingDates} sem datas completas.`,
    },
    {
      key: "followUp",
      label: "Follow-up",
      score: Math.round(followUpScore),
      weight: HEALTH_SCORE_WEIGHTS.followUp,
      formula: "1 − (negócios abertos/comprometidos parados ≥30 dias ÷ total abertos/comprometidos)",
      detail: `${staleDeals.length} de ${openOrCommitted.length} negócios em aberto sem atualização há 30+ dias.`,
      dealIds: staleDeals.map((d) => d.id),
    },
    {
      key: "forecast",
      label: "Forecast",
      score: Math.round(forecastScore),
      weight: HEALTH_SCORE_WEIGHTS.forecast,
      formula: "% de meses (com meta definida) que não fecharam em \"crítico\"",
      detail: `${healthyMonths} de ${monthsWithTarget.length} meses com meta ficaram fora da faixa crítica (<70%).`,
    },
    {
      key: "velocidade",
      label: "Velocidade",
      score: Math.round(velocidadeScore),
      weight: HEALTH_SCORE_WEIGHTS.velocidade,
      formula: "ciclo médio de vendas vs. teto assumido de 30 dias",
      detail: cycle > 0 ? `Ciclo médio atual: ${cycle.toFixed(1)} dias.` : "Sem negócios com ciclo completo (proposta → assinatura) para medir.",
    },
  ];

  const totalWeight = dimensions.reduce((sum, d) => sum + d.weight, 0);
  const overall = Math.round(
    dimensions.reduce((sum, d) => sum + d.score * d.weight, 0) / totalWeight,
  );

  return { overall, band: bandFor(overall), dimensions };
}
