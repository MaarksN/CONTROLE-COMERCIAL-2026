export type Stage = "aberto" | "ganho" | "faturado" | "pago";

export const STAGES: Stage[] = ["aberto", "ganho", "faturado", "pago"];

export const STAGE_LABELS: Record<Stage, string> = {
  aberto: "Aberto",
  ganho: "Ganho",
  faturado: "Faturado",
  pago: "Pago",
};

export const MONTH_NAMES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

export type Deal = {
  id: string;
  year: number;
  month: string;
  monthNumber: number;
  owner: string;
  company: string;
  origin: string;
  sold: number;
  governedSold: number;
  adjusted: number;
  proposalAcceptedAt: string | null;
  contractSignedAt: string | null;
  billed: number;
  variance: number;
  billingStatus: string;
  stage: Stage;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  updatedBy: string | null;
};

export type Target = {
  year: number;
  monthNumber: number;
  month: string;
  target: number;
};

export type MonthlyMetric = {
  month: string;
  monthNumber: number;
  target: number;
  sold: number;
  adjusted: number;
  adjustmentRate: number;
  gap: number;
  attainment: number;
  health: "acima" | "atenção" | "crítico";
};

export type ExecutiveSummary = {
  ytdTarget: number;
  ytdSold: number;
  ytdAdjusted: number;
  ytdGap: number;
  attainment: number;
  realization: number;
  averageSalesCycle: number;
  currentMonthForecast: number;
  currentMonthPending: number;
};

export type SellerRole = "Vendedor" | "SDR";

export type Seller = {
  name: string;
  role: SellerRole;
};

export type OwnerPerformance = {
  owner: string;
  deals: number;
  sold: number;
  adjusted: number;
  billed: number;
};

export type OriginPerformance = {
  origin: string;
  deals: number;
  adjusted: number;
};

export type DerivedMetrics = {
  monthlyMetrics: MonthlyMetric[];
  executiveSummary: ExecutiveSummary;
  ownerPerformance: OwnerPerformance[];
  originPerformance: OriginPerformance[];
  currentMonthNumber: number;
};

function health(attainment: number): MonthlyMetric["health"] {
  if (attainment >= 1) return "acima";
  if (attainment >= 0.7) return "atenção";
  return "crítico";
}

