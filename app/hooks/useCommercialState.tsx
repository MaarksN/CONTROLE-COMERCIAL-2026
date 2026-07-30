import { useState, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { deriveMetrics, MONTH_NAMES, STAGES, STAGE_LABELS, buildSellerSummary, buildGrowthPlan } from "../deriveMetrics";
import type { Deal, MonthlyMetric, Seller, SellerGrowthTarget, SellerRole, Stage, Target } from "../deriveMetrics";
import { buildDashboardInsights } from "../deriveDashboard";
import type { ActionHorizon, ActionItem, ActionStatus } from "../deriveDashboard";
import { classifyRevenue, computeForecastScenarios } from "../deriveRevenueIntelligence";
import { computeSalesHealthScore } from "../deriveHealthScore";
import { computeAlerts, type AlertState } from "../deriveAlerts";
import { computeSellerPerformanceScore } from "../deriveSellerScore";
import { ENTERPRISE_ROADMAP } from "../deriveEnterpriseRoadmap";
import type { CommercialData, Objective, ObjectiveKeyResult } from "@/db/commercial-data";
import { ACTION_LABELS, WEEKDAY_LABELS } from "../utils/constants";
import { parseCsv } from "../utils/csv";
import {
  buildMonthGrid,
  capitalizeFirst,
  currency,
  isSameDate,
} from "../utils/formatters";
import { DailyPromptModal } from "../components/modals/DailyPromptModal";
import type {
  DealFormValues,
  ActionItemFormValues,
  ActivityEntry,
  IntegrationSettingsView,
  BitrixImportItem,
  EnrichedLead,
  Section,
} from "../CommercialControl";

function subscribeNever() {
  return () => {};
}

function useIsClientMounted() {
  return useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false,
  );
}

