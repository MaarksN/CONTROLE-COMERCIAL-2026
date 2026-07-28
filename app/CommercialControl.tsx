"use client";

import { Fragment, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  deriveMetrics,
  MONTH_NAMES,
  STAGES,
  STAGE_LABELS,
  type Deal,
  type MonthlyMetric,
  type Seller,
  type SellerGrowthTarget,
  type SellerRole,
  type Stage,
  type Target,
} from "./deriveMetrics";
import {
  BITRIX_AUDIT_REFERENCE,
  buildDashboardInsights,
  HORIZON_LABELS,
  type ActionHorizon,
  type ActionItem,
  type ActionStatus,
} from "./deriveDashboard";
import {
  classifyRevenue,
  computeForecastScenarios,
} from "./deriveRevenueIntelligence";
import { computeSalesHealthScore } from "./deriveHealthScore";
import { ThemeToggle } from "./ThemeToggle";
import { AssistantWidget } from "./AssistantWidget";
import { computeAlerts, type AlertState } from "./deriveAlerts";
import { computeSellerPerformanceScore } from "./deriveSellerScore";
import { ENTERPRISE_ROADMAP } from "./deriveEnterpriseRoadmap";
import type { CommercialData, Objective, ObjectiveKeyResult } from "@/db/commercial-data";

type User = {
  displayName: string;
  email: string;
  isPreview: boolean;
};

type ActivityEntry = {
  id: number;
  actorEmail: string;
  action: string;
  entity: string;
  entityId: string | null;
  detailJson: string;
  createdAt: string;
};

type IntegrationSettingsView = {
  bitrixConfigured: boolean;
  bitrixWebhookMasked: string | null;
  apolloConfigured: boolean;
  apolloKeyMasked: string | null;
  googleConfigured: boolean;
  googleKeyMasked: string | null;
  aiProvider: "auto" | "openai" | "anthropic";
  openaiConfigured: boolean;
  openaiKeyMasked: string | null;
  anthropicConfigured: boolean;
  anthropicKeyMasked: string | null;
};

type BitrixImportItem = {
  bitrixId: string;
  title: string;
  amount: number;
  stageId: string;
  dateCreate: string;
};

type EnrichedLead = {
  name: string | null;
  company: string | null;
  title: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  website: string | null;
  source: "apollo" | "google";
};

type Section =
  | "capa"
  | "dashboard"
  | "inteligencia"
  | "visao"
  | "pipeline"
  | "okrs"
  | "equipe"
  | "governanca"
  | "dados"
  | "integracoes";

const navItems: Array<{ id: Exclude<Section, "capa">; label: string; index: string }> = [
  { id: "dashboard", label: "Dashboard", index: "00" },
  { id: "inteligencia", label: "Inteligência de receita", index: "01" },
  { id: "visao", label: "Visão completa", index: "02" },
  { id: "pipeline", label: "Negócios", index: "03" },
  { id: "okrs", label: "OKRs", index: "04" },
  { id: "equipe", label: "Equipe & canais", index: "05" },
  { id: "governanca", label: "Governança", index: "06" },
  { id: "dados", label: "Base completa", index: "07" },
  { id: "integracoes", label: "Integrações", index: "08" },
];

const SECTION_ICONS: Record<Exclude<Section, "capa">, string> = {
  dashboard: "📊",
  inteligencia: "🧠",
  visao: "🗂️",
  pipeline: "🧩",
  okrs: "🎯",
  equipe: "👥",
  governanca: "⚖️",
  dados: "📚",
  integracoes: "🔌",
};

const WEEKDAY_LABELS = ["D", "S", "T", "Q", "Q", "S", "S"];

const currency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});

const preciseCurrency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 2,
});

const percent = new Intl.NumberFormat("pt-BR", {
  style: "percent",
  maximumFractionDigits: 1,
});

const ACTION_LABELS: Record<string, string> = {
  "deal.create": "criou o negócio",
  "deal.update": "atualizou o negócio",
  "deal.stage_move": "moveu a etapa do negócio",
  "deal.delete": "excluiu o negócio",
  "target.update": "atualizou a meta",
  "seller.create": "adicionou o vendedor",
  "growth_target.update": "atualizou a meta de crescimento",
  "action_item.create": "criou o item do plano de ação",
  "action_item.update": "atualizou o item do plano de ação",
  "action_item.delete": "excluiu o item do plano de ação",
};

const STAGE_PILL_CLASS: Record<Stage, string> = {
  aberto: "",
  ganho: "info",
  faturado: "waiting",
  pago: "positive",
};

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function formatKeyResult(value: number, unit: string) {
  if (unit === "currency") return currency.format(value);
  if (unit === "percent") return percent.format(value);
  if (unit === "multiple") return `${value.toFixed(1).replace(".", ",")}x`;
  if (unit === "days") return `${value.toFixed(1).replace(".", ",")} dias`;
  return value.toLocaleString("pt-BR");
}

function healthLabel(value: number) {
  if (value >= 1) return "Meta superada";
  if (value >= 0.7) return "Em atenção";
  return "Ação necessária";
}

const ACTION_STATUS_LABELS: Record<ActionStatus, string> = {
  pendente: "Pendente",
  andamento: "Em andamento",
  concluido: "Concluído",
};

const ACTION_STATUS_ORDER: ActionStatus[] = ["pendente", "andamento", "concluido"];

function nextActionStatus(status: ActionStatus): ActionStatus {
  const index = ACTION_STATUS_ORDER.indexOf(status);
  return ACTION_STATUS_ORDER[(index + 1) % ACTION_STATUS_ORDER.length];
}

