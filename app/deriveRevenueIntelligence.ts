import { MONTH_NAMES, type Deal, type OwnerPerformance, type Target } from "./deriveMetrics";

/**
 * Revenue Intelligence engine.
 *
 * Everything here is a deterministic, explainable rules engine over real
 * columns already stored on `commercial_deals` (stage, adjusted, sold,
 * proposalAcceptedAt, contractSignedAt, updatedAt, owner). It is NOT a
 * statistical or machine-learned model: with ~85 deals/year and 7 months of
 * consolidated history there isn't enough volume to fit or validate one
 * responsibly. Every number returned carries the factors that produced it so
 * a manager can see exactly why, and `computeForecastConfidence` reports
 * "baixa"/"moderada" rather than a fabricated precision whenever the
 * underlying sample is thin.
 */

export type ProbabilityFactor = {
  label: string;
  impact: "positive" | "negative" | "neutral";
  detail: string;
};

export type DealProbability = {
  dealId: string;
  probability: number;
  factors: ProbabilityFactor[];
};

const STAGE_BASELINE_PROBABILITY: Record<Deal["stage"], number> = {
  aberto: 0.35,
  ganho: 0.75,
  faturado: 0.92,
  pago: 1,
};

const MIN_OPEN_PROBABILITY = 0.05;
const MAX_OPEN_PROBABILITY = 0.97;
const DAY_MS = 86_400_000;

function daysBetween(fromIso: string, toIso: string): number {
  const from = new Date(fromIso).getTime();
  const to = new Date(toIso).getTime();
  if (!Number.isFinite(from) || !Number.isFinite(to)) return 0;
  return Math.max(0, Math.round((to - from) / DAY_MS));
}

/**
 * Per-deal dynamic probability (0-1). `pago` deals are always 1 (already
 * realized). Every other stage starts from a baseline and is nudged by real
 * risk signals: staleness, cycle length vs the company's own historical
 * average, and ticket size vs the owner's own historical average — never a
 * global "one size fits all" adjustment.
 */
export function computeDealProbability(
  deal: Deal,
  context: { asOf: string; averageSalesCycle: number; ownerPerformance: OwnerPerformance[] },
): DealProbability {
  const factors: ProbabilityFactor[] = [];

  if (deal.stage === "pago") {
    return {
      dealId: deal.id,
      probability: 1,
      factors: [
        {
          label: "Etapa paga",
          impact: "positive",
          detail: "Negócio já pago — receita realizada, não é mais uma previsão.",
        },
      ],
    };
  }

  let probability = STAGE_BASELINE_PROBABILITY[deal.stage];
  factors.push({
    label: `Etapa: ${deal.stage}`,
    impact: "neutral",
    detail: `Probabilidade-base da etapa "${deal.stage}": ${Math.round(
      STAGE_BASELINE_PROBABILITY[deal.stage] * 100,
    )}%.`,
  });

  const daysSinceUpdate = daysBetween(deal.updatedAt, context.asOf);
  if (daysSinceUpdate >= 60) {
    probability -= 0.3;
    factors.push({
      label: "Parado há 60+ dias",
      impact: "negative",
      detail: `Sem atualização há ${daysSinceUpdate} dias.`,
    });
  } else if (daysSinceUpdate >= 30) {
    probability -= 0.15;
    factors.push({
      label: "Parado há 30+ dias",
      impact: "negative",
      detail: `Sem atualização há ${daysSinceUpdate} dias.`,
    });
  } else if (daysSinceUpdate >= 15) {
    probability -= 0.05;
    factors.push({
      label: "Parado há 15+ dias",
      impact: "negative",
      detail: `Sem atualização há ${daysSinceUpdate} dias.`,
    });
  }

  if (deal.proposalAcceptedAt && context.averageSalesCycle > 0) {
    const proposalAge = daysBetween(deal.proposalAcceptedAt, context.asOf);
    const cycleRatio = proposalAge / context.averageSalesCycle;
    if (cycleRatio > 2.5) {
      probability -= 0.2;
      factors.push({
        label: "Ciclo muito acima da média",
        impact: "negative",
        detail: `${proposalAge} dias desde a proposta vs. ciclo médio de ${context.averageSalesCycle.toFixed(1)} dias.`,
      });
    } else if (cycleRatio > 1.5) {
      probability -= 0.1;
      factors.push({
        label: "Ciclo acima da média",
        impact: "negative",
        detail: `${proposalAge} dias desde a proposta vs. ciclo médio de ${context.averageSalesCycle.toFixed(1)} dias.`,
      });
    }
  }

  const ownerStats = context.ownerPerformance.find((o) => o.owner === deal.owner);
  if (ownerStats && ownerStats.deals > 0) {
    const ownerAvgTicket = ownerStats.adjusted / ownerStats.deals;
    if (ownerAvgTicket > 0) {
      const ticketRatio = deal.adjusted / ownerAvgTicket;
      if (ticketRatio > 3) {
        probability -= 0.2;
        factors.push({
          label: "Ticket muito acima do habitual",
          impact: "negative",
          detail: `Valor ${ticketRatio.toFixed(1)}x o ticket médio de ${deal.owner} — negócios atípicos têm histórico menos previsível.`,
        });
      } else if (ticketRatio > 2) {
        probability -= 0.1;
        factors.push({
          label: "Ticket acima do habitual",
          impact: "negative",
          detail: `Valor ${ticketRatio.toFixed(1)}x o ticket médio de ${deal.owner}.`,
        });
      }
    }
  }

  if (deal.sold > 0) {
    const discountRatio = (deal.sold - deal.adjusted) / deal.sold;
    if (discountRatio > 0.75) {
      probability -= 0.2;
      factors.push({
        label: "Ajuste/desconto muito acima do padrão",
        impact: "negative",
        detail: `Valor ajustado é ${Math.round((1 - discountRatio) * 100)}% do vendido.`,
      });
    } else if (discountRatio > 0.5) {
      probability -= 0.1;
      factors.push({
        label: "Ajuste/desconto acima do padrão",
        impact: "negative",
        detail: `Valor ajustado é ${Math.round((1 - discountRatio) * 100)}% do vendido.`,
      });
    }
  }

  return {
    dealId: deal.id,
    probability: Math.min(MAX_OPEN_PROBABILITY, Math.max(MIN_OPEN_PROBABILITY, probability)),
    factors,
  };
}