export function useCommercialState(data: CommercialData, user: any, isReadOnly: boolean) {
  const [section, setSection] = useState<Section>("capa");
  const [search, setSearch] = useState("");
  const [monthFilter, setMonthFilter] = useState("Todos");
  const [ownerFilter, setOwnerFilter] = useState("Todos");
  const [selectedOwner, setSelectedOwner] = useState(
    data.ownerPerformance[0]?.owner ?? "",
  );
  const [selectedSheet, setSelectedSheet] = useState(data.rawSheets[0]?.name ?? "");
  const [sheetSearch, setSheetSearch] = useState("");
  const [sheetMode, setSheetMode] = useState<"values" | "formulas">("values");

  const [deals, setDeals] = useState<Deal[]>(data.deals2026);
  const [targets, setTargets] = useState<Target[]>(data.targets);
  const [sellers, setSellers] = useState<Seller[]>(data.sellers);
  const [growthTargets, setGrowthTargets] = useState<SellerGrowthTarget[]>(data.growthTargets);
  const [alertStates, setAlertStates] = useState<AlertState[]>(data.alertStates);
  const [alertActionKey, setAlertActionKey] = useState<string | null>(null);
  const [alertJustifications, setAlertJustifications] = useState<Record<string, string>>({});
  const [drilldown, setDrilldown] = useState<{ title: string; dealIds: string[] } | null>(null);
  const [auditFilters, setAuditFilters] = useState({ actor: "", action: "", entity: "", from: "", to: "" });
  const [auditResults, setAuditResults] = useState<ActivityEntry[] | null>(null);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [asOf, setAsOf] = useState(data.asOf);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [lastSyncedAt, setLastSyncedAt] = useState(() => Date.now());
  const [syncError, setSyncError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const pendingIdsRef = useRef<Set<string>>(new Set());

  const [pipelineView, setPipelineView] = useState<"kanban" | "tabela">("kanban");
  const [dragOverStage, setDragOverStage] = useState<Stage | null>(null);
  const [dealModal, setDealModal] = useState<
    | { mode: "create"; defaultStage?: Stage; defaultMonthNumber?: number }
    | { mode: "edit"; deal: Deal }
    | null
  >(null);
  const [modalSaving, setModalSaving] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [sellerModalOpen, setSellerModalOpen] = useState(false);
  const [sellerModalSaving, setSellerModalSaving] = useState(false);
  const [sellerModalError, setSellerModalError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ tone: "success" | "error"; message: string } | null>(
    null,
  );

  const [actionItems, setActionItems] = useState<ActionItem[]>(data.actionItems);
  const [actionItemModal, setActionItemModal] = useState<
    { mode: "create"; defaultHorizon: ActionHorizon } | { mode: "edit"; item: ActionItem } | null
  >(null);
  const [actionItemModalSaving, setActionItemModalSaving] = useState(false);
  const [actionItemModalError, setActionItemModalError] = useState<string | null>(null);

  const [monthlyRecordModal, setMonthlyRecordModal] = useState<{ monthNumber: number } | null>(
    null,
  );
  const [monthlyRecordModalSaving, setMonthlyRecordModalSaving] = useState(false);
  const [monthlyRecordModalError, setMonthlyRecordModalError] = useState<string | null>(null);

  const [visaoScope, setVisaoScope] = useState<"completa" | "vendedor">("completa");
  const [visaoMonth, setVisaoMonth] = useState<number | "todos">("todos");

  const [dailyPromptOpen, setDailyPromptOpen] = useState(true);
  const [dailyPromptQuery, setDailyPromptQuery] = useState("");
  const [showAllActivity, setShowAllActivity] = useState(false);
  const [showAllQualityIssues, setShowAllQualityIssues] = useState(false);
  const [showAllBottlenecks, setShowAllBottlenecks] = useState(false);
  const clockMounted = useIsClientMounted();

  const [integrationSettings, setIntegrationSettings] = useState<IntegrationSettingsView | null>(
    null,
  );
  const [integrationForm, setIntegrationForm] = useState({
    bitrixWebhookUrl: "",
    apolloApiKey: "",
    googleApiKey: "",
    aiProvider: "auto" as "auto" | "openai" | "anthropic",
    openaiApiKey: "",
    anthropicApiKey: "",
  });
  const [integrationSaving, setIntegrationSaving] = useState(false);
  const [integrationError, setIntegrationError] = useState<string | null>(null);

  const [bitrixImportItems, setBitrixImportItems] = useState<BitrixImportItem[] | null>(null);
  const [bitrixImportSelected, setBitrixImportSelected] = useState<Set<string>>(new Set());
  const [bitrixImportLoading, setBitrixImportLoading] = useState(false);
  const [bitrixImportError, setBitrixImportError] = useState<string | null>(null);
  const [bitrixImportConfirming, setBitrixImportConfirming] = useState(false);
  const [bitrixExporting, setBitrixExporting] = useState(false);
  const [bitrixExportError, setBitrixExportError] = useState<string | null>(null);
  const [csvImporting, setCsvImporting] = useState(false);
  const [csvImportError, setCsvImportError] = useState<string | null>(null);

  const [leadQuery, setLeadQuery] = useState({ company: "", domain: "", email: "" });
  const [leadResult, setLeadResult] = useState<EnrichedLead | null>(null);
  const [leadLoading, setLeadLoading] = useState<"apollo" | "google" | null>(null);
  const [leadError, setLeadError] = useState<string | null>(null);
  const [leadPrefill, setLeadPrefill] = useState<Partial<DealFormValues> | null>(null);

  const [aiReportOpen, setAiReportOpen] = useState(false);
  const [aiReportLoading, setAiReportLoading] = useState(false);
  const [aiReportError, setAiReportError] = useState<string | null>(null);
  const [aiReportText, setAiReportText] = useState("");

  const [objectives, setObjectives] = useState<Objective[]>(data.objectives);
  const [objectiveModal, setObjectiveModal] = useState<Objective | null>(null);
  const [objectiveModalSaving, setObjectiveModalSaving] = useState(false);
  const [objectiveModalError, setObjectiveModalError] = useState<string | null>(null);

  useEffect(() => {
    if (section !== "integracoes" || integrationSettings) return;
    let cancelled = false;
    fetch("/api/integrations/settings", { cache: "no-store" })
      .then(async (res) => {
        const json = (await res.json()) as IntegrationSettingsView & { error?: string };
        if (!res.ok) throw new Error(json.error ?? "Falha ao carregar configurações.");
        return json;
      })
      .then((json) => {
        if (cancelled) return;
        setIntegrationSettings(json);
        setIntegrationForm((prev) => ({ ...prev, aiProvider: json.aiProvider }));
      })
      .catch((error) => {
        if (!cancelled) {
          setIntegrationError(
            error instanceof Error ? error.message : "Falha ao carregar configurações.",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [section, integrationSettings]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(id);
  }, [toast]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);


  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    async function poll() {
      try {
        const [dealsRes, activityRes, sellersRes, actionItemsRes, growthPlanRes, alertsRes] = await Promise.all([
          fetch("/api/deals", { cache: "no-store", signal: controller.signal }),
          fetch("/api/activity?limit=20", { cache: "no-store", signal: controller.signal }),
          fetch("/api/sellers", { cache: "no-store", signal: controller.signal }),
          fetch("/api/action-items", { cache: "no-store", signal: controller.signal }),
          fetch("/api/growth-plan", { cache: "no-store", signal: controller.signal }),
          fetch("/api/alerts", { cache: "no-store", signal: controller.signal }),
        ]);
        if (!dealsRes.ok) throw new Error("sync failed");
        const dealsJson = (await dealsRes.json()) as { deals: Deal[]; targets: Target[] };
        if (cancelled) return;

        setDeals((prev) => {
          const pending = pendingIdsRef.current;
          if (pending.size === 0) return dealsJson.deals;
          const preserved = prev.filter((deal) => pending.has(deal.id));
          const incoming = dealsJson.deals.filter((deal) => !pending.has(deal.id));
          return [...incoming, ...preserved];
        });
        setTargets(dealsJson.targets);
        setAsOf(new Date().toISOString());
        setLastSyncedAt(Date.now());
        setSyncError(null);

        if (activityRes.ok) {
          const activityJson = (await activityRes.json()) as { activity: ActivityEntry[] };
          if (!cancelled) setActivity(activityJson.activity);
        }
        if (sellersRes.ok) {
          const sellersJson = (await sellersRes.json()) as { sellers: Seller[] };
          if (!cancelled) setSellers(sellersJson.sellers);
        }
        if (actionItemsRes.ok) {
          const actionItemsJson = (await actionItemsRes.json()) as { actionItems: ActionItem[] };
          if (!cancelled) setActionItems(actionItemsJson.actionItems);
        }
        if (growthPlanRes.ok) {
          const growthPlanJson = (await growthPlanRes.json()) as {
            growthTargets: SellerGrowthTarget[];
          };
          if (!cancelled) setGrowthTargets(growthPlanJson.growthTargets);
        }
        if (alertsRes.ok) {
          const alertsJson = (await alertsRes.json()) as { alertStates: AlertState[] };
          if (!cancelled) setAlertStates(alertsJson.alertStates);
        }
      } catch (error) {
        if (!cancelled && (error as Error).name !== "AbortError") {
          setSyncError("Falha ao sincronizar. Exibindo os últimos dados conhecidos.");
        }
      }
    }

    const interval = setInterval(poll, 60000);
    return () => {
      cancelled = true;
      controller.abort();
      clearInterval(interval);
    };
  }, []);

  const owners = useMemo(
    () =>
      [...new Set([...sellers.map((seller) => seller.name), ...deals.map((deal) => deal.owner)])]
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, "pt-BR")),
    [deals, sellers],
  );
  const sellerRoleByName = useMemo(
    () => new Map(sellers.map((seller) => [seller.name, seller.role])),
    [sellers],
  );

  const derived = useMemo(
    () => deriveMetrics({ deals, targets, asOf, knownOwners: owners }),
    [deals, targets, asOf, owners],
  );
  const { monthlyMetrics, executiveSummary, ownerPerformance, originPerformance, currentMonthNumber } =
    derived;
  const currentMonthMetric =
    monthlyMetrics.find((metric) => metric.monthNumber === currentMonthNumber) ??
    monthlyMetrics[monthlyMetrics.length - 1];

  const dashboardInsights = useMemo(
    () =>
      buildDashboardInsights({
        deals,
        monthlyMetrics,
        historicalDeals: data.historicalDeals,
        ownerPerformance,
        asOf,
      }),
    [deals, monthlyMetrics, data.historicalDeals, ownerPerformance, asOf],
  );

  const revenueClassification = useMemo(
    () => classifyRevenue(deals, { asOf, ownerPerformance }),
    [deals, asOf, ownerPerformance],
  );

  const forecastScenarios = useMemo(
    () =>
      computeForecastScenarios({
        deals,
        targets,
        asOf,
        ownerPerformance,
        averageSalesCycle: executiveSummary.averageSalesCycle,
        monthsOfHistory: monthlyMetrics.filter((m) => m.sold > 0).length,
      }),
    [deals, targets, asOf, ownerPerformance, executiveSummary.averageSalesCycle, monthlyMetrics],
  );

  const healthScore = useMemo(
    () =>
      computeSalesHealthScore({
        deals,
        monthlyMetrics,
        executiveSummary,
        dataQualityIssues: data.dataQualityIssues,
        pipelineOpenTotal: revenueClassification.pipelineAberto.total,
        gapToTarget: forecastScenarios.gapToTarget,
        asOf,
      }),
    [deals, monthlyMetrics, executiveSummary, data.dataQualityIssues, revenueClassification, forecastScenarios.gapToTarget, asOf],
  );

  const alerts = useMemo(
    () =>
      computeAlerts({
        deals,
        monthlyMetrics,
        ownerPerformance,
        sellerGrowthTargets: growthTargets,
        dataQualityIssues: data.dataQualityIssues,
        revenueClassification,
        asOf,
      }),
    [deals, monthlyMetrics, ownerPerformance, growthTargets, data.dataQualityIssues, revenueClassification, asOf],
  );

  const alertStateByKey = useMemo(
    () => new Map(alertStates.map((state) => [state.key, state])),
    [alertStates],
  );

  const dealsById = useMemo(() => new Map(deals.map((deal) => [deal.id, deal])), [deals]);

  const sellerScores = useMemo(
    () =>
      new Map(
        owners.map((owner) => [
          owner,
          computeSellerPerformanceScore({
            owner,
            deals,
            ownerPerformance,
            growthTargets,
            companyAverageCycle: executiveSummary.averageSalesCycle,
            asOf,
          }),
        ]),
      ),
    [owners, deals, ownerPerformance, growthTargets, executiveSummary.averageSalesCycle, asOf],
  );

  const dataQualityMetrics = useMemo(() => {
    const total = deals.length;
    const missingOrigin = deals.filter((d) => !d.origin);
    const missingProposalDate = deals.filter((d) => !d.proposalAcceptedAt);
    const missingSignatureDate = deals.filter((d) => !d.contractSignedAt);
    const missingBillingStatus = deals.filter(
      (d) => !d.billingStatus || d.billingStatus.trim().toLowerCase() === "sem status",
    );
    const ratio = (count: number) => (total > 0 ? count / total : 0);
    return [
      {
        key: "origin",
        label: "Sem origem classificada",
        count: missingOrigin.length,
        ratio: ratio(missingOrigin.length),
        dealIds: missingOrigin.map((d) => d.id),
      },
      {
        key: "proposalDate",
        label: "Sem data de proposta",
        count: missingProposalDate.length,
        ratio: ratio(missingProposalDate.length),
        dealIds: missingProposalDate.map((d) => d.id),
      },
      {
        key: "signatureDate",
        label: "Sem data de assinatura",
        count: missingSignatureDate.length,
        ratio: ratio(missingSignatureDate.length),
        dealIds: missingSignatureDate.map((d) => d.id),
      },
      {
        key: "billingStatus",
        label: "Sem status de faturamento",
        count: missingBillingStatus.length,
        ratio: ratio(missingBillingStatus.length),
        dealIds: missingBillingStatus.map((d) => d.id),
      },
    ];
  }, [deals]);

  const actionItemsByHorizon = useMemo(() => {
    const grouped: Record<ActionHorizon, ActionItem[]> = { h0: [], h1: [], h2: [], h3: [] };
    for (const item of actionItems) grouped[item.horizon].push(item);
    return grouped;
  }, [actionItems]);

  const origins = useMemo(
    () =>
      [...new Set(deals.map((deal) => deal.origin))]
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, "pt-BR")),
    [deals],
  );

  function showToast(tone: "success" | "error", message: string) {
    setToast({ tone, message });
  }

  async function setAlertStatus(
    key: string,
    status: AlertState["status"],
    justification: string | null,
  ) {
    setAlertActionKey(key);
    try {
      const res = await fetch(`/api/alerts/${encodeURIComponent(key)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, justification }),
      });
      const json = (await res.json()) as { alertState?: AlertState; error?: string };
      if (!res.ok || !json.alertState) throw new Error(json.error ?? "Erro ao atualizar alerta");
      setAlertStates((prev) => [json.alertState!, ...prev.filter((s) => s.key !== key)]);
      showToast(
        "success",
        status === "dispensado" ? "Alerta dispensado." : status === "resolvido" ? "Alerta marcado como resolvido." : "Alerta reaberto.",
      );
    } catch (error) {
      showToast("error", error instanceof Error ? error.message : "Erro ao atualizar alerta");
    } finally {
      setAlertActionKey(null);
    }
  }

  async function applyAuditFilters() {
    setAuditLoading(true);
    setAuditError(null);
    try {
      const params = new URLSearchParams({ limit: "200" });
      if (auditFilters.actor.trim()) params.set("actor", auditFilters.actor.trim());
      if (auditFilters.action) params.set("action", auditFilters.action);
      if (auditFilters.entity.trim()) params.set("entity", auditFilters.entity.trim());
      if (auditFilters.from) params.set("from", auditFilters.from);
      if (auditFilters.to) params.set("to", `${auditFilters.to}T23:59:59.999Z`);
      const res = await fetch(`/api/activity?${params.toString()}`, { cache: "no-store" });
      const json = (await res.json()) as { activity?: ActivityEntry[]; error?: string };
      if (!res.ok || !json.activity) throw new Error(json.error ?? "Erro ao filtrar auditoria");
      setAuditResults(json.activity);
    } catch (error) {
      setAuditError(error instanceof Error ? error.message : "Erro ao filtrar auditoria");
    } finally {
      setAuditLoading(false);
    }
  }

  function clearAuditFilters() {
    setAuditFilters({ actor: "", action: "", entity: "", from: "", to: "" });
    setAuditResults(null);
    setAuditError(null);
  }

  function downloadActivityCsv(entries: ActivityEntry[], filename: string) {
    const rows = [
      ["Data", "Usuário", "Ação", "Entidade", "ID da entidade", "Detalhes"],
      ...entries.map((entry) => [
        entry.createdAt,
        entry.actorEmail,
        ACTION_LABELS[entry.action] ?? entry.action,
        entry.entity,
        entry.entityId ?? "",
        entry.detailJson,
      ]),
    ];
    const csv = rows
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function createDeal(values: DealFormValues) {
    setModalSaving(true);
    setModalError(null);
    const body = {
      company: values.company.trim(),
      owner: values.owner.trim(),
      origin: values.origin.trim(),
      monthNumber: values.monthNumber,
      sold: Number(values.sold),
      adjusted: values.adjusted === "" ? undefined : Number(values.adjusted),
      billed: values.billed === "" ? 0 : Number(values.billed),
      stage: values.stage,
      notes: values.notes.trim() || null,
      proposalAcceptedAt: values.proposalAcceptedAt || null,
      contractSignedAt: values.contractSignedAt || null,
    };
    const tempId = `temp-${crypto.randomUUID()}`;
    const optimisticDeal: Deal = {
      id: tempId,
      year: 2026,
      month: MONTH_NAMES[values.monthNumber - 1],
      monthNumber: values.monthNumber,
      owner: body.owner,
      company: body.company,
      origin: body.origin,
      sold: body.sold,
      governedSold: body.sold,
      adjusted: body.adjusted ?? body.sold,
      proposalAcceptedAt: body.proposalAcceptedAt,
      contractSignedAt: body.contractSignedAt,
      billed: body.billed,
      variance: body.billed - body.sold,
      billingStatus: "Sem status",
      stage: body.stage,
      notes: body.notes,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: user.email,
      updatedBy: user.email,
    };
    pendingIdsRef.current.add(tempId);
    setDeals((prev) => [...prev, optimisticDeal]);

    try {
      const res = await fetch("/api/deals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as { deal?: Deal; error?: string };
      if (!res.ok || !json.deal) throw new Error(json.error ?? "Erro ao criar negócio");
      pendingIdsRef.current.delete(tempId);
      const created = json.deal;
      setDeals((prev) => prev.map((deal) => (deal.id === tempId ? created : deal)));
      setModalSaving(false);
      setDealModal(null);
      showToast("success", "Negócio criado.");
    } catch (error) {
      pendingIdsRef.current.delete(tempId);
      setDeals((prev) => prev.filter((deal) => deal.id !== tempId));
      setModalSaving(false);
      setModalError(error instanceof Error ? error.message : "Erro ao criar negócio");
    }
  }

  async function updateDeal(id: string, patch: Record<string, unknown>, options?: { silent?: boolean }) {
    const previous = deals;
    pendingIdsRef.current.add(id);
    setDeals((prev) => prev.map((deal) => (deal.id === id ? { ...deal, ...patch } as Deal : deal)));

    try {
      const res = await fetch(`/api/deals/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const json = (await res.json()) as { deal?: Deal; error?: string };
      if (!res.ok || !json.deal) throw new Error(json.error ?? "Erro ao atualizar negócio");
      pendingIdsRef.current.delete(id);
      const updated = json.deal;
      setDeals((prev) => prev.map((deal) => (deal.id === id ? updated : deal)));
      if (!options?.silent) {
        setModalSaving(false);
        setDealModal(null);
        showToast("success", "Negócio atualizado.");
      }
      return true;
    } catch (error) {
      pendingIdsRef.current.delete(id);
      setDeals(previous);
      if (!options?.silent) {
        setModalSaving(false);
        setModalError(error instanceof Error ? error.message : "Erro ao atualizar negócio");
      } else {
        showToast("error", error instanceof Error ? error.message : "Erro ao mover negócio");
      }
      return false;
    }
  }

  async function deleteDeal(id: string) {
    const previous = deals;
    pendingIdsRef.current.add(id);
    setDeals((prev) => prev.filter((deal) => deal.id !== id));

    try {
      const res = await fetch(`/api/deals/${id}`, { method: "DELETE" });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Erro ao excluir negócio");
      pendingIdsRef.current.delete(id);
      setModalSaving(false);
      setDealModal(null);
      showToast("success", "Negócio excluído.");
    } catch (error) {
      pendingIdsRef.current.delete(id);
      setDeals(previous);
      setModalSaving(false);
      setModalError(error instanceof Error ? error.message : "Erro ao excluir negócio");
    }
  }

  function moveDealStage(id: string, stage: Stage) {
    void updateDeal(id, { stage }, { silent: true });
  }

  async function updateMonthlyRecord(
    monthNumber: number,
    patch: Partial<{ target: number; sold: number; adjusted: number }>,
    options?: { silent?: boolean; successMessage?: string },
  ) {
    const year = targets.find((t) => t.monthNumber === monthNumber)?.year ?? 2026;
    const previous = targets;
    setTargets((prev) => {
      const exists = prev.some((t) => t.monthNumber === monthNumber);
      if (exists) {
        return prev.map((t) => (t.monthNumber === monthNumber ? { ...t, ...patch } : t));
      }
      return [
        ...prev,
        {
          year,
          monthNumber,
          month: MONTH_NAMES[monthNumber - 1],
          target: patch.target ?? 0,
          sold: patch.sold ?? 0,
          adjusted: patch.adjusted ?? 0,
        },
      ];
    });

    try {
      const res = await fetch(`/api/targets/${year}/${monthNumber}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const json = (await res.json()) as { target?: Target; error?: string };
      if (!res.ok || !json.target) throw new Error(json.error ?? "Erro ao atualizar mês");
      const updated = json.target;
      setTargets((prev) => prev.map((t) => (t.monthNumber === monthNumber ? updated : t)));
      if (!options?.silent) {
        setMonthlyRecordModalSaving(false);
        setMonthlyRecordModal(null);
      }
      showToast("success", options?.successMessage ?? "Mês atualizado.");
      return true;
    } catch (error) {
      setTargets(previous);
      const message = error instanceof Error ? error.message : "Erro ao atualizar mês";
      if (!options?.silent) {
        setMonthlyRecordModalSaving(false);
        setMonthlyRecordModalError(message);
      } else {
        showToast("error", message);
      }
      return false;
    }
  }

  async function updateGrowthTarget(
    owner: string,
    year: number,
    monthNumber: number,
    patch: { entryTarget?: number; realizedTarget?: number },
  ) {
    const previous = growthTargets;
    const existing = growthTargets.find(
      (row) => row.owner === owner && row.year === year && row.monthNumber === monthNumber,
    );
    const nextRow: SellerGrowthTarget = {
      owner,
      year,
      monthNumber,
      month: MONTH_NAMES[monthNumber - 1],
      entryTarget: patch.entryTarget ?? existing?.entryTarget ?? 0,
      realizedTarget: patch.realizedTarget ?? existing?.realizedTarget ?? 0,
    };
    setGrowthTargets((prev) => {
      const exists = prev.some(
        (row) => row.owner === owner && row.year === year && row.monthNumber === monthNumber,
      );
      return exists
        ? prev.map((row) =>
            row.owner === owner && row.year === year && row.monthNumber === monthNumber
              ? nextRow
              : row,
          )
        : [...prev, nextRow];
    });

    try {
      const res = await fetch(
        `/api/growth-plan/${encodeURIComponent(owner)}/${year}/${monthNumber}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            entryTarget: nextRow.entryTarget,
            realizedTarget: nextRow.realizedTarget,
          }),
        },
      );
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Erro ao atualizar meta de crescimento");
      showToast("success", "Meta de crescimento atualizada.");
    } catch (error) {
      setGrowthTargets(previous);
      showToast(
        "error",
        error instanceof Error ? error.message : "Erro ao atualizar meta de crescimento",
      );
    }
  }

  async function addSeller(values: { name: string; role: SellerRole }) {
    setSellerModalSaving(true);
    setSellerModalError(null);
    const previous = sellers;
    const alreadyExists = sellers.some(
      (seller) => seller.name.toLocaleLowerCase("pt-BR") === values.name.toLocaleLowerCase("pt-BR"),
    );
    setSellers((prev) =>
      alreadyExists
        ? prev.map((seller) =>
            seller.name.toLocaleLowerCase("pt-BR") === values.name.toLocaleLowerCase("pt-BR")
              ? values
              : seller,
          )
        : [...prev, values],
    );

    try {
      const res = await fetch("/api/sellers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const json = (await res.json()) as { sellers?: Seller[]; error?: string };
      if (!res.ok || !json.sellers) throw new Error(json.error ?? "Erro ao adicionar vendedor");
      setSellers(json.sellers);
      setSellerModalSaving(false);
      setSellerModalOpen(false);
      showToast("success", `${values.name} adicionado à equipe.`);
    } catch (error) {
      setSellers(previous);
      setSellerModalSaving(false);
      setSellerModalError(error instanceof Error ? error.message : "Erro ao adicionar vendedor");
    }
  }

  async function createActionItem(values: ActionItemFormValues) {
    setActionItemModalSaving(true);
    setActionItemModalError(null);
    try {
      const res = await fetch("/api/action-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const json = (await res.json()) as { actionItem?: ActionItem; error?: string };
      if (!res.ok || !json.actionItem) throw new Error(json.error ?? "Erro ao criar item");
      setActionItems((prev) => [...prev, json.actionItem as ActionItem]);
      setActionItemModalSaving(false);
      setActionItemModal(null);
      showToast("success", "Item do plano de ação criado.");
    } catch (error) {
      setActionItemModalSaving(false);
      setActionItemModalError(error instanceof Error ? error.message : "Erro ao criar item");
    }
  }

  async function updateActionItem(
    id: string,
    patch: Partial<{ title: string; description: string; owner: string | null; horizon: ActionHorizon; status: ActionStatus }>,
    options?: { silent?: boolean },
  ) {
    const previous = actionItems;
    setActionItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...patch } as ActionItem : item)),
    );

    try {
      const res = await fetch(`/api/action-items/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const json = (await res.json()) as { actionItem?: ActionItem; error?: string };
      if (!res.ok || !json.actionItem) throw new Error(json.error ?? "Erro ao atualizar item");
      setActionItems((prev) => prev.map((item) => (item.id === id ? (json.actionItem as ActionItem) : item)));
      if (!options?.silent) {
        setActionItemModalSaving(false);
        setActionItemModal(null);
        showToast("success", "Item do plano de ação atualizado.");
      }
    } catch (error) {
      setActionItems(previous);
      if (!options?.silent) {
        setActionItemModalSaving(false);
        setActionItemModalError(error instanceof Error ? error.message : "Erro ao atualizar item");
      } else {
        showToast("error", error instanceof Error ? error.message : "Erro ao atualizar status");
      }
    }
  }

  async function deleteActionItemFn(id: string) {
    const previous = actionItems;
    setActionItems((prev) => prev.filter((item) => item.id !== id));

    try {
      const res = await fetch(`/api/action-items/${id}`, { method: "DELETE" });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Erro ao excluir item");
      setActionItemModalSaving(false);
      setActionItemModal(null);
      showToast("success", "Item do plano de ação excluído.");
    } catch (error) {
      setActionItems(previous);
      setActionItemModalSaving(false);
      setActionItemModalError(error instanceof Error ? error.message : "Erro ao excluir item");
    }
  }

  function handleActionItemModalSubmit(values: ActionItemFormValues) {
    if (!actionItemModal) return;
    if (actionItemModal.mode === "create") {
      void createActionItem(values);
      return;
    }
    setActionItemModalSaving(true);
    setActionItemModalError(null);
    void updateActionItem(actionItemModal.item.id, {
      title: values.title.trim(),
      description: values.description.trim(),
      owner: values.owner.trim() || null,
      horizon: values.horizon,
    });
  }

  function handleModalSubmit(values: DealFormValues) {
    if (!dealModal) return;
    if (dealModal.mode === "create") {
      void createDeal(values);
      return;
    }
    setModalSaving(true);
    setModalError(null);
    void updateDeal(dealModal.deal.id, {
      company: values.company.trim(),
      owner: values.owner.trim(),
      origin: values.origin.trim(),
      monthNumber: values.monthNumber,
      sold: Number(values.sold),
      adjusted: Number(values.adjusted),
      billed: Number(values.billed),
      stage: values.stage,
      notes: values.notes.trim() || null,
      proposalAcceptedAt: values.proposalAcceptedAt || null,
      contractSignedAt: values.contractSignedAt || null,
    });
  }

  async function saveIntegrationSettings() {
    setIntegrationSaving(true);
    setIntegrationError(null);
    try {
      const res = await fetch("/api/integrations/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(integrationForm),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Falha ao salvar configurações.");

      const refreshedRes = await fetch("/api/integrations/settings", { cache: "no-store" });
      const refreshed = (await refreshedRes.json()) as IntegrationSettingsView;
      setIntegrationSettings(refreshed);
      setIntegrationForm({
        bitrixWebhookUrl: "",
        apolloApiKey: "",
        googleApiKey: "",
        aiProvider: refreshed.aiProvider,
        openaiApiKey: "",
        anthropicApiKey: "",
      });
      showToast("success", "Configurações de integração salvas.");
    } catch (error) {
      setIntegrationError(
        error instanceof Error ? error.message : "Falha ao salvar configurações.",
      );
    } finally {
      setIntegrationSaving(false);
    }
  }

  async function runBitrixImport() {
    setBitrixImportLoading(true);
    setBitrixImportError(null);
    try {
      const res = await fetch("/api/integrations/bitrix/import", { method: "POST" });
      const json = (await res.json()) as { items?: BitrixImportItem[]; error?: string };
      if (!res.ok || !json.items) throw new Error(json.error ?? "Falha ao importar do Bitrix24.");
      setBitrixImportItems(json.items);
      setBitrixImportSelected(new Set(json.items.map((item) => item.bitrixId)));
    } catch (error) {
      setBitrixImportError(
        error instanceof Error ? error.message : "Falha ao importar do Bitrix24.",
      );
    } finally {
      setBitrixImportLoading(false);
    }
  }

  function toggleBitrixImportSelection(bitrixId: string) {
    setBitrixImportSelected((prev) => {
      const next = new Set(prev);
      if (next.has(bitrixId)) next.delete(bitrixId);
      else next.add(bitrixId);
      return next;
    });
  }

  async function confirmBitrixImport() {
    if (!bitrixImportItems) return;
    setBitrixImportConfirming(true);
    setBitrixImportError(null);
    try {
      const items = bitrixImportItems.filter((item) => bitrixImportSelected.has(item.bitrixId));
      const res = await fetch("/api/integrations/bitrix/import/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      const json = (await res.json()) as { imported?: number; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Falha ao confirmar importação.");
      showToast("success", `${json.imported ?? 0} negócio(s) importado(s) do Bitrix24.`);
      setBitrixImportItems(null);
      setBitrixImportSelected(new Set());

      const dealsRes = await fetch("/api/deals", { cache: "no-store" });
      if (dealsRes.ok) {
        const dealsJson = (await dealsRes.json()) as { deals: Deal[]; targets: Target[] };
        setDeals(dealsJson.deals);
        setTargets(dealsJson.targets);
      }
    } catch (error) {
      setBitrixImportError(
        error instanceof Error ? error.message : "Falha ao confirmar importação.",
      );
    } finally {
      setBitrixImportConfirming(false);
    }
  }

  async function runBitrixExport() {
    setBitrixExporting(true);
    setBitrixExportError(null);
    try {
      const res = await fetch("/api/integrations/bitrix/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dealIds: deals.map((deal) => deal.id) }),
      });
      const json = (await res.json()) as {
        created?: number;
        updated?: number;
        failed?: number;
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "Falha ao exportar para o Bitrix24.");
      showToast(
        "success",
        `Exportado: ${json.created ?? 0} criado(s), ${json.updated ?? 0} atualizado(s)${
          json.failed ? `, ${json.failed} falha(s)` : ""
        }.`,
      );
    } catch (error) {
      setBitrixExportError(
        error instanceof Error ? error.message : "Falha ao exportar para o Bitrix24.",
      );
    } finally {
      setBitrixExporting(false);
    }
  }

  async function handleCsvImport(file: File) {
    setCsvImporting(true);
    setCsvImportError(null);
    try {
      const text = await file.text();
      const rows = parseCsv(text);
      const [, ...dataRows] = rows;
      let imported = 0;
      for (const cols of dataRows) {
        const [month, company, owner, origin, stageLabel, sold, adjusted, billed] = cols;
        if (!company || !owner) continue;
        const monthNumber = MONTH_NAMES.indexOf(month) + 1 || new Date().getMonth() + 1;
        const stageEntry = STAGES.find((stage) => STAGE_LABELS[stage] === stageLabel);
        const res = await fetch("/api/deals", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            company,
            owner,
            origin: origin || "",
            monthNumber,
            stage: stageEntry ?? "aberto",
            sold: Number(sold) || 0,
            adjusted: Number(adjusted) || Number(sold) || 0,
            billed: Number(billed) || 0,
          }),
        });
        if (res.ok) imported += 1;
      }
      showToast("success", `${imported} negócio(s) importado(s) do CSV.`);

      const dealsRes = await fetch("/api/deals", { cache: "no-store" });
      if (dealsRes.ok) {
        const dealsJson = (await dealsRes.json()) as { deals: Deal[]; targets: Target[] };
        setDeals(dealsJson.deals);
        setTargets(dealsJson.targets);
      }
    } catch (error) {
      setCsvImportError(error instanceof Error ? error.message : "Falha ao importar CSV.");
    } finally {
      setCsvImporting(false);
    }
  }

  async function runLeadSearch(provider: "apollo" | "google") {
    setLeadLoading(provider);
    setLeadError(null);
    setLeadResult(null);
    try {
      const res = await fetch("/api/leads/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          query: {
            email: leadQuery.email || undefined,
            company: leadQuery.company || undefined,
            domain: leadQuery.domain || undefined,
          },
        }),
      });
      const json = (await res.json()) as { lead?: EnrichedLead; error?: string };
      if (!res.ok || !json.lead) throw new Error(json.error ?? "Não foi possível enriquecer o lead.");
      setLeadResult(json.lead);
    } catch (error) {
      setLeadError(error instanceof Error ? error.message : "Não foi possível enriquecer o lead.");
    } finally {
      setLeadLoading(null);
    }
  }

  function openDealModalFromLead(lead: EnrichedLead) {
    setLeadPrefill({
      company: lead.company ?? "",
      notes: [lead.name, lead.title, lead.email, lead.phone, lead.address, lead.website]
        .filter(Boolean)
        .join(" · "),
    });
    setDealModal({ mode: "create" });
  }

  async function generateAiReport() {
    setAiReportOpen(true);
    setAiReportLoading(true);
    setAiReportError(null);
    setAiReportText("");
    try {
      const context = {
        executiveSummary,
        healthScore,
        activeAlerts: alerts,
        sellerScores: Object.fromEntries(sellerScores),
      };
      const res = await fetch("/api/ai/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ context }),
      });
      const json = (await res.json()) as { report?: string; error?: string };
      if (!res.ok || !json.report) throw new Error(json.error ?? "Falha ao gerar relatório.");
      setAiReportText(json.report);
    } catch (error) {
      setAiReportError(error instanceof Error ? error.message : "Falha ao gerar relatório.");
    } finally {
      setAiReportLoading(false);
    }
  }

  function handleObjectiveSubmit(
    objective: Objective,
    values: { title: string; owner: string; cadence: string; keyResults: ObjectiveKeyResult[] },
  ) {
    setObjectiveModalSaving(true);
    setObjectiveModalError(null);
    fetch(`/api/objectives/${objective.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    })
      .then(async (res) => {
        const json = (await res.json()) as { objective?: Objective; error?: string };
        if (!res.ok || !json.objective) throw new Error(json.error ?? "Falha ao atualizar OKR.");
        setObjectives((prev) =>
          prev.map((item) => (item.id === objective.id ? json.objective! : item)),
        );
        setObjectiveModal(null);
        showToast("success", "OKR atualizado.");
      })
      .catch((error) => {
        setObjectiveModalError(error instanceof Error ? error.message : "Falha ao atualizar OKR.");
      })
      .finally(() => setObjectiveModalSaving(false));
  }

  const filteredDeals = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("pt-BR");
    return deals.filter((deal) => {
      const matchesQuery =
        !query ||
        deal.company.toLocaleLowerCase("pt-BR").includes(query) ||
        deal.owner.toLocaleLowerCase("pt-BR").includes(query) ||
        deal.origin.toLocaleLowerCase("pt-BR").includes(query);
      const matchesMonth =
        monthFilter === "Todos" || deal.month === monthFilter;
      const matchesOwner =
        ownerFilter === "Todos" || deal.owner === ownerFilter;
      return matchesQuery && matchesMonth && matchesOwner;
    });
  }, [deals, monthFilter, ownerFilter, search]);

  const dealsByStage = useMemo(() => {
    const grouped: Record<Stage, Deal[]> = { aberto: [], ganho: [], faturado: [], pago: [] };
    for (const deal of filteredDeals) grouped[deal.stage].push(deal);
    return grouped;
  }, [filteredDeals]);

  const selectedOwnerDeals = useMemo(
    () => deals.filter((deal) => deal.owner === selectedOwner),
    [deals, selectedOwner],
  );

  const selectedOwnerDashboard = useMemo(
    () => buildSellerSummary(selectedOwnerDeals, monthlyMetrics),
    [selectedOwnerDeals, monthlyMetrics],
  );

  const selectedOwnerMaxMonth = Math.max(
    ...selectedOwnerDashboard.months.map((month) => month.adjusted),
    1,
  );

  // Visão executiva: "Visão completa" (empresa) vs. "Por vendedor", ambas
  // podem ser recortadas por um mês específico ou pelo ano inteiro.
  const visaoMonthLabel =
    visaoMonth === "todos"
      ? "Ano completo"
      : (monthlyMetrics.find((metric) => metric.monthNumber === visaoMonth)?.month ??
        MONTH_NAMES[visaoMonth - 1]);

  const visaoCompanyDeals = useMemo(
    () => (visaoMonth === "todos" ? deals : deals.filter((deal) => deal.monthNumber === visaoMonth)),
    [deals, visaoMonth],
  );

  const visaoCompanySummary = useMemo(() => {
    if (visaoMonth === "todos") return executiveSummary;
    const metric = monthlyMetrics.find((item) => item.monthNumber === visaoMonth);
    const sold = visaoCompanyDeals.reduce((sum, deal) => sum + deal.sold, 0);
    const adjusted = visaoCompanyDeals.reduce((sum, deal) => sum + deal.adjusted, 0);
    const target = metric?.target ?? 0;
    const cycles = visaoCompanyDeals
      .map((deal) => {
        if (!deal.proposalAcceptedAt || !deal.contractSignedAt) return null;
        const start = new Date(`${deal.proposalAcceptedAt}T00:00:00`);
        const end = new Date(`${deal.contractSignedAt}T00:00:00`);
        return Math.max(0, Math.round((end.getTime() - start.getTime()) / 86_400_000));
      })
      .filter((days): days is number => days !== null);
    const pending = visaoCompanyDeals
      .filter((deal) => deal.stage === "aberto" || deal.stage === "ganho")
      .reduce((sum, deal) => sum + deal.adjusted, 0);

    return {
      ytdTarget: target,
      ytdSold: sold,
      ytdAdjusted: adjusted,
      ytdGap: adjusted - target,
      attainment: target ? adjusted / target : 0,
      realization: sold ? adjusted / sold : 0,
      averageSalesCycle: cycles.length
        ? cycles.reduce((sum, days) => sum + days, 0) / cycles.length
        : 0,
      currentMonthForecast: adjusted,
      currentMonthPending: pending,
    };
  }, [visaoMonth, visaoCompanyDeals, monthlyMetrics, executiveSummary]);

  const visaoSellerDeals = useMemo(() => {
    const base = deals.filter((deal) => deal.owner === selectedOwner);
    return visaoMonth === "todos" ? base : base.filter((deal) => deal.monthNumber === visaoMonth);
  }, [deals, selectedOwner, visaoMonth]);

  const visaoSellerSummary = useMemo(
    () => buildSellerSummary(visaoSellerDeals, monthlyMetrics),
    [visaoSellerDeals, monthlyMetrics],
  );

  const selectedOwnerAllDeals = useMemo(
    () => deals.filter((deal) => deal.owner === selectedOwner),
    [deals, selectedOwner],
  );
  const selectedOwnerGrowthTargets = useMemo(
    () => growthTargets.filter((row) => row.owner === selectedOwner),
    [growthTargets, selectedOwner],
  );
  const selectedOwnerGrowthPlan = useMemo(
    () => buildGrowthPlan(selectedOwnerAllDeals, selectedOwnerGrowthTargets, asOf),
    [selectedOwnerAllDeals, selectedOwnerGrowthTargets, asOf],
  );
  const selectedOwnerWon = useMemo(
    () => visaoSellerDeals.filter((deal) => deal.stage !== "aberto"),
    [visaoSellerDeals],
  );
  const selectedOwnerOpen = useMemo(
    () => visaoSellerDeals.filter((deal) => deal.stage === "aberto"),
    [visaoSellerDeals],
  );

  const currentSheet =
    data.rawSheets.find((sheet) => sheet.name === selectedSheet) ??
    data.rawSheets[0];
  const currentMatrix =
    sheetMode === "values" ? currentSheet?.rows : currentSheet?.formulas;
  const visibleSheetRows = useMemo(() => {
    const query = sheetSearch.trim().toLocaleLowerCase("pt-BR");
    return (currentMatrix ?? [])
      .map((row, index) => ({ row, rowNumber: index + 1 }))
      .filter(
        ({ row }) =>
          !query ||
          row.some((cell) =>
            String(cell ?? "")
              .toLocaleLowerCase("pt-BR")
              .includes(query),
          ),
      );
  }, [currentMatrix, sheetSearch]);

  const maxMonthly = Math.max(
    ...monthlyMetrics.flatMap((metric) => [metric.target, metric.adjusted]),
    1,
  );
  const maxOrigin = Math.max(
    ...originPerformance.map((item) => item.adjusted),
    1,
  );

  const secondsSinceSync = Math.max(0, Math.round((now - lastSyncedAt) / 1000));

  if (section === "capa") {
    const criticalCount =
      dashboardInsights.internalBottlenecks.filter((item) => item.severity === "alta").length +
      dashboardInsights.internalBottlenecks.filter((item) => item.severity === "média").length;

    const today = new Date(now);
    // Real time is only rendered after mount: an SSR-rendered clock would show the
    // server's timestamp, which never matches the client's on hydration.
    const clockTime = clockMounted ? today.toLocaleTimeString("pt-BR") : "--:--:--";
    const clockDateLabel = clockMounted
      ? capitalizeFirst(
          today.toLocaleDateString("pt-BR", {
            weekday: "long",
            day: "2-digit",
            month: "long",
            year: "numeric",
          }),
        )
      : "";
    const monthWeeks = buildMonthGrid(today.getFullYear(), today.getMonth());
    const calendarMonthLabel = capitalizeFirst(
      today.toLocaleDateString("pt-BR", { month: "long", year: "numeric" }),
    );
    const asOfDate = new Date(asOf);
    const asOfIsToday = isSameDate(asOfDate, today);

    return (
      <>
      <div className="cover-screen">
        <div className="cover-hero">
          <img src="/atlas-logo.png" alt="Atlas" className="cover-logo" />
          <span className="eyebrow">Controle comercial · 2026</span>
          <h1>Atlas Comercial 360</h1>
          <p>
            Escolha como quer entrar: um Dashboard analítico com comparação anual e plano de
            ação, ou a Visão completa da operação para navegar por negócios, equipe e governança.
          </p>
        </div>
        <div className="cover-widgets">
          <div className="cover-widget cover-widget-clock">
            <span className="cover-widget-label">Agora</span>
            <strong className="cover-widget-time">{clockTime}</strong>
            <span className="cover-widget-date">{clockDateLabel}</span>
          </div>
          <div className="cover-widget cover-widget-calendar">
            <div className="cover-widget-calendar-heading">
              <span className="cover-widget-label">{calendarMonthLabel}</span>
            </div>
            <div className="cover-widget-calendar-grid">
              {WEEKDAY_LABELS.map((label, index) => (
                <span key={`${label}-${index}`} className="cover-widget-calendar-weekday">
                  {label}
                </span>
              ))}
              {monthWeeks.flatMap((week, weekIndex) =>
                week.map((day, dayIndex) => {
                  if (day === null) {
                    return (
                      <span
                        key={`${weekIndex}-${dayIndex}`}
                        className="cover-widget-calendar-cell empty"
                      />
                    );
                  }
                  const cellDate = new Date(today.getFullYear(), today.getMonth(), day);
                  const isToday = isSameDate(cellDate, today);
                  const isAsOf = !isToday && isSameDate(cellDate, asOfDate);
                  return (
                    <span
                      key={`${weekIndex}-${dayIndex}`}
                      className={`cover-widget-calendar-cell${isToday ? " today" : ""}${isAsOf ? " as-of" : ""}`}
                    >
                      {day}
                    </span>
                  );
                }),
              )}
            </div>
            <span className="cover-widget-calendar-caption">
              {asOfIsToday
                ? "Dados atualizados hoje"
                : `Dados atualizados até ${asOfDate.toLocaleDateString("pt-BR")}`}
            </span>
          </div>
        </div>
        <div className="cover-cards">
          <button type="button" className="cover-card" onClick={() => setSection("dashboard")}>
            <span className="cover-card-icon">📊</span>
            <h2>Dashboard</h2>
            <p>Todos os meses, comparação com 2025, gargalos e plano de ação de melhorias.</p>
            <div className="cover-card-stats">
              <div>
                <span>Crescimento YoY</span>
                <strong>
                  {dashboardInsights.yoy.growthPct === null
                    ? "—"
                    : `${dashboardInsights.yoy.growthPct >= 0 ? "+" : ""}${(dashboardInsights.yoy.growthPct * 100).toFixed(1).replace(".", ",")}%`}
                </strong>
              </div>
              <div>
                <span>Meses acima da meta</span>
                <strong>
                  {dashboardInsights.yoy.monthsAboveTarget2026}/{dashboardInsights.yoy.totalMonths2026}
                </strong>
              </div>
              <div>
                <span>Gargalos ativos</span>
                <strong>{criticalCount}</strong>
              </div>
            </div>
            <b className="cover-card-cta">Abrir Dashboard →</b>
          </button>

          <button type="button" className="cover-card" onClick={() => setSection("visao")}>
            <span className="cover-card-icon">🗂️</span>
            <h2>Visão completa</h2>
            <p>Receita governada, pipeline por etapa, equipe, OKRs e governança em um só lugar.</p>
            <div className="cover-card-stats">
              <div>
                <span>Receita ajustada YTD</span>
                <strong>{currency.format(executiveSummary.ytdAdjusted)}</strong>
              </div>
              <div>
                <span>Meta YTD</span>
                <strong>{currency.format(executiveSummary.ytdTarget)}</strong>
              </div>
              <div>
                <span>Negócios ativos</span>
                <strong>{deals.length}</strong>
              </div>
            </div>
            <b className="cover-card-cta">Abrir Visão completa →</b>
          </button>
        </div>
        <div className="cover-footer">
          <span className="lock-dot">●</span>
          {user.isPreview ? "Acesso público temporário" : `Conectado como ${user.email}`}
        </div>
      </div>
      {dailyPromptOpen && (
        <DailyPromptModal
          query={dailyPromptQuery}
          onQueryChange={setDailyPromptQuery}
          onSelect={(nextSection) => {
            setDailyPromptOpen(false);
            setSection(nextSection);
          }}
          onClose={() => setDailyPromptOpen(false)}
        />
      )}
      </>
    );
  }


  return {
    section, setSection, search, setSearch, monthFilter, setMonthFilter, ownerFilter, setOwnerFilter, selectedOwner, setSelectedOwner,
    selectedSheet, setSelectedSheet, sheetSearch, setSheetSearch, sheetMode, setSheetMode,
    deals, setDeals, targets, setTargets, sellers, setSellers, growthTargets, setGrowthTargets, alertStates, setAlertStates,
    alertActionKey, setAlertActionKey, alertJustifications, setAlertJustifications, drilldown, setDrilldown, auditFilters, setAuditFilters,
    auditResults, setAuditResults, auditLoading, setAuditLoading, auditError, setAuditError, asOf, setAsOf, activity, setActivity,
    lastSyncedAt, setLastSyncedAt, syncError, setSyncError, now, setNow,
    pipelineView, setPipelineView, dragOverStage, setDragOverStage, dealModal, setDealModal, modalSaving, setModalSaving, modalError, setModalError,
    sellerModalOpen, setSellerModalOpen, sellerModalSaving, setSellerModalSaving, sellerModalError, setSellerModalError, toast, setToast,
    actionItems, setActionItems, actionItemModal, setActionItemModal, actionItemModalSaving, setActionItemModalSaving, actionItemModalError, setActionItemModalError,
    monthlyRecordModal, setMonthlyRecordModal, monthlyRecordModalSaving, setMonthlyRecordModalSaving, monthlyRecordModalError, setMonthlyRecordModalError,
    visaoScope, setVisaoScope, visaoMonth, setVisaoMonth, dailyPromptOpen, setDailyPromptOpen, dailyPromptQuery, setDailyPromptQuery,
    showAllActivity, setShowAllActivity, showAllQualityIssues, setShowAllQualityIssues, showAllBottlenecks, setShowAllBottlenecks,
    integrationSettings, setIntegrationSettings, integrationForm, setIntegrationForm, integrationSaving, setIntegrationSaving, integrationError, setIntegrationError,
    bitrixImportItems, setBitrixImportItems, bitrixImportSelected, setBitrixImportSelected, bitrixImportLoading, setBitrixImportLoading, bitrixImportError, setBitrixImportError, bitrixImportConfirming, setBitrixImportConfirming, bitrixExporting, setBitrixExporting, bitrixExportError, setBitrixExportError, csvImporting, setCsvImporting, csvImportError, setCsvImportError,
    leadQuery, setLeadQuery, leadResult, setLeadResult, leadLoading, setLeadLoading, leadError, setLeadError, leadPrefill, setLeadPrefill,
    aiReportOpen, setAiReportOpen, aiReportLoading, setAiReportLoading, aiReportError, setAiReportError, aiReportText, setAiReportText,
    objectives, setObjectives, objectiveModal, setObjectiveModal, objectiveModalSaving, setObjectiveModalSaving, objectiveModalError, setObjectiveModalError,
    owners, sellerRoleByName, derived, monthlyMetrics, executiveSummary, ownerPerformance, originPerformance, currentMonthNumber, currentMonthMetric,
    dashboardInsights, revenueClassification, forecastScenarios, healthScore, alerts, alertStateByKey, dealsById, sellerScores, dataQualityMetrics, actionItemsByHorizon, origins,
    filteredDeals, dealsByStage, selectedOwnerDeals, selectedOwnerDashboard, selectedOwnerMaxMonth,
    visaoMonthLabel, visaoCompanyDeals, visaoCompanySummary, visaoSellerDeals, visaoSellerSummary,
    selectedOwnerAllDeals, selectedOwnerGrowthTargets, selectedOwnerGrowthPlan, selectedOwnerWon, selectedOwnerOpen,
    currentSheet, currentMatrix, visibleSheetRows, maxMonthly, maxOrigin, secondsSinceSync,
    showToast, setAlertStatus, applyAuditFilters, clearAuditFilters, downloadActivityCsv,
    createDeal, updateDeal, deleteDeal, moveDealStage, updateMonthlyRecord, updateGrowthTarget, addSeller,
    createActionItem, updateActionItem, deleteActionItemFn, handleActionItemModalSubmit, handleModalSubmit,
    saveIntegrationSettings, runBitrixImport, toggleBitrixImportSelection, confirmBitrixImport, runBitrixExport,
    handleCsvImport, runLeadSearch, openDealModalFromLead, generateAiReport, handleObjectiveSubmit,
    clockMounted, pendingIdsRef
  };
}
