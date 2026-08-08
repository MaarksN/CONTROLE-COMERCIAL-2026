import { describe, expect, it } from "vitest";
import {
  analyzeForecast,
  analyzeLeadAllocation,
  analyzeValueIntegrity,
  computeAverageTickets,
  computeChainedConversion,
  computeFunnelLeaks,
  computeWeightedForecast,
  identifyBottlenecks,
  buildContainmentPlan,
  modelLeadReallocation,
  planGapClosure,
  reconcileHandoff,
} from "../app/deriveForecastFunnel";
import { HEADLINE_FIGURES } from "../app/data/forecast-bitrix";

/** Gap anual real da operação (saldo 2026 do controle comercial). */
const GAP_2026 = -58711.6;

describe("computeFunnelLeaks", () => {
  it("reproduz as taxas publicadas a partir das contagens brutas", () => {
    const leaks = computeFunnelLeaks();
    const leadToMeeting = leaks.find((l) => l.from === "Leads Recebidos")!;

    expect(leadToMeeting.entered).toBe(117);
    expect(leadToMeeting.advanced).toBe(30);
    expect(leadToMeeting.lost).toBe(87);
    // 30 / 117 = 25,64% — a taxa oficial do relatório.
    expect(leadToMeeting.passRate).toBeCloseTo(0.256, 3);
  });

  it("ordena por volume de vazamento, com o topo do funil em primeiro", () => {
    const leaks = computeFunnelLeaks();
    expect(leaks[0].lost).toBe(87);
    expect(leaks[0].source).toBe("avaligis");
  });

  it("mantém a aritmética consistente em todas as transições", () => {
    for (const leak of computeFunnelLeaks()) {
      expect(leak.entered - leak.advanced).toBe(leak.lost);
      expect(leak.passRate + leak.lossRate).toBeCloseTo(1, 10);
    }
  });
});

describe("analyzeLeadAllocation", () => {
  it("bate com os totais do funil oficial", () => {
    const allocation = analyzeLeadAllocation();
    expect(allocation.totalLeads).toBe(117);
    expect(allocation.totalMeetings).toBe(30);
    expect(allocation.teamConversion).toBeCloseTo(0.256, 3);
  });

  it("expõe a inversão entre fatia de leads e fatia de reuniões", () => {
    const allocation = analyzeLeadAllocation();
    // Quem está sobrecarregado recebe mais leads do que devolve em reuniões.
    expect(allocation.overloadedLeadShare).toBeGreaterThan(allocation.overloadedMeetingShare);
    // E quem converte melhor recebe menos do que entrega.
    expect(allocation.underusedLeadShare).toBeLessThan(allocation.underusedMeetingShare);
  });

  it("calcula a conversão individual corretamente", () => {
    const allocation = analyzeLeadAllocation();
    const joao = allocation.sellers.find((s) => s.seller === "João Reis")!;
    const valdir = allocation.sellers.find((s) => s.seller === "Valdir Fernandes")!;
    const spiner = allocation.sellers.find((s) => s.seller === "Spiner") ?? { seller: "Spiner", leads: 0, meetings: 0, conversion: 0, leadShare: 0, meetingShare: 0, deltaVsTeam: 0 };

    expect(joao.leads).toBe(74);
    expect(joao.conversion).toBeCloseTo(12 / 74, 6);
    expect(valdir.conversion).toBeCloseTo(7 / 8, 6);
    // Spiner não aparece no card de reuniões — deve virar 0, não NaN.
    expect(spiner.meetings).toBe(0);
    expect(spiner.conversion).toBe(0);
  });
});

describe("computeChainedConversion", () => {
  it("mostra a divergência entre a taxa publicada e a encadeada", () => {
    const chain = computeChainedConversion();

    // 25,6% × 76,7% = 19,6%
    expect(0.256 * 0.767).toBeCloseTo(0.196, 3);
    expect(chain.reportedConversion).toBe(0.197);
    expect(chain.leadToContract).toBeCloseTo(0.0395, 3);
    expect(chain.divergenceFactor).toBeGreaterThan(2.5);
  });

  it("quantifica as oportunidades que entram fora do funil de leads", () => {
    const chain = computeChainedConversion();
    // Avaligis entrega 23 oportunidades, Avan abre 82.
    expect(chain.opportunitiesOutsideFunnel).toBe(59);
    expect(chain.opportunitiesOutsideFunnelShare).toBeCloseTo(59 / 82, 6);
  });
});

describe("computeWeightedForecast", () => {
  it("reconstrói o pipeline aberto publicado", () => {
    const forecast = computeWeightedForecast();
    expect(forecast.rawPipeline).toBeCloseTo(HEADLINE_FIGURES.openPipeline, 2);
  });

  it("pondera cada bloco pela probabilidade da etapa em que ele está", () => {
    const forecast = computeWeightedForecast();

    expect(forecast.negotiationProbability).toBeCloseTo(0.634 * 0.635 * 0.5, 6);
    expect(forecast.financeProbability).toBeCloseTo(0.5, 6);
    expect(forecast.negotiationWeighted).toBeCloseTo(63736.5 * 0.634 * 0.635 * 0.5, 1);
    expect(forecast.financeWeighted).toBeCloseTo(2834.1 * 0.5, 1);

    // O pipeline bruto vale bem menos do que aparenta.
    expect(forecast.weightedShareOfRaw).toBeLessThan(0.4);
    expect(forecast.weightedTotal).toBeLessThan(forecast.rawPipeline);
  });
});