export type RevenueClassification = {
  realizada: { total: number; dealIds: string[] };
  comprometida: { total: number; dealIds: string[] };
  pipelineAberto: { total: number; dealIds: string[] };
  emRisco: { total: number; dealIds: string[]; reasons: Record<string, string[]> };
};

const STALE_RISK_DAYS = 21;
const TICKET_OUTLIER_RATIO = 2;

/**
 * Classifies every open/committed deal's `adjusted` value into the revenue
 * buckets the business already reasons about via `stage`
 * (aberto→ganho→faturado→pago). "Em risco" is a documented subset of
 * aberto/ganho deals: stale ≥21 days without an update, or an unusually
 * large ticket vs. the owner's own average — the only two risk signals this
 * dataset actually supports (no "próxima atividade"/CRM engagement field
 * exists to check against).
 */
export function classifyRevenue(
  deals: Deal[],
  context: { asOf: string; ownerPerformance: OwnerPerformance[] },
): RevenueClassification {
  const realizada = deals.filter((d) => d.stage === "pago");
  const comprometida = deals.filter((d) => d.stage === "ganho" || d.stage === "faturado");
  const pipelineAberto = deals.filter((d) => d.stage === "aberto");

  const ownerAvgTicket = new Map<string, number>();
  for (const owner of context.ownerPerformance) {
    if (owner.deals > 0) ownerAvgTicket.set(owner.owner, owner.adjusted / owner.deals);
  }

  const emRiscoDeals = [...pipelineAberto, ...comprometida].filter((d) => d.stage !== "faturado");
  const reasons: Record<string, string[]> = {};
  const riskyDeals = emRiscoDeals.filter((deal) => {
    const dealReasons: string[] = [];
    const daysSinceUpdate = daysBetween(deal.updatedAt, context.asOf);
    if (daysSinceUpdate >= STALE_RISK_DAYS) {
      dealReasons.push(`Sem atualização há ${daysSinceUpdate} dias`);
    }
    const avgTicket = ownerAvgTicket.get(deal.owner);
    if (avgTicket && avgTicket > 0 && deal.adjusted / avgTicket > TICKET_OUTLIER_RATIO) {
      dealReasons.push(
        `Ticket ${(deal.adjusted / avgTicket).toFixed(1)}x acima da média de ${deal.owner}`,
      );
    }
    if (dealReasons.length > 0) {
      reasons[deal.id] = dealReasons;
      return true;
    }
    return false;
  });

  const sum = (list: Deal[]) => Math.round(list.reduce((acc, d) => acc + d.adjusted, 0) * 100) / 100;

  return {
    realizada: { total: sum(realizada), dealIds: realizada.map((d) => d.id) },
    comprometida: { total: sum(comprometida), dealIds: comprometida.map((d) => d.id) },
    pipelineAberto: { total: sum(pipelineAberto), dealIds: pipelineAberto.map((d) => d.id) },
    emRisco: { total: sum(riskyDeals), dealIds: riskyDeals.map((d) => d.id), reasons },
  };
}

export type ForecastConfidence = {
  level: "alta" | "moderada" | "baixa";
  reasons: string[];
};

/**
 * Confidence is judged independently from the forecast value itself, purely
 * on how much real signal backs it: months of actual sold history, how many
 * deals are in scope, and how complete their date fields are. This never
 * returns a fabricated percentage — only a bounded label plus the concrete
 * reasons, per the "não invente resultados" rule.
 */
