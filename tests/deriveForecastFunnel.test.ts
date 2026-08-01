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

    expect(leadToMeeting.entered).toBe(122);
    expect(leadToMeeting.advanced).toBe(30);
    expect(leadToMeeting.lost).toBe(92);
    // 30 / 122 = 24,59% — a taxa oficial de 24,6% do relatório.
    expect(leadToMeeting.passRate).toBeCloseTo(0.246, 3);
  });

  it("ordena por volume de vazamento, com o topo do funil em primeiro", () => {
    const leaks = computeFunnelLeaks();
    expect(leaks[0].lost).toBe(92);
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
    expect(allocation.totalLeads).toBe(122);
    expect(allocation.totalMeetings).toBe(30);
    expect(allocation.teamConversion).toBeCloseTo(0.246, 3);
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
    const spiner = allocation.sellers.find((s) => s.seller === "Spiner")!;

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

    // 24,6% × 76,7% = 18,9% — exatamente a taxa "Lead → Oportunidade (geral)".
    expect(0.246 * 0.767).toBeCloseTo(0.189, 3);
    expect(chain.reportedConversion).toBe(0.172);
    expect(chain.leadToContract).toBeCloseTo(0.0592, 3);
    expect(chain.divergenceFactor).toBeGreaterThan(2.5);
  });

  it("quantifica as oportunidades que entram fora do funil de leads", () => {
    const chain = computeChainedConversion();
    // Avaligis entrega 23 oportunidades, Avan abre 95.
    expect(chain.opportunitiesOutsideFunnel).toBe(72);
    expect(chain.opportunitiesOutsideFunnelShare).toBeCloseTo(72 / 95, 6);
  });
});

describe("computeWeightedForecast", () => {
  it("reconstrói o pipeline aberto publicado", () => {
    const forecast = computeWeightedForecast();
    // R$ 63.846,00 + R$ 14.148,10 = R$ 77.994,10 — o número do relatório.
    expect(forecast.rawPipeline).toBeCloseTo(HEADLINE_FIGURES.openPipeline, 2);
  });

  it("pondera cada bloco pela probabilidade da etapa em que ele está", () => {
    const forecast = computeWeightedForecast();

    expect(forecast.negotiationProbability).toBeCloseTo(0.6 * 0.754 * 0.694, 6);
    expect(forecast.financeProbability).toBeCloseTo(0.694, 6);
    expect(forecast.negotiationWeighted).toBeCloseTo(63846 * 0.6 * 0.754 * 0.694, 1);
    expect(forecast.financeWeighted).toBeCloseTo(14148.1 * 0.694, 1);

    // O pipeline bruto vale bem menos do que aparenta.
    expect(forecast.weightedShareOfRaw).toBeLessThan(0.4);
    expect(forecast.weightedTotal).toBeLessThan(forecast.rawPipeline);
  });
});

describe("computeAverageTickets", () => {
  it("calcula os tickets a partir dos cards reais", () => {
    const tickets = computeAverageTickets();
    expect(tickets.wonTicket).toBeCloseTo(54358.65 / 21, 2);
    expect(tickets.lostTicket).toBeCloseTo(547192 / 22, 2);
    // Julho perdeu cerca de 10x o que ganhou, em valor.
    expect(tickets.lostToWonValueRatio).toBeGreaterThan(9);
  });
});

describe("analyzeValueIntegrity", () => {
  it("aponta a concentração de perdas e o fator de inflação", () => {
    const findings = analyzeValueIntegrity();
    const murilo = findings[0];

    expect(murilo.seller).toBe("Murilo Marques");
    expect(murilo.lostShareOfTotal).toBeGreaterThan(0.9);
    expect(murilo.lostTicket).toBeCloseTo(493253.7 / 10, 2);
    expect(murilo.wonTicket).toBeCloseTo(19137.6 / 7, 2);
    // Ticket perdido muito acima do que ele de fato fecha.
    expect(murilo.inflationFactor).toBeGreaterThan(15);
  });

  it("ignora vendedores sem valor monetário na extração", () => {
    const findings = analyzeValueIntegrity();
    // Adilson Fernandes tem 3 perdas sem valor — não deve entrar com zero.
    expect(findings.some((f) => f.seller === "Adilson Fernandes")).toBe(false);
  });
});

describe("reconcileHandoff", () => {
  it("recusa-se a tratar a diferença entre etapas como vazamento", () => {
    const handoff = reconcileHandoff();

    expect(handoff.approvedDeals).toBe(22);
    expect(handoff.inFinanceDeals).toBe(15);
    expect(handoff.reconcilable).toBe(false);
    expect(handoff.confidence).toBe("baixa");
    // Assinado em julho vale ~2x o aprovado em julho: veio de estoque anterior.
    expect(handoff.signedToApprovedRatio).toBeGreaterThan(1.9);
    expect(handoff.caveat).toContain("não pode ser lida como vazamento");
  });
});

describe("planGapClosure", () => {
  it("dimensiona o topo do funil nos dois regimes de conversão", () => {
    const closure = planGapClosure(GAP_2026);

    expect(closure.gap).toBeCloseTo(58711.6, 2);
    expect(closure.contractsNeeded).toBe(23);
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
      2,
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