function round(value: number, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

/**
 * Pure aggregation: recomputes every derived KPI/table from the live deals +
 * targets. Used server-side for the first render and client-side (useMemo)
 * on every poll/mutation, so precomputed numbers never go stale after CRUD.
 *
 * "currentMonthForecast"/"currentMonthPending" generalize the spreadsheet's
 * hand-typed "julyForecast"/"julyPending" cells (which encoded a manual
 * sales estimate not reconstructable from deal records) into stage-driven
 * figures: forecast = adjusted value of all deals in the current month,
 * pending = adjusted value still not billed (stage aberto/ganho).
 */
export function deriveMetrics({
  deals,
  targets,
  asOf,
  knownOwners,
}: {
  deals: Deal[];
  targets: Target[];
  asOf: string;
  /** Roster names (e.g. a newly added SDR) that must appear in
   * ownerPerformance with zero stats even before they have any deals. */
  knownOwners?: string[];
}): DerivedMetrics {
  const currentMonthNumber = new Date(asOf).getMonth() + 1;

  const targetByMonth = new Map(targets.map((t) => [t.monthNumber, t]));
  const monthNumbers = new Set<number>([
    ...targets.map((t) => t.monthNumber),
    ...deals.map((d) => d.monthNumber),
  ]);
  const sortedMonthNumbers = [...monthNumbers].sort((a, b) => a - b);

  const monthlyMetrics: MonthlyMetric[] = sortedMonthNumbers.map((monthNumber) => {
    const targetRow = targetByMonth.get(monthNumber);
    const target = targetRow?.target ?? 0;
    const monthName = targetRow?.month ?? MONTH_NAMES[monthNumber - 1];
    const monthDeals = deals.filter((deal) => deal.monthNumber === monthNumber);
    const sold = monthDeals.reduce((sum, deal) => sum + deal.sold, 0);
    const adjusted = monthDeals.reduce((sum, deal) => sum + deal.adjusted, 0);
    const gap = adjusted - target;
    const attainment = target ? adjusted / target : 0;
    const adjustmentRate = sold ? (adjusted - sold) / sold : 0;
    return {
      month: monthName,
      monthNumber,
      target,
      sold: round(sold),
      adjusted: round(adjusted),
      adjustmentRate: round(adjustmentRate, 4),
      gap: round(gap),
      attainment: round(attainment, 4),
      health: health(attainment),
    };
  });

  const ytdMetrics = monthlyMetrics.filter((metric) => metric.monthNumber <= currentMonthNumber);
  const ytdTarget = ytdMetrics.reduce((sum, m) => sum + m.target, 0);
  const ytdSold = ytdMetrics.reduce((sum, m) => sum + m.sold, 0);
  const ytdAdjusted = ytdMetrics.reduce((sum, m) => sum + m.adjusted, 0);
  const ytdGap = ytdAdjusted - ytdTarget;
  const attainment = ytdTarget ? ytdAdjusted / ytdTarget : 0;
  const realization = ytdSold ? ytdAdjusted / ytdSold : 0;

  const cycles = deals
    .map((deal) => {
      if (!deal.proposalAcceptedAt || !deal.contractSignedAt) return null;
      const start = new Date(`${deal.proposalAcceptedAt}T00:00:00`);
      const end = new Date(`${deal.contractSignedAt}T00:00:00`);
      return Math.max(0, Math.round((end.getTime() - start.getTime()) / 86_400_000));
    })
    .filter((days): days is number => days !== null);
  const averageSalesCycle = cycles.length
    ? cycles.reduce((sum, days) => sum + days, 0) / cycles.length
    : 0;

  const currentMonthDeals = deals.filter((deal) => deal.monthNumber === currentMonthNumber);
  const currentMonthForecast = currentMonthDeals.reduce((sum, deal) => sum + deal.adjusted, 0);
  const currentMonthPending = currentMonthDeals
    .filter((deal) => deal.stage === "aberto" || deal.stage === "ganho")
    .reduce((sum, deal) => sum + deal.adjusted, 0);

  const ownerMap = new Map<string, OwnerPerformance>();
  for (const owner of knownOwners ?? []) {
    if (!owner) continue;
    ownerMap.set(owner, { owner, deals: 0, sold: 0, adjusted: 0, billed: 0 });
  }
  for (const deal of deals) {
    const row = ownerMap.get(deal.owner) ?? {
      owner: deal.owner,
      deals: 0,
      sold: 0,
      adjusted: 0,
      billed: 0,
    };
    row.deals += 1;
    row.sold += deal.sold;
    row.adjusted += deal.adjusted;
    row.billed += deal.billed;
    ownerMap.set(deal.owner, row);
  }
  const ownerPerformance = [...ownerMap.values()]
    .map((row) => ({
      ...row,
      sold: round(row.sold),
      adjusted: round(row.adjusted),
      billed: round(row.billed),
    }))
    .sort((a, b) => b.adjusted - a.adjusted);

  const originMap = new Map<string, OriginPerformance>();
  for (const deal of deals) {
    const key = deal.origin || "Não informado";
    const row = originMap.get(key) ?? { origin: key, deals: 0, adjusted: 0 };
    row.deals += 1;
    row.adjusted += deal.adjusted;
    originMap.set(key, row);
  }
  const originPerformance = [...originMap.values()]
    .map((row) => ({ ...row, adjusted: round(row.adjusted) }))
    .sort((a, b) => b.adjusted - a.adjusted);

  return {
    monthlyMetrics,
    executiveSummary: {
      ytdTarget: round(ytdTarget),
      ytdSold: round(ytdSold),
      ytdAdjusted: round(ytdAdjusted),
      ytdGap: round(ytdGap),
      attainment: round(attainment, 4),
      realization: round(realization, 4),
      averageSalesCycle: round(averageSalesCycle, 1),
      currentMonthForecast: round(currentMonthForecast),
      currentMonthPending: round(currentMonthPending),
    },
    ownerPerformance,
    originPerformance,
    currentMonthNumber,
  };
}

export function inferStage(deal: {
  billed: number;
  contractSigned?: string;
  contractSignedAt?: string | null;
  billingStatus?: string;
}): Stage {
  const isContractSigned = deal.contractSigned === "V" && Boolean(deal.contractSignedAt);
  if (!isContractSigned) return "aberto";

  if ((deal.billed ?? 0) <= 0) return "ganho";

  const status = (deal.billingStatus ?? "").toLocaleLowerCase("pt-BR");
  if (status.includes("aguardando")) return "faturado";
  if (status.includes("card adequado") || status.includes("card mantido")) return "pago";
  return "faturado";
}
