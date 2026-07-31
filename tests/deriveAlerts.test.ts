import { describe, expect, it } from "vitest";
import { computeAlerts } from "../app/deriveAlerts";
import { classifyRevenue } from "../app/deriveRevenueIntelligence";
import { makeDeal, makeOwnerPerformance, makeActionItem } from "./helpers";
import type { MonthlyMetric } from "../app/deriveMetrics";

const ASOF = "2026-07-20T00:00:00.000Z";

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

describe("computeAlerts", () => {
  it("returns no alerts for a clean, healthy dataset", () => {
    // No ownerPerformance rows: with a single seller, "100% concentration"
    // would otherwise always fire — that's a real signal, not something to
    // suppress artificially, so this case simply excludes owner rows to
    // isolate the "no other risk signals present" scenario.
    const deals = [makeDeal({ stage: "pago", updatedAt: ASOF })];
    const revenueClassification = classifyRevenue(deals, { asOf: ASOF, ownerPerformance: [] });
    const alerts = computeAlerts({
      deals,
      monthlyMetrics: [makeMonthlyMetric()],
      ownerPerformance: [],
      sellerGrowthTargets: [],
      dataQualityIssues: [],
      actionItems: [],
      integrationSyncStates: [],
      revenueClassification,
      asOf: ASOF,
    });
    expect(alerts).toHaveLength(0);
  });

  it("raises a critical alert for months below 70% attainment", () => {
    const alerts = computeAlerts({
      deals: [],
      monthlyMetrics: [makeMonthlyMetric({ monthNumber: 6, health: "crítico", attainment: 0.4 })],
      ownerPerformance: [],
      sellerGrowthTargets: [],
      dataQualityIssues: [],
      actionItems: [],
      integrationSyncStates: [],
      revenueClassification: classifyRevenue([], { asOf: ASOF, ownerPerformance: [] }),
      asOf: ASOF,
    });
    expect(alerts.some((a) => a.key === "meta:meses-criticos")).toBe(true);
  });

  it("flags owner concentration above the medium threshold", () => {
    const ownerPerformance = [
      makeOwnerPerformance({ owner: "Murilo", adjusted: 6000, deals: 5 }),
      makeOwnerPerformance({ owner: "Ana", adjusted: 4000, deals: 5 }),
    ];
    const alerts = computeAlerts({
      deals: [],
      monthlyMetrics: [],
      ownerPerformance,
      sellerGrowthTargets: [],
      dataQualityIssues: [],
      actionItems: [],
      integrationSyncStates: [],
      revenueClassification: classifyRevenue([], { asOf: ASOF, ownerPerformance }),
      asOf: ASOF,
    });
    expect(alerts.some((a) => a.category === "pipeline" && a.entity === "Murilo")).toBe(true);
  });

  it("groups stale deals per owner into a follow-up alert", () => {
    const deals = [
      makeDeal({ owner: "João", stage: "aberto", updatedAt: "2026-01-01T00:00:00.000Z" }),
      makeDeal({ owner: "João", stage: "aberto", updatedAt: "2026-01-05T00:00:00.000Z" }),
    ];
    const alerts = computeAlerts({
      deals,
      monthlyMetrics: [],
      ownerPerformance: [],
      sellerGrowthTargets: [],
      dataQualityIssues: [],
      actionItems: [],
      integrationSyncStates: [],
      revenueClassification: classifyRevenue(deals, { asOf: ASOF, ownerPerformance: [] }),
      asOf: ASOF,
    });
    const alert = alerts.find((a) => a.category === "followup" && a.entity === "João");
    expect(alert).toBeDefined();
    expect(alert!.evidenceDealIds).toHaveLength(2);
  });

  it("passes through real data-quality issues as alerts, unmodified in substance", () => {
    const alerts = computeAlerts({
      deals: [],
      monthlyMetrics: [],
      ownerPerformance: [],
      sellerGrowthTargets: [],
      dataQualityIssues: [
        { severity: "alta", category: "Completude", title: "2 negócios sem origem", description: "d", owner: "Sales Ops" },
      ],
      actionItems: [],
      integrationSyncStates: [],
      revenueClassification: classifyRevenue([], { asOf: ASOF, ownerPerformance: [] }),
      asOf: ASOF,
    });
    expect(alerts.some((a) => a.title === "2 negócios sem origem")).toBe(true);
  });

  it("flags a seller below their own growth-target realization for the current month", () => {
    const currentMonth = new Date(ASOF).getMonth() + 1;
    const deals = [makeDeal({ owner: "Ana", monthNumber: currentMonth, adjusted: 100 })];
    const alerts = computeAlerts({
      deals,
      monthlyMetrics: [],
      ownerPerformance: [makeOwnerPerformance({ owner: "Ana", adjusted: 100, deals: 1 })],
      sellerGrowthTargets: [
        { owner: "Ana", year: 2026, monthNumber: currentMonth, month: "Julho", entryTarget: 0, realizedTarget: 1000 },
      ],
      dataQualityIssues: [],
      actionItems: [],
      integrationSyncStates: [],
      revenueClassification: classifyRevenue(deals, { asOf: ASOF, ownerPerformance: [] }),
      asOf: ASOF,
    });
    expect(alerts.some((a) => a.category === "crescimento" && a.entity === "Ana")).toBe(true);
  });

  it("flags an action item past its due date as an overdue follow-up alert", () => {
    const actionItems = [
      makeActionItem({ owner: "Beatriz", dueDate: "2026-07-01", status: "pendente" }),
    ];
    const alerts = computeAlerts({
      deals: [],
      monthlyMetrics: [],
      ownerPerformance: [],
      sellerGrowthTargets: [],
      dataQualityIssues: [],
      actionItems,
      integrationSyncStates: [],
      revenueClassification: classifyRevenue([], { asOf: ASOF, ownerPerformance: [] }),
      asOf: ASOF,
    });
    expect(alerts.some((a) => a.key === "followup:acao-vencida:beatriz")).toBe(true);
  });

  it("does not flag an action item that is overdue but already concluded", () => {
    const actionItems = [
      makeActionItem({ owner: "Beatriz", dueDate: "2026-07-01", status: "concluido" }),
    ];
    const alerts = computeAlerts({
      deals: [],
      monthlyMetrics: [],
      ownerPerformance: [],
      sellerGrowthTargets: [],
      dataQualityIssues: [],
      actionItems,
      integrationSyncStates: [],
      revenueClassification: classifyRevenue([], { asOf: ASOF, ownerPerformance: [] }),
      asOf: ASOF,
    });
    expect(alerts.some((a) => a.category === "followup")).toBe(false);
  });

  it("flags a failed integration sync attempt", () => {
    const alerts = computeAlerts({
      deals: [],
      monthlyMetrics: [],
      ownerPerformance: [],
      sellerGrowthTargets: [],
      dataQualityIssues: [],
      actionItems: [],
      integrationSyncStates: [
        { id: "bitrix", lastStatus: "error", lastError: "Webhook inválido.", lastAttemptAt: ASOF, lastSuccessAt: null },
      ],
      revenueClassification: classifyRevenue([], { asOf: ASOF, ownerPerformance: [] }),
      asOf: ASOF,
    });
    expect(alerts.some((a) => a.key === "integracao:falha:bitrix")).toBe(true);
  });

  it("sorts alerts by severity, most critical first", () => {
    const alerts = computeAlerts({
      deals: [],
      monthlyMetrics: [makeMonthlyMetric({ health: "crítico", attainment: 0.3 })],
      ownerPerformance: [],
      sellerGrowthTargets: [],
      dataQualityIssues: [
        { severity: "baixa", category: "x", title: "t1", description: "d", owner: "o" },
      ],
      actionItems: [],
      integrationSyncStates: [],
      revenueClassification: classifyRevenue([], { asOf: ASOF, ownerPerformance: [] }),
      asOf: ASOF,
    });
    expect(alerts[0].severity).toBe("critico");
  });
});