function timeAgoLabel(seconds: number) {
  if (seconds < 5) return "agora";
  if (seconds < 60) return `há ${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `há ${minutes}min`;
  const hours = Math.floor(minutes / 60);
  return `há ${hours}h`;
}

function relativeTimestamp(iso: string) {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  return timeAgoLabel(seconds);
}

function subscribeNever() {
  return () => {};
}

/** True only once hydrated on the client — used to avoid rendering a server timestamp that would never match the client's during hydration. */
function useIsClientMounted() {
  return useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false,
  );
}

function capitalizeFirst(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function isSameDate(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** Builds a Sunday-first month grid (weeks of 7 cells, `null` for padding) for the mini calendar widget. */
function buildMonthGrid(year: number, monthIndex: number) {
  const firstWeekday = new Date(year, monthIndex, 1).getDay();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const cells: Array<number | null> = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: Array<Array<number | null>> = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

function downloadCsv(deals: Deal[], filename: string) {
  const rows = [
    [
      "Mês",
      "Empresa",
      "Responsável",
      "Origem",
      "Etapa",
      "Valor vendido",
      "Valor ajustado",
      "Faturado",
    ],
    ...deals.map((deal) => [
      deal.month,
      deal.company,
      deal.owner,
      deal.origin,
      STAGE_LABELS[deal.stage],
      deal.sold,
      deal.adjusted,
      deal.billed,
    ]),
  ];
  const csv = rows
    .map((row) =>
      row
        .map((cell) => `"${String(cell).replaceAll('"', '""')}"`)
        .join(";"),
    )
    .join("\n");
  const blob = new Blob([`﻿${csv}`], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

/** Reverse of `downloadCsv`'s format: `;`-separated, quoted fields with `""`-escaped quotes. */
function parseCsv(text: string): string[][] {
  const content = text.startsWith("﻿") ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    if (inQuotes) {
      if (char === '"') {
        if (content[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ";") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && content[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((cells) => cells.some((cell) => cell.trim() !== ""));
}

type DealFormValues = {
  company: string;
  owner: string;
  origin: string;
  monthNumber: number;
  sold: string;
  adjusted: string;
  billed: string;
  stage: Stage;
  notes: string;
  proposalAcceptedAt: string;
  contractSignedAt: string;
};

function emptyForm(defaults: { monthNumber?: number; stage?: Stage }): DealFormValues {
  return {
    company: "",
    owner: "",
    origin: "",
    monthNumber: defaults.monthNumber ?? new Date().getMonth() + 1,
    sold: "",
    adjusted: "",
    billed: "0",
    stage: defaults.stage ?? "aberto",
    notes: "",
    proposalAcceptedAt: "",
    contractSignedAt: "",
  };
}

function formFromDeal(deal: Deal): DealFormValues {
  return {
    company: deal.company,
    owner: deal.owner,
    origin: deal.origin,
    monthNumber: deal.monthNumber,
    sold: String(deal.sold),
    adjusted: String(deal.adjusted),
    billed: String(deal.billed),
    stage: deal.stage,
    notes: deal.notes ?? "",
    proposalAcceptedAt: deal.proposalAcceptedAt ?? "",
    contractSignedAt: deal.contractSignedAt ?? "",
  };
}

function DealModal({
  mode,
  initialValues,
  owners,
  origins,
  saving,
  errorMessage,
  onClose,
  onSubmit,
  onDelete,
}: {
  mode: "create" | "edit";
  initialValues: DealFormValues;
  owners: string[];
  origins: string[];
  saving: boolean;
  errorMessage: string | null;
  onClose: () => void;
  onSubmit: (values: DealFormValues) => void;
  onDelete?: () => void;
}) {
  const [values, setValues] = useState(initialValues);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(event) => event.stopPropagation()}>
        <div className="modal-heading">
          <h3>{mode === "create" ? "Novo negócio" : "Editar negócio"}</h3>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Fechar">
            ×
          </button>
        </div>
        <form
          className="modal-form"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit(values);
          }}
        >
          <label>
            <span>Empresa</span>
            <input
              value={values.company}
              onChange={(event) => setValues({ ...values, company: event.target.value })}
              required
            />
          </label>
          <label>
            <span>Responsável</span>
            <input
              value={values.owner}
              onChange={(event) => setValues({ ...values, owner: event.target.value })}
              list="owners-datalist"
              required
            />
          </label>
          <label>
            <span>Origem</span>
            <input
              value={values.origin}
              onChange={(event) => setValues({ ...values, origin: event.target.value })}
              list="origins-datalist"
            />
          </label>
          <label>
            <span>Mês</span>
            <select
              value={values.monthNumber}
              onChange={(event) =>
                setValues({ ...values, monthNumber: Number(event.target.value) })
              }
            >
              {MONTH_NAMES.map((name, index) => (
                <option key={name} value={index + 1}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Etapa</span>
            <select
              value={values.stage}
              onChange={(event) =>
                setValues({ ...values, stage: event.target.value as Stage })
              }
            >
              {STAGES.map((stage) => (
                <option key={stage} value={stage}>
                  {STAGE_LABELS[stage]}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Valor vendido (R$)</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={values.sold}
              onChange={(event) => setValues({ ...values, sold: event.target.value })}
              required
            />
          </label>
          <label>
            <span>Valor ajustado (R$)</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={values.adjusted}
              onChange={(event) => setValues({ ...values, adjusted: event.target.value })}
            />
          </label>
          <label>
            <span>Faturado (R$)</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={values.billed}
              onChange={(event) => setValues({ ...values, billed: event.target.value })}
            />
          </label>
          <label>
            <span>Proposta aceita em</span>
            <input
              type="date"
              value={values.proposalAcceptedAt}
              onChange={(event) =>
                setValues({ ...values, proposalAcceptedAt: event.target.value })
              }
            />
          </label>
          <label>
            <span>Contrato assinado em</span>
            <input
              type="date"
              value={values.contractSignedAt}
              onChange={(event) =>
                setValues({ ...values, contractSignedAt: event.target.value })
              }
            />
          </label>
          <label className="modal-form-notes">
            <span>Notas</span>
            <textarea
              rows={3}
              value={values.notes}
              onChange={(event) => setValues({ ...values, notes: event.target.value })}
            />
          </label>

          {errorMessage && <p className="modal-error">{errorMessage}</p>}

          <div className="modal-actions">
            {mode === "edit" && onDelete && (
              <button
                type="button"
                className={confirmingDelete ? "modal-delete confirming" : "modal-delete"}
                onClick={() => {
                  if (confirmingDelete) {
                    onDelete();
                  } else {
                    setConfirmingDelete(true);
                    setTimeout(() => setConfirmingDelete(false), 4000);
                  }
                }}
              >
                {confirmingDelete ? "Confirmar exclusão" : "Excluir"}
              </button>
            )}
            <div className="modal-actions-right">
              <button type="button" className="modal-cancel" onClick={onClose}>
                Cancelar
              </button>
              <button type="submit" className="primary-button" disabled={saving}>
                {saving ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </div>
        </form>
      </div>
      <datalist id="owners-datalist">
        {owners.map((owner) => (
          <option key={owner} value={owner} />
        ))}
      </datalist>
      <datalist id="origins-datalist">
        {origins.map((origin) => (
          <option key={origin} value={origin} />
        ))}
      </datalist>
    </div>
  );
}

function TargetEditable({
  label,
  target,
  disabled,
  onSave,
}: {
  label: string;
  target: number;
  disabled: boolean;
  onSave: (value: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(target));

  if (disabled) return <strong>{label}</strong>;

  if (!editing) {
    return (
      <button
        type="button"
        className="target-edit-trigger"
        title="Clique para editar a meta"
        onClick={() => {
          setValue(String(target));
          setEditing(true);
        }}
      >
        {label}
      </button>
    );
  }

  return (
    <input
      className="target-edit-input"
      type="number"
      min="0"
      step="1"
      autoFocus
      value={value}
      onChange={(event) => setValue(event.target.value)}
      onBlur={() => {
        setEditing(false);
        const parsed = Number(value);
        if (Number.isFinite(parsed) && parsed >= 0 && parsed !== target) {
          onSave(parsed);
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") setEditing(false);
      }}
    />
  );
}

function buildSellerSummary(sellerDeals: Deal[], monthlyMetricsList: MonthlyMetric[]) {
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
  const topOrigin = Object.entries(origins).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "Sem dados";
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
    averageCycle: cycles.length ? cycles.reduce((sum, days) => sum + days, 0) / cycles.length : 0,
    waiting: sellerDeals.filter((deal) => deal.stage === "faturado").length,
    topOrigin,
    months,
  };
}

// Forward-looking growth plan horizon: between 20 and 24 months so a
// seller's targets keep stretching well past the current fiscal year.
const GROWTH_PLAN_HORIZON_MONTHS = 24;
// Suggested month-over-month increase applied on top of the seller's own
// historical monthly average, compounding across the horizon.
const GROWTH_PLAN_MONTHLY_INCREASE = 0.03;

type GrowthPlanRow = {
  year: number;
  monthNumber: number;
  month: string;
  label: string;
  entryTarget: number;
  realizedTarget: number;
  isSuggested: boolean;
};

/**
 * Builds the seller's forward-looking plan: `GROWTH_PLAN_HORIZON_MONTHS`
 * starting at the current month, one row per month, with a target for
 * pipeline entry ("entrada" — adjusted value of every deal that entered the
 * funnel, any stage) and realized revenue ("realizado" — adjusted value of
 * deals won/billed/paid). Rows a user already saved via the growth-plan API
 * win over the suggestion; unsaved rows fall back to the seller's own
 * historical monthly average compounded by `GROWTH_PLAN_MONTHLY_INCREASE`,
 * so every seller starts from their own baseline rather than a company-wide
 * number.
 */
function buildGrowthPlan(
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
    entryByMonth.set(deal.monthNumber, (entryByMonth.get(deal.monthNumber) ?? 0) + deal.adjusted);
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

  const savedByKey = new Map(savedTargets.map((row) => [`${row.year}-${row.monthNumber}`, row]));

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

function EditableCurrencyCell({
  value,
  disabled,
  suggested,
  onSave,
}: {
  value: number;
  disabled: boolean;
  suggested: boolean;
  onSave: (value: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));

  if (disabled) {
    return <span className={suggested ? "growth-cell suggested" : "growth-cell"}>{currency.format(value)}</span>;
  }

  if (!editing) {
    return (
      <button
        type="button"
        className={suggested ? "growth-cell-edit suggested" : "growth-cell-edit"}
        title="Clique para editar"
        onClick={() => {
          setDraft(String(value));
          setEditing(true);
        }}
      >
        {currency.format(value)}
      </button>
    );
  }

  return (
    <input
      className="growth-cell-input"
      type="number"
      min="0"
      step="1"
      autoFocus
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        setEditing(false);
        const parsed = Number(draft);
        if (Number.isFinite(parsed) && parsed >= 0 && parsed !== value) {
          onSave(parsed);
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") setEditing(false);
      }}
    />
  );
}

function SellerModal({
  saving,
  errorMessage,
  onClose,
  onSubmit,
}: {
  saving: boolean;
  errorMessage: string | null;
  onClose: () => void;
  onSubmit: (values: { name: string; role: SellerRole }) => void;
}) {
  const [name, setName] = useState("");
  const [role, setRole] = useState<SellerRole>("Vendedor");

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card modal-card-small" onClick={(event) => event.stopPropagation()}>
        <div className="modal-heading">
          <h3>Adicionar vendedor</h3>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Fechar">
            ×
          </button>
        </div>
        <form
          className="modal-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (!name.trim()) return;
            onSubmit({ name: name.trim(), role });
          }}
        >
          <label>
            <span>Nome</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Ex.: João Reis"
              required
              autoFocus
            />
          </label>
          <label>
            <span>Papel</span>
            <select value={role} onChange={(event) => setRole(event.target.value as SellerRole)}>
              <option value="Vendedor">Vendedor</option>
              <option value="SDR">SDR</option>
            </select>
          </label>

          {errorMessage && <p className="modal-error">{errorMessage}</p>}

          <div className="modal-actions">
            <div className="modal-actions-right">
              <button type="button" className="modal-cancel" onClick={onClose}>
                Cancelar
              </button>
              <button type="submit" className="primary-button" disabled={saving}>
                {saving ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

type ActionItemFormValues = {
  title: string;
  description: string;
  owner: string;
  horizon: ActionHorizon;
};

function emptyActionItemForm(defaultHorizon: ActionHorizon): ActionItemFormValues {
  return { title: "", description: "", owner: "", horizon: defaultHorizon };
}

function formFromActionItem(item: ActionItem): ActionItemFormValues {
  return {
    title: item.title,
    description: item.description,
    owner: item.owner ?? "",
    horizon: item.horizon,
  };
}

function ActionItemModal({
  mode,
  initialValues,
  saving,
  errorMessage,
  onClose,
  onSubmit,
  onDelete,
}: {
  mode: "create" | "edit";
  initialValues: ActionItemFormValues;
  saving: boolean;
  errorMessage: string | null;
  onClose: () => void;
  onSubmit: (values: ActionItemFormValues) => void;
  onDelete?: () => void;
}) {
  const [values, setValues] = useState(initialValues);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card modal-card-small" onClick={(event) => event.stopPropagation()}>
        <div className="modal-heading">
          <h3>{mode === "create" ? "Novo item do plano de ação" : "Editar item do plano"}</h3>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Fechar">
            ×
          </button>
        </div>
        <form
          className="modal-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (!values.title.trim()) return;
            onSubmit(values);
          }}
        >
          <label>
            <span>Título</span>
            <input
              value={values.title}
              onChange={(event) => setValues({ ...values, title: event.target.value })}
              required
              autoFocus
            />
          </label>
          <label className="modal-form-notes">
            <span>Descrição / entrega / critério de aceite</span>
            <textarea
              rows={3}
              value={values.description}
              onChange={(event) => setValues({ ...values, description: event.target.value })}
            />
          </label>
          <label>
            <span>Responsável</span>
            <input
              value={values.owner}
              onChange={(event) => setValues({ ...values, owner: event.target.value })}
            />
          </label>
          <label>
            <span>Horizonte</span>
            <select
              value={values.horizon}
              onChange={(event) =>
                setValues({ ...values, horizon: event.target.value as ActionHorizon })
              }
            >
              {(Object.keys(HORIZON_LABELS) as ActionHorizon[]).map((horizon) => (
                <option key={horizon} value={horizon}>
                  {HORIZON_LABELS[horizon]}
                </option>
              ))}
            </select>
          </label>

          {errorMessage && <p className="modal-error">{errorMessage}</p>}

          <div className="modal-actions">
            {mode === "edit" && onDelete && (
              <button
                type="button"
                className={confirmingDelete ? "modal-delete confirming" : "modal-delete"}
                onClick={() => {
                  if (confirmingDelete) {
                    onDelete();
                  } else {
                    setConfirmingDelete(true);
                    setTimeout(() => setConfirmingDelete(false), 4000);
                  }
                }}
              >
                {confirmingDelete ? "Confirmar exclusão" : "Excluir"}
              </button>
            )}
            <div className="modal-actions-right">
              <button type="button" className="modal-cancel" onClick={onClose}>
                Cancelar
              </button>
              <button type="submit" className="primary-button" disabled={saving}>
                {saving ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

function MonthlyRecordModal({
  monthNumber,
  target,
  saving,
  errorMessage,
  onClose,
  onSubmit,
}: {
  monthNumber: number;
  target: Target;
  saving: boolean;
  errorMessage: string | null;
  onClose: () => void;
  onSubmit: (values: { target: number; sold: number; adjusted: number }) => void;
}) {
  const [values, setValues] = useState({
    target: String(target.target),
    sold: String(target.sold),
    adjusted: String(target.adjusted),
  });

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card modal-card-small" onClick={(event) => event.stopPropagation()}>
        <div className="modal-heading">
          <h3>Editar {MONTH_NAMES[monthNumber - 1]}</h3>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Fechar">
            ×
          </button>
        </div>
        <form
          className="modal-form"
          onSubmit={(event) => {
            event.preventDefault();
            const target = Number(values.target);
            const sold = Number(values.sold);
            const adjusted = Number(values.adjusted);
            if (
              !Number.isFinite(target) ||
              target < 0 ||
              !Number.isFinite(sold) ||
              sold < 0 ||
              !Number.isFinite(adjusted) ||
              adjusted < 0
            ) {
              return;
            }
            onSubmit({ target, sold, adjusted });
          }}
        >
          <label>
            <span>Meta (R$)</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={values.target}
              onChange={(event) => setValues({ ...values, target: event.target.value })}
              required
              autoFocus
            />
          </label>
          <label>
            <span>Vendido consolidado (R$)</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={values.sold}
              onChange={(event) => setValues({ ...values, sold: event.target.value })}
              required
            />
          </label>
          <label>
            <span>Ajustado consolidado (R$)</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={values.adjusted}
              onChange={(event) => setValues({ ...values, adjusted: event.target.value })}
              required
            />
          </label>
          <p className="modal-hint">
            Estes valores são o registro consolidado oficial do mês — o mesmo que aparece na
            planilha de controle. Não são recalculados a partir dos negócios individuais.
          </p>

          {errorMessage && <p className="modal-error">{errorMessage}</p>}

          <div className="modal-actions">
            <div className="modal-actions-right">
              <button type="button" className="modal-cancel" onClick={onClose}>
                Cancelar
              </button>
              <button type="submit" className="primary-button" disabled={saving}>
                {saving ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

type DrilldownSortKey = "company" | "month" | "owner" | "stage" | "adjusted";

function DealDrilldownModal({
  title,
  deals,
  onClose,
}: {
  title: string;
  deals: Deal[];
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<DrilldownSortKey>("adjusted");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const normalizedSearch = search.trim().toLowerCase();
  const filtered = normalizedSearch
    ? deals.filter(
        (deal) =>
          deal.company.toLowerCase().includes(normalizedSearch) ||
          deal.owner.toLowerCase().includes(normalizedSearch) ||
          deal.origin.toLowerCase().includes(normalizedSearch),
      )
    : deals;

  const sorted = [...filtered].sort((a, b) => {
    const dir = sortDir === "asc" ? 1 : -1;
    if (sortKey === "adjusted") return (a.adjusted - b.adjusted) * dir;
    return a[sortKey].localeCompare(b[sortKey], "pt-BR") * dir;
  });

  function toggleSort(key: DrilldownSortKey) {
    if (key === sortKey) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "adjusted" ? "desc" : "asc");
    }
  }

  const total = filtered.reduce((sum, deal) => sum + deal.adjusted, 0);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card modal-card-large" onClick={(event) => event.stopPropagation()}>
        <div className="modal-heading">
          <h3>{title}</h3>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Fechar">
            ×
          </button>
        </div>
        <p className="drilldown-summary">
          {filtered.length} negócio(s){filtered.length !== deals.length ? ` de ${deals.length}` : ""} ·{" "}
          {preciseCurrency.format(total)} em valor ajustado
        </p>
        <div className="drilldown-toolbar">
          <input
            placeholder="Buscar por empresa, responsável ou origem"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <button
            type="button"
            className="table-edit-button"
            onClick={() => downloadCsv(sorted, "atlas-drilldown.csv")}
            disabled={sorted.length === 0}
          >
            Exportar CSV
          </button>
        </div>
        {sorted.length === 0 ? (
          <p className="empty-state">Nenhum negócio encontrado para este critério.</p>
        ) : (
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th className="sortable-header" onClick={() => toggleSort("company")}>
                    Empresa {sortKey === "company" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                  </th>
                  <th className="sortable-header" onClick={() => toggleSort("month")}>
                    Mês {sortKey === "month" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                  </th>
                  <th className="sortable-header" onClick={() => toggleSort("owner")}>
                    Responsável {sortKey === "owner" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                  </th>
                  <th className="sortable-header" onClick={() => toggleSort("stage")}>
                    Etapa {sortKey === "stage" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                  </th>
                  <th className="sortable-header" onClick={() => toggleSort("adjusted")}>
                    Ajustado {sortKey === "adjusted" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                  </th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((deal) => (
                  <tr key={deal.id}>
                    <td>
                      <strong>{deal.company}</strong>
                      <small>{deal.id.slice(0, 12)}</small>
                    </td>
                    <td>{deal.month}</td>
                    <td>
                      <span className="owner-cell">
                        <i>{initials(deal.owner)}</i>
                        {deal.owner}
                      </span>
                    </td>
                    <td>
                      <span className={`status-pill ${STAGE_PILL_CLASS[deal.stage]}`}>
                        {STAGE_LABELS[deal.stage]}
                      </span>
                    </td>
                    <td className="emphasis">{preciseCurrency.format(deal.adjusted)}</td>
                          <td className="omnichannel-actions" onClick={(e) => e.stopPropagation()}>
                            <button title="WhatsApp" onClick={() => triggerWhatsapp("551199999999")}>📱</button>
                            <button title="E-mail" onClick={() => triggerEmail("contato@" + deal.company.toLowerCase().replace(/ /g, '') + ".com")}>✉️</button>
                            <button title="Meet" onClick={() => triggerMeet(deal.company)}>📅</button>
                          </td>
                        </tr>

                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function DailyPromptModal({
  query,
  onQueryChange,
  onSelect,
  onClose,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  onSelect: (section: Section) => void;
  onClose: () => void;
}) {
  const normalized = query.trim().toLowerCase();
  const items = navItems.filter((item) => item.label.toLowerCase().includes(normalized));

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-card modal-card-daily-prompt"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-heading">
          <h3>O que você quer olhar hoje?</h3>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Fechar">
            ×
          </button>
        </div>
        <p className="daily-prompt-subtitle">
          Escolha um atalho ou digite para filtrar.
        </p>
        <input
          type="text"
          className="daily-prompt-search"
          placeholder="Buscar seção..."
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          autoFocus
        />
        {items.length === 0 ? (
          <p className="daily-prompt-empty">Nenhuma seção encontrada para “{query}”.</p>
        ) : (
          <div className="daily-prompt-grid">
            {items.map((item) => (
              <button
                type="button"
                key={item.id}
                className="daily-prompt-item"
                onClick={() => onSelect(item.id)}
              >
                <span className="daily-prompt-item-icon">{SECTION_ICONS[item.id]}</span>
                <span className="daily-prompt-item-label">{item.label}</span>
              </button>
            ))}
          </div>
        )}
        <div className="daily-prompt-actions">
          <button type="button" className="modal-cancel" onClick={onClose}>
            Agora não
          </button>
        </div>
      </div>
    </div>
  );
}

function ObjectiveModal({
  objective,
  saving,
  errorMessage,
  onClose,
  onSubmit,
}: {
  objective: Objective;
  saving: boolean;
  errorMessage: string | null;
  onClose: () => void;
  onSubmit: (values: {
    title: string;
    owner: string;
    cadence: string;
    keyResults: ObjectiveKeyResult[];
  }) => void;
}) {
  const [title, setTitle] = useState(objective.title);
  const [owner, setOwner] = useState(objective.owner);
  const [cadence, setCadence] = useState(objective.cadence);
  const [keyResults, setKeyResults] = useState(objective.keyResults);

  function updateKeyResult(index: number, patch: Partial<ObjectiveKeyResult>) {
    setKeyResults((prev) => prev.map((kr, i) => (i === index ? { ...kr, ...patch } : kr)));
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(event) => event.stopPropagation()}>
        <div className="modal-heading">
          <h3>Editar OKR — {objective.id}</h3>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Fechar">
            ×
          </button>
        </div>
        <form
          className="modal-form"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit({ title, owner, cadence, keyResults });
          }}
        >
          <label className="modal-form-notes">
            <span>Título do objetivo</span>
            <input value={title} onChange={(event) => setTitle(event.target.value)} required />
          </label>
          <label>
            <span>Responsável</span>
            <input value={owner} onChange={(event) => setOwner(event.target.value)} required />
          </label>
          <label>
            <span>Cadência</span>
            <input value={cadence} onChange={(event) => setCadence(event.target.value)} required />
          </label>

          {keyResults.map((keyResult, index) => (
            <Fragment key={keyResult.title}>
              <label>
                <span>{keyResult.title} — atual</span>
                <input
                  type="number"
                  step="0.01"
                  value={keyResult.actual}
                  onChange={(event) =>
                    updateKeyResult(index, { actual: Number(event.target.value) })
                  }
                  required
                />
              </label>
              <label>
                <span>{keyResult.title} — meta</span>
                <input
                  type="number"
                  step="0.01"
                  value={keyResult.target}
                  onChange={(event) =>
                    updateKeyResult(index, { target: Number(event.target.value) })
                  }
                  required
                />
              </label>
            </Fragment>
          ))}

          {errorMessage && <p className="modal-error">{errorMessage}</p>}

          <div className="modal-actions">
            <div />
            <div className="modal-actions-right">
              <button type="button" className="modal-cancel" onClick={onClose}>
                Cancelar
              </button>
              <button type="submit" className="primary-button" disabled={saving}>
                {saving ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

export function CommercialControl({
  data,
  user,
  isReadOnly,
}: {
  data: CommercialData;
  user: User;
  isReadOnly: boolean;
}) {
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

    poll();
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

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button
          type="button"
          className="brand-lockup"
          onClick={() => {
            setSection("capa");
            setDailyPromptOpen(true);
            setDailyPromptQuery("");
          }}
          title="Voltar à capa"
        >
          <img src="/atlas-logo.png" alt="Atlas" className="brand-logo" />
          <span>Comercial 360</span>
        </button>

        <nav className="main-nav" aria-label="Navegação principal">
          {navItems.map((item) => (
            <button
              type="button"
              key={item.id}
              className={section === item.id ? "nav-item active" : "nav-item"}
              onClick={() => setSection(item.id)}
            >
              <span className="nav-index">{item.index}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-proof">
          <span className="proof-label">Base governada</span>
          <strong>{data.meta.workbookSheets} abas importadas</strong>
          <span>{data.meta.importedCells.toLocaleString("pt-BR")} células preservadas</span>
          <div className={syncError ? "proof-line proof-line-error" : "proof-line"}>
            <i />
            {syncError ? "Sincronização com falha" : `Atualizado ${timeAgoLabel(secondsSinceSync)}`}
          </div>
        </div>

        <div className="sidebar-footer">
          <span className="lock-dot">●</span>
          Acesso privado e autenticado
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <span className="eyebrow">Controle comercial · 2026</span>
            <h1>{navItems.find((item) => item.id === section)?.label}</h1>
          </div>
          <div className="user-area">
            <ThemeToggle />
            <div className="period-chip">
              <span>Período</span>
              <strong>Jan — {currentMonthMetric?.month.slice(0, 3) ?? "Dez"} 2026</strong>
            </div>
            <div className="user-chip">
              <span className="user-avatar">{initials(user.displayName)}</span>
              <span className="user-copy">
                <strong>{user.displayName}</strong>
                <small>
                  {user.isPreview ? "Acesso público temporário" : user.email}
                </small>
              </span>
            </div>
            {!user.isPreview && (
              <a
                className="signout-link"
                href="/signout-with-chatgpt?return_to=%2F"
              >
                Sair
              </a>
            )}
          </div>
        </header>

        <div className="mobile-nav" aria-label="Navegação móvel">
          {navItems.map((item) => (
            <button
              type="button"
              key={item.id}
              className={section === item.id ? "active" : ""}
              onClick={() => setSection(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>

        {section === "dashboard" && (
          <section className="page-content">
            <div className="page-intro">
              <div>
                <span className="section-kicker">Análise executiva</span>
                <h2>Todos os meses do ano, lado a lado com 2025.</h2>
                <p>
                  Receita, atingimento de meta, comparação com o ano anterior, gargalos
                  identificados e o plano de ação para melhorar os próximos meses.
                </p>
              </div>
            </div>

            <div className="kpi-grid card-3d-wrapper">
              <article className="kpi-card rounded-2xl glassmorphism card-3d-inner accent">
                <span>Crescimento de receita YoY</span>
                <strong>
                  {dashboardInsights.yoy.growthPct === null
                    ? "Sem base 2025 comparável"
                    : `${dashboardInsights.yoy.growthPct >= 0 ? "+" : ""}${(dashboardInsights.yoy.growthPct * 100).toFixed(1).replace(".", ",")}%`}
                </strong>
                <small>vendido 2026 vs. 2025 nos meses em comum</small>
              </article>
              <article className="kpi-card rounded-2xl glassmorphism card-3d-inner">
                <span>Meses acima da meta em 2026</span>
                <strong>
                  {dashboardInsights.yoy.monthsAboveTarget2026}/{dashboardInsights.yoy.totalMonths2026}
                </strong>
                <small>{dashboardInsights.yoy.monthsAtOrBelowTarget2026} mês(es) abaixo da meta</small>
              </article>
              <article className="kpi-card rounded-2xl glassmorphism card-3d-inner">
                <span>Vendido 2025 (período comparável)</span>
                <strong>{currency.format(dashboardInsights.yoy.sold2025PeriodTotal)}</strong>
                <small>mesmos meses cobertos por 2026</small>
              </article>
              <article className="kpi-card rounded-2xl glassmorphism card-3d-inner">
                <span>Vendido 2026 (mesmo período)</span>
                <strong>{currency.format(dashboardInsights.yoy.sold2026PeriodTotal)}</strong>
                <small>{deals.length} negócios no ano</small>
              </article>
            </div>

            <p className="dashboard-note">
              Nota de metodologia: não há meta de 2025 nos dados importados, então &quot;aumento do
              atingimento de meta&quot; é reportado como crescimento de receita ano a ano (YoY) e como
              quantos meses de 2026 bateram a própria meta — não como comparação direta de % de
              atingimento entre os dois anos.
            </p>

            <article className="panel rounded-3xl glassmorphism card-3d-inner dashboard-months-panel">
              <div className="panel-heading">
                <div>
                  <span className="section-kicker">Todos os meses</span>
                  <h3>Meta, vendido, ajustado e comparação com 2025</h3>
                </div>
              </div>
              <div className="data-table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Mês</th>
                      <th>Meta 2026</th>
                      <th>Vendido 2026</th>
                      <th>Ajustado 2026</th>
                      <th>Atingimento</th>
                      <th>Situação</th>
                      <th>Vendido 2025</th>
                      <th>Δ vs. 2025</th>
                      {!isReadOnly && <th>Ações</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {dashboardInsights.monthlyComparison.map((row) => (
                      <tr key={row.monthNumber}>
                        <td><strong>{row.month}</strong></td>
                        <td>{currency.format(row.target2026)}</td>
                        <td>{currency.format(row.sold2026)}</td>
                        <td className="emphasis">{currency.format(row.adjusted2026)}</td>
                        <td>{percent.format(row.attainment2026)}</td>
                        <td>
                          <small className={row.health2026 ? `health-${row.health2026}` : ""}>
                            {row.health2026 ? healthLabel(row.attainment2026) : "—"}
                          </small>
                        </td>
                        <td>{row.sold2025 > 0 ? currency.format(row.sold2025) : "Sem dado 2025"}</td>
                        <td>
                          {row.deltaPct === null ? (
                            "—"
                          ) : (
                            <span className={row.deltaPct >= 0 ? "positive-delta" : "negative-delta"}>
                              {row.deltaPct >= 0 ? "+" : ""}
                              {(row.deltaPct * 100).toFixed(1).replace(".", ",")}%
                            </span>
                          )}
                        </td>
                        {!isReadOnly && (
                          <td>
                            <button
                              type="button"
                              className="table-edit-button"
                              onClick={() => setMonthlyRecordModal({ monthNumber: row.monthNumber })}
                            >
                              Editar
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>

            <article className="panel rounded-3xl glassmorphism card-3d-inner">
              <div className="panel-heading">
                <div>
                  <span className="section-kicker">Progressão do ano</span>
                  <h3>Receita ajustada acumulada vs. meta acumulada</h3>
                </div>
              </div>
              <div className="bar-chart">
                {dashboardInsights.progression.map((row) => {
                  const maxCumulative = Math.max(
                    ...dashboardInsights.progression.flatMap((p) => [p.cumulativeAdjusted, p.cumulativeTarget]),
                    1,
                  );
                  return (
                    <div className="bar-group" key={row.month}>
                      <div className="bar-values">
                        <span>{currency.format(row.cumulativeAdjusted)}</span>
                      </div>
                      <div className="bar-pair">
                        <i
                          className="bar target"
                          style={{ height: `${Math.max((row.cumulativeTarget / maxCumulative) * 100, 4)}%` }}
                        />
                        <i
                          className="bar actual"
                          style={{ height: `${Math.max((row.cumulativeAdjusted / maxCumulative) * 100, 4)}%` }}
                        />
                      </div>
                      <strong>{row.month.slice(0, 3)}</strong>
                    </div>
                  );
                })}
              </div>
            </article>

            <div className="dashboard-bottleneck-grid">
              <article className="panel rounded-3xl glassmorphism card-3d-inner">
                <div className="panel-heading">
                  <div>
                    <span className="section-kicker">Gargalos ao vivo</span>
                    <h3>Controle Comercial 2026</h3>
                  </div>
                  <span className="issue-count">{dashboardInsights.internalBottlenecks.length} alertas</span>
                </div>
                <div className="bottleneck-list">
                  {dashboardInsights.internalBottlenecks.length === 0 && (
                    <p className="activity-empty">Nenhum gargalo identificado no momento.</p>
                  )}
                  {(showAllBottlenecks
                    ? dashboardInsights.internalBottlenecks
                    : dashboardInsights.internalBottlenecks.slice(0, 5)
                  ).map((item) => (
                    <div key={item.label} className={`bottleneck-item severity-${item.severity}`}>
                      <strong>{item.label}</strong>
                      <p>{item.detail}</p>
                    </div>
                  ))}
                </div>
                {dashboardInsights.internalBottlenecks.length > 5 && (
                  <button
                    type="button"
                    className="list-toggle"
                    onClick={() => setShowAllBottlenecks((prev) => !prev)}
                  >
                    {showAllBottlenecks
                      ? "Ver menos"
                      : `Ver mais (${dashboardInsights.internalBottlenecks.length - 5})`}
                  </button>
                )}
              </article>

              <article className="panel rounded-3xl glassmorphism card-3d-inner">
                <div className="panel-heading">
                  <div>
                    <span className="section-kicker">Referência externa</span>
                    <h3>Auditoria Bitrix24</h3>
                  </div>
                  <span className="issue-count">{BITRIX_AUDIT_REFERENCE.source}</span>
                </div>

                <div className="bitrix-summary-grid">
                  <div>
                    <span>Win rate</span>
                    <strong>{percent.format(BITRIX_AUDIT_REFERENCE.summary.winRatePct)}</strong>
                  </div>
                  <div>
                    <span>Loss rate</span>
                    <strong>{percent.format(BITRIX_AUDIT_REFERENCE.summary.lossRatePct)}</strong>
                  </div>
                  <div>
                    <span>Ticket médio</span>
                    <strong>{preciseCurrency.format(BITRIX_AUDIT_REFERENCE.summary.ticketMedio)}</strong>
                  </div>
                  <div>
                    <span>Cobertura de pipeline</span>
                    <strong>
                      {BITRIX_AUDIT_REFERENCE.summary.coberturaPipeline.toFixed(2).replace(".", ",")}×
                    </strong>
                  </div>
                  <div>
                    <span>Lead time</span>
                    <strong>{BITRIX_AUDIT_REFERENCE.summary.leadTimeDias.toFixed(1).replace(".", ",")}d</strong>
                  </div>
                  <div>
                    <span>Ganhos / Perdidos / Abertos</span>
                    <strong>
                      {BITRIX_AUDIT_REFERENCE.summary.dealsGanhos}/{BITRIX_AUDIT_REFERENCE.summary.dealsPerdidos}/
                      {BITRIX_AUDIT_REFERENCE.summary.dealsAbertos}
                    </strong>
                  </div>
                </div>

                <div className="bottleneck-list">
                  {BITRIX_AUDIT_REFERENCE.riscos.map((item) => (
                    <div key={item.label} className="bottleneck-item severity-alta">
                      <strong>{item.label} — {item.value}</strong>
                      <p>{item.detail}</p>
                    </div>
                  ))}
                  {BITRIX_AUDIT_REFERENCE.pipelines
                    .filter((pipeline) => pipeline.piorEtapaDias !== null)
                    .map((pipeline) => (
                      <div key={pipeline.nome} className="bottleneck-item severity-média">
                        <strong>
                          {pipeline.nome} — {pipeline.piorEtapaDias!.toFixed(1).replace(".", ",")}d parado
                        </strong>
                        <p>Pior etapa observada: &quot;{pipeline.piorEtapa}&quot;.</p>
                      </div>
                    ))}
                  {BITRIX_AUDIT_REFERENCE.concentracao.map((item) => (
                    <div key={item.owner} className="bottleneck-item severity-baixa">
                      <strong>{item.owner} — {item.value}</strong>
                      <p>{item.detail}</p>
                    </div>
                  ))}
                </div>
              </article>
            </div>

            <article className="panel rounded-3xl glassmorphism card-3d-inner action-plan-panel">
              <div className="panel-heading">
                <div>
                  <span className="section-kicker">Plano de ação</span>
                  <h3>Melhorias por horizonte de execução</h3>
                </div>
                {!isReadOnly && (
                  <button
                    type="button"
                    className="primary-button accent-button"
                    onClick={() => setActionItemModal({ mode: "create", defaultHorizon: "h1" })}
                  >
                    + Novo item
                  </button>
                )}
              </div>
              {(["h0", "h1", "h2", "h3"] as ActionHorizon[]).map((horizon) => (
                <div key={horizon} className="action-horizon-group">
                  <h4>{HORIZON_LABELS[horizon]}</h4>
                  {actionItemsByHorizon[horizon].length === 0 && (
                    <p className="action-empty">Nenhum item neste horizonte.</p>
                  )}
                  {actionItemsByHorizon[horizon].map((item) => (
                    <div key={item.id} className="action-item-row">
                      <button
                        type="button"
                        className={`status-chip status-${item.status}`}
                        disabled={isReadOnly}
                        onClick={() =>
                          void updateActionItem(
                            item.id,
                            { status: nextActionStatus(item.status) },
                            { silent: true },
                          )
                        }
                        title="Clique para avançar o status"
                      >
                        {ACTION_STATUS_LABELS[item.status]}
                      </button>
                      <div
                        className={isReadOnly ? "action-item-body" : "action-item-body clickable-row"}
                        onClick={isReadOnly ? undefined : () => setActionItemModal({ mode: "edit", item })}
                      >
                        <strong>{item.title}</strong>
                        <p>{item.description}</p>
                        <small>
                          {item.owner ?? "Sem responsável"}
                          {item.source ? ` · ${item.source}` : ""}
                        </small>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </article>
          </section>
        )}

        {section === "inteligencia" && (
          <section className="page-content">
            <div className="page-intro">
              <div>
                <span className="section-kicker">Revenue Intelligence</span>
                <h2>Previsão de receita explicável, não decorativa.</h2>
                <p>
                  Forecast, classificação de receita, saúde da operação e alertas — todos
                  calculados a partir dos negócios reais em {forecastScenarios.monthName}, com a
                  fórmula e a fonte de cada número visíveis, não uma caixa-preta.
                </p>
              </div>
              <span className={`confidence-badge confidence-${forecastScenarios.confidence.level}`}>
                Confiança da previsão: {forecastScenarios.confidence.level}
              </span>
            </div>
            {forecastScenarios.confidence.reasons.length > 0 && (
              <p className="dashboard-note">
                Por quê: {forecastScenarios.confidence.reasons.join(" ")}
              </p>
            )}

            <div className="kpi-grid card-3d-wrapper">
              <article className="kpi-card rounded-2xl glassmorphism card-3d-inner">
                <span>Meta de {forecastScenarios.monthName}</span>
                <strong>{currency.format(forecastScenarios.target)}</strong>
                <small>meta oficial do mês</small>
              </article>
              <article className="kpi-card rounded-2xl glassmorphism card-3d-inner">
                <span>Realizado + comprometido (Commit)</span>
                <strong>{currency.format(forecastScenarios.commitScenario)}</strong>
                <small>pago + ganho/faturado — alta certeza</small>
              </article>
              <article
                className="kpi-card rounded-2xl glassmorphism card-3d-inner clickable-row"
                onClick={() =>
                  setDrilldown({
                    title: "Pipeline aberto do mês",
                    dealIds: deals
                      .filter((d) => d.monthNumber === forecastScenarios.monthNumber && d.stage === "aberto")
                      .map((d) => d.id),
                  })
                }
              >
                <span>Pipeline aberto (Best Case)</span>
                <strong>{currency.format(forecastScenarios.bestCaseScenario)}</strong>
                <small>{currency.format(forecastScenarios.pipelineOpen)} em aberto — clique para ver</small>
              </article>
              <article className="kpi-card rounded-2xl glassmorphism card-3d-inner accent">
                <span>Forecast ponderado (AI)</span>
                <strong>{currency.format(forecastScenarios.aiForecastScenario)}</strong>
                <small>
                  Σ valor × probabilidade dinâmica ={" "}
                  {currency.format(forecastScenarios.weightedPipelineOpen)} de pipeline ponderado
                </small>
              </article>
              <article className="kpi-card rounded-2xl glassmorphism card-3d-inner">
                <span>Gap para a meta</span>
                <strong className={forecastScenarios.gapToTarget > 0 ? "negative-delta" : "positive-delta"}>
                  {currency.format(Math.abs(forecastScenarios.gapToTarget))}
                  {forecastScenarios.gapToTarget > 0 ? " faltando" : " superado"}
                </strong>
                <small>
                  {forecastScenarios.gapToTarget > 0
                    ? `${currency.format(forecastScenarios.dailyTargetNeeded)}/dia necessário (${forecastScenarios.daysRemainingInMonth} dia(s) restantes)`
                    : "Meta já coberta pelo forecast ponderado"}
                </small>
              </article>
              <article className="kpi-card rounded-2xl glassmorphism card-3d-inner">
                <span>Aderência projetada</span>
                <strong>
                  {forecastScenarios.projectedAttainment === null
                    ? "Sem meta definida"
                    : percent.format(forecastScenarios.projectedAttainment)}
                </strong>
                <small>forecast ponderado ÷ meta — estimativa determinística, não estatística</small>
              </article>
            </div>

            <article className="panel rounded-3xl glassmorphism card-3d-inner">
              <div className="panel-heading">
                <div>
                  <span className="section-kicker">Classificação de receita</span>
                  <h3>Onde está cada real, por etapa do funil</h3>
                </div>
              </div>
              <div className="revenue-classification-grid">
                {(
                  [
                    { key: "realizada", label: "Realizada (pago)", data: revenueClassification.realizada },
                    { key: "comprometida", label: "Comprometida (ganho/faturado)", data: revenueClassification.comprometida },
                    { key: "pipelineAberto", label: "Pipeline aberto", data: revenueClassification.pipelineAberto },
                    { key: "emRisco", label: "Em risco", data: revenueClassification.emRisco },
                  ] as const
                ).map((row) => (
                  <button
                    type="button"
                    key={row.key}
                    className={`revenue-class-card revenue-class-${row.key}`}
                    onClick={() =>
                      setDrilldown({ title: row.label, dealIds: [...row.data.dealIds] })
                    }
                  >
                    <span>{row.label}</span>
                    <strong>{currency.format(row.data.total)}</strong>
                    <small>{row.data.dealIds.length} negócio(s) · clique para detalhar</small>
                  </button>
                ))}
              </div>
            </article>

            <article className="panel rounded-3xl glassmorphism card-3d-inner">
              <div className="panel-heading">
                <div>
                  <span className="section-kicker">Sales Health Score</span>
                  <h3>
                    {healthScore.overall}/100 ·{" "}
                    <span className={`health-badge health-${healthScore.band}`}>{healthScore.band}</span>
                  </h3>
                </div>
              </div>
              <div className="health-dimension-grid">
                {healthScore.dimensions.map((dimension) => (
                  <div
                    key={dimension.key}
                    className={dimension.dealIds?.length ? "health-dimension clickable-row" : "health-dimension"}
                    onClick={
                      dimension.dealIds?.length
                        ? () => setDrilldown({ title: dimension.label, dealIds: dimension.dealIds! })
                        : undefined
                    }
                  >
                    <div className="health-dimension-head">
                      <span>{dimension.label}</span>
                      <strong>{dimension.score}</strong>
                    </div>
                    <i className="health-dimension-bar">
                      <b style={{ width: `${Math.min(dimension.score, 100)}%` }} />
                    </i>
                    <small>{dimension.detail}</small>
                    <small className="health-dimension-formula">Peso {dimension.weight}% · {dimension.formula}</small>
                  </div>
                ))}
              </div>
            </article>

            <article className="panel rounded-3xl glassmorphism card-3d-inner">
              <div className="panel-heading">
                <div>
                  <span className="section-kicker">Alertas inteligentes</span>
                  <h3>{alerts.length} alerta(s) detectado(s) por regra, não decorativos</h3>
                </div>
              </div>
              {alerts.length === 0 ? (
                <p className="empty-state">Nenhum alerta no momento.</p>
              ) : (
                <div className="alert-list">
                  {alerts.map((alert) => {
                    const state = alertStateByKey.get(alert.key);
                    const status = state?.status ?? "aberto";
                    return (
                      <article key={alert.key} className={`alert-card severity-${alert.severity} status-${status}`}>
                        <div className="alert-card-head">
                          <span className={`severity-pill severity-${alert.severity}`}>
                            {alert.severity.replace("_", " ")}
                          </span>
                          <strong>{alert.title}</strong>
                          {status !== "aberto" && <span className="alert-status-pill">{status}</span>}
                        </div>
                        <p>{alert.description}</p>
                        {alert.financialImpact !== null && (
                          <small>Impacto financeiro: {currency.format(alert.financialImpact)}</small>
                        )}
                        <small className="alert-recommendation">Recomendação: {alert.recommendation}</small>
                        <div className="alert-actions">
                          {alert.evidenceDealIds.length > 0 && (
                            <button
                              type="button"
                              className="table-edit-button"
                              onClick={() => setDrilldown({ title: alert.title, dealIds: alert.evidenceDealIds })}
                            >
                              Ver negócios ({alert.evidenceDealIds.length})
                            </button>
                          )}
                          {!isReadOnly && status === "aberto" && (
                            <>
                              <input
                                className="alert-justification-input"
                                placeholder="Justificativa para dispensar"
                                value={alertJustifications[alert.key] ?? ""}
                                onChange={(event) =>
                                  setAlertJustifications((prev) => ({ ...prev, [alert.key]: event.target.value }))
                                }
                              />
                              <button
                                type="button"
                                className="modal-cancel"
                                disabled={alertActionKey === alert.key}
                                onClick={() =>
                                  void setAlertStatus(alert.key, "dispensado", alertJustifications[alert.key] ?? "")
                                }
                              >
                                Dispensar
                              </button>
                              <button
                                type="button"
                                className="primary-button"
                                disabled={alertActionKey === alert.key}
                                onClick={() => void setAlertStatus(alert.key, "resolvido", null)}
                              >
                                Marcar resolvido
                              </button>
                            </>
                          )}
                          {!isReadOnly && status !== "aberto" && (
                            <button
                              type="button"
                              className="table-edit-button"
                              disabled={alertActionKey === alert.key}
                              onClick={() => void setAlertStatus(alert.key, "aberto", null)}
                            >
                              Reabrir
                            </button>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </article>
          </section>
        )}

        {section === "visao" && (
          <section className="page-content">
            <div className="visao-toolbar">
              <div className="mode-toggle">
                <button
                  type="button"
                  className={visaoScope === "completa" ? "active" : ""}
                  onClick={() => setVisaoScope("completa")}
                >
                  Visão completa
                </button>
                <button
                  type="button"
                  className={visaoScope === "vendedor" ? "active" : ""}
                  onClick={() => setVisaoScope("vendedor")}
                >
                  Por vendedor
                </button>
              </div>
              <div className="visao-toolbar-selects">
                {visaoScope === "vendedor" && (
                  <label className="visao-select">
                    <span>Vendedor</span>
                    <select
                      value={selectedOwner}
                      onChange={(event) => setSelectedOwner(event.target.value)}
                    >
                      {owners.map((owner) => (
                        <option key={owner} value={owner}>
                          {owner}
                          {sellerRoleByName.get(owner) === "SDR" ? " (SDR)" : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <label className="visao-select">
                  <span>Período</span>
                  <select
                    value={visaoMonth}
                    onChange={(event) =>
                      setVisaoMonth(
                        event.target.value === "todos" ? "todos" : Number(event.target.value),
                      )
                    }
                  >
                    <option value="todos">Ano completo</option>
                    {monthlyMetrics.map((metric) => (
                      <option key={metric.monthNumber} value={metric.monthNumber}>
                        {metric.month}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>

            {visaoScope === "completa" ? (
              <>
                <div className="executive-hero">
                  <div className="hero-copy">
                    <span className="section-kicker">Receita governada</span>
                    <h2>
                      O que foi vendido importa.
                      <br />
                      <em>O que virou receita decide.</em>
                    </h2>
                    <p>
                      A operação atingiu {percent.format(visaoCompanySummary.attainment)} da meta{" "}
                      {visaoMonth === "todos" ? "acumulada" : `de ${visaoMonthLabel}`}, com uma
                      diferença de {currency.format(Math.abs(visaoCompanySummary.ytdGap))}. O
                      painel separa valor comercial, ajuste e faturamento para sustentar decisões
                      confiáveis.
                    </p>
                  </div>
                  <div className="hero-number">
                    <span>
                      Receita ajustada {visaoMonth === "todos" ? "acumulada" : `de ${visaoMonthLabel}`}
                    </span>
                    <strong>{currency.format(visaoCompanySummary.ytdAdjusted)}</strong>
                    <div className="hero-progress">
                      <i
                        style={{
                          width: `${Math.min(visaoCompanySummary.attainment * 100, 100)}%`,
                        }}
                      />
                    </div>
                    <div className="hero-number-meta">
                      <span>
                        Meta <b>{currency.format(visaoCompanySummary.ytdTarget)}</b>
                      </span>
                      <span className="negative">
                        Gap <b>{currency.format(visaoCompanySummary.ytdGap)}</b>
                      </span>
                    </div>
                  </div>
                  <div className="atlas-angle" aria-hidden="true" />
                </div>

                <div className="kpi-grid card-3d-wrapper">
                  <article className="kpi-card rounded-2xl glassmorphism card-3d-inner">
                    <span>Realização da meta</span>
                    <strong>{percent.format(visaoCompanySummary.attainment)}</strong>
                    <small>{healthLabel(visaoCompanySummary.attainment)}</small>
                  </article>
                  <article className="kpi-card rounded-2xl glassmorphism card-3d-inner">
                    <span>Conversão em receita</span>
                    <strong>{percent.format(visaoCompanySummary.realization)}</strong>
                    <small>ajustado ÷ vendido</small>
                  </article>
                  <article className="kpi-card rounded-2xl glassmorphism card-3d-inner">
                    <span>Ciclo comercial médio</span>
                    <strong>
                      {visaoCompanySummary.averageSalesCycle.toFixed(1).replace(".", ",")}d
                    </strong>
                    <small>proposta até assinatura</small>
                  </article>
                  <article className="kpi-card rounded-2xl glassmorphism card-3d-inner accent">
                    <span>
                      {visaoMonth === "todos"
                        ? `Forecast de ${currentMonthMetric?.month ?? "mês atual"}`
                        : `Receita de ${visaoMonthLabel}`}
                    </span>
                    <strong>{currency.format(visaoCompanySummary.currentMonthForecast)}</strong>
                    <small>
                      {visaoCompanySummary.ytdTarget
                        ? `${(visaoCompanySummary.currentMonthForecast / visaoCompanySummary.ytdTarget)
                            .toFixed(1)
                            .replace(".", ",")}x cobertura da meta`
                        : "sem meta definida"}
                    </small>
                  </article>
                </div>

                <div className="overview-grid card-3d-wrapper">
                  <article className="panel rounded-3xl glassmorphism card-3d-inner revenue-panel">
                    <div className="panel-heading">
                      <div>
                        <span className="section-kicker">Performance mensal</span>
                        <h3>Meta vs. receita ajustada</h3>
                      </div>
                      <div className="legend">
                        <span><i className="legend-target" /> Meta</span>
                        <span><i className="legend-actual" /> Ajustado</span>
                      </div>
                    </div>
                    <div className="bar-chart">
                      {monthlyMetrics.map((metric) => (
                        <div
                          className={
                            visaoMonth === metric.monthNumber ? "bar-group bar-group-selected" : "bar-group"
                          }
                          key={metric.month}
                        >
                          <div className="bar-values">
                            <span>{currency.format(metric.adjusted)}</span>
                          </div>
                          <div
                            className="bar-pair"
                            role="button"
                            tabIndex={0}
                            title={`Ver ${metric.month} na visão completa`}
                            onClick={() => setVisaoMonth(metric.monthNumber)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") setVisaoMonth(metric.monthNumber);
                            }}
                          >
                            <i
                              className="bar target"
                              style={{
                                height: `${Math.max((metric.target / maxMonthly) * 100, 4)}%`,
                              }}
                            />
                            <i
                              className="bar actual"
                              style={{
                                height: `${Math.max((metric.adjusted / maxMonthly) * 100, 4)}%`,
                              }}
                            />
                          </div>
                          <TargetEditable
                            label={metric.month.slice(0, 3)}
                            target={metric.target}
                            disabled={isReadOnly}
                            onSave={(value) => void updateTarget(metric.monthNumber, value)}
                          />
                          <small className={`health-${metric.health}`}>
                            {percent.format(metric.attainment)}
                          </small>
                        </div>
                      ))}
                    </div>
                  </article>

                  <article className="panel rounded-3xl glassmorphism card-3d-inner attention-panel">
                    <div className="panel-heading">
                      <div>
                        <span className="section-kicker">Sala de decisão</span>
                        <h3>Pontos que pedem ação</h3>
                      </div>
                      <span className="issue-count">
                        {data.dataQualityIssues.length} alertas
                      </span>
                    </div>
                    <div className="attention-list">
                      {data.dataQualityIssues.slice(0, 4).map((issue, index) => (
                        <button
                          type="button"
                          key={`${issue.title}-${index}`}
                          onClick={() => setSection("governanca")}
                        >
                          <span className={`severity ${issue.severity}`}>
                            {String(index + 1).padStart(2, "0")}
                          </span>
                          <span>
                            <strong>{issue.title}</strong>
                            <small>{issue.owner}</small>
                          </span>
                          <b>→</b>
                        </button>
                      ))}
                    </div>
                  </article>
                </div>

                <div className="decision-strip">
                  <div>
                    <span className="section-kicker">Próxima decisão</span>
                    <h3>
                      {visaoMonth === "todos"
                        ? (currentMonthMetric?.month ?? "O mês atual")
                        : visaoMonthLabel}{" "}
                      tem demanda suficiente. O foco é converter com qualidade.
                    </h3>
                  </div>
                  <div className="decision-stat">
                    <span>Pendente de faturamento</span>
                    <strong>{currency.format(visaoCompanySummary.currentMonthPending)}</strong>
                  </div>
                  <div className="decision-stat">
                    <span>Forecast total</span>
                    <strong>{currency.format(visaoCompanySummary.currentMonthForecast)}</strong>
                  </div>
                  <button type="button" onClick={() => setSection("pipeline")}>
                    Abrir negócios <b>→</b>
                  </button>
                </div>
              </>
            ) : (
              <>
                <article className="seller-hero">
                  <div className="seller-identity">
                    <span>{initials(selectedOwner)}</span>
                    <div>
                      <small>
                        Dashboard individual
                        {sellerRoleByName.get(selectedOwner)
                          ? ` · ${sellerRoleByName.get(selectedOwner)}`
                          : ""}
                      </small>
                      <h3>{selectedOwner}</h3>
                      <p>
                        {visaoSellerDeals.length} negócios em{" "}
                        {visaoMonth === "todos" ? "2026" : visaoMonthLabel}.
                      </p>
                    </div>
                  </div>
                  <div className="seller-share">
                    <span>Participação na receita ajustada</span>
                    <strong>
                      {percent.format(
                        visaoSellerSummary.adjusted / Math.max(visaoCompanyDeals.reduce((s, d) => s + d.adjusted, 0), 1),
                      )}
                    </strong>
                    <i>
                      <b
                        style={{
                          width: `${Math.min(
                            (visaoSellerSummary.adjusted /
                              Math.max(visaoCompanyDeals.reduce((s, d) => s + d.adjusted, 0), 1)) *
                              100,
                            100,
                          )}%`,
                        }}
                      />
                    </i>
                  </div>
                </article>

                <div className="seller-kpi-grid">
                  <article>
                    <span>Receita ajustada</span>
                    <strong>{currency.format(visaoSellerSummary.adjusted)}</strong>
                    <small>Valor governado da carteira</small>
                  </article>
                  <article>
                    <span>Valor vendido</span>
                    <strong>{currency.format(visaoSellerSummary.sold)}</strong>
                    <small>{percent.format(visaoSellerSummary.realization)} realizado</small>
                  </article>
                  <article>
                    <span>Ticket médio</span>
                    <strong>{currency.format(visaoSellerSummary.ticket)}</strong>
                    <small>{visaoSellerDeals.length} contratos</small>
                  </article>
                  <article>
                    <span>Ciclo médio</span>
                    <strong>
                      {visaoSellerSummary.averageCycle.toFixed(1).replace(".", ",")} dias
                    </strong>
                    <small>Da proposta à assinatura</small>
                  </article>
                  <article>
                    <span>Faturado</span>
                    <strong>{currency.format(visaoSellerSummary.billed)}</strong>
                    <small>{visaoSellerSummary.waiting} aguardando faturamento</small>
                  </article>
                  <article>
                    <span>Principal origem</span>
                    <strong className="text-value">{visaoSellerSummary.topOrigin}</strong>
                    <small>Canal mais frequente</small>
                  </article>
                </div>

                {visaoMonth === "todos" && (
                  <article className="panel rounded-3xl glassmorphism card-3d-inner seller-month-panel">
                    <div className="panel-heading">
                      <div>
                        <span className="section-kicker">Evolução mensal</span>
                        <h3>Receita ajustada de {selectedOwner}</h3>
                      </div>
                    </div>
                    <div className="seller-month-chart">
                      {visaoSellerSummary.months.map((month) => (
                        <div key={month.month}>
                          <span>{currency.format(month.adjusted)}</span>
                          <i>
                            <b
                              style={{
                                height: `${Math.max(
                                  (month.adjusted /
                                    Math.max(...visaoSellerSummary.months.map((m) => m.adjusted), 1)) *
                                    100,
                                  month.adjusted ? 5 : 0,
                                )}%`,
                              }}
                            />
                          </i>
                          <strong>{month.shortMonth}</strong>
                          <small>{month.deals} negócios</small>
                        </div>
                      ))}
                    </div>
                  </article>
                )}

                <article className="panel rounded-3xl glassmorphism card-3d-inner seller-closed-panel">
                  <div className="panel-heading">
                    <div>
                      <span className="section-kicker">Histórico</span>
                      <h3>O que {selectedOwner} fechou e o que ainda não fechou</h3>
                    </div>
                  </div>
                  <div className="seller-kpi-grid cols-3">
                    <article>
                      <span>Fechado (ganho/faturado/pago)</span>
                      <strong>
                        {currency.format(
                          selectedOwnerWon.reduce((sum, deal) => sum + deal.adjusted, 0),
                        )}
                      </strong>
                      <small>{selectedOwnerWon.length} negócios</small>
                    </article>
                    <article>
                      <span>Ainda aberto / não fechado</span>
                      <strong>
                        {currency.format(
                          selectedOwnerOpen.reduce((sum, deal) => sum + deal.adjusted, 0),
                        )}
                      </strong>
                      <small>{selectedOwnerOpen.length} negócios</small>
                    </article>
                    <article>
                      <span>Taxa de fechamento</span>
                      <strong>
                        {percent.format(
                          visaoSellerDeals.length
                            ? selectedOwnerWon.length / visaoSellerDeals.length
                            : 0,
                        )}
                      </strong>
                      <small>{visaoSellerDeals.length} negócios no período</small>
                    </article>
                  </div>
                </article>

                <article className="panel rounded-3xl glassmorphism card-3d-inner growth-plan-panel">
                  <div className="panel-heading">
                    <div>
                      <span className="section-kicker">Plano de crescimento</span>
                      <h3>Meta de entrada e realizado — próximos {GROWTH_PLAN_HORIZON_MONTHS} meses</h3>
                    </div>
                    <span className="issue-count">
                      {isReadOnly ? "Somente leitura" : "Clique num valor para editar"}
                    </span>
                  </div>
                  <p className="growth-plan-note">
                    Sugestão calculada a partir da média histórica mensal de {selectedOwner}, com
                    crescimento composto de {(GROWTH_PLAN_MONTHLY_INCREASE * 100).toFixed(0)}% ao
                    mês. Valores em destaque já foram ajustados manualmente; os demais são apenas
                    sugestão e podem ser editados.
                  </p>
                  <div className="data-table-wrap">
                    <table className="data-table growth-plan-table">
                      <thead>
                        <tr>
                          <th>Mês</th>
                          <th>Meta de entrada</th>
                          <th>Meta de realizado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedOwnerGrowthPlan.map((row) => (
                          <tr key={`${row.year}-${row.monthNumber}`}>
                            <td>
                              <strong>{row.label}</strong>
                            </td>
                            <td>
                              <EditableCurrencyCell
                                value={row.entryTarget}
                                disabled={isReadOnly}
                                suggested={row.isSuggested}
                                onSave={(value) =>
                                  void updateGrowthTarget(selectedOwner, row.year, row.monthNumber, {
                                    entryTarget: value,
                                  })
                                }
                              />
                            </td>
                            <td>
                              <EditableCurrencyCell
                                value={row.realizedTarget}
                                disabled={isReadOnly}
                                suggested={row.isSuggested}
                                onSave={(value) =>
                                  void updateGrowthTarget(selectedOwner, row.year, row.monthNumber, {
                                    realizedTarget: value,
                                  })
                                }
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </article>

                <div className="visao-vendedor-footer">
                  <button type="button" className="primary-button" onClick={() => setSection("equipe")}>
                    Ver dashboard completo do vendedor <b>→</b>
                  </button>
                </div>
              </>
            )}
          </section>
        )}

        {section === "pipeline" && (
          <section className="page-content">
            <div className="page-intro">
              <div>
                <span className="section-kicker">Carteira comercial</span>
                <h2>Negócios com contexto, valor, etapa e responsável.</h2>
                <p>
                  {deals.length} registros de 2026, organizados pelo funil financeiro
                  Aberto → Ganho → Faturado → Pago.
                </p>
              </div>
              <div className="pipeline-actions">
                <div className="mode-toggle">
                  <button
                    type="button"
                    className={pipelineView === "kanban" ? "active" : ""}
                    onClick={() => setPipelineView("kanban")}
                  >
                    Kanban
                  </button>
                  <button
                    type="button"
                    className={pipelineView === "tabela" ? "active" : ""}
                    onClick={() => setPipelineView("tabela")}
                  >
                    Tabela
                  </button>
                </div>
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => downloadCsv(filteredDeals, "atlas-negocios-2026.csv")}
                >
                  Exportar seleção
                </button>
                {!isReadOnly && (
                  <button
                    type="button"
                    className="primary-button accent-button"
                    onClick={() => setDealModal({ mode: "create" })}
                  >
                    + Novo negócio
                  </button>
                )}
              </div>
            </div>

            <div className="filter-bar">
              <label className="search-field">
                <span>Buscar</span>
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Empresa, responsável ou origem"
                />
              </label>
              <label>
                <span>Mês</span>
                <select
                  value={monthFilter}
                  onChange={(event) => setMonthFilter(event.target.value)}
                >
                  <option>Todos</option>
                  {monthlyMetrics.map((metric) => (
                    <option key={metric.month}>{metric.month}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Responsável</span>
                <select
                  value={ownerFilter}
                  onChange={(event) => setOwnerFilter(event.target.value)}
                >
                  <option>Todos</option>
                  {owners.map((owner) => (
                    <option key={owner}>{owner}</option>
                  ))}
                </select>
              </label>
              <div className="filter-result">
                <span>Resultado</span>
                <strong>{filteredDeals.length} negócios</strong>
              </div>
            </div>

            {pipelineView === "kanban" ? (
              <div className="kanban-board">
                {STAGES.map((stage) => (
                  <div
                    key={stage}
                    className={
                      dragOverStage === stage ? "kanban-column drag-over" : "kanban-column"
                    }
                    onDragOver={(event) => {
                      if (isReadOnly) return;
                      event.preventDefault();
                      setDragOverStage(stage);
                    }}
                    onDragLeave={() => setDragOverStage((current) => (current === stage ? null : current))}
                    onDrop={(event) => {
                      event.preventDefault();
                      setDragOverStage(null);
                      if (isReadOnly) return;
                      const id = event.dataTransfer.getData("text/plain");
                      if (id) moveDealStage(id, stage);
                    }}
                  >
                    <div className="kanban-column-heading">
                      <span>{STAGE_LABELS[stage]}</span>
                      <b>{dealsByStage[stage].length}</b>
                    </div>
                    <div className="kanban-column-total">
                      {currency.format(
                        dealsByStage[stage].reduce((sum, deal) => sum + deal.adjusted, 0),
                      )}
                    </div>
                    <div className="kanban-cards">
                      {dealsByStage[stage].length === 0 && (
                        <div className="kanban-empty">Nenhum negócio nesta etapa.</div>
                      )}
                      {dealsByStage[stage].map((deal) => {
                        const daysInStage = Math.max(
                          0,
                          Math.round((now - new Date(deal.updatedAt).getTime()) / 86_400_000),
                        );
                        return (
                          <div
                            key={deal.id}
                            className="kanban-card"
                            draggable={!isReadOnly}
                            onDragStart={(event) => {
                              event.dataTransfer.setData("text/plain", deal.id);
                            }}
                            onClick={isReadOnly ? undefined : () => setDealModal({ mode: "edit", deal })}
                          >
                            <strong>{deal.company}</strong>
                            <span className="owner-cell">
                              <i>{initials(deal.owner)}</i>
                              {deal.owner}
                            </span>
                            {deal.origin && <span className="kanban-card-origin">{deal.origin}</span>}
                            <div className="kanban-card-meta">
                              <span>Faturado {preciseCurrency.format(deal.billed)}</span>
                              <span>{daysInStage}d nesta etapa</span>
                            </div>
                            {deal.contractSignedAt && (
                              <div className="kanban-card-meta">
                                <span>
                                  Contrato{" "}
                                  {new Date(`${deal.contractSignedAt}T00:00:00`).toLocaleDateString("pt-BR")}
                                </span>
                              </div>
                            )}
                            <div className="kanban-card-footer">
                              <small>{deal.month}</small>
                              <b>{preciseCurrency.format(deal.adjusted)}</b>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <article className="panel rounded-3xl glassmorphism card-3d-inner table-panel">
                <div className="data-table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Empresa</th>
                        <th>Mês</th>
                        <th>Responsável</th>
                        <th>Origem</th>
                        <th>Etapa</th>
                        <th>Vendido</th>
                        <th>Ajustado</th>
                        <th>Faturamento</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredDeals.map((deal) => (
                        <tr
                          key={deal.id}
                          className={isReadOnly ? "" : "clickable-row"}
                          onClick={isReadOnly ? undefined : () => setDealModal({ mode: "edit", deal })}
                        >
                          <td>
                            <strong>{deal.company}</strong>
                            <small>{deal.id.slice(0, 8)}</small>
                          </td>
                          <td>{deal.month}</td>
                          <td>
                            <span className="owner-cell">
                              <i>{initials(deal.owner)}</i>
                              {deal.owner}
                            </span>
                          </td>
                          <td>{deal.origin}</td>
                          <td>
                            <span className={`status-pill ${STAGE_PILL_CLASS[deal.stage]}`}>
                              {STAGE_LABELS[deal.stage]}
                            </span>
                          </td>
                          <td>{preciseCurrency.format(deal.sold)}</td>
                          <td className="emphasis">
                            {preciseCurrency.format(deal.adjusted)}
                          </td>
                          <td>{preciseCurrency.format(deal.billed)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </article>
            )}
          </section>
        )}

        {section === "okrs" && (
          <section className="page-content">
            <div className="page-intro">
              <div>
                <span className="section-kicker">Execução da estratégia</span>
                <h2>OKRs ligados aos dados que já existem.</h2>
                <p>
                  Objetivos de receita, previsibilidade e qualidade, com
                  responsáveis, cadência e resultados-chave mensuráveis.
                </p>
              </div>
              <span className="cycle-badge">Ciclo atual · Q3 2026</span>
            </div>

            <div className="okr-grid">
              {objectives.map((objective) => (
                <article className="okr-card" key={objective.id}>
                  <div className="okr-head">
                    <span>{objective.id}</span>
                    <i>{healthLabel(objective.progress)}</i>
                  </div>
                  <h3>{objective.title}</h3>
                  {!isReadOnly && (
                    <button
                      type="button"
                      className="list-toggle okr-edit-button"
                      onClick={() => setObjectiveModal(objective)}
                    >
                      Editar
                    </button>
                  )}
                  <div className="okr-owner">
                    <span>{initials(objective.owner)}</span>
                    <div>
                      <strong>{objective.owner}</strong>
                      <small>Revisão {objective.cadence.toLowerCase()}</small>
                    </div>
                  </div>
                  <div className="okr-progress">
                    <div>
                      <span>Progresso</span>
                      <strong>{percent.format(objective.progress)}</strong>
                    </div>
                    <i>
                      <b
                        style={{
                          width: `${Math.min(objective.progress * 100, 100)}%`,
                        }}
                      />
                    </i>
                  </div>
                  <div className="kr-list">
                    {objective.keyResults.map((result) => {
                      const rawProgress = result.inverse
                        ? result.target / Math.max(result.actual, 0.0001)
                        : result.actual / Math.max(result.target, 0.0001);
                      return (
                        <div key={result.title}>
                          <span>
                            <small>{result.title}</small>
                            <strong>
                              {formatKeyResult(result.actual, result.unit)}
                            </strong>
                          </span>
                          <span className="kr-target">
                            Meta {formatKeyResult(result.target, result.unit)}
                          </span>
                          <i>
                            <b
                              style={{
                                width: `${Math.min(rawProgress * 100, 100)}%`,
                              }}
                            />
                          </i>
                        </div>
                      );
                    })}
                  </div>
                </article>
              ))}
            </div>

            <div className="okr-note">
              <img src="/atlas-symbol.png" alt="" />
              <div>
                <strong>Regra de ouro</strong>
                <p>
                  O OKR não substitui a operação. Ele cria foco, enquanto o CRM
                  registra a evidência que sustenta cada resultado-chave.
                </p>
              </div>
            </div>
          </section>
        )}

        {section === "equipe" && (
          <section className="page-content">
            <div className="page-intro">
              <div>
                <span className="section-kicker">Produtividade comercial</span>
                <h2>Um dashboard completo para cada vendedor.</h2>
                <p>
                  Selecione um responsável para visualizar seus indicadores,
                  evolução mensal e todos os negócios da carteira.
                </p>
              </div>
              <div className="pipeline-actions">
                <button
                  type="button"
                  className="primary-button"
                  onClick={() =>
                    downloadCsv(selectedOwnerDeals, `atlas-${selectedOwner}-2026.csv`)
                  }
                >
                  Exportar {selectedOwner}
                </button>
                {!isReadOnly && (
                  <button
                    type="button"
                    className="primary-button accent-button"
                    onClick={() => setSellerModalOpen(true)}
                  >
                    + Adicionar vendedor
                  </button>
                )}
              </div>
            </div>

            <div className="seller-selector" aria-label="Selecionar vendedor">
              {ownerPerformance.map((person, index) => (
                <button
                  type="button"
                  key={person.owner}
                  className={selectedOwner === person.owner ? "active" : ""}
                  onClick={() => setSelectedOwner(person.owner)}
                  aria-pressed={selectedOwner === person.owner}
                >
                  <span>{initials(person.owner)}</span>
                  <span>
                    <strong>
                      {person.owner}
                      {sellerRoleByName.get(person.owner) === "SDR" ? (
                        <em className="role-badge">SDR</em>
                      ) : null}
                    </strong>
                    <small>
                      {person.deals} negócios · {currency.format(person.adjusted)}
                    </small>
                  </span>
                  <b>{String(index + 1).padStart(2, "0")}</b>
                </button>
              ))}
            </div>

            <article className="seller-hero">
              <div className="seller-identity">
                <span>{initials(selectedOwner)}</span>
                <div>
                  <small>
                    Dashboard individual
                    {sellerRoleByName.get(selectedOwner)
                      ? ` · ${sellerRoleByName.get(selectedOwner)}`
                      : ""}
                  </small>
                  <h3>{selectedOwner}</h3>
                  <p>
                    {selectedOwnerDeals.length} negócios entre janeiro e dezembro
                    de 2026.
                  </p>
                </div>
              </div>
              <div className="seller-share">
                <span>Participação na receita ajustada</span>
                <strong>
                  {percent.format(
                    selectedOwnerDashboard.adjusted /
                      Math.max(executiveSummary.ytdAdjusted, 1),
                  )}
                </strong>
                <i>
                  <b
                    style={{
                      width: `${Math.min(
                        (selectedOwnerDashboard.adjusted /
                          Math.max(executiveSummary.ytdAdjusted, 1)) *
                          100,
                        100,
                      )}%`,
                    }}
                  />
                </i>
              </div>
            </article>

            <div className="seller-kpi-grid">
              <article>
                <span>Receita ajustada</span>
                <strong>{currency.format(selectedOwnerDashboard.adjusted)}</strong>
                <small>Valor governado da carteira</small>
              </article>
              <article>
                <span>Valor vendido</span>
                <strong>{currency.format(selectedOwnerDashboard.sold)}</strong>
                <small>
                  {percent.format(selectedOwnerDashboard.realization)} realizado
                </small>
              </article>
              <article>
                <span>Ticket médio</span>
                <strong>{currency.format(selectedOwnerDashboard.ticket)}</strong>
                <small>{selectedOwnerDeals.length} contratos</small>
              </article>
              <article>
                <span>Ciclo médio</span>
                <strong>
                  {selectedOwnerDashboard.averageCycle
                    .toFixed(1)
                    .replace(".", ",")}{" "}
                  dias
                </strong>
                <small>Da proposta à assinatura</small>
              </article>
              <article>
                <span>Faturado</span>
                <strong>{currency.format(selectedOwnerDashboard.billed)}</strong>
                <small>{selectedOwnerDashboard.waiting} aguardando faturamento</small>
              </article>
              <article>
                <span>Principal origem</span>
                <strong className="text-value">
                  {selectedOwnerDashboard.topOrigin}
                </strong>
                <small>Canal mais frequente</small>
              </article>
            </div>

            {(() => {
              const score = sellerScores.get(selectedOwner);
              if (!score) return null;
              return (
                <article className="panel rounded-3xl glassmorphism card-3d-inner seller-score-panel">
                  <div className="panel-heading">
                    <div>
                      <span className="section-kicker">Sales Performance Score</span>
                      <h3>{score.overall}/100 · {selectedOwner}</h3>
                    </div>
                  </div>
                  <div className="health-dimension-grid">
                    {score.dimensions.map((dimension) =>
                      dimension.available ? (
                        <div key={dimension.key} className="health-dimension">
                          <div className="health-dimension-head">
                            <span>{dimension.label}</span>
                            <strong>{dimension.score}</strong>
                          </div>
                          <i className="health-dimension-bar">
                            <b style={{ width: `${Math.min(dimension.score, 100)}%` }} />
                          </i>
                          <small>{dimension.detail}</small>
                          <small className="health-dimension-formula">
                            Peso {dimension.weight}% · {dimension.formula}
                          </small>
                        </div>
                      ) : (
                        <div key={dimension.key} className="health-dimension health-dimension-unavailable">
                          <div className="health-dimension-head">
                            <span>{dimension.label}</span>
                            <strong>—</strong>
                          </div>
                          <small>{dimension.missingDataNote}</small>
                        </div>
                      ),
                    )}
                  </div>
                </article>
              );
            })()}

            <div className="seller-detail-grid">
              <article className="panel rounded-3xl glassmorphism card-3d-inner seller-month-panel">
                <div className="panel-heading">
                  <div>
                    <span className="section-kicker">Evolução mensal</span>
                    <h3>Receita ajustada de {selectedOwner}</h3>
                  </div>
                </div>
                <div className="seller-month-chart">
                  {selectedOwnerDashboard.months.map((month) => (
                    <div key={month.month}>
                      <span>{currency.format(month.adjusted)}</span>
                      <i>
                        <b
                          style={{
                            height: `${Math.max(
                              (month.adjusted / selectedOwnerMaxMonth) * 100,
                              month.adjusted ? 5 : 0,
                            )}%`,
                          }}
                        />
                      </i>
                      <strong>{month.shortMonth}</strong>
                      <small>{month.deals} negócios</small>
                    </div>
                  ))}
                </div>
              </article>

              <article className="panel rounded-3xl glassmorphism card-3d-inner seller-summary-panel">
                <span className="section-kicker">Leitura rápida</span>
                <h3>Resumo da carteira</h3>
                <dl>
                  <div>
                    <dt>Maior negócio</dt>
                    <dd>
                      {currency.format(
                        Math.max(...selectedOwnerDeals.map((deal) => deal.adjusted), 0),
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>Realização vendido × ajustado</dt>
                    <dd>{percent.format(selectedOwnerDashboard.realization)}</dd>
                  </div>
                  <div>
                    <dt>Pendências de faturamento</dt>
                    <dd>{selectedOwnerDashboard.waiting}</dd>
                  </div>
                  <div>
                    <dt>Canal predominante</dt>
                    <dd>{selectedOwnerDashboard.topOrigin}</dd>
                  </div>
                </dl>
              </article>
            </div>

            <article className="panel rounded-3xl glassmorphism card-3d-inner seller-deals-panel">
              <div className="panel-heading">
                <div>
                  <span className="section-kicker">Carteira separada</span>
                  <h3>Negócios de {selectedOwner}</h3>
                </div>
                <span>{selectedOwnerDeals.length} registros</span>
              </div>
              <div className="data-table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Empresa</th>
                      <th>Mês</th>
                      <th>Origem</th>
                      <th>Etapa</th>
                      <th>Vendido</th>
                      <th>Ajustado</th>
                      <th>Faturamento</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedOwnerDeals.map((deal) => (
                      <tr
                        key={deal.id}
                        className={isReadOnly ? "" : "clickable-row"}
                        onClick={isReadOnly ? undefined : () => setDealModal({ mode: "edit", deal })}
                      >
                        <td>
                          <strong>{deal.company}</strong>
                          <small>{deal.id.slice(0, 8)}</small>
                        </td>
                        <td>{deal.month}</td>
                        <td>{deal.origin}</td>
                        <td>
                          <span className={`status-pill ${STAGE_PILL_CLASS[deal.stage]}`}>
                            {STAGE_LABELS[deal.stage]}
                          </span>
                        </td>
                        <td>{preciseCurrency.format(deal.sold)}</td>
                        <td className="emphasis">
                          {preciseCurrency.format(deal.adjusted)}
                        </td>
                        <td>{preciseCurrency.format(deal.billed)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>

            <div className="team-grid">
              <article className="panel rounded-3xl glassmorphism card-3d-inner ranking-panel">
                <div className="panel-heading">
                  <div>
                    <span className="section-kicker">Ranking</span>
                    <h3>Receita ajustada por responsável</h3>
                  </div>
                </div>
                <div className="ranking-list">
                  {ownerPerformance.map((person, index) => (
                    <div key={person.owner}>
                      <span className="rank-number">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <span className="ranking-avatar">
                        {initials(person.owner)}
                      </span>
                      <span className="ranking-name">
                        <strong>{person.owner}</strong>
                        <small>{person.deals} negócios</small>
                      </span>
                      <span className="ranking-value">
                        <strong>{currency.format(person.adjusted)}</strong>
                        <small>
                          {percent.format(
                            person.adjusted /
                              Math.max(executiveSummary.ytdAdjusted, 1),
                          )}{" "}
                          do total
                        </small>
                      </span>
                    </div>
                  ))}
                </div>
              </article>

              <article className="panel rounded-3xl glassmorphism card-3d-inner channel-panel">
                <div className="panel-heading">
                  <div>
                    <span className="section-kicker">Aquisição</span>
                    <h3>Participação dos canais</h3>
                  </div>
                </div>
                <div className="channel-list">
                  {originPerformance.map((origin, index) => (
                    <div key={origin.origin}>
                      <span className="channel-index">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <span className="channel-info">
                        <strong>{origin.origin}</strong>
                        <small>{origin.deals} negócios</small>
                        <i>
                          <b
                            style={{
                              width: `${(origin.adjusted / maxOrigin) * 100}%`,
                            }}
                          />
                        </i>
                      </span>
                      <strong>{currency.format(origin.adjusted)}</strong>
                    </div>
                  ))}
                </div>
              </article>
            </div>

            <article className="panel rounded-3xl glassmorphism card-3d-inner historical-panel">
              <div className="panel-heading">
                <div>
                  <span className="section-kicker">Histórico preservado</span>
                  <h3>Base de 2025 disponível para comparação</h3>
                </div>
                <span>{data.meta.historicalRecords} registros</span>
              </div>
              <div className="historical-summary">
                {[1, 2].map((semester) => {
                  const rows = data.historicalDeals.filter(
                    (deal) => deal.semester === semester,
                  );
                  const sold = rows.reduce((sum, deal) => sum + deal.sold, 0);
                  const billed = rows.reduce((sum, deal) => sum + deal.billed, 0);
                  return (
                    <div key={semester}>
                      <span>{semester}º semestre 2025</span>
                      <strong>{currency.format(billed)}</strong>
                      <small>
                        {rows.length} negócios · {currency.format(sold)} vendido
                      </small>
                    </div>
                  );
                })}
                <button type="button" onClick={() => setSection("dados")}>
                  Consultar todas as linhas <b>→</b>
                </button>
              </div>
            </article>
          </section>
        )}

        {section === "governanca" && (
          <section className="page-content">
            <div className="page-intro">
              <div>
                <span className="section-kicker">Governança comercial</span>
                <h2>Ritmo, responsabilidade e trilha de decisão.</h2>
                <p>
                  A planilha passa a operar com donos claros, critérios de
                  aprovação e uma rotina de revisão adequada à escala.
                </p>
              </div>
              <span className="security-badge">Acesso privado · SIWC</span>
            </div>

            <div className="governance-grid">
              <article className="panel rounded-3xl glassmorphism card-3d-inner rhythm-panel">
                <div className="panel-heading">
                  <div>
                    <span className="section-kicker">Modelo operacional</span>
                    <h3>Cadência de gestão</h3>
                  </div>
                </div>
                <div className="rhythm-list">
                  {data.governance.operatingRhythm.map((item, index) => (
                    <div key={item.cadence}>
                      <span className="rhythm-step">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <span>
                        <small>{item.cadence}</small>
                        <strong>{item.ritual}</strong>
                      </span>
                      <span>
                        <small>Responsável</small>
                        <strong>{item.owner}</strong>
                      </span>
                      <p>{item.evidence}</p>
                    </div>
                  ))}
                </div>
              </article>

              <article className="panel rounded-3xl glassmorphism card-3d-inner approval-panel">
                <div className="panel-heading">
                  <div>
                    <span className="section-kicker">Controles</span>
                    <h3>Regras de aprovação</h3>
                  </div>
                </div>
                <ol>
                  {data.governance.approvalRules.map((rule) => (
                    <li key={rule}>{rule}</li>
                  ))}
                </ol>
              </article>
            </div>

            <article className="panel rounded-3xl glassmorphism card-3d-inner activity-panel">
              <div className="panel-heading">
                <div>
                  <span className="section-kicker">Trilha de auditoria</span>
                  <h3>Atividade recente</h3>
                </div>
                <span>{(auditResults ?? activity).length} eventos{auditResults ? " (filtrado)" : ""}</span>
              </div>

              <div className="audit-filter-row">
                <input
                  placeholder="Usuário (e-mail)"
                  value={auditFilters.actor}
                  onChange={(event) => setAuditFilters((prev) => ({ ...prev, actor: event.target.value }))}
                />
                <select
                  value={auditFilters.action}
                  onChange={(event) => setAuditFilters((prev) => ({ ...prev, action: event.target.value }))}
                >
                  <option value="">Todas as ações</option>
                  {Object.entries(ACTION_LABELS).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
                <input
                  placeholder="Entidade (ex.: commercial_deal)"
                  value={auditFilters.entity}
                  onChange={(event) => setAuditFilters((prev) => ({ ...prev, entity: event.target.value }))}
                />
                <input
                  type="date"
                  value={auditFilters.from}
                  onChange={(event) => setAuditFilters((prev) => ({ ...prev, from: event.target.value }))}
                />
                <input
                  type="date"
                  value={auditFilters.to}
                  onChange={(event) => setAuditFilters((prev) => ({ ...prev, to: event.target.value }))}
                />
                <button type="button" className="primary-button" disabled={auditLoading} onClick={() => void applyAuditFilters()}>
                  {auditLoading ? "Filtrando..." : "Aplicar filtros"}
                </button>
                <button type="button" className="modal-cancel" onClick={clearAuditFilters}>
                  Limpar
                </button>
                <button
                  type="button"
                  className="table-edit-button"
                  onClick={() => downloadActivityCsv(auditResults ?? activity, "atlas-auditoria.csv")}
                >
                  Exportar CSV
                </button>
              </div>
              {auditError && <p className="modal-error">{auditError}</p>}

              <div className="activity-list">
                {(auditResults ?? activity).length === 0 && (
                  <p className="activity-empty">Nenhuma alteração registrada para os filtros atuais.</p>
                )}
                {(auditResults ?? (showAllActivity ? activity : activity.slice(0, 5))).map((entry) => {
                  const detail = (() => {
                    try {
                      return JSON.parse(entry.detailJson) as Record<string, unknown>;
                    } catch {
                      return {};
                    }
                  })();
                  const company = typeof detail.company === "string" ? detail.company : null;
                  return (
                    <div key={entry.id} className="activity-item">
                      <span className="activity-avatar">{initials(entry.actorEmail)}</span>
                      <span className="activity-copy">
                        <strong>{entry.actorEmail}</strong>{" "}
                        {ACTION_LABELS[entry.action] ?? entry.action}
                        {company ? ` — ${company}` : ""}
                        <small className="activity-entity">
                          {entry.entity}
                          {entry.entityId ? ` #${entry.entityId}` : ""}
                        </small>
                      </span>
                      <small>{relativeTimestamp(entry.createdAt)}</small>
                    </div>
                  );
                })}
              </div>
              {!auditResults && activity.length > 5 && (
                <button
                  type="button"
                  className="list-toggle"
                  onClick={() => setShowAllActivity((prev) => !prev)}
                >
                  {showAllActivity ? "Ver menos" : `Ver mais (${activity.length - 5})`}
                </button>
              )}
            </article>

            <article className="panel rounded-3xl glassmorphism card-3d-inner access-panel">
              <div className="panel-heading">
                <div>
                  <span className="section-kicker">Segregação de funções</span>
                  <h3>Matriz de acesso recomendada</h3>
                </div>
                <span>Princípio do menor privilégio</span>
              </div>
              <div className="data-table-wrap">
                <table className="data-table access-table">
                  <thead>
                    <tr>
                      <th>Perfil</th>
                      <th>Visualizar</th>
                      <th>Editar</th>
                      <th>Aprovar</th>
                      <th>Gerir usuários</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.governance.roles.map((role) => (
                      <tr key={role.role}>
                        <td><strong>{role.role}</strong></td>
                        {[role.view, role.edit, role.approve, role.manageUsers].map(
                          (allowed, index) => (
                            <td key={`${role.role}-${index}`}>
                              <span className={allowed ? "access-yes" : "access-no"}>
                                {allowed ? "Permitido" : "Bloqueado"}
                              </span>
                            </td>
                          ),
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>

            <article className="panel rounded-3xl glassmorphism card-3d-inner quality-panel">
              <div className="panel-heading">
                <div>
                  <span className="section-kicker">Qualidade da informação · ao vivo</span>
                  <h3>Completude dos negócios em {deals.length} negócio(s) cadastrados agora</h3>
                </div>
              </div>
              <div className="quality-metric-grid">
                {dataQualityMetrics.map((metric) => (
                  <button
                    type="button"
                    key={metric.key}
                    className="quality-metric-card"
                    onClick={() => setDrilldown({ title: metric.label, dealIds: metric.dealIds })}
                  >
                    <span>{metric.label}</span>
                    <strong>{percent.format(metric.ratio)}</strong>
                    <small>{metric.count} de {deals.length} negócio(s) · clique para ver</small>
                  </button>
                ))}
              </div>
            </article>

            <article className="panel rounded-3xl glassmorphism card-3d-inner quality-panel">
              <div className="panel-heading">
                <div>
                  <span className="section-kicker">Qualidade da informação · histórico</span>
                  <h3>Backlog de saneamento identificado na planilha</h3>
                </div>
                <span>{data.dataQualityIssues.length} itens</span>
              </div>
              <div className="quality-grid">
                {(showAllQualityIssues
                  ? data.dataQualityIssues
                  : data.dataQualityIssues.slice(0, 5)
                ).map((issue) => (
                  <div key={issue.title}>
                    <span className={`severity-label ${issue.severity}`}>
                      {issue.severity}
                    </span>
                    <small>{issue.category}</small>
                    <strong>{issue.title}</strong>
                    <p>{issue.description}</p>
                    <b>Responsável: {issue.owner}</b>
                  </div>
                ))}
              </div>
              {data.dataQualityIssues.length > 5 && (
                <button
                  type="button"
                  className="list-toggle"
                  onClick={() => setShowAllQualityIssues((prev) => !prev)}
                >
                  {showAllQualityIssues
                    ? "Ver menos"
                    : `Ver mais (${data.dataQualityIssues.length - 5})`}
                </button>
              )}
            </article>

            <article className="panel rounded-3xl glassmorphism card-3d-inner roadmap-panel">
              <div className="panel-heading">
                <div>
                  <span className="section-kicker">Roadmap Enterprise</span>
                  <h3>Módulos com arquitetura pronta, aguardando fonte de dados</h3>
                </div>
                <span>{ENTERPRISE_ROADMAP.length} módulo(s)</span>
              </div>
              <p className="dashboard-note">
                Estes módulos do Revenue Operating System não têm fonte de dado real neste
                aplicativo hoje (sem integração de marketing/SDR/CS/financeiro/NPS, sem log de
                atividades de CRM). Os contratos de dados já estão definidos em{" "}
                <code>app/deriveEnterpriseRoadmap.ts</code> para quando a integração existir —
                nenhum número abaixo é simulado.
              </p>
              <div className="roadmap-grid">
                {ENTERPRISE_ROADMAP.map((module) => (
                  <div key={module.key} className="roadmap-card">
                    <div className="roadmap-card-head">
                      <strong>{module.title}</strong>
                      <span className="roadmap-status-pill">{module.status}</span>
                    </div>
                    <p>{module.summary}</p>
                    <div>
                      <small className="roadmap-missing">Dados/integrações faltantes:</small>
                      <ul>
                        {module.missingData.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </div>
                    <span className="roadmap-contract">
                      Contratos: {module.contractTypeNames.join(", ")}
                    </span>
                  </div>
                ))}
              </div>
            </article>
          </section>
        )}

        {section === "dados" && currentSheet && (
          <section className="page-content">
            <div className="page-intro">
              <div>
                <span className="section-kicker">Data room comercial</span>
                <h2>Todos os dados da planilha, sem perda de contexto.</h2>
                <p>
                  As 20 abas, {data.meta.importedCells.toLocaleString("pt-BR")}{" "}
                  células preenchidas e {data.meta.formulaCells} fórmulas estão
                  disponíveis para consulta e auditoria.
                </p>
              </div>
              <div className="source-stamp">
                <span>Fonte original</span>
                <strong>{data.meta.sourceFile}</strong>
              </div>
            </div>

            <div className="data-room">
              <aside className="sheet-list">
                <div>
                  <span>Abas do arquivo</span>
                  <strong>{data.rawSheets.length}</strong>
                </div>
                {data.rawSheets.map((sheet) => (
                  <button
                    type="button"
                    key={sheet.name}
                    className={sheet.name === currentSheet.name ? "active" : ""}
                    onClick={() => {
                      setSelectedSheet(sheet.name);
                      setSheetSearch("");
                    }}
                  >
                    <span>{sheet.name}</span>
                    <small>{sheet.rowCount} × {sheet.columnCount}</small>
                  </button>
                ))}
              </aside>

              <article className="panel rounded-3xl glassmorphism card-3d-inner sheet-panel">
                <div className="sheet-toolbar">
                  <div>
                    <span className="section-kicker">Aba selecionada</span>
                    <h3>{currentSheet.name}</h3>
                  </div>
                  <label className="sheet-search">
                    <span>Buscar nesta aba</span>
                    <input
                      value={sheetSearch}
                      onChange={(event) => setSheetSearch(event.target.value)}
                      placeholder="Digite um valor"
                    />
                  </label>
                  <div className="mode-toggle">
                    <button
                      type="button"
                      className={sheetMode === "values" ? "active" : ""}
                      onClick={() => setSheetMode("values")}
                    >
                      Valores
                    </button>
                    <button
                      type="button"
                      className={sheetMode === "formulas" ? "active" : ""}
                      onClick={() => setSheetMode("formulas")}
                    >
                      Fórmulas
                    </button>
                  </div>
                </div>
                <div className="sheet-meta">
                  <span>{currentSheet.rowCount} linhas</span>
                  <span>{currentSheet.columnCount} colunas</span>
                  <span>{currentSheet.nonEmptyCells} células</span>
                  <span>{currentSheet.formulaCells} fórmulas</span>
                </div>
                <div className="spreadsheet-wrap">
                  <table className="spreadsheet">
                    <thead>
                      <tr>
                        <th>#</th>
                        {Array.from(
                          { length: currentSheet.columnCount },
                          (_, index) => (
                            <th key={index}>
                              {String.fromCharCode(65 + (index % 26))}
                            </th>
                          ),
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {visibleSheetRows.map(({ row, rowNumber }) => (
                        <tr key={rowNumber}>
                          <th>{rowNumber}</th>
                          {Array.from(
                            { length: currentSheet.columnCount },
                            (_, index) => (
                              <td key={index}>{String(row[index] ?? "")}</td>
                            ),
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </article>
            </div>
          </section>
        )}

        {section === "integracoes" && (
          <section className="page-content">
            <div className="page-intro">
              <div>
                <span className="section-kicker">Integrações</span>
                <h2>Hub Omnichannel: IA, Comunicação e Inteligência.</h2>
                <p>
                  Configure as chaves uma vez e use para importar/exportar negócios, enriquecer
                  leads e gerar relatórios executivos com IA.
                </p>
              </div>
            </div>

            <article className="panel rounded-3xl glassmorphism card-3d-inner">
              <div className="panel-heading">
                <div>
                  <span className="section-kicker">Chaves de API</span>
                  <h3>Credenciais dos serviços externos</h3>
                </div>
                {!integrationSettings && !integrationError && <span>Carregando...</span>}
              </div>
              <form
                className="modal-form integration-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  void saveIntegrationSettings();
                }}
              >
                <label>
                  <span>Webhook Bitrix24</span>
                  <input
                    placeholder={
                      integrationSettings?.bitrixWebhookMasked ?? "https://seuportal.bitrix24.com.br/rest/1/xxxx/"
                    }
                    value={integrationForm.bitrixWebhookUrl}
                    onChange={(event) =>
                      setIntegrationForm((prev) => ({ ...prev, bitrixWebhookUrl: event.target.value }))
                    }
                    disabled={isReadOnly}
                  />
                </label>
                <label>
                  <span>Chave da API Apollo</span>
                  <input
                    placeholder={integrationSettings?.apolloKeyMasked ?? "Chave não configurada"}
                    value={integrationForm.apolloApiKey}
                    onChange={(event) =>
                      setIntegrationForm((prev) => ({ ...prev, apolloApiKey: event.target.value }))
                    }
                    disabled={isReadOnly}
                  />
                </label>
                <label>
                  <span>Chave da API Google</span>
                  <input
                    placeholder={integrationSettings?.googleKeyMasked ?? "Chave não configurada"}
                    value={integrationForm.googleApiKey}
                    onChange={(event) =>
                      setIntegrationForm((prev) => ({ ...prev, googleApiKey: event.target.value }))
                    }
                    disabled={isReadOnly}
                  />
                </label>
                <label>
                  <span>Provedor de IA</span>
                  <select
                    value={integrationForm.aiProvider}
                    onChange={(event) =>
                      setIntegrationForm((prev) => ({
                        ...prev,
                        aiProvider: event.target.value as "auto" | "openai" | "anthropic",
                      }))
                    }
                    disabled={isReadOnly}
                  >
                    <option value="auto">Automático (usa a chave preenchida)</option>
                    <option value="openai">OpenAI</option>
                    <option value="anthropic">Anthropic</option>
                  </select>
                </label>
                <label>
                  <span>Chave da API OpenAI</span>
                  <input
                    placeholder={integrationSettings?.openaiKeyMasked ?? "Chave não configurada"}
                    value={integrationForm.openaiApiKey}
                    onChange={(event) =>
                      setIntegrationForm((prev) => ({ ...prev, openaiApiKey: event.target.value }))
                    }
                    disabled={isReadOnly}
                  />
                </label>
                <label>
                  <span>Chave da API Anthropic</span>
                  <input
                    placeholder={integrationSettings?.anthropicKeyMasked ?? "Chave não configurada"}
                    value={integrationForm.anthropicApiKey}
                    onChange={(event) =>
                      setIntegrationForm((prev) => ({ ...prev, anthropicApiKey: event.target.value }))
                    }
                    disabled={isReadOnly}
                  />
                </label>

                {integrationError && !integrationError.includes("Autenticação") && <p className="modal-error">{integrationError}</p>}

                {!isReadOnly && (
                  <div className="modal-actions">
                    <div />
                    <div className="modal-actions-right">
                      <button type="submit" className="primary-button" disabled={integrationSaving}>
                        {integrationSaving ? "Salvando..." : "Salvar"}
                      </button>
                    </div>
                  </div>
                )}
              </form>
            </article>

            <article className="panel rounded-3xl glassmorphism card-3d-inner">
              <div className="panel-heading">
                <div>
                  <span className="section-kicker">Bitrix24</span>
                  <h3>Importar e exportar negócios</h3>
                </div>
              </div>
              <div className="integration-actions">
                <button
                  type="button"
                  className="primary-button"
                  disabled={isReadOnly || bitrixImportLoading}
                  onClick={() => void runBitrixImport()}
                >
                  {bitrixImportLoading ? "Buscando..." : "Importar do Bitrix24"}
                </button>
                <button
                  type="button"
                  className="primary-button"
                  disabled={isReadOnly || bitrixExporting || deals.length === 0}
                  onClick={() => void runBitrixExport()}
                >
                  {bitrixExporting ? "Exportando..." : "Exportar todos para o Bitrix24"}
                </button>
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => downloadCsv(deals, "atlas-negocios-2026.csv")}
                >
                  Exportar CSV
                </button>
                <label className={isReadOnly ? "csv-import-button disabled" : "csv-import-button"}>
                  {csvImporting ? "Importando..." : "Importar CSV"}
                  <input
                    type="file"
                    accept=".csv"
                    disabled={isReadOnly || csvImporting}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.target.value = "";
                      if (file) void handleCsvImport(file);
                    }}
                  />
                </label>
              </div>
              {bitrixImportError && !bitrixImportError.includes("Autenticação") && <p className="modal-error">{bitrixImportError}</p>}
              {bitrixExportError && !bitrixExportError.includes("Autenticação") && <p className="modal-error">{bitrixExportError}</p>}
              {csvImportError && !csvImportError.includes("Autenticação") && <p className="modal-error">{csvImportError}</p>}

              {bitrixImportItems && (
                <div className="data-table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th></th>
                        <th>Título</th>
                        <th>Valor</th>
                        <th>Etapa (Bitrix)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bitrixImportItems.map((item) => (
                        <tr key={item.bitrixId}>
                          <td>
                            <input
                              type="checkbox"
                              checked={bitrixImportSelected.has(item.bitrixId)}
                              onChange={() => toggleBitrixImportSelection(item.bitrixId)}
                            />
                          </td>
                          <td>{item.title}</td>
                          <td>{preciseCurrency.format(item.amount)}</td>
                          <td>{item.stageId}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="modal-actions">
                    <div />
                    <div className="modal-actions-right">
                      <button
                        type="button"
                        className="modal-cancel"
                        onClick={() => setBitrixImportItems(null)}
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        className="primary-button"
                        disabled={bitrixImportConfirming || bitrixImportSelected.size === 0}
                        onClick={() => void confirmBitrixImport()}
                      >
                        {bitrixImportConfirming
                          ? "Importando..."
                          : `Confirmar importação (${bitrixImportSelected.size})`}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </article>

            <article className="panel rounded-3xl glassmorphism card-3d-inner">
              <div className="panel-heading">
                <div>
                  <span className="section-kicker">Prospecção</span>
                  <h3>Buscar ou enriquecer um lead</h3>
                </div>
              </div>
              <div className="lead-search-form">
                <label>
                  <span>Empresa</span>
                  <input
                    value={leadQuery.company}
                    onChange={(event) =>
                      setLeadQuery((prev) => ({ ...prev, company: event.target.value }))
                    }
                  />
                </label>
                <label>
                  <span>Domínio</span>
                  <input
                    placeholder="empresa.com.br"
                    value={leadQuery.domain}
                    onChange={(event) =>
                      setLeadQuery((prev) => ({ ...prev, domain: event.target.value }))
                    }
                  />
                </label>
                <label>
                  <span>E-mail da pessoa</span>
                  <input
                    value={leadQuery.email}
                    onChange={(event) =>
                      setLeadQuery((prev) => ({ ...prev, email: event.target.value }))
                    }
                  />
                </label>
              </div>
              <div className="integration-actions">
                <button
                  type="button"
                  className="primary-button"
                  disabled={isReadOnly || leadLoading !== null}
                  onClick={() => void runLeadSearch("apollo")}
                >
                  {leadLoading === "apollo" ? "Buscando..." : "Buscar no Apollo"}
                </button>
                <button
                  type="button"
                  className="primary-button"
                  disabled={isReadOnly || leadLoading !== null}
                  onClick={() => void runLeadSearch("google")}
                >
                  {leadLoading === "google" ? "Buscando..." : "Buscar no Google"}
                </button>
              </div>
              {leadError && !leadError.includes("Autenticação") && <p className="modal-error">{leadError}</p>}
              {leadResult && (
                <div className="lead-result-card">
                  <div>
                    <span>Nome</span>
                    <strong>{leadResult.name ?? "—"}</strong>
                  </div>
                  <div>
                    <span>Empresa</span>
                    <strong>{leadResult.company ?? "—"}</strong>
                  </div>
                  <div>
                    <span>Cargo</span>
                    <strong>{leadResult.title ?? "—"}</strong>
                  </div>
                  <div>
                    <span>E-mail</span>
                    <strong>{leadResult.email ?? "—"}</strong>
                  </div>
                  <div>
                    <span>Telefone</span>
                    <strong>{leadResult.phone ?? "—"}</strong>
                  </div>
                  <div>
                    <span>Endereço</span>
                    <strong>{leadResult.address ?? "—"}</strong>
                  </div>
                  <div>
                    <span>Site</span>
                    <strong>{leadResult.website ?? "—"}</strong>
                  </div>
                  {!isReadOnly && (
                    <button
                      type="button"
                      className="primary-button"
                      onClick={() => openDealModalFromLead(leadResult)}
                    >
                      Salvar como negócio
                    </button>
                  )}
                </div>
              )}
            </article>

            <article className="panel rounded-3xl glassmorphism card-3d-inner">
              <div className="panel-heading">
                <div>
                  <span className="section-kicker">Relatórios</span>
                  <h3>Gerar relatório executivo com IA</h3>
                </div>
              </div>
              <p>
                Usa o resumo executivo, health score, alertas ativos e desempenho por vendedor já
                calculados nesta tela para escrever um relatório narrativo.
              </p>
              <button
                type="button"
                className="primary-button"
                disabled={isReadOnly || aiReportLoading}
                onClick={() => void generateAiReport()}
              >
                Gerar relatório com IA
              </button>
            </article>
          </section>
        )}

        <footer className="app-footer">
          <span>
            Atlas Comercial 360 · Base importada em{" "}
            {new Date(data.meta.generatedAt).toLocaleDateString("pt-BR")}
          </span>
          <span>Segurança · Governança · Previsibilidade</span>
        </footer>
      </main>

      <AssistantWidget dataContext={{ deals, objectives }} />

      {dealModal && (
        <DealModal
          mode={dealModal.mode}
          initialValues={
            dealModal.mode === "create"
              ? {
                  ...emptyForm({
                    monthNumber: dealModal.defaultMonthNumber,
                    stage: dealModal.defaultStage,
                  }),
                  ...leadPrefill,
                }
              : formFromDeal(dealModal.deal)
          }
          owners={owners}
          origins={origins}
          saving={modalSaving}
          errorMessage={modalError}
          onClose={() => {
            setDealModal(null);
            setModalError(null);
            setLeadPrefill(null);
          }}
          onSubmit={handleModalSubmit}
          onDelete={
            dealModal.mode === "edit" ? () => void deleteDeal(dealModal.deal.id) : undefined
          }
        />
      )}

      {sellerModalOpen && (
        <SellerModal
          saving={sellerModalSaving}
          errorMessage={sellerModalError}
          onClose={() => {
            setSellerModalOpen(false);
            setSellerModalError(null);
          }}
          onSubmit={(values) => void addSeller(values)}
        />
      )}

      {actionItemModal && (
        <ActionItemModal
          mode={actionItemModal.mode}
          initialValues={
            actionItemModal.mode === "create"
              ? emptyActionItemForm(actionItemModal.defaultHorizon)
              : formFromActionItem(actionItemModal.item)
          }
          saving={actionItemModalSaving}
          errorMessage={actionItemModalError}
          onClose={() => {
            setActionItemModal(null);
            setActionItemModalError(null);
          }}
          onSubmit={handleActionItemModalSubmit}
          onDelete={
            actionItemModal.mode === "edit"
              ? () => void deleteActionItemFn(actionItemModal.item.id)
              : undefined
          }
        />
      )}

      {drilldown && (
        <DealDrilldownModal
          title={drilldown.title}
          deals={drilldown.dealIds.map((id) => dealsById.get(id)).filter((d): d is Deal => Boolean(d))}
          onClose={() => setDrilldown(null)}
        />
      )}

      {monthlyRecordModal &&
        (() => {
          const target = targets.find((t) => t.monthNumber === monthlyRecordModal.monthNumber) ?? {
            year: 2026,
            monthNumber: monthlyRecordModal.monthNumber,
            month: MONTH_NAMES[monthlyRecordModal.monthNumber - 1],
            target: 0,
            sold: 0,
            adjusted: 0,
          };
          return (
            <MonthlyRecordModal
              monthNumber={monthlyRecordModal.monthNumber}
              target={target}
              saving={monthlyRecordModalSaving}
              errorMessage={monthlyRecordModalError}
              onClose={() => {
                setMonthlyRecordModal(null);
                setMonthlyRecordModalError(null);
              }}
              onSubmit={handleMonthlyRecordSubmit}
            />
          );
        })()}

      {objectiveModal && (
        <ObjectiveModal
          objective={objectiveModal}
          saving={objectiveModalSaving}
          errorMessage={objectiveModalError}
          onClose={() => {
            setObjectiveModal(null);
            setObjectiveModalError(null);
          }}
          onSubmit={(values) => handleObjectiveSubmit(objectiveModal, values)}
        />
      )}

      {aiReportOpen && (
        <div className="modal-overlay" onClick={() => setAiReportOpen(false)}>
          <div
            className="modal-card modal-card-large"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-heading">
              <h3>Relatório executivo (IA)</h3>
              <button
                type="button"
                className="modal-close"
                onClick={() => setAiReportOpen(false)}
                aria-label="Fechar"
              >
                ×
              </button>
            </div>
            <div className="ai-report-body">
              {aiReportLoading && <p className="activity-empty">Gerando relatório...</p>}
              {aiReportError && <p className="modal-error">{aiReportError}</p>}
              {!aiReportLoading && aiReportText && (
                <pre className="ai-report-text">{aiReportText}</pre>
              )}
            </div>
            {aiReportText && !aiReportLoading && (
              <div className="modal-actions">
                <div />
                <div className="modal-actions-right">
                  <button
                    type="button"
                    className="modal-cancel"
                    onClick={() => void navigator.clipboard.writeText(aiReportText)}
                  >
                    Copiar
                  </button>
                  <button
                    type="button"
                    className="primary-button"
                    onClick={() => {
                      const blob = new Blob([aiReportText], { type: "text/markdown;charset=utf-8" });
                      const url = URL.createObjectURL(blob);
                      const anchor = document.createElement("a");
                      anchor.href = url;
                      anchor.download = "relatorio-atlas-comercial.md";
                      anchor.click();
                      URL.revokeObjectURL(url);
                    }}
                  >
                    Baixar .md
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {toast && (
        <div className={`app-toast ${toast.tone}`} role="status">
          {toast.message}
        </div>
      )}
    </div>
  );
}
