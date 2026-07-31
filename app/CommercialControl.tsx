"use client";

import {
  Fragment,
  isValidElement,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
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
import { computeAlerts, type AlertState, type AlertSeverity } from "./deriveAlerts";
import { computeSellerPerformanceScore } from "./deriveSellerScore";
import { ENTERPRISE_ROADMAP } from "./deriveEnterpriseRoadmap";
import type { CommercialData, Objective, ObjectiveKeyResult } from "@/db/commercial-data";
import {
  GROWTH_PLAN_HORIZON_MONTHS,
  GROWTH_PLAN_MONTHLY_INCREASE,
} from "./utils/constants";

type User = {
  displayName: string;
  email: string;
  isPreview: boolean;
};

export type ActivityEntry = {
  id: number;
  actorEmail: string;
  action: string;
  entity: string;
  entityId: string | null;
  detailJson: string;
  createdAt: string;
};

export type IntegrationSettingsView = {
  bitrixConfigured: boolean;
  bitrixWebhookMasked: string | null;
  apolloConfigured: boolean;
  apolloKeyMasked: string | null;
  googleConfigured: boolean;
  googleKeyMasked: string | null;
  googleOAuthConfigured: boolean;
  googleClientIdMasked: string | null;
  googleClientSecretMasked: string | null;
  aiProvider: "auto" | "openai" | "anthropic";
  openaiConfigured: boolean;
  openaiKeyMasked: string | null;
  anthropicConfigured: boolean;
  anthropicKeyMasked: string | null;
};

export type BitrixImportItem = {
  bitrixId: string;
  title: string;
  amount: number;
  stageId: string;
  dateCreate: string;
};

export type EnrichedLead = {
  name: string | null;
  company: string | null;
  title: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  website: string | null;
  source: "apollo" | "google";
};

export type Section =
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

// Maps the alerts engine's 4-tier severity (app/deriveAlerts.ts) onto the
// 3-tier "alta/média/baixa" scale the bottleneck-card styling already uses.
const BOTTLENECK_SEVERITY: Record<AlertSeverity, "alta" | "média" | "baixa"> = {
  critico: "alta",
  alto_risco: "alta",
  atencao: "média",
  informativo: "baixa",
};

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
export function useIsClientMounted() {
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

export type DealFormValues = {
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

export type ActionItemFormValues = {
  title: string;
  description: string;
  owner: string;
  horizon: ActionHorizon;
  dueDate: string;
};

function emptyActionItemForm(defaultHorizon: ActionHorizon): ActionItemFormValues {
  return { title: "", description: "", owner: "", horizon: defaultHorizon, dueDate: "" };
}

function formFromActionItem(item: ActionItem): ActionItemFormValues {
  return {
    title: item.title,
    description: item.description,
    owner: item.owner ?? "",
    horizon: item.horizon,
    dueDate: item.dueDate ?? "",
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
          <label>
            <span>Prazo (data limite)</span>
            <input
              type="date"
              value={values.dueDate}
              onChange={(event) => setValues({ ...values, dueDate: event.target.value })}
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

import { useCommercialState } from './hooks/useCommercialState';
export function CommercialControl({
  data,
  user,
  isReadOnly,
}: { data: CommercialData; user: User; isReadOnly: boolean }) {
  const stateOrCover = useCommercialState(data, user, isReadOnly);
  if (isValidElement(stateOrCover)) return stateOrCover;
  const state = stateOrCover;
  const {
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
    bitrixAutoSyncing, bitrixAutoSyncedAt, bitrixAutoSyncError, runBitrixAutoSync,
    googleConnection, googleDisconnecting, disconnectGoogle, calendarReminderKey, createCalendarReminder,
    alertsDigestSending, sendAlertsDigest, sheetsExporting, exportDealsToSheets,
    leadQuery, setLeadQuery, leadResult, setLeadResult, leadLoading, setLeadLoading, leadError, setLeadError, leadPrefill, setLeadPrefill,
    aiReportOpen, setAiReportOpen, aiReportLoading, setAiReportLoading, aiReportError, setAiReportError, aiReportText, setAiReportText,
    objectives, setObjectives, objectiveModal, setObjectiveModal, objectiveModalSaving, setObjectiveModalSaving, objectiveModalError, setObjectiveModalError,
    owners, sellerRoleByName, derived, monthlyMetrics, executiveSummary, ownerPerformance, originPerformance, currentMonthNumber, currentMonthMetric,
    dashboardInsights, revenueClassification, forecastScenarios, healthScore, alerts, alertStateByKey, openAlerts, dealsById, sellerScores, dataQualityMetrics, actionItemsByHorizon, origins,
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
  } = state;
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
              {item.id === "governanca" && openAlerts.length > 0 && (
                <span className="nav-badge">{openAlerts.length}</span>
              )}
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
              {item.id === "governanca" && openAlerts.length > 0 && (
                <span className="nav-badge">{openAlerts.length}</span>
              )}
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
                  <span className="issue-count">{openAlerts.length} alertas</span>
                </div>
                <div className="bottleneck-list">
                  {openAlerts.length === 0 && (
                    <p className="activity-empty">Nenhum gargalo identificado no momento.</p>
                  )}
                  {(showAllBottlenecks ? openAlerts : openAlerts.slice(0, 5)).map((alert) => (
                    <div key={alert.key} className={`bottleneck-item severity-${BOTTLENECK_SEVERITY[alert.severity]}`}>
                      <strong>{alert.title}</strong>
                      <p>{alert.description}</p>
                    </div>
                  ))}
                </div>
                {openAlerts.length > 5 && (
                  <button
                    type="button"
                    className="list-toggle"
                    onClick={() => setShowAllBottlenecks((prev) => !prev)}
                  >
                    {showAllBottlenecks ? "Ver menos" : `Ver mais (${openAlerts.length - 5})`}
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
                          {item.dueDate && (
                            <span
                              className={
                                item.status !== "concluido" && item.dueDate < asOf.slice(0, 10)
                                  ? "action-item-due overdue"
                                  : "action-item-due"
                              }
                            >
                              {" · Prazo: "}
                              {new Date(`${item.dueDate}T00:00:00`).toLocaleDateString("pt-BR")}
                            </span>
                          )}
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
                {googleConnection?.connected && openAlerts.length > 0 && (
                  <button
                    type="button"
                    className="table-edit-button"
                    disabled={alertsDigestSending}
                    onClick={() => void sendAlertsDigest()}
                  >
                    {alertsDigestSending ? "Enviando..." : "Enviar resumo por e-mail"}
                  </button>
                )}
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
                          {alert.category === "followup" && googleConnection?.connected && (
                            <button
                              type="button"
                              className="table-edit-button"
                              disabled={calendarReminderKey === alert.key}
                              onClick={() => void createCalendarReminder(alert)}
                            >
                              {calendarReminderKey === alert.key ? "Criando..." : "Criar lembrete no Calendar"}
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
                  <span>Google Client ID (OAuth)</span>
                  <input
                    placeholder={integrationSettings?.googleClientIdMasked ?? "Não configurado"}
                    value={integrationForm.googleClientId}
                    onChange={(event) =>
                      setIntegrationForm((prev) => ({ ...prev, googleClientId: event.target.value }))
                    }
                    disabled={isReadOnly}
                  />
                </label>
                <label>
                  <span>Google Client Secret (OAuth)</span>
                  <input
                    placeholder={integrationSettings?.googleClientSecretMasked ?? "Não configurado"}
                    value={integrationForm.googleClientSecret}
                    onChange={(event) =>
                      setIntegrationForm((prev) => ({ ...prev, googleClientSecret: event.target.value }))
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
                {integrationSettings?.bitrixConfigured && (
                  <div className={bitrixAutoSyncError ? "proof-line proof-line-error" : "proof-line"}>
                    <i />
                    {bitrixAutoSyncing
                      ? "Sincronizando..."
                      : bitrixAutoSyncError
                        ? bitrixAutoSyncError
                        : bitrixAutoSyncedAt
                          ? `Sincronização automática ${timeAgoLabel(Math.round((now - bitrixAutoSyncedAt) / 1000))}`
                          : "Sincronização automática ativa"}
                  </div>
                )}
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
                {integrationSettings?.bitrixConfigured && (
                  <button
                    type="button"
                    className="primary-button"
                    disabled={isReadOnly || bitrixAutoSyncing}
                    onClick={() => void runBitrixAutoSync()}
                  >
                    {bitrixAutoSyncing ? "Sincronizando..." : "Sincronizar agora"}
                  </button>
                )}
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
                  <span className="section-kicker">Google Workspace</span>
                  <h3>Calendar, Gmail e Sheets</h3>
                </div>
              </div>
              {!integrationSettings?.googleOAuthConfigured ? (
                <p className="activity-empty">
                  Preencha o Client ID e o Client Secret do Google acima (criados no Google Cloud
                  Console) para habilitar a conexão.
                </p>
              ) : googleConnection?.connected ? (
                <div className="integration-actions">
                  <span className="proof-line">
                    <i />
                    Conectado como {googleConnection.googleAccountEmail ?? "conta Google"}
                  </span>
                  <button
                    type="button"
                    className="primary-button"
                    disabled={isReadOnly || sheetsExporting || deals.length === 0}
                    onClick={() => void exportDealsToSheets()}
                  >
                    {sheetsExporting ? "Exportando..." : "Exportar negócios para Google Sheets"}
                  </button>
                  <button
                    type="button"
                    className="modal-cancel"
                    disabled={isReadOnly || googleDisconnecting}
                    onClick={() => void disconnectGoogle()}
                  >
                    {googleDisconnecting ? "Desconectando..." : "Desconectar"}
                  </button>
                </div>
              ) : (
                <div className="integration-actions">
                  <a
                    className={isReadOnly ? "primary-button disabled" : "primary-button"}
                    href={isReadOnly ? undefined : "/api/integrations/google/auth"}
                  >
                    Conectar conta Google
                  </a>
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
