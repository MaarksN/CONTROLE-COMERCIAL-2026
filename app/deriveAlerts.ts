import type { Deal, MonthlyMetric, OwnerPerformance, SellerGrowthTarget } from "./deriveMetrics";
import type { RevenueClassification } from "./deriveRevenueIntelligence";
import type { DataQualityIssue } from "./deriveHealthScore";
import type { ActionItem } from "./deriveDashboard";

export type IntegrationSyncState = {
  id: string;
  lastStatus: "ok" | "error";
  lastError: string | null;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
};

/**
 * Smart Alerts engine — deterministic rules over real data only. No LLM text
 * generation happens here (that belongs to a future "IA Comercial" copilot,
 * explicitly out of scope for this pass); every title/description/
 * recommendation is a template filled with real numbers, so the same input
 * always produces the same alert with the same `key`. That key is the
 * stable identity used to persist dismiss/resolve state in `alert_state`.
 */

export type AlertSeverity = "informativo" | "atencao" | "alto_risco" | "critico";
export type AlertCategory =
  | "receita"
  | "meta"
  | "pipeline"
  | "followup"
  | "qualidade_dados"
  | "crescimento"
  | "integracao";

/** Persisted human interaction with an alert (dismiss/resolve), keyed by
 * the alert's deterministic `key` from `computeAlerts`. */
export type AlertState = {
  key: string;
  status: "aberto" | "dispensado" | "resolvido";
  justification: string | null;
  actorEmail: string | null;
  updatedAt: string;
};

export type SmartAlert = {
  key: string;
  title: string;
  description: string;
  severity: AlertSeverity;
  category: AlertCategory;
  entity: string;
  financialImpact: number | null;
  evidenceDealIds: string[];
  recommendation: string;
};

const COMBINING_MARKS = new RegExp(`[̀-ͯ]`, "g");

