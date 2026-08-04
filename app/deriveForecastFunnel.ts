/**
 * Motor de análise do forecast Bitrix24.
 *
 * Transforma a extração bruta de `data/forecast-bitrix.ts` em diagnóstico:
 * onde o funil vaza, quanto isso custa, o que é fato e o que é hipótese, e qual
 * é o próximo passo para conter cada gargalo.
 *
 * Regra de honestidade adotada em todo o módulo: quando a extração não permite
 * afirmar algo, o resultado carrega `confidence` e `caveat` em vez de fingir
 * precisão. Um número errado com cara de certeza é pior do que uma lacuna
 * declarada.
 */

import {
  CONVERSION_RATES,
  FUNNEL_PIPELINES,
  FUNNEL_SOURCE_LABELS,
  HEADLINE_FIGURES,
  ITEM_CARDS,
  findItemCard,
  type FunnelSource,
  type SellerBreakdown,
} from "./data/forecast-bitrix";

export type Confidence = "alta" | "media" | "baixa";
export type Severity = "critico" | "alto" | "medio";

const round2 = (value: number) => Math.round(value * 100) / 100;

/* ------------------------------------------------------------------ *
 * 1. Vazamento etapa a etapa
 * ------------------------------------------------------------------ */

export type FunnelLeak = {
  id: string;
  source: FunnelSource;
  sourceLabel: string;
  from: string;
  to: string;
  entered: number;
  advanced: number;
  lost: number;
  passRate: number;
  lossRate: number;
};

/**
 * Vazamento por transição, calculado a partir das contagens reais do funil
 * histórico (e não das taxas publicadas), para que a aritmética seja auditável.
 */
export function computeFunnelLeaks(): FunnelLeak[] {
  const leaks: FunnelLeak[] = [];

  for (const pipeline of FUNNEL_PIPELINES) {
    for (let index = 1; index < pipeline.stages.length; index += 1) {
      const previous = pipeline.stages[index - 1];
      const current = pipeline.stages[index];
      const lost = previous.count - current.count;

      leaks.push({
        id: `${pipeline.source}-${index}`,
        source: pipeline.source,
        sourceLabel: FUNNEL_SOURCE_LABELS[pipeline.source],
        from: previous.label,
        to: current.label,
        entered: previous.count,
        advanced: current.count,
        lost,
        passRate: previous.count === 0 ? 0 : current.count / previous.count,
        lossRate: previous.count === 0 ? 0 : lost / previous.count,
      });
    }
  }

  return leaks.sort((a, b) => b.lost - a.lost);
}

/* ------------------------------------------------------------------ *
 * 2. Distribuição de leads x capacidade de conversão
 * ------------------------------------------------------------------ */

export type SellerLeadEfficiency = {
  seller: string;
  leads: number;
  meetings: number;
  conversion: number;
  leadShare: number;
  meetingShare: number;
  /** Positivo = converte acima da média do time; negativo = abaixo. */
  deltaVsTeam: number;
};

export type LeadAllocationAnalysis = {
  teamConversion: number;
  totalLeads: number;
  totalMeetings: number;
  sellers: SellerLeadEfficiency[];
  overloaded: SellerLeadEfficiency[];
  underused: SellerLeadEfficiency[];
  overloadedLeadShare: number;
  overloadedMeetingShare: number;
  underusedLeadShare: number;
  underusedMeetingShare: number;
};

/**
 * Cruza "Leads Recebidos" com "Reuniões Agendadas" por vendedor. É o único
 * cruzamento da extração que revela capacidade individual de conversão — os
 * demais cards não compartilham a mesma população.
 */
export function analyzeLeadAllocation(): LeadAllocationAnalysis {
  const leadsCard = findItemCard("leads-recebidos");
  const meetingsCard = findItemCard("reunioes-agendadas");

  const leadRows: SellerBreakdown[] = leadsCard?.sellers ?? [];
  const meetingBySeller = new Map<string, number>(
    (meetingsCard?.sellers ?? []).map((row) => [row.seller, row.count]),
  );

  const totalLeads = leadRows.reduce((sum, row) => sum + row.count, 0);
  const totalMeetings = (meetingsCard?.sellers ?? []).reduce((sum, row) => sum + row.count, 0);
  const teamConversion = totalLeads === 0 ? 0 : totalMeetings / totalLeads;

  const sellers: SellerLeadEfficiency[] = leadRows
    .map((row) => {
      const meetings = meetingBySeller.get(row.seller) ?? 0;
      const conversion = row.count === 0 ? 0 : meetings / row.count;
      return {
        seller: row.seller,
        leads: row.count,
        meetings,
        conversion,
        leadShare: totalLeads === 0 ? 0 : row.count / totalLeads,
        meetingShare: totalMeetings === 0 ? 0 : meetings / totalMeetings,
        deltaVsTeam: conversion - teamConversion,
      };
    })
    .sort((a, b) => b.leads - a.leads);

  // "Sobrecarregado" = recebe fatia de leads maior do que a fatia de reuniões
  // que devolve. "Subaproveitado" = o inverso, com conversão acima da média.
  const overloaded = sellers.filter((s) => s.leadShare > s.meetingShare && s.conversion < teamConversion);
  const underused = sellers.filter((s) => s.conversion > teamConversion && s.leadShare < s.meetingShare);

  const share = (rows: SellerLeadEfficiency[], key: "leadShare" | "meetingShare") =>
    rows.reduce((sum, row) => sum + row[key], 0);

  return {
    teamConversion,
    totalLeads,
    totalMeetings,
    sellers,
    overloaded,
    underused,
    overloadedLeadShare: share(overloaded, "leadShare"),
    overloadedMeetingShare: share(overloaded, "meetingShare"),
    underusedLeadShare: share(underused, "leadShare"),
    underusedMeetingShare: share(underused, "meetingShare"),
  };
}

