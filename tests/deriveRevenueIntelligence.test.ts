import { describe, expect, it } from "vitest";
import {
  classifyRevenue,
  computeDealProbability,
  computeForecastConfidence,
  computeForecastScenarios,
} from "../app/deriveRevenueIntelligence";
import { makeDeal, makeOwnerPerformance } from "./helpers";

const ASOF = "2026-07-20T00:00:00.000Z";

describe("computeDealProbability", () => {
  it("returns 1.0 for a paid deal regardless of other factors", () => {
    const deal = makeDeal({ stage: "pago", updatedAt: "2020-01-01T00:00:00.000Z" });
    const result = computeDealProbability(deal, {
      asOf: ASOF,
      averageSalesCycle: 10,
      ownerPerformance: [],
    });
    expect(result.probability).toBe(1);
  });

  it("penalizes a stale open deal below the stage baseline", () => {
    const fresh = makeDeal({ stage: "aberto", updatedAt: ASOF });
    const stale = makeDeal({ stage: "aberto", updatedAt: "2026-05-01T00:00:00.000Z" });
    const context = { asOf: ASOF, averageSalesCycle: 15, ownerPerformance: [] };
    const freshResult = computeDealProbability(fresh, context);
    const staleResult = computeDealProbability(stale, context);
    expect(staleResult.probability).toBeLessThan(freshResult.probability);
  });

  it("penalizes an outlier ticket vs. the owner's own average", () => {
    const owner = makeOwnerPerformance({ owner: "Ana", deals: 4, adjusted: 4000 }); // avg ticket 1000
    const bigDeal = makeDeal({ owner: "Ana", adjusted: 5000, updatedAt: ASOF, stage: "aberto" });
    const result = computeDealProbability(bigDeal, {
      asOf: ASOF,
      averageSalesCycle: 15,
      ownerPerformance: [owner],
    });
    expect(result.factors.some((f) => f.label.includes("Ticket"))).toBe(true);
  });

  it("clamps probability within [0.05, 0.97] for open stages", () => {
    const deal = makeDeal({
      stage: "aberto",
      updatedAt: "2020-01-01T00:00:00.000Z",
      proposalAcceptedAt: "2019-01-01",
      sold: 10000,
      adjusted: 500,
    });
    const result = computeDealProbability(deal, {
      asOf: ASOF,
      averageSalesCycle: 10,
      ownerPerformance: [],
    });
    expect(result.probability).toBeGreaterThanOrEqual(0.05);
    expect(result.probability).toBeLessThanOrEqual(0.97);
  });
});

describe("classifyRevenue", () => {
  it("buckets deals by stage into realizada/comprometida/pipelineAberto", () => {
    const deals = [
      makeDeal({ stage: "pago", adjusted: 100 }),
      makeDeal({ stage: "ganho", adjusted: 200 }),
      makeDeal({ stage: "faturado", adjusted: 300 }),
      makeDeal({ stage: "aberto", adjusted: 400 }),
    ];
    const result = classifyRevenue(deals, { asOf: ASOF, ownerPerformance: [] });
    expect(result.realizada.total).toBe(100);
    expect(result.comprometida.total).toBe(500);
    expect(result.pipelineAberto.total).toBe(400);
  });

  it("flags stale open deals as em risco with a documented reason", () => {
    const stale = makeDeal({
      stage: "aberto",
      adjusted: 400,
      updatedAt: "2026-05-01T00:00:00.000Z",
    });
    const result = classifyRevenue([stale], { asOf: ASOF, ownerPerformance: [] });
    expect(result.emRisco.dealIds).toContain(stale.id);
    expect(result.emRisco.reasons[stale.id][0]).toMatch(/atualização/);
  });

  it("returns all-zero buckets for an empty deal list (no invented data)", () => {
    const result = classifyRevenue([], { asOf: ASOF, ownerPerformance: [] });
    expect(result.realizada.total).toBe(0);
    expect(result.comprometida.total).toBe(0);
    expect(result.pipelineAberto.total).toBe(0);
    expect(result.emRisco.total).toBe(0);
  });
});

describe("computeForecastConfidence", () => {
  it("reports baixa when history and deal volume are both thin", () => {
    const result = computeForecastConfidence({ monthsOfHistory: 3, dealsInScope: [makeDeal()] });
    expect(result.level).toBe("baixa");
    expect(result.reasons.length).toBeGreaterThan(0);
  });

  it("reports alta only with enough history, volume, and complete dates", () => {
    const deals = Array.from({ length: 10 }, () => makeDeal({ proposalAcceptedAt: "2026-01-01" }));
    const result = computeForecastConfidence({ monthsOfHistory: 12, dealsInScope: deals });
    expect(result.level).toBe("alta");
  });

  it("never fabricates a numeric confidence percentage", () => {
    const result = computeForecastConfidence({ monthsOfHistory: 1, dealsInScope: [] });
    expect(["alta", "moderada", "baixa"]).toContain(result.level);
  });
});

describe("computeForecastScenarios", () => {
  it("computes commit <= aiForecast <= bestCase ordering", () => {
    const deals = [
      makeDeal({ monthNumber: 7, stage: "pago", adjusted: 100 }),
      makeDeal({ monthNumber: 7, stage: "ganho", adjusted: 200 }),
      makeDeal({ monthNumber: 7, stage: "aberto", adjusted: 300, updatedAt: ASOF }),
    ];
    const result = computeForecastScenarios({
      deals,
      targets: [{ year: 2026, monthNumber: 7, month: "Julho", target: 1000, sold: 300, adjusted: 300 }],
      asOf: ASOF,
      ownerPerformance: [],
      averageSalesCycle: 10,
      monthsOfHistory: 7,
    });
    expect(result.commitScenario).toBeLessThanOrEqual(result.aiForecastScenario);
    expect(result.aiForecastScenario).toBeLessThanOrEqual(result.bestCaseScenario);
  });

  it("returns zero daily target needed once the gap is closed", () => {
    const deals = [makeDeal({ monthNumber: 7, stage: "pago", adjusted: 5000 })];
    const result = computeForecastScenarios({
      deals,
      targets: [{ year: 2026, monthNumber: 7, month: "Julho", target: 1000, sold: 5000, adjusted: 5000 }],
      asOf: ASOF,
      ownerPerformance: [],
      averageSalesCycle: 10,
      monthsOfHistory: 7,
    });
    expect(result.dailyTargetNeeded).toBe(0);
  });

  it("handles a month with no target and no deals without throwing", () => {
    const result = computeForecastScenarios({
      deals: [],
      targets: [],
      asOf: ASOF,
      ownerPerformance: [],
      averageSalesCycle: 0,
      monthsOfHistory: 0,
    });
    expect(result.target).toBe(0);
    expect(result.projectedAttainment).toBeNull();
  });
});