function slug(value: string): string {
  return value
    .normalize("NFD")
    .replace(COMBINING_MARKS, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

const STALE_DAYS_THRESHOLD = 30;
const CONCENTRATION_HIGH = 0.5;
const CONCENTRATION_MEDIUM = 0.35;
const GROWTH_SHORTFALL_RATIO = 0.7;

export function computeAlerts({
  deals,
  monthlyMetrics,
  ownerPerformance,
  sellerGrowthTargets,
  dataQualityIssues,
  revenueClassification,
  actionItems,
  integrationSyncStates,
  asOf,
}: {
  deals: Deal[];
  monthlyMetrics: MonthlyMetric[];
  ownerPerformance: OwnerPerformance[];
  sellerGrowthTargets: SellerGrowthTarget[];
  dataQualityIssues: DataQualityIssue[];
  revenueClassification: RevenueClassification;
  actionItems: ActionItem[];
  integrationSyncStates: IntegrationSyncState[];
  asOf: string;
}): SmartAlert[] {
  const alerts: SmartAlert[] = [];
  const now = new Date(asOf).getTime();
  const currentMonthNumber = new Date(asOf).getMonth() + 1;
  const today = asOf.slice(0, 10);

  // Revenue at risk (from the Revenue Intelligence classification).
  if (revenueClassification.emRisco.total > 0) {
    alerts.push({
      key: "receita:em-risco",
      title: `R$ ${revenueClassification.emRisco.total.toFixed(0)} em receita em risco`,
      description: `${revenueClassification.emRisco.dealIds.length} negócio(s) em aberto/comprometido apresentam sinais de risco (parado ou ticket atípico).`,
      severity: revenueClassification.emRisco.total > 50000 ? "alto_risco" : "atencao",
      category: "receita",
      entity: "empresa",
      financialImpact: revenueClassification.emRisco.total,
      evidenceDealIds: revenueClassification.emRisco.dealIds,
      recommendation: "Revisar cada negócio listado e registrar a próxima ação com o responsável.",
    });
  }

  // Critical / attention months.
  const criticalMonths = monthlyMetrics.filter((m) => m.health === "crítico" && m.monthNumber <= currentMonthNumber);
  if (criticalMonths.length > 0) {
    alerts.push({
      key: "meta:meses-criticos",
      title: `${criticalMonths.length} mês(es) crítico(s) na meta`,
      description: `${criticalMonths.map((m) => m.month).join(", ")} — atingimento abaixo de 70% da meta.`,
      severity: "critico",
      category: "meta",
      entity: "empresa",
      financialImpact: criticalMonths.reduce((sum, m) => sum + Math.max(0, m.gap * -1), 0),
      evidenceDealIds: [],
      recommendation: "Investigar causa raiz do desvio (pipeline insuficiente, ciclo, concentração) e ajustar plano de ação.",
    });
  }

  // Owner concentration.
  const totalAdjusted = ownerPerformance.reduce((sum, o) => sum + o.adjusted, 0);
  const topOwner = ownerPerformance[0];
  if (topOwner && totalAdjusted > 0) {
    const share = topOwner.adjusted / totalAdjusted;
    if (share >= CONCENTRATION_MEDIUM) {
      alerts.push({
        key: `pipeline:concentracao:${slug(topOwner.owner)}`,
        title: `Concentração de receita em ${topOwner.owner}`,
        description: `${topOwner.owner} responde por ${(share * 100).toFixed(1)}% da receita ajustada (${topOwner.deals} negócios).`,
        severity: share >= CONCENTRATION_HIGH ? "alto_risco" : "atencao",
        category: "pipeline",
        entity: topOwner.owner,
        financialImpact: topOwner.adjusted,
        evidenceDealIds: deals.filter((d) => d.owner === topOwner.owner).map((d) => d.id),
        recommendation: "Redistribuir contas/leads para reduzir dependência de um único vendedor.",
      });
    }
  }

  // Stale deals per owner.
  const staleByOwner = new Map<string, Deal[]>();
  for (const deal of deals) {
    if (deal.stage === "pago") continue;
    const daysSinceUpdate = Math.round((now - new Date(deal.updatedAt).getTime()) / 86_400_000);
    if (daysSinceUpdate < STALE_DAYS_THRESHOLD) continue;
    const list = staleByOwner.get(deal.owner) ?? [];
    list.push(deal);
    staleByOwner.set(deal.owner, list);
  }
  for (const [owner, staleDeals] of staleByOwner) {
    alerts.push({
      key: `followup:parados:${slug(owner)}`,
      title: `${owner} possui ${staleDeals.length} negócio(s) sem atualização`,
      description: `Negócios sem atualização há ${STALE_DAYS_THRESHOLD}+ dias, etapa: ${[...new Set(staleDeals.map((d) => d.stage))].join(", ")}.`,
      severity: staleDeals.length >= 5 ? "alto_risco" : "atencao",
      category: "followup",
      entity: owner,
      financialImpact: staleDeals.reduce((sum, d) => sum + d.adjusted, 0),
      evidenceDealIds: staleDeals.map((d) => d.id),
      recommendation: "Priorizar contato imediato ou encerrar formalmente os negócios sem potencial.",
    });
  }

  // Data quality issues (already real, from the original audited workbook).
  for (const issue of dataQualityIssues) {
    alerts.push({
      key: `qualidade_dados:${slug(issue.title)}`,
      title: issue.title,
      description: issue.description,
      severity: issue.severity === "alta" ? "alto_risco" : issue.severity === "média" ? "atencao" : "informativo",
      category: "qualidade_dados",
      entity: issue.owner,
      financialImpact: null,
      evidenceDealIds: [],
      recommendation: `Responsável sugerido: ${issue.owner}.`,
    });
  }

  // Per-seller growth-target shortfall for the current month.
  const growthByOwnerMonth = new Map<string, SellerGrowthTarget>();
  for (const target of sellerGrowthTargets) {
    if (target.monthNumber === currentMonthNumber) {
      growthByOwnerMonth.set(target.owner, target);
    }
  }
  for (const [owner, target] of growthByOwnerMonth) {
    if (target.realizedTarget <= 0) continue;
    const ownerRow = ownerPerformance.find((o) => o.owner === owner);
    const monthAdjusted = deals
      .filter((d) => d.owner === owner && d.monthNumber === currentMonthNumber)
      .reduce((sum, d) => sum + d.adjusted, 0);
    if (monthAdjusted < target.realizedTarget * GROWTH_SHORTFALL_RATIO) {
      alerts.push({
        key: `crescimento:abaixo-meta:${slug(owner)}:${currentMonthNumber}`,
        title: `${owner} abaixo da meta de crescimento em ${target.month}`,
        description: `Realizado ${monthAdjusted.toFixed(0)} vs. meta de ${target.realizedTarget.toFixed(0)} (${((monthAdjusted / target.realizedTarget) * 100).toFixed(0)}%).`,
        severity: monthAdjusted < target.realizedTarget * 0.4 ? "alto_risco" : "atencao",
        category: "crescimento",
        entity: owner,
        financialImpact: target.realizedTarget - monthAdjusted,
        evidenceDealIds: deals.filter((d) => d.owner === owner && d.monthNumber === currentMonthNumber).map((d) => d.id),
        recommendation: "Revisar plano de crescimento do vendedor e priorizar oportunidades em aberto.",
      });
      void ownerRow;
    }
  }

  // Overdue action items (past due date, not yet concluded).
  const overdueByOwner = new Map<string, ActionItem[]>();
  for (const item of actionItems) {
    if (item.status === "concluido") continue;
    if (!item.dueDate || item.dueDate >= today) continue;
    const key = item.owner ?? "Sem responsável";
    const list = overdueByOwner.get(key) ?? [];
    list.push(item);
    overdueByOwner.set(key, list);
  }
  for (const [owner, items] of overdueByOwner) {
    alerts.push({
      key: `followup:acao-vencida:${slug(owner)}`,
      title: `${owner}: ${items.length} ação(ões) do plano vencida(s)`,
      description: items.map((item) => item.title).join(", "),
      severity: items.length >= 3 ? "alto_risco" : "atencao",
      category: "followup",
      entity: owner,
      financialImpact: null,
      evidenceDealIds: [],
      recommendation: "Revisar prazo e concluir ou reagendar cada item vencido do plano de ação.",
    });
  }

  // Integration sync failures (e.g. last Bitrix24 import/export attempt failed).
  for (const state of integrationSyncStates) {
    if (state.lastStatus !== "error") continue;
    alerts.push({
      key: `integracao:falha:${slug(state.id)}`,
      title: `Falha na sincronização com ${state.id === "bitrix" ? "Bitrix24" : state.id}`,
      description: state.lastError ?? "A última tentativa de sincronização falhou.",
      severity: "alto_risco",
      category: "integracao",
      entity: state.id,
      financialImpact: null,
      evidenceDealIds: [],
      recommendation: "Verificar credenciais e conectividade em Integrações, depois sincronizar novamente.",
    });
  }

  const severityRank: Record<AlertSeverity, number> = { critico: 0, alto_risco: 1, atencao: 2, informativo: 3 };
  return alerts.sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);
}