export type ReallocationScenario = {
  leadsMoved: number;
  /** Taxa deliberadamente conservadora aplicada aos leads realocados. */
  assumedConversion: number;
  observedConversionOfUnderused: number;
  currentConversionOfOverloaded: number;
  incrementalMeetings: number;
  incrementalContracts: number;
  incrementalRevenueMonthly: number;
  incrementalRevenueRemainingYear: number;
  monthsRemaining: number;
};

/**
 * Modelo de realocação de leads. Usa uma taxa assumida propositalmente abaixo
 * da observada nos vendedores subaproveitados, porque a amostra deles é pequena
 * e extrapolar a conversão real superestimaria o ganho.
 */
export function modelLeadReallocation(options?: {
  leadsMoved?: number;
  assumedConversion?: number;
  monthsRemaining?: number;
}): ReallocationScenario {
  const allocation = analyzeLeadAllocation();
  const chain = computeChainedConversion();
  const ticket = computeAverageTickets().wonTicket;

  const leadsMoved = options?.leadsMoved ?? 30;
  const assumedConversion = options?.assumedConversion ?? 0.5;
  const monthsRemaining = options?.monthsRemaining ?? 5;

  const sumLeads = (rows: SellerLeadEfficiency[]) => rows.reduce((sum, r) => sum + r.leads, 0);
  const sumMeetings = (rows: SellerLeadEfficiency[]) => rows.reduce((sum, r) => sum + r.meetings, 0);

  const underusedLeads = sumLeads(allocation.underused);
  const overloadedLeads = sumLeads(allocation.overloaded);

  const observedConversionOfUnderused =
    underusedLeads === 0 ? 0 : sumMeetings(allocation.underused) / underusedLeads;
  const currentConversionOfOverloaded =
    overloadedLeads === 0 ? 0 : sumMeetings(allocation.overloaded) / overloadedLeads;

  const incrementalMeetings = leadsMoved * (assumedConversion - currentConversionOfOverloaded);
  const incrementalContracts = incrementalMeetings * chain.meetingToContract;
  const incrementalRevenueMonthly = incrementalContracts * ticket;

  return {
    leadsMoved,
    assumedConversion,
    observedConversionOfUnderused,
    currentConversionOfOverloaded,
    incrementalMeetings: round2(incrementalMeetings),
    incrementalContracts: round2(incrementalContracts),
    incrementalRevenueMonthly: round2(incrementalRevenueMonthly),
    incrementalRevenueRemainingYear: round2(incrementalRevenueMonthly * monthsRemaining),
    monthsRemaining,
  };
}

/* ------------------------------------------------------------------ *
 * 3. A métrica que não fecha: conversão encadeada x conversão publicada
 * ------------------------------------------------------------------ */

export type ChainedConversion = {
  /** Produto das taxas de etapa: lead → contrato assinado. */
  leadToContract: number;
  /** Produto das taxas a partir da reunião agendada. */
  meetingToContract: number;
  /** Taxa publicada no relatório (21 contratos ÷ 122 leads). */
  reportedConversion: number;
  /** Quantas vezes a taxa publicada supera a encadeada. */
  divergenceFactor: number;
  /** Oportunidades do Avan que não vieram do funil de leads do Avaligis. */
  opportunitiesOutsideFunnel: number;
  opportunitiesOutsideFunnelShare: number;
};

const rateOf = (id: string) => CONVERSION_RATES.find((rate) => rate.id === id)?.rate ?? 0;

/**
 * A taxa "geral" publicada (19,7%) é `contratos ÷ leads` da mesma competência,
 * mas numerador e denominador vêm de populações distintas: os 18 contratos de
 * julho não descendem dos 117 leads de julho. O produto das etapas dá outro
 * número — e a distância entre os dois é o que dimensiona errado a meta de topo.
 */
export function computeChainedConversion(): ChainedConversion {
  const leadToMeeting = rateOf("lead-reuniao");
  const meetingToOpportunity = rateOf("reuniao-oportunidade");
  const opportunityToProposal = rateOf("oportunidade-proposta");
  const proposalToApproved = rateOf("proposta-aprovado");
  const processToSigned = rateOf("processo-assinado");

  const meetingToContract =
    meetingToOpportunity * opportunityToProposal * proposalToApproved * processToSigned;
  const leadToContract = leadToMeeting * meetingToContract;
  const reportedConversion = HEADLINE_FIGURES.overallConversion;

  const avaligis = FUNNEL_PIPELINES.find((p) => p.source === "avaligis");
  const avan = FUNNEL_PIPELINES.find((p) => p.source === "avan");
  const opportunitiesFromFunnel = avaligis?.stages.at(-1)?.count ?? 0;
  const opportunitiesTotal = avan?.stages[0]?.count ?? 0;
  const opportunitiesOutsideFunnel = opportunitiesTotal - opportunitiesFromFunnel;

  return {
    leadToContract,
    meetingToContract,
    reportedConversion,
    divergenceFactor: leadToContract === 0 ? 0 : reportedConversion / leadToContract,
    opportunitiesOutsideFunnel,
    opportunitiesOutsideFunnelShare:
      opportunitiesTotal === 0 ? 0 : opportunitiesOutsideFunnel / opportunitiesTotal,
  };
}

