import { describe, expect, it } from "vitest";
import { computeSalesHealthScore } from "../app/deriveHealthScore";
import { makeDeal } from "./helpers";
import type { ExecutiveSummary, MonthlyMetric } from "../app/deriveMetrics";

const ASOF = "2026-07-20T00:00:00.000Z";

function makeExecutiveSummary(overrides: Partial<ExecutiveSummary> = {}): ExecutiveSummary {
  return {
    ytdTarget: 1000,
    ytdSold: 1000,
    ytdAdjusted: 1000,
    ytdGap: 0,
    attainment: 1,
    realization: 1,
    averageSalesCycle: 10,
    currentMonthForecast: 1000,
    currentMonthPending: 0,
    ...overrides,
  };
}

function makeMonthlyMetric(overrides: Partial<MonthlyMetric> = {}): MonthlyMetric {
  return {
    month: "Julho",
    monthNumber: 7,
    target: 1000,
    sold: 1000,
    adjusted: 1000,
    adjustmentRate: 0,
    gap: 0,
    attainment: 1,
    health: "acima",
    ...overrides,
  };
}

describe("computeSalesHealthScore", () => {
  it("scores 100 pipeline dimension when the target gap is already closed", () => {
    const result = computeSalesHealthScore({
      deals: [makeDeal({ stage: "pago" })],
      monthlyMetrics: [makeMonthlyMetric()],
      executiveSummary: makeExecutiveSummary(),
      dataQualityIssues: [],
      pipelineOpenTotal: 0,
      gapToTarget: 0,
      asOf: ASOF,
    });
    const pipeline = result.dimensions.find((d) => d.key === "pipeline")!;
    expect(pipeline.score).toBe(100);
  });

  it("penalizes CRM/qualidade score for real flagged data-quality issues", () => {
    const withIssues = computeSalesHealthScore({
      deals: [makeDeal()],
      monthlyMetrics: [makeMonthlyMetric()],
      executiveSummary: makeExecutiveSummary(),
      dataQualityIssues: [
        { severity: "alta", category: "Conciliação", title: "x", description: "y", owner: "z" },
      ],
      pipelineOpenTotal: 0,
      gapToTarget: 0,
      asOf: ASOF,
    });
    const withoutIssues = computeSalesHealthScore({
      deals: [makeDeal()],
      monthlyMetrics: [makeMonthlyMetric()],
      executiveSummary: makeExecutiveSummary(),
      dataQualityIssues: [],
      pipelineOpenTotal: 0,
      gapToTarget: 0,
      asOf: ASOF,
    });
    const crmWith = withIssues.dimensions.find((d) => d.key === "crmQualidade")!;
    const crmWithout = withoutIssues.dimensions.find((d) => d.key === "crmQualidade")!;
    expect(crmWith.score).toBeLessThan(crmWithout.score);
  });

  it("lowers follow-up score when open deals are stale", () => {
    const result = computeSalesHealthScore({
      deals: [makeDeal({ stage: "aberto", updatedAt: "2026-01-01T00:00:00.000Z" })],
      monthlyMetrics: [makeMonthlyMetric()],
      executiveSummary: makeExecutiveSummary(),
      dataQualityIssues: [],
      pipelineOpenTotal: 1000,
      gapToTarget: 0,
      asOf: ASOF,
    });
    const followUp = result.dimensions.find((d) => d.key === "followUp")!;
    expect(followUp.score).toBeLessThan(100);
    expect(followUp.dealIds?.length).toBeGreaterThan(0);
  });

  it("never divides by zero with an empty deal/month list", () => {
    const result = computeSalesHealthScore({
      deals: [],
      monthlyMetrics: [],
      executiveSummary: makeExecutiveSummary({ attainment: 0, averageSalesCycle: 0 }),
      dataQualityIssues: [],
      pipelineOpenTotal: 0,
      gapToTarget: 0,
      asOf: ASOF,
    });
    expect(Number.isFinite(result.overall)).toBe(true);
    for (const dimension of result.dimensions) {
      expect(Number.isFinite(dimension.score)).toBe(true);
    }
  });

  it("assigns the correct band for the overall score", () => {
    const result = computeSalesHealthScore({
      deals: [makeDeal({ stage: "pago" })],
      monthlyMetrics: [makeMonthlyMetric()],
      executiveSummary: makeExecutiveSummary(),
      dataQualityIssues: [],
      pipelineOpenTotal: 0,
      gapToTarget: 0,
      asOf: ASOF,
    });
    expect(["excelente", "saudável", "atenção", "risco", "crítico"]).toContain(result.band);
  });
});
