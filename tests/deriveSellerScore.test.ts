import { describe, expect, it } from "vitest";
import { computeSellerPerformanceScore } from "../app/deriveSellerScore";
import { makeDeal, makeOwnerPerformance } from "./helpers";

const ASOF = "2026-07-20T00:00:00.000Z";
const CURRENT_MONTH = new Date(ASOF).getMonth() + 1;

describe("computeSellerPerformanceScore", () => {
  it("marks metaCrescimento unavailable when no growth target is set", () => {
    const result = computeSellerPerformanceScore({
      owner: "Ana",
      deals: [makeDeal({ owner: "Ana" })],
      ownerPerformance: [makeOwnerPerformance({ owner: "Ana" })],
      growthTargets: [],
      companyAverageCycle: 10,
      asOf: ASOF,
    });
    const meta = result.dimensions.find((d) => d.key === "metaCrescimento")!;
    expect(meta.available).toBe(false);
  });

  it("scores metaCrescimento from real realized vs. target when a growth target exists", () => {
    const result = computeSellerPerformanceScore({
      owner: "Ana",
      deals: [makeDeal({ owner: "Ana", monthNumber: CURRENT_MONTH, adjusted: 500 })],
      ownerPerformance: [makeOwnerPerformance({ owner: "Ana", adjusted: 500, deals: 1 })],
      growthTargets: [
        { owner: "Ana", year: 2026, monthNumber: CURRENT_MONTH, month: "Julho", entryTarget: 0, realizedTarget: 1000 },
      ],
      companyAverageCycle: 10,
      asOf: ASOF,
    });
    const meta = result.dimensions.find((d) => d.key === "metaCrescimento")!;
    expect(meta.available).toBe(true);
    if (meta.available) expect(meta.score).toBe(50);
  });

  it("always marks 'atividades' as unavailable — no activity data source exists", () => {
    const result = computeSellerPerformanceScore({
      owner: "Ana",
      deals: [makeDeal({ owner: "Ana" })],
      ownerPerformance: [makeOwnerPerformance({ owner: "Ana" })],
      growthTargets: [],
      companyAverageCycle: 10,
      asOf: ASOF,
    });
    const activities = result.dimensions.find((d) => d.key === "atividades")!;
    expect(activities.available).toBe(false);
    if (!activities.available) expect(activities.missingDataNote.length).toBeGreaterThan(0);
  });

  it("computes an overall score only from available dimensions, never NaN", () => {
    const result = computeSellerPerformanceScore({
      owner: "Novo Vendedor",
      deals: [],
      ownerPerformance: [],
      growthTargets: [],
      companyAverageCycle: 0,
      asOf: ASOF,
    });
    expect(Number.isFinite(result.overall)).toBe(true);
  });

  it("gives a follow-up score below 100 when the owner's open deals are stale", () => {
    const result = computeSellerPerformanceScore({
      owner: "Ana",
      deals: [makeDeal({ owner: "Ana", stage: "aberto", updatedAt: "2026-01-01T00:00:00.000Z" })],
      ownerPerformance: [makeOwnerPerformance({ owner: "Ana" })],
      growthTargets: [],
      companyAverageCycle: 10,
      asOf: ASOF,
    });
    const followUp = result.dimensions.find((d) => d.key === "followUp")!;
    expect(followUp.available).toBe(true);
    if (followUp.available) expect(followUp.score).toBeLessThan(100);
  });
});