/* ------------------------------------------------------------------ *
 * 4. Forecast ponderado pelas taxas reais de cada etapa
 * ------------------------------------------------------------------ */

export type WeightedForecast = {
  negotiationValue: number;
  negotiationProbability: number;
  negotiationWeighted: number;
  financeValue: number;
  financeProbability: number;
  financeWeighted: number;
  rawPipeline: number;
  weightedTotal: number;
  weightedShareOfRaw: number;
};

/**
 * Pondera cada bloco do pipeline aberto pela probabilidade real de chegar ao
 * contrato assinado, em vez de tratar R$ 66.570,60 como se fosse receita.
 */
export function computeWeightedForecast(): WeightedForecast {
  const negotiation = findItemCard("em-negociacao");
  const finance = findItemCard("em-processo-financeiro");

  const negotiationValue = negotiation?.value ?? 0;
  const financeValue = finance?.value ?? 0;

  // Em Negociação ainda precisa atravessar proposta, aprovação e financeiro.
  const negotiationProbability =
    rateOf("oportunidade-proposta") * rateOf("proposta-aprovado") * rateOf("processo-assinado");
  // O que já está no Financeiro só depende da última transição.
  const financeProbability = rateOf("processo-assinado");

  const negotiationWeighted = negotiationValue * negotiationProbability;
  const financeWeighted = financeValue * financeProbability;
  const rawPipeline = negotiationValue + financeValue;
  const weightedTotal = negotiationWeighted + financeWeighted;

  return {
    negotiationValue,
    negotiationProbability,
    negotiationWeighted: round2(negotiationWeighted),
    financeValue,
    financeProbability,
    financeWeighted: round2(financeWeighted),
    rawPipeline: round2(rawPipeline),
    weightedTotal: round2(weightedTotal),
    weightedShareOfRaw: rawPipeline === 0 ? 0 : weightedTotal / rawPipeline,
  };
}

/* ------------------------------------------------------------------ *
 * 5. Integridade do valor: perdas concentradas e ticket inflado
 * ------------------------------------------------------------------ */

export type AverageTickets = {
  wonTicket: number;
  lostTicket: number;
  negotiationTicket: number;
  lostToWonValueRatio: number;
};

export function computeAverageTickets(): AverageTickets {
  const won = findItemCard("contratos-assinados");
  const lost = findItemCard("negocios-perdidos");
  const negotiation = findItemCard("em-negociacao");

  const wonTicket = won && won.records > 0 ? (won.value ?? 0) / won.records : 0;
  const lostTicket = lost && lost.records > 0 ? (lost.value ?? 0) / lost.records : 0;
  const negotiationTicket =
    negotiation && negotiation.records > 0 ? (negotiation.value ?? 0) / negotiation.records : 0;

  return {
    wonTicket: round2(wonTicket),
    lostTicket: round2(lostTicket),
    negotiationTicket: round2(negotiationTicket),
    lostToWonValueRatio: (won?.value ?? 0) === 0 ? 0 : (lost?.value ?? 0) / (won?.value ?? 1),
  };
}

export type ValueIntegrityFinding = {
  seller: string;
  lostDeals: number;
  lostValue: number;
  lostShareOfTotal: number;
  lostTicket: number;
  wonDeals: number;
  wonValue: number;
  wonTicket: number;
  /** Quantas vezes o ticket perdido supera o ticket que o vendedor de fato fecha. */
  inflationFactor: number;
};

/**
 * Compara, por vendedor, o ticket dos negócios perdidos com o ticket dos
 * negócios efetivamente fechados. Um fator alto indica valor inflado no CRM —
 * o que contamina o forecast — e não necessariamente perda real de receita.
 */
export function analyzeValueIntegrity(): ValueIntegrityFinding[] {
  const lost = findItemCard("negocios-perdidos");
  const won = findItemCard("contratos-assinados");
  const lostTotal = lost?.value ?? 0;

  const wonBySeller = new Map<string, SellerBreakdown>(
    (won?.sellers ?? []).map((row) => [row.seller, row]),
  );

  return (lost?.sellers ?? [])
    .filter((row) => row.value !== null && row.value > 0)
    .map((row) => {
      const lostValue = row.value ?? 0;
      const wonRow = wonBySeller.get(row.seller);
      const wonDeals = wonRow?.count ?? 0;
      const wonValue = wonRow?.value ?? 0;
      const wonTicket = wonDeals === 0 ? 0 : wonValue / wonDeals;
      const lostTicket = row.count === 0 ? 0 : lostValue / row.count;

      return {
        seller: row.seller,
        lostDeals: row.count,
        lostValue,
        lostShareOfTotal: lostTotal === 0 ? 0 : lostValue / lostTotal,
        lostTicket: round2(lostTicket),
        wonDeals,
        wonValue,
        wonTicket: round2(wonTicket),
        inflationFactor: wonTicket === 0 ? 0 : lostTicket / wonTicket,
      };
    })
    .sort((a, b) => b.lostValue - a.lostValue);
}

/* ------------------------------------------------------------------ *
 * 6. Reconciliação entre pipelines (o handoff que ninguém audita)
 * ------------------------------------------------------------------ */

export type HandoffReconciliation = {
  approvedDeals: number;
  approvedValue: number;
  inFinanceDeals: number;
  inFinanceValue: number;
  signedDeals: number;
  signedValue: number;
  dealDelta: number;
  valueDelta: number;
  signedToApprovedRatio: number;
  reconcilable: boolean;
  confidence: Confidence;
  caveat: string;
};

