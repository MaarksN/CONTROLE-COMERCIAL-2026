import type { Deal, OwnerPerformance, SellerGrowthTarget } from "./deriveMetrics";

/**
 * Seller Performance Score — 0-100 per owner, from real per-deal data
 * already in `commercial_deals` plus the seller's own growth targets. The
 * original spec's "Produtividade"/"atividades" and "qualidade do CRM
 * individual" dimensions need a call/email/meeting activity log that
 * doesn't exist in this app — those are returned as explicit unavailable
 * dimensions rather than a fabricated number, per the "não invente
 * resultados" rule.
 */

export type ScoreDimension = {
  key: string;
  label: string;
  available: true;
  score: number;
  weight: number;
  formula: string;
  detail: string;
};

export type UnavailableDimension = {
  key: string;
  label: string;
  available: false;
  missingDataNote: string;
};

export type SellerScoreDimension = ScoreDimension | UnavailableDimension;

export type SellerPerformanceScore = {
  owner: string;
  overall: number;
  dimensions: SellerScoreDimension[];
};

export const SELLER_SCORE_WEIGHTS = {
  metaCrescimento: 30,
  participacaoReceita: 20,
  conversaoFaturamento: 20,
  followUp: 20,
  velocidade: 10,
} as const;

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

export function computeSellerPerformanceScore({
  owner,
  deals,
  ownerPerformance,
  growthTargets,
  companyAverageCycle,
  asOf,
}: {
  owner: string;
  deals: Deal[];
  ownerPerformance: OwnerPerformance[];
  growthTargets: SellerGrowthTarget[];
  companyAverageCycle: number;
  asOf: string;
}): SellerPerformanceScore {
  const now = new Date(asOf).getTime();
  const currentMonthNumber = new Date(asOf).getMonth() + 1;
  const ownerDeals = deals.filter((d) => d.owner === owner);
  const ownerRow = ownerPerformance.find((o) => o.owner === owner);
  const totalAdjusted = ownerPerformance.reduce((sum, o) => sum + o.adjusted, 0);

  const dimensions: SellerScoreDimension[] = [];

  // Meta de crescimento: realizado do mês vs. meta pessoal (se definida).
  const monthTarget = growthTargets.find(
    (t) => t.owner === owner && t.monthNumber === currentMonthNumber,
  );
  if (monthTarget && monthTarget.realizedTarget > 0) {
    const monthAdjusted = ownerDeals
      .filter((d) => d.monthNumber === currentMonthNumber)
      .reduce((sum, d) => sum + d.adjusted, 0);
    const attainment = monthAdjusted / monthTarget.realizedTarget;
    dimensions.push({
      key: "metaCrescimento",
      label: "Meta de crescimento",
      available: true,
      score: Math.round(clamp(attainment * 100)),
      weight: SELLER_SCORE_WEIGHTS.metaCrescimento,
      formula: "receita ajustada do mês ÷ meta de realizado do plano de crescimento",
      detail: `R$ ${monthAdjusted.toFixed(0)} realizados de uma meta de R$ ${monthTarget.realizedTarget.toFixed(0)} (${(attainment * 100).toFixed(0)}%).`,
    });
  } else {
    dimensions.push({
      key: "metaCrescimento",
      label: "Meta de crescimento",
      available: false,
      missingDataNote: `Nenhuma meta de crescimento definida para ${owner} neste mês.`,
    });
  }

  // Participação na receita ajustada da empresa.
  if (ownerRow && totalAdjusted > 0) {
    const share = ownerRow.adjusted / totalAdjusted;
    dimensions.push({
      key: "participacaoReceita",
      label: "Participação na receita",
      available: true,
      score: Math.round(clamp(share * 100 * 4)),
      weight: SELLER_SCORE_WEIGHTS.participacaoReceita,
      formula: "receita ajustada do vendedor ÷ receita ajustada total (referência: 25% = pontuação máxima)",
      detail: `${(share * 100).toFixed(1)}% da receita ajustada da empresa (${ownerRow.deals} negócios).`,
    });
  } else {
    dimensions.push({
      key: "participacaoReceita",
      label: "Participação na receita",
      available: false,
      missingDataNote: `${owner} ainda não possui negócios registrados.`,
    });
  }

  // Conversão para faturamento: billed / adjusted.
  if (ownerRow && ownerRow.adjusted > 0) {
    const conversion = ownerRow.billed / ownerRow.adjusted;
    dimensions.push({
      key: "conversaoFaturamento",
      label: "Conversão para faturamento",
      available: true,
      score: Math.round(clamp(conversion * 100)),
      weight: SELLER_SCORE_WEIGHTS.conversaoFaturamento,
      formula: "valor faturado ÷ valor ajustado da carteira",
      detail: `${(conversion * 100).toFixed(1)}% da carteira ajustada já foi faturada.`,
    });
  } else {
    dimensions.push({
      key: "conversaoFaturamento",
      label: "Conversão para faturamento",
      available: false,
      missingDataNote: `${owner} ainda não possui negócios registrados.`,
    });
  }

  // Follow-up: share of the seller's still-open/committed deals that are stale.
  const openOrCommitted = ownerDeals.filter((d) => d.stage !== "pago");
  if (openOrCommitted.length > 0) {
    const staleDeals = openOrCommitted.filter(
      (d) => Math.round((now - new Date(d.updatedAt).getTime()) / 86_400_000) >= 30,
    );
    const staleRatio = staleDeals.length / openOrCommitted.length;
    dimensions.push({
      key: "followUp",
      label: "Follow-up da carteira",
      available: true,
      score: Math.round(clamp(100 - staleRatio * 100)),
      weight: SELLER_SCORE_WEIGHTS.followUp,
      formula: "1 − (negócios em aberto parados ≥30 dias ÷ total de negócios em aberto)",
      detail: `${staleDeals.length} de ${openOrCommitted.length} negócios em aberto sem atualização há 30+ dias.`,
    });
  } else {
    dimensions.push({
      key: "followUp",
      label: "Follow-up da carteira",
      available: false,
      missingDataNote: `${owner} não possui negócios em aberto ou comprometidos no momento.`,
    });
  }

  // Velocidade: seller's own average cycle vs. company average.
  const cycles = ownerDeals
    .map((deal) => {
      if (!deal.proposalAcceptedAt || !deal.contractSignedAt) return null;
      const start = new Date(`${deal.proposalAcceptedAt}T00:00:00`).getTime();
      const end = new Date(`${deal.contractSignedAt}T00:00:00`).getTime();
      return Math.max(0, Math.round((end - start) / 86_400_000));
    })
    .filter((d): d is number => d !== null);
  if (cycles.length > 0 && companyAverageCycle > 0) {
    const sellerAvgCycle = cycles.reduce((sum, d) => sum + d, 0) / cycles.length;
    const ratio = sellerAvgCycle / companyAverageCycle;
    dimensions.push({
      key: "velocidade",
      label: "Velocidade de fechamento",
      available: true,
      score: Math.round(clamp(ratio <= 1 ? 100 : 100 - (ratio - 1) * 60)),
      weight: SELLER_SCORE_WEIGHTS.velocidade,
      formula: "ciclo médio do vendedor vs. ciclo médio da empresa",
      detail: `Ciclo médio de ${sellerAvgCycle.toFixed(1)} dias vs. ${companyAverageCycle.toFixed(1)} dias da empresa.`,
    });
  } else {
    dimensions.push({
      key: "velocidade",
      label: "Velocidade de fechamento",
      available: false,
      missingDataNote: `${owner} não possui negócios com proposta e assinatura registradas para medir o ciclo.`,
    });
  }

  // "Atividades" and "qualidade do CRM individual" from the original spec —
  // no activity log integration exists in this app yet.
  dimensions.push({
    key: "atividades",
    label: "Atividades (ligações, reuniões, e-mails)",
    available: false,
    missingDataNote:
      "Requer integração com uma fonte de atividades de CRM (ligações, reuniões, e-mails) — nenhuma existe hoje neste aplicativo.",
  });

  const scored = dimensions.filter((d): d is ScoreDimension => d.available);
  const totalWeight = scored.reduce((sum, d) => sum + d.weight, 0);
  const overall = totalWeight > 0
    ? Math.round(scored.reduce((sum, d) => sum + d.score * d.weight, 0) / totalWeight)
    : 0;

  return { owner, overall, dimensions };
}