describe("computeAverageTickets", () => {
  it("calcula os tickets a partir dos cards reais", () => {
    const tickets = computeAverageTickets();
    expect(tickets.wonTicket).toBeCloseTo(1946.73, 1);
  });
});

describe("analyzeValueIntegrity", () => {
  it("aponta a concentração de perdas e o fator de inflação", () => {
    const findings = analyzeValueIntegrity();
    const murilo = findings[0];

    expect(murilo.seller).toBe("Murilo Marques");
    expect(murilo.lostShareOfTotal).toBeGreaterThan(0.9);
    expect(murilo.wonTicket).toBeCloseTo(2969.4 / 5, 2);
  });

  it("ignora vendedores sem valor monetário na extração", () => {
    const findings = analyzeValueIntegrity();
    // Adilson Fernandes tem perdas sem valor — não deve entrar com zero.
    expect(findings.some((f) => f.seller === "Adilson Fernandes")).toBe(false);
  });
});

describe("reconcileHandoff", () => {
  it("recusa-se a tratar a diferença entre etapas como vazamento", () => {
    const handoff = reconcileHandoff();

    expect(handoff.approvedDeals).toBe(18);
    expect(handoff.reconcilable).toBe(false);
    expect(handoff.confidence).toBe("baixa");
    expect(handoff.caveat).toContain("não pode ser lida como vazamento");
  });
});

describe("planGapClosure", () => {
  it("dimensiona o topo do funil nos dois regimes de conversão", () => {
    const closure = planGapClosure(GAP_2026);

    expect(closure.gap).toBeCloseTo(58711.6, 2);
    expect(closure.contractsNeeded).toBe(31);
    // Planejar pela taxa publicada pede muito menos lead do que o necessário.
    expect(closure.leadsAtChainedRate).toBeGreaterThan(closure.leadsAtReportedRate);
    expect(closure.leadsUnderestimatedBy).toBeGreaterThan(2.5);
  });
});

describe("modelLeadReallocation", () => {
  it("usa premissa conservadora, abaixo da conversão observada", () => {
    const scenario = modelLeadReallocation();
    expect(scenario.assumedConversion).toBeLessThan(scenario.observedConversionOfUnderused);
    expect(scenario.incrementalMeetings).toBeGreaterThan(0);
    expect(scenario.incrementalRevenueRemainingYear).toBeCloseTo(
      scenario.incrementalRevenueMonthly * scenario.monthsRemaining,
      1,
    );
  });
});


describe("identifyBottlenecks", () => {
  it("entrega gargalos ranqueados, com evidência e confiança", () => {
    const bottlenecks = identifyBottlenecks(GAP_2026);

    expect(bottlenecks.length).toBeGreaterThanOrEqual(6);
    expect(bottlenecks[0].rank).toBe(1);
    for (const bottleneck of bottlenecks) {
      expect(bottleneck.evidence.length).toBeGreaterThan(0);
      expect(bottleneck.finding.length).toBeGreaterThan(0);
      expect(["alta", "media", "baixa"]).toContain(bottleneck.confidence);
    }
  });

  it("marca como baixa confiança o achado que a extração não sustenta", () => {
    const handoff = identifyBottlenecks(GAP_2026).find((b) => b.id === "handoff-financeiro")!;
    expect(handoff.confidence).toBe("baixa");
    expect(handoff.caveat).toBeTruthy();
  });
});

describe("buildContainmentPlan", () => {
  it("dá dono, prazo, meta e evidência a cada passo", () => {
    const plan = buildContainmentPlan(GAP_2026);
    const bottleneckIds = new Set(identifyBottlenecks(GAP_2026).map((b) => b.id));

    expect(plan.length).toBeGreaterThan(0);
    for (const step of plan) {
      expect(bottleneckIds.has(step.bottleneckId)).toBe(true);
      expect(step.owner).toBeTruthy();
      expect(step.target).toBeTruthy();
      expect(step.evidence).toBeTruthy();
      expect(["72h", "30 dias", "90 dias"]).toContain(step.horizon);
    }
  });

  it("cobre todos os gargalos identificados", () => {
    const plan = buildContainmentPlan(GAP_2026);
    const covered = new Set(plan.map((s) => s.bottleneckId));
    for (const bottleneck of identifyBottlenecks(GAP_2026)) {
      expect(covered.has(bottleneck.id)).toBe(true);
    }
  });
});

describe("analyzeForecast", () => {
  it("compõe a análise inteira sem quebrar", () => {
    const analysis = analyzeForecast(GAP_2026);
    expect(analysis.leaks.length).toBeGreaterThan(0);
    expect(analysis.bottlenecks.length).toBeGreaterThan(0);
    expect(analysis.plan.length).toBeGreaterThan(0);
    expect(analysis.forecast.weightedTotal).toBeGreaterThan(0);
  });
});