/**
 * "Aprovado Internamente" (Avan) deveria desaguar em "Em Processo" (Financeiro).
 * A extração não permite subtrair um do outro: os contratos assinados em julho
 * valem 2x o aprovado em julho, ou seja, consomem um estoque de aprovações
 * anteriores. O gargalo aqui é a ausência de rastreio, não um número.
 */
export function reconcileHandoff(): HandoffReconciliation {
  const approved = findItemCard("aprovado-internamente");
  const inFinance = findItemCard("em-processo-financeiro");
  const signed = findItemCard("contratos-assinados");

  const approvedValue = approved?.value ?? 0;
  const signedValue = signed?.value ?? 0;
  const signedToApprovedRatio = approvedValue === 0 ? 0 : signedValue / approvedValue;

  return {
    approvedDeals: approved?.records ?? 0,
    approvedValue,
    inFinanceDeals: inFinance?.records ?? 0,
    inFinanceValue: inFinance?.value ?? 0,
    signedDeals: signed?.records ?? 0,
    signedValue,
    dealDelta: (approved?.records ?? 0) - (inFinance?.records ?? 0),
    valueDelta: round2(approvedValue - (inFinance?.value ?? 0)),
    signedToApprovedRatio,
    reconcilable: false,
    confidence: "baixa",
    caveat:
      "Os cards comparam recortes diferentes: 'Aprovado Internamente' é de julho/2026 e " +
      "'Em Processo no Financeiro' é uma foto do agora. Como os contratos assinados em julho " +
      `valem ${signedToApprovedRatio.toFixed(2)}x o aprovado no mesmo mês, parte deles veio de ` +
      "aprovações anteriores. A diferença não pode ser lida como vazamento — ela mede a " +
      "impossibilidade de rastrear o handoff com a extração atual.",
  };
}

/* ------------------------------------------------------------------ *
 * 7. Fechamento do gap anual
 * ------------------------------------------------------------------ */

export type GapClosurePlan = {
  gap: number;
  wonTicket: number;
  contractsNeeded: number;
  leadsAtReportedRate: number;
  leadsAtChainedRate: number;
  leadsUnderestimatedBy: number;
  currentMonthlyLeads: number;
  monthsRemaining: number;
  leadsPerMonthRequired: number;
  /** Leads que a operação já vai gerar no horizonte, no ritmo atual. */
  leadsAvailableRemaining: number;
  /** Positivo = sobra de topo de funil; negativo = falta mesmo. */
  leadSurplus: number;
  /** `true` quando o volume atual já basta e o gargalo é conversão, não geração. */
  volumeIsSufficient: boolean;
  /** Receita que o volume atual entregaria mantida a conversão encadeada. */
  revenueAtCurrentVolume: number;
  /** Conversão mínima lead→contrato que fecharia o gap sem gerar um lead a mais. */
  conversionNeededAtCurrentVolume: number;
  /** Limite explícito do que este modelo cobre — e do que ele não cobre. */
  scopeNote: string;
};

/**
 * Dimensiona o topo do funil necessário para cobrir o gap anual — nos dois
 * regimes de conversão. A diferença entre eles é o custo real de planejar com
 * a métrica publicada.
 *
 * O resultado também responde à pergunta que importa antes de pedir orçamento
 * de mídia: o problema é falta de lead ou falta de conversão? Quando
 * `volumeIsSufficient` é `true`, comprar mais lead não resolve.
 */
export function planGapClosure(gap: number, monthsRemaining = 5): GapClosurePlan {
  const absoluteGap = Math.abs(gap);
  const { wonTicket } = computeAverageTickets();
  const chain = computeChainedConversion();
  const currentMonthlyLeads = findItemCard("leads-recebidos")?.records ?? 0;

  const contractsNeeded = wonTicket === 0 ? 0 : absoluteGap / wonTicket;
  const leadsAtReportedRate =
    chain.reportedConversion === 0 ? 0 : contractsNeeded / chain.reportedConversion;
  const leadsAtChainedRate =
    chain.leadToContract === 0 ? 0 : contractsNeeded / chain.leadToContract;
  const leadsPerMonthRequired = monthsRemaining === 0 ? 0 : leadsAtChainedRate / monthsRemaining;
  const leadsAvailableRemaining = currentMonthlyLeads * monthsRemaining;
  const revenueAtCurrentVolume = leadsAvailableRemaining * chain.leadToContract * wonTicket;

  return {
    gap: absoluteGap,
    wonTicket,
    contractsNeeded: Math.ceil(contractsNeeded),
    leadsAtReportedRate: Math.ceil(leadsAtReportedRate),
    leadsAtChainedRate: Math.ceil(leadsAtChainedRate),
    leadsUnderestimatedBy:
      leadsAtReportedRate === 0 ? 0 : leadsAtChainedRate / leadsAtReportedRate,
    currentMonthlyLeads,
    monthsRemaining,
    leadsPerMonthRequired: Math.ceil(leadsPerMonthRequired),
    leadsAvailableRemaining,
    leadSurplus: Math.round(leadsAvailableRemaining - leadsAtChainedRate),
    volumeIsSufficient: leadsAvailableRemaining >= leadsAtChainedRate,
    revenueAtCurrentVolume: round2(revenueAtCurrentVolume),
    conversionNeededAtCurrentVolume:
      leadsAvailableRemaining === 0 ? 0 : contractsNeeded / leadsAvailableRemaining,
    scopeNote:
      `Duas premissas sustentam esta conta. Primeira: ticket médio de ${brl(wonTicket)}, o de ` +
      "julho/2026, assumindo mix de produto estável. Segunda, e mais frágil: a conversão " +
      "encadeada trata todo contrato como se descendesse de um lead do Avaligis — mas 75,8% das " +
      "oportunidades do Avan entram por outras fontes. Então o número de leads aqui é um teto " +
      "pessimista, não uma meta de mídia. Corrigir a atribuição de origem é o que transforma " +
      "esta estimativa em plano.",
  };
}