export function computeForecastConfidence({
  monthsOfHistory,
  dealsInScope,
}: {
  monthsOfHistory: number;
  dealsInScope: Deal[];
}): ForecastConfidence {
  const reasons: string[] = [];
  const dealCount = dealsInScope.length;
  const withDates = dealsInScope.filter((d) => d.proposalAcceptedAt).length;
  const completeness = dealCount > 0 ? withDates / dealCount : 0;

  if (monthsOfHistory < 12) {
    reasons.push(`Apenas ${monthsOfHistory} mês(es) de histórico mensal consolidado.`);
  }
  if (dealCount < 5) {
    reasons.push(`Apenas ${dealCount} negócio(s) no escopo considerado.`);
  }
  if (completeness < 0.7 && dealCount > 0) {
    reasons.push(
      `${Math.round((1 - completeness) * 100)}% dos negócios sem data de proposta registrada.`,
    );
  }

  if (monthsOfHistory < 6 || dealCount < 5) {
    return { level: "baixa", reasons: reasons.length ? reasons : ["Dados históricos insuficientes para gerar uma previsão confiável."] };
  }
  if (monthsOfHistory < 12 || completeness < 0.7) {
    return { level: "moderada", reasons };
  }
  return { level: "alta", reasons: ["Histórico e completude de dados suficientes."] };
}

export type ForecastScenarios = {
  monthNumber: number;
  monthName: string;
  target: number;
  realized: number;
  committed: number;
  pipelineOpen: number;
  weightedPipelineOpen: number;
  commitScenario: number;
  bestCaseScenario: number;
  aiForecastScenario: number;
  gapToTarget: number;
  daysRemainingInMonth: number;
  dailyTargetNeeded: number;
  weeklyTargetNeeded: number;
  projectedAttainment: number | null;
  confidence: ForecastConfidence;
};

function daysRemainingInMonth(asOf: string): number {
  const date = new Date(asOf);
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  return Math.max(1, lastDay - date.getDate() + 1);
}

/**
 * Commit / Best Case / Weighted ("AI") forecast for the current month,
 * following the spec's own reference formula:
 * `pipeline ponderado = Σ valor do negócio × probabilidade dinâmica`.
 * - Commit = realized + committed (ganho/faturado) — already high-certainty.
 * - Best Case = Commit + 100% of open pipeline (everything closes).
 * - AI/Weighted forecast = Commit + probability-weighted open pipeline.
 */
export function computeForecastScenarios({
  deals,
  targets,
  asOf,
  ownerPerformance,
  averageSalesCycle,
  monthsOfHistory,
}: {
  deals: Deal[];
  targets: Target[];
  asOf: string;
  ownerPerformance: OwnerPerformance[];
  averageSalesCycle: number;
  monthsOfHistory: number;
}): ForecastScenarios {
  const monthNumber = new Date(asOf).getMonth() + 1;
  const monthName = MONTH_NAMES[monthNumber - 1];
  const target = targets.find((t) => t.monthNumber === monthNumber)?.target ?? 0;
  const monthDeals = deals.filter((d) => d.monthNumber === monthNumber);

  const realized = monthDeals.filter((d) => d.stage === "pago").reduce((s, d) => s + d.adjusted, 0);
  const committed = monthDeals
    .filter((d) => d.stage === "ganho" || d.stage === "faturado")
    .reduce((s, d) => s + d.adjusted, 0);
  const openDeals = monthDeals.filter((d) => d.stage === "aberto");
  const pipelineOpen = openDeals.reduce((s, d) => s + d.adjusted, 0);
  const weightedPipelineOpen = openDeals.reduce((sum, deal) => {
    const { probability } = computeDealProbability(deal, { asOf, averageSalesCycle, ownerPerformance });
    return sum + deal.adjusted * probability;
  }, 0);

  const commitScenario = realized + committed;
  const bestCaseScenario = commitScenario + pipelineOpen;
  const aiForecastScenario = commitScenario + weightedPipelineOpen;
  const gapToTarget = target - aiForecastScenario;
  const remainingDays = daysRemainingInMonth(asOf);

  const round2 = (n: number) => Math.round(n * 100) / 100;

  return {
    monthNumber,
    monthName,
    target: round2(target),
    realized: round2(realized),
    committed: round2(committed),
    pipelineOpen: round2(pipelineOpen),
    weightedPipelineOpen: round2(weightedPipelineOpen),
    commitScenario: round2(commitScenario),
    bestCaseScenario: round2(bestCaseScenario),
    aiForecastScenario: round2(aiForecastScenario),
    gapToTarget: round2(gapToTarget),
    daysRemainingInMonth: remainingDays,
    dailyTargetNeeded: gapToTarget > 0 ? round2(gapToTarget / remainingDays) : 0,
    weeklyTargetNeeded: gapToTarget > 0 ? round2((gapToTarget / remainingDays) * 7) : 0,
    projectedAttainment: target > 0 ? round2(aiForecastScenario / target) : null,
    confidence: computeForecastConfidence({ monthsOfHistory, dealsInScope: monthDeals }),
  };
}
