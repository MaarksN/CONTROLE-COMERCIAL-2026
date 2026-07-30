import { GROWTH_PLAN_HORIZON_MONTHS, GROWTH_PLAN_MONTHLY_INCREASE } from "./utils/constants";
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

/**
 * Monthly consolidated record — the official target/sold/adjusted rollup
 * the business already reconciles by hand in the source spreadsheet. It is
 * intentionally NOT derived by summing `deals2026`: the detail-level deal
 * rows and this consolidated row are known to diverge for some months
 * (flagged in `dataQualityIssues` as "detalhe e consolidado divergem"), so
 * recomputing sold/adjusted from deals would silently reintroduce that gap
 * instead of reflecting the number the business actually reports on.
 */
export type Target = {
  year: number;
  monthNumber: number;
  month: string;
  target: number;
  sold: number;
  adjusted: number;
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

/**
 * Forward-looking growth plan cell: one seller's pipeline-entry ("entrada")
 * and closed-revenue ("realizado") target for a single month of the 20-24
 * month horizon. Distinct from `Target`, which is the company-wide 2026
 * monthly target — this is per-seller and spans beyond the current year.
 */
export type SellerGrowthTarget = {
  owner: string;
  year: number;
  monthNumber: number;
  month: string;
  entryTarget: number;
  realizedTarget: number;
};

export type SellerSummary = {
  sold: number;
  adjusted: number;
  billed: number;
  dealsCount: number;
  ticket: number;
  realization: number;
  averageCycle: number;
  waiting: number;
  topOrigin: string;
  months: Array<{
    month: string;
    shortMonth: string;
    deals: number;
    adjusted: number;
  }>;
};

export type GrowthPlanRow = {
  year: number;
  monthNumber: number;
  month: string;
  label: string;
  entryTarget: number;
  realizedTarget: number;
  isSuggested: boolean;
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

export function buildSellerSummary(
  sellerDeals: Deal[],
  monthlyMetricsList: MonthlyMetric[],
): SellerSummary {
  const sold = sellerDeals.reduce((sum, deal) => sum + deal.sold, 0);
  const adjusted = sellerDeals.reduce((sum, deal) => sum + deal.adjusted, 0);
  const billed = sellerDeals.reduce((sum, deal) => sum + deal.billed, 0);
  const cycles = sellerDeals
    .map((deal) => {
      if (!deal.proposalAcceptedAt || !deal.contractSignedAt) return null;
      const start = new Date(`${deal.proposalAcceptedAt}T00:00:00`);
      const end = new Date(`${deal.contractSignedAt}T00:00:00`);
      return Math.max(0, Math.round((end.getTime() - start.getTime()) / 86_400_000));
    })
    .filter((days): days is number => days !== null);
  const origins = sellerDeals.reduce<Record<string, number>>((accumulator, deal) => {
    const origin = deal.origin || "Não informado";
    accumulator[origin] = (accumulator[origin] ?? 0) + 1;
    return accumulator;
  }, {});
  const topOrigin =
    Object.entries(origins).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "Sem dados";
  const months = monthlyMetricsList.map((metric) => {
    const monthDeals = sellerDeals.filter((deal) => deal.monthNumber === metric.monthNumber);
    return {
      month: metric.month,
      shortMonth: metric.month.slice(0, 3),
      deals: monthDeals.length,
      adjusted: monthDeals.reduce((sum, deal) => sum + deal.adjusted, 0),
    };
  });

  return {
    sold,
    adjusted,
    billed,
    dealsCount: sellerDeals.length,
    ticket: sellerDeals.length ? adjusted / sellerDeals.length : 0,
    realization: sold ? adjusted / sold : 0,
    averageCycle: cycles.length
      ? cycles.reduce((sum, days) => sum + days, 0) / cycles.length
      : 0,
    waiting: sellerDeals.filter((deal) => deal.stage === "faturado").length,
    topOrigin,
    months,
  };
}

export function buildGrowthPlan(
  ownerDeals: Deal[],
  savedTargets: SellerGrowthTarget[],
  asOf: string,
): GrowthPlanRow[] {
  const now = new Date(asOf);
  const startYear = now.getFullYear();
  const startMonth = now.getMonth() + 1;

  const entryByMonth = new Map<number, number>();
  const realizedByMonth = new Map<number, number>();
  for (const deal of ownerDeals) {
    entryByMonth.set(
      deal.monthNumber,
      (entryByMonth.get(deal.monthNumber) ?? 0) + deal.adjusted,
    );
    if (deal.stage === "ganho" || deal.stage === "faturado" || deal.stage === "pago") {
      realizedByMonth.set(
        deal.monthNumber,
        (realizedByMonth.get(deal.monthNumber) ?? 0) + deal.adjusted,
      );
    }
  }

  const monthsWithHistory = [...entryByMonth.keys()].filter((month) => month <= startMonth);
  const averageEntry = monthsWithHistory.length
    ? monthsWithHistory.reduce((sum, month) => sum + (entryByMonth.get(month) ?? 0), 0) /
      monthsWithHistory.length
    : 0;
  const averageRealized = monthsWithHistory.length
    ? monthsWithHistory.reduce((sum, month) => sum + (realizedByMonth.get(month) ?? 0), 0) /
      monthsWithHistory.length
    : 0;
  const savedByKey = new Map(
    savedTargets.map((row) => [`${row.year}-${row.monthNumber}`, row]),
  );

  const rows: GrowthPlanRow[] = [];
  for (let step = 0; step < GROWTH_PLAN_HORIZON_MONTHS; step++) {
    const absoluteMonth = startMonth - 1 + step;
    const year = startYear + Math.floor(absoluteMonth / 12);
    const monthNumber = (absoluteMonth % 12) + 1;
    const month = MONTH_NAMES[monthNumber - 1];
    const saved = savedByKey.get(`${year}-${monthNumber}`);
    const growthFactor = (1 + GROWTH_PLAN_MONTHLY_INCREASE) ** (step + 1);
    rows.push({
      year,
      monthNumber,
      month,
      label: `${month.slice(0, 3)}/${String(year).slice(2)}`,
      entryTarget: saved?.entryTarget ?? Math.round(averageEntry * growthFactor),
      realizedTarget: saved?.realizedTarget ?? Math.round(averageRealized * growthFactor),
      isSuggested: !saved,
    });
  }

  return rows;
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
    const sold = targetRow?.sold ?? 0;
    const adjusted = targetRow?.adjusted ?? 0;
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