/* ------------------------------------------------------------------ *
 * 8. Gargalos priorizados
 * ------------------------------------------------------------------ */

export type Bottleneck = {
  id: string;
  rank: number;
  title: string;
  scope: string;
  severity: Severity;
  headline: string;
  finding: string;
  evidence: string[];
  impact: string;
  confidence: Confidence;
  caveat?: string;
};

const pct = (value: number, digits = 1) =>
  `${(value * 100).toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`;

const brl = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });

/**
 * Ordena os gargalos por impacto sobre a receita, não por severidade nominal:
 * um vazamento grande numa etapa barata pode custar menos que um vazamento
 * pequeno numa etapa cara.
 */
export function identifyBottlenecks(gap: number): Bottleneck[] {
  const leaks = computeFunnelLeaks();
  const allocation = analyzeLeadAllocation();
  const chain = computeChainedConversion();
  const tickets = computeAverageTickets();
  const integrity = analyzeValueIntegrity();
  const handoff = reconcileHandoff();
  const forecast = computeWeightedForecast();
  const closure = planGapClosure(gap);

  const avaligisOpportunities = FUNNEL_PIPELINES.find((p) => p.source === "avaligis")?.stages.at(-1)?.count ?? 0;
  const avanOpportunities = FUNNEL_PIPELINES.find((p) => p.source === "avan")?.stages[0]?.count ?? 0;
  const financeiroPipeline = FUNNEL_PIPELINES.find((p) => p.source === "financeiro");
  const financeiroEntered = financeiroPipeline?.stages[0]?.count ?? 0;
  const financeiroSigned = financeiroPipeline?.stages.at(-1)?.count ?? 0;
  const avanStages = FUNNEL_PIPELINES.find((p) => p.source === "avan")?.stages ?? [];
  const opportunityCount = avanStages[0]?.count ?? 0;
  const proposalCount = avanStages[1]?.count ?? 0;

  const topLeak = leaks[0];
  // O vendedor que mais custa não é o de pior taxa, e sim o que desperdiça mais
  // leads em números absolutos — taxa ruim sobre volume pequeno importa pouco.
  const worstAllocator = [...allocation.sellers]
    .filter((s) => s.conversion < allocation.teamConversion)
    .sort((a, b) => b.leads - b.meetings - (a.leads - a.meetings))[0];
  const bestAllocator = [...allocation.sellers]
    .filter((s) => s.leads > 0)
    .sort((a, b) => b.conversion - a.conversion)[0];
  const worstInflation = integrity[0];

  const bottlenecks: Omit<Bottleneck, "rank">[] = [
    {
      id: "distribuicao-leads",
      title: "Leads concentrados em quem menos converte",
      scope: "Avaligis · topo do funil",
      severity: "critico",
      headline: `${pct(allocation.overloadedLeadShare)} dos leads → ${pct(allocation.overloadedMeetingShare)} das reuniões`,
      finding:
        `A distribuição de leads é inversa à capacidade de conversão. ` +
        (worstAllocator
          ? `${worstAllocator.seller} recebe ${worstAllocator.leads} leads, converte ` +
            `${pct(worstAllocator.conversion)} e sozinho desperdiça ` +
            `${worstAllocator.leads - worstAllocator.meetings} leads; `
          : "") +
        (bestAllocator
          ? `${bestAllocator.seller} converte ${pct(bestAllocator.conversion)} com apenas ${bestAllocator.leads} leads. `
          : "") +
        "O gargalo não é volume de leads — é para onde eles vão.",
      evidence: allocation.sellers.map(
        (s) =>
          `${s.seller}: ${s.leads} leads → ${s.meetings} ${s.meetings === 1 ? "reunião" : "reuniões"} ` +
          `(${pct(s.conversion)})`,
      ),
      impact:
        `${topLeak ? topLeak.lost : 0} leads morrem antes da reunião. ` +
        `Cada reunião vale ${brl(chain.meetingToContract * tickets.wonTicket)} em receita esperada.`,
      confidence: "alta",
      caveat:
        "As taxas altas de Valdir e Murilo vêm de amostras pequenas (8 e 6 leads). " +
        "Qualquer realocação deve ser feita em lotes com medição, não de uma vez.",
    },
    {
      id: "metrica-conversao",
      title: "A taxa de conversão geral está medindo populações diferentes",
      scope: "Metodologia · todo o funil",
      severity: "critico",
      headline: `${pct(chain.reportedConversion)} publicado vs ${pct(chain.leadToContract)} encadeado`,
      finding:
        `Os ${HEADLINE_FIGURES.confirmedDeals} contratos de julho não descendem dos ` +
        `${allocation.totalLeads} leads de julho. O Avan recebe ${chain.opportunitiesOutsideFunnel} ` +
        `oportunidades (${pct(chain.opportunitiesOutsideFunnelShare)}) que nunca passaram pelo funil ` +
        "de leads do Avaligis, então dividir um pelo outro mistura fontes.",
      evidence: [
        `Avaligis entrega ${avaligisOpportunities} oportunidades; Avan abre ${avanOpportunities} — ` +
          `diferença de ${chain.opportunitiesOutsideFunnel}`,
        `Produto das etapas: ${pct(rateOf("lead-reuniao"))} × ${pct(rateOf("reuniao-oportunidade"))} × ` +
          `${pct(rateOf("oportunidade-proposta"))} × ${pct(rateOf("proposta-aprovado"))} × ` +
          `${pct(rateOf("processo-assinado"))} = ${pct(chain.leadToContract)}`,
        `Taxa publicada: ${HEADLINE_FIGURES.confirmedDeals} ÷ ${allocation.totalLeads} = ${pct(chain.reportedConversion)}`,
      ],
      impact:
        `Planejar com a taxa publicada subdimensiona a meta de topo em ` +
        `${closure.leadsUnderestimatedBy.toFixed(1)}x: ${closure.leadsAtReportedRate} leads pedidos ` +
        `contra ${closure.leadsAtChainedRate} necessários para cobrir o gap de ${brl(closure.gap)}. ` +
        (closure.volumeIsSufficient
          ? `Mesmo assim, no ritmo atual a operação gera ${closure.leadsAvailableRemaining} leads até ` +
            `dezembro — ${closure.leadSurplus} a mais do que o necessário. Comprar mídia não resolve: ` +
            "o gargalo é conversão, não geração."
          : `No ritmo atual só haverá ${closure.leadsAvailableRemaining} leads até dezembro — ` +
            `faltam ${Math.abs(closure.leadSurplus)}.`),
      confidence: "alta",
    },
    {
      id: "valor-inflado",
      title: "Valor de pipeline inflado contamina o forecast",
      scope: "Avan Negócios · integridade de dados",
      severity: "alto",
      headline: worstInflation
        ? `${worstInflation.seller}: ticket perdido ${worstInflation.inflationFactor.toFixed(1)}x o ticket ganho`
        : "Ticket perdido muito acima do ticket ganho",
      finding:
        `Julho perdeu ${brl(findItemCard("negocios-perdidos")?.value ?? 0)} contra ` +
        `${brl(findItemCard("contratos-assinados")?.value ?? 0)} ganhos — razão de ` +
        `${tickets.lostToWonValueRatio.toFixed(1)}:1 em valor. ` +
        (worstInflation
          ? `${worstInflation.seller} concentra ${pct(worstInflation.lostShareOfTotal)} do valor perdido ` +
            `em ${worstInflation.lostDeals} negócios, com ticket médio de ${brl(worstInflation.lostTicket)} ` +
            `enquanto fecha a ${brl(worstInflation.wonTicket)}.`
          : ""),
      evidence: integrity.map(
        (row) =>
          `${row.seller}: perdeu ${brl(row.lostValue)} em ${row.lostDeals} deals ` +
          `(ticket ${brl(row.lostTicket)}) · ganhou ${brl(row.wonValue)} em ${row.wonDeals} ` +
          `(ticket ${brl(row.wonTicket)})`,
      ),
      impact:
        `Enquanto o valor não for auditado, todo forecast ponderado herda o erro. ` +
        `O pipeline aberto de ${brl(forecast.rawPipeline)} vale ${brl(forecast.weightedTotal)} ` +
        `ponderado (${pct(forecast.weightedShareOfRaw)}) — e mesmo isso assume valores corretos.`,
      confidence: "media",
      caveat:
        "Ticket inflado e perda real de deals enterprise produzem exatamente o mesmo número. " +
        "Só a auditoria dos 10 negócios distingue os dois casos — e a ação é oposta em cada um.",
    },
    {
      id: "handoff-financeiro",
      title: "O handoff Avan → Financeiro não é rastreável",
      scope: "Avan Negócios → Financeiro",
      severity: "alto",
      headline: `${handoff.approvedDeals} aprovados vs ${handoff.inFinanceDeals} no Financeiro`,
      finding:
        `${brl(handoff.approvedValue)} foram aprovados internamente em julho e ` +
        `${brl(handoff.inFinanceValue)} estão no Financeiro agora. Não dá para dizer quanto ` +
        "avançou, quanto travou e quanto sumiu, porque os registros não carregam vínculo entre " +
        "as etapas.",
      evidence: [
        `Aprovado Internamente (julho): ${handoff.approvedDeals} · ${brl(handoff.approvedValue)}`,
        `Em Processo no Financeiro (agora): ${handoff.inFinanceDeals} · ${brl(handoff.inFinanceValue)}`,
        `Contratos Assinados (julho): ${handoff.signedDeals} · ${brl(handoff.signedValue)}`,
        `Assinado ÷ aprovado no mesmo mês = ${handoff.signedToApprovedRatio.toFixed(2)}x`,
      ],
      impact:
        `Além disso, ${pct(1 - rateOf("processo-assinado"))} do que entra no Financeiro não vira ` +
        `contrato — ${financeiroEntered - financeiroSigned} de ${financeiroEntered} em julho/2026. ` +
        "É a última etapa antes da receita e a menos observada.",
      confidence: handoff.confidence,
      caveat: handoff.caveat,
    },
    {
      id: "qualificacao-proposta",
      title: `${pct(1 - rateOf("oportunidade-proposta"), 0)} das oportunidades morrem antes da proposta`,
      scope: "Avan Negócios · qualificação",
      severity: "medio",
      headline: `${opportunityCount} → ${proposalCount} (${pct(rateOf("oportunidade-proposta"))})`,
      finding:
        `Entre abrir a oportunidade e enviar a proposta perde-se ${opportunityCount - proposalCount} ` +
        "negócios. É a maior queda do Avan e acontece antes de qualquer esforço comercial pesado — " +
        "sinal de qualificação fraca na entrada ou de capacidade insuficiente para produzir proposta.",
      evidence: [
        `Nova Oportunidade: ${opportunityCount}`,
        `Proposta Enviada: ${proposalCount} (${pct(rateOf("oportunidade-proposta"))})`,
        `Proposta Enviada → Aprovado Internamente: ${pct(rateOf("proposta-aprovado"))} — a etapa seguinte converte bem`,
      ],
      impact:
        `Como a etapa seguinte converte a ${pct(rateOf("proposta-aprovado"))}, cada proposta a mais tem ` +
        `alto retorno esperado. Recuperar 10 das ${opportunityCount - proposalCount} oportunidades perdidas ` +
        `rende ~${brl(10 * rateOf("proposta-aprovado") * rateOf("processo-assinado") * tickets.wonTicket)} por ciclo.`,
      confidence: "media",
    },
    {
      id: "cobertura-cnpj",
      title: `${pct(1 - HEADLINE_FIGURES.cnpjCovered / HEADLINE_FIGURES.cnpjTotal, 0)} dos clientes fechados não têm CNPJ no CRM`,
      scope: "Financeiro · qualidade cadastral",
      severity: "medio",
      headline: `${HEADLINE_FIGURES.cnpjCovered}/${HEADLINE_FIGURES.cnpjTotal} com CNPJ`,
      finding:
        `${HEADLINE_FIGURES.cnpjTotal - HEADLINE_FIGURES.cnpjCovered} clientes com contrato ` +
        "assinado não têm CNPJ cadastrado no Bitrix24. Sem esse campo não há conciliação " +
        "automática com o financeiro, nem enriquecimento, nem deduplicação confiável.",
      evidence: [
        `Cobertura atual: ${pct(HEADLINE_FIGURES.cnpjCovered / HEADLINE_FIGURES.cnpjTotal)}`,
        "O campo existe no CRM — está vazio, não ausente",
      ],
      impact:
        "Bloqueia automação de faturamento e mantém a reconciliação de receita em trabalho manual, " +
        "que é justamente a origem dos ajustes negativos vistos no fechamento mensal.",
      confidence: "alta",
    },
  ];

  return bottlenecks.map((item, index) => ({ ...item, rank: index + 1 }));
}

/* ------------------------------------------------------------------ *
 * 9. Plano de contenção — o próximo passo de cada gargalo
 * ------------------------------------------------------------------ */

export type ContainmentStep = {
  bottleneckId: string;
  order: number;
  action: string;
  owner: string;
  horizon: "72h" | "30 dias" | "90 dias";
  target: string;
  evidence: string;
  effort: "baixo" | "médio" | "alto";
};

/**
 * Cada passo precisa de dono, prazo, meta numérica e evidência de aceite —
 * sem isso vira intenção, não plano.
 */
export function buildContainmentPlan(gap: number): ContainmentStep[] {
  const reallocation = modelLeadReallocation();
  const closure = planGapClosure(gap);
  const integrity = analyzeValueIntegrity();
  const worstInflation = integrity[0];
  const allocation = analyzeLeadAllocation();
  const mostOverloaded = [...allocation.overloaded].sort((a, b) => b.leads - a.leads)[0];
  const financeiroPipeline = FUNNEL_PIPELINES.find((p) => p.source === "financeiro");
  const financeiroEntered = financeiroPipeline?.stages[0]?.count ?? 0;
  const financeiroSigned = financeiroPipeline?.stages.at(-1)?.count ?? 0;

  return [
    {
      bottleneckId: "distribuicao-leads",
      order: 1,
      action:
        `Redistribuir ${reallocation.leadsMoved} leads/mês dos vendedores sobrecarregados para os ` +
        "de maior conversão, em lotes semanais com medição antes do lote seguinte.",
      owner: "Head Comercial + CRM Ops",
      horizon: "72h",
      target:
        `+${reallocation.incrementalMeetings.toFixed(1)} reuniões/mês ` +
        `(~${brl(reallocation.incrementalRevenueMonthly)}/mês, ${brl(reallocation.incrementalRevenueRemainingYear)} até dezembro)`,
      evidence: "Regra de roteamento no Bitrix24 versionada + relatório semanal de conversão por vendedor",
      effort: "baixo",
    },
    {
      bottleneckId: "distribuicao-leads",
      order: 2,
      action: mostOverloaded
        ? `Investigar a cadência de ${mostOverloaded.seller}, que recebeu ${mostOverloaded.leads} leads ` +
          `(${(mostOverloaded.leadShare * 100).toFixed(0)}% do total) e converte só ` +
          `${(mostOverloaded.conversion * 100).toFixed(1)}% em reunião, abaixo da média do time ` +
          `(${(allocation.teamConversion * 100).toFixed(1)}%).`
        : "Investigar a cadência dos vendedores com conversão de lead para reunião abaixo da média do time.",
      owner: "Head Comercial",
      horizon: "72h",
      target: "Causa identificada e leads redirecionados ou cadência corrigida",
      evidence: "Registro de atividade dos leads no Bitrix24",
      effort: "baixo",
    },
    {
      bottleneckId: "metrica-conversao",
      order: 3,
      action:
        "Instrumentar atribuição de origem por negócio e passar a medir conversão por coorte " +
        "(leads de um mês seguidos até o contrato), aposentando a divisão contratos ÷ leads.",
      owner: "CRM Ops + BI",
      horizon: "30 dias",
      target: closure.volumeIsSufficient
        ? `Congelar investimento em novos leads: ${closure.currentMonthlyLeads}/mês já cobrem os ` +
          `${closure.leadsPerMonthRequired}/mês necessários. Meta migra para conversão lead→contrato ` +
          `de ${pct(closure.conversionNeededAtCurrentVolume)}`
        : `Meta de topo recalculada: ${closure.leadsPerMonthRequired} leads/mês (hoje ${closure.currentMonthlyLeads})`,
      evidence: "Campo de origem obrigatório + painel de coorte com lead_id rastreável até o contrato",
      effort: "médio",
    },
    {
      bottleneckId: "valor-inflado",
      order: 4,
      action: worstInflation
        ? `Auditar os ${worstInflation.lostDeals} negócios perdidos de ${worstInflation.seller} ` +
          `(${brl(worstInflation.lostValue)}) e decidir: valor irreal no CRM ou perda enterprise real.`
        : "Auditar os negócios perdidos de maior valor.",
      owner: "Head Comercial + Controladoria",
      horizon: "72h",
      target: "100% dos deals acima de R$ 10.000 com valor validado ou corrigido",
      evidence: "Parecer por negócio anexado ao registro, com proposta ou pedido como lastro",
      effort: "baixo",
    },
    {
      bottleneckId: "valor-inflado",
      order: 5,
      action:
        "Criar gate de valor: negócio acima de 3x o ticket médio do vendedor exige proposta " +
        "anexada para avançar de etapa.",
      owner: "CRM Ops",
      horizon: "30 dias",
      target: "Zero negócios de alto valor sem lastro documental",
      evidence: "Regra de automação no Bitrix24 com log de bloqueios",
      effort: "médio",
    },
    {
      bottleneckId: "handoff-financeiro",
      order: 6,
      action:
        "Vincular o registro do Financeiro ao negócio de origem do Avan (campo de referência " +
        "obrigatório) e publicar relatório diário de aprovados sem entrada no Financeiro.",
      owner: "CRM Ops + Financeiro",
      horizon: "30 dias",
      target: "Handoff 100% rastreável; fila de aprovados parados visível em até 48h",
      evidence: "Relatório de conciliação Avan × Financeiro com zero órfãos",
      effort: "médio",
    },
    {
      bottleneckId: "handoff-financeiro",
      order: 7,
      action:
        `Atacar os ${pct(1 - rateOf("processo-assinado"))} que entram no Financeiro e não assinam: mapear os ` +
        `${financeiroEntered - financeiroSigned} casos de julho/2026 e separar recusa do cliente de ` +
        "travamento documental interno.",
      owner: "Financeiro",
      horizon: "30 dias",
      target: `Em Processo → Contrato Assinado de ${pct(rateOf("processo-assinado"), 0)} para 70%`,
      evidence: "Motivo de perda obrigatório na etapa do Financeiro",
      effort: "médio",
    },
    {
      bottleneckId: "qualificacao-proposta",
      order: 8,
      action:
        "Definir critério de qualificação na abertura da oportunidade e medir tempo até a " +
        "primeira proposta, separando 'não qualificou' de 'não teve capacidade'.",
      owner: "Head Comercial",
      horizon: "90 dias",
      target: `Nova Oportunidade → Proposta Enviada de ${pct(rateOf("oportunidade-proposta"), 0)} para 75%`,
      evidence: "Checklist de qualificação no card + SLA de proposta monitorado",
      effort: "alto",
    },
    {
      bottleneckId: "cobertura-cnpj",
      order: 9,
      action:
        `Campanha de preenchimento retroativo dos ${HEADLINE_FIGURES.cnpjTotal - HEADLINE_FIGURES.cnpjCovered} ` +
        "clientes sem CNPJ e tornar o campo obrigatório na entrada do Financeiro.",
      owner: "CRM Ops + Financeiro",
      horizon: "30 dias",
      target: `Cobertura de ${pct(HEADLINE_FIGURES.cnpjCovered / HEADLINE_FIGURES.cnpjTotal, 0)} para 100%`,
      evidence: "Campo obrigatório ativo + zero contratos assinados sem CNPJ",
      effort: "baixo",
    },
  ];
}

/* ------------------------------------------------------------------ *
 * 10. Fachada
 * ------------------------------------------------------------------ */

export type ForecastAnalysis = {
  leaks: FunnelLeak[];
  allocation: LeadAllocationAnalysis;
  reallocation: ReallocationScenario;
  chain: ChainedConversion;
  forecast: WeightedForecast;
  tickets: AverageTickets;
  integrity: ValueIntegrityFinding[];
  handoff: HandoffReconciliation;
  closure: GapClosurePlan;
  bottlenecks: Bottleneck[];
  plan: ContainmentStep[];
};

export function analyzeForecast(gap: number): ForecastAnalysis {
  return {
    leaks: computeFunnelLeaks(),
    allocation: analyzeLeadAllocation(),
    reallocation: modelLeadReallocation(),
    chain: computeChainedConversion(),
    forecast: computeWeightedForecast(),
    tickets: computeAverageTickets(),
    integrity: analyzeValueIntegrity(),
    handoff: reconcileHandoff(),
    closure: planGapClosure(gap),
    bottlenecks: identifyBottlenecks(gap),
    plan: buildContainmentPlan(gap),
  };
}

export { ITEM_CARDS, FUNNEL_PIPELINES, CONVERSION_RATES };
