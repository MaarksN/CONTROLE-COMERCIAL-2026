"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  deriveMetrics,
  MONTH_NAMES,
  STAGES,
  STAGE_LABELS,
  type Deal,
  type MonthlyMetric,
  type Seller,
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
import type { CommercialData } from "@/db/commercial-data";

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

type Section =
  | "capa"
  | "dashboard"
  | "visao"
  | "pipeline"
  | "okrs"
  | "equipe"
  | "joao-reis"
  | "governanca"
  | "dados";

const navItems: Array<{ id: Section; label: string; index: string }> = [
  { id: "dashboard", label: "Dashboard", index: "00" },
  { id: "visao", label: "Visão completa", index: "01" },
  { id: "pipeline", label: "Negócios", index: "02" },
  { id: "okrs", label: "OKRs", index: "03" },
  { id: "equipe", label: "Equipe & canais", index: "04" },
  { id: "joao-reis", label: "SDR João Reis", index: "05" },
  { id: "governanca", label: "Governança", index: "06" },
  { id: "dados", label: "Base completa", index: "07" },
];

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

function normalizeReference(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function referencesJoaoReis(value: unknown) {
  const normalized = normalizeReference(value);
  return normalized.includes("joao") && normalized.includes("reis");
}

const JOAO_BASELINE = {
  scheduled: 15,
  held: 10,
  noShow: 5,
};

const JOAO_TARGET = {
  scheduled: 30,
  held: 24,
  maxNoShow: 6,
  showRate: 0.8,
};

const JOAO_WEEKLY_PLAN = [
  {
    week: "Semana 1",
    theme: "Diagnóstico, foco e instrumentação",
    scheduled: 6,
    held: 4,
    actions: [
      "Auditar 100% dos leads, atividades, tarefas, reuniões e motivos de perda ou no-show disponíveis no Bitrix24.",
      "Classificar a carteira por ICP, prioridade, origem, temperatura, última interação e próximo passo.",
      "Construir o script de abertura, perguntas de diagnóstico e proposta de valor por segmento.",
      "Realizar dois role-plays e revisar cinco conversas reais com feedback objetivo.",
    ],
    deliverable: "Scorecard inicial, script v1, carteira priorizada e campos obrigatórios no CRM.",
  },
  {
    week: "Semana 2",
    theme: "Volume com cadência multicanal",
    scheduled: 7,
    held: 5,
    actions: [
      "Executar dois blocos diários de prospecção sem interrupção, com lista preparada antes do primeiro contato.",
      "Aplicar cadência de 12 tentativas em 15 dias combinando ligação, WhatsApp, e-mail e LinkedIn.",
      "Registrar cada tentativa e deixar sempre uma próxima ação com data, horário e objetivo definidos.",
      "Medir conversão por canal e concentrar energia nas origens que gerarem conversas qualificadas.",
    ],
    deliverable: "Cadência v1 ativa, painel diário e relatório de conversão por canal.",
  },
  {
    week: "Semana 3",
    theme: "Conversão, objeções e prevenção de no-show",
    scheduled: 8,
    held: 7,
    actions: [
      "Treinar tratamento das dez objeções mais recorrentes e criar respostas curtas por contexto.",
      "Enviar convite de calendário imediatamente, com pauta, duração, participantes e benefício esperado.",
      "Aplicar confirmação D-1, lembrete H-2 e mensagem H-15 com opção simples de confirmar ou reagendar.",
      "Executar protocolo de recuperação do no-show em até 5 minutos, 2 horas e 24 horas.",
    ],
    deliverable: "Playbook de objeções, sequência de confirmação e fluxo de recuperação de faltas.",
  },
  {
    week: "Semana 4",
    theme: "Escala, repetição e autonomia",
    scheduled: 9,
    held: 8,
    actions: [
      "Duplicar os canais, mensagens e faixas de horário com melhor conversão observada nas três semanas anteriores.",
      "Reativar leads mornos e no-shows antigos com nova abordagem orientada a valor e urgência real.",
      "Fazer revisão final de calls, ajustar o script e documentar as práticas que João executa melhor.",
      "Fechar o mês com retroativa, plano do ciclo seguinte e metas semanais já carregadas no Bitrix24.",
    ],
    deliverable: "Playbook v2, rotina sustentável e plano de manutenção para o próximo mês.",
  },
];

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

  const [visaoScope, setVisaoScope] = useState<"completa" | "vendedor">("completa");
  const [visaoMonth, setVisaoMonth] = useState<number | "todos">("todos");

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
        const [dealsRes, activityRes, sellersRes, actionItemsRes] = await Promise.all([
          fetch("/api/deals", { cache: "no-store", signal: controller.signal }),
          fetch("/api/activity?limit=500", { cache: "no-store", signal: controller.signal }),
          fetch("/api/sellers", { cache: "no-store", signal: controller.signal }),
          fetch("/api/action-items", { cache: "no-store", signal: controller.signal }),
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
      } catch (error) {
        if (!cancelled && (error as Error).name !== "AbortError") {
          setSyncError("Falha ao sincronizar. Exibindo os últimos dados conhecidos.");
        }
      }
    }

    poll();
    const interval = setInterval(poll, 9000);
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

  async function updateTarget(monthNumber: number, value: number) {
    const year = targets.find((t) => t.monthNumber === monthNumber)?.year ?? 2026;
    const previous = targets;
    setTargets((prev) => {
      const exists = prev.some((t) => t.monthNumber === monthNumber);
      if (exists) {
        return prev.map((t) => (t.monthNumber === monthNumber ? { ...t, target: value } : t));
      }
      return [...prev, { year, monthNumber, month: MONTH_NAMES[monthNumber - 1], target: value }];
    });

    try {
      const res = await fetch(`/api/targets/${year}/${monthNumber}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: value }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Erro ao atualizar meta");
      showToast("success", "Meta atualizada.");
    } catch (error) {
      setTargets(previous);
      showToast("error", error instanceof Error ? error.message : "Erro ao atualizar meta");
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


  const joaoOwnerName = useMemo(() => {
    const exactOwner = owners.find((owner) => referencesJoaoReis(owner));
    const exactSeller = sellers.find((seller) => referencesJoaoReis(seller.name))?.name;
    return exactOwner ?? exactSeller ?? "João Reis";
  }, [owners, sellers]);

  const joaoDeals = useMemo(
    () => deals.filter((deal) => referencesJoaoReis(deal.owner)),
    [deals],
  );

  const joaoAuditEntries = useMemo(
    () =>
      activity.filter((entry) => {
        if (referencesJoaoReis(entry.actorEmail)) return true;
        if (referencesJoaoReis(entry.detailJson)) return true;
        try {
          const detail = JSON.parse(entry.detailJson) as Record<string, unknown>;
          return Object.values(detail).some((value) => referencesJoaoReis(value));
        } catch {
          return false;
        }
      }),
    [activity],
  );

  const joaoAuditMetrics = useMemo(() => {
    const nowMs = new Date(asOf).getTime();
    const recordsWithoutNotes = joaoDeals.filter((deal) => !deal.notes?.trim()).length;
    const recordsWithoutOrigin = joaoDeals.filter(
      (deal) => !deal.origin?.trim() || normalizeReference(deal.origin) === "sem origem",
    ).length;
    const openWithoutRecentUpdate = joaoDeals.filter((deal) => {
      if (deal.stage !== "aberto" && deal.stage !== "ganho") return false;
      const updatedMs = new Date(deal.updatedAt).getTime();
      if (!Number.isFinite(updatedMs) || !Number.isFinite(nowMs)) return false;
      return nowMs - updatedMs > 7 * 86_400_000;
    }).length;
    const registeredNotes = joaoDeals.filter((deal) => Boolean(deal.notes?.trim())).length;
    const activeRecords = joaoDeals.filter(
      (deal) => deal.stage === "aberto" || deal.stage === "ganho",
    ).length;
    const distinctOrigins = new Set(
      joaoDeals.map((deal) => deal.origin).filter(Boolean),
    ).size;

    return {
      recordsWithoutNotes,
      recordsWithoutOrigin,
      openWithoutRecentUpdate,
      registeredNotes,
      activeRecords,
      distinctOrigins,
    };
  }, [joaoDeals, asOf]);

  const joaoCompanyCount = useMemo(
    () =>
      new Set(
        joaoDeals
          .map((deal) => normalizeReference(deal.company))
          .filter(Boolean),
      ).size,
    [joaoDeals],
  );

  const joaoActivityCount = joaoAuditEntries.length;
  const joaoShowRate = JOAO_BASELINE.held / JOAO_BASELINE.scheduled;
  const joaoNoShowRate = JOAO_BASELINE.noShow / JOAO_BASELINE.scheduled;
  const joaoHeldGrowth = JOAO_TARGET.held / JOAO_BASELINE.held - 1;
  const joaoScheduledGrowth = JOAO_TARGET.scheduled / JOAO_BASELINE.scheduled - 1;
  const joaoSchedulesNeededAtCurrentRate = Math.ceil(JOAO_TARGET.held / joaoShowRate);
  const joaoCurrentEfficiencyFactor =
    joaoSchedulesNeededAtCurrentRate / JOAO_BASELINE.scheduled;
  const joaoPlanVolumeFactor = JOAO_TARGET.scheduled / JOAO_BASELINE.scheduled;
  const joaoActivitiesFor24AtCurrentEfficiency =
    joaoActivityCount > 0
      ? Math.ceil(joaoActivityCount * joaoCurrentEfficiencyFactor)
      : null;
  const joaoActivitiesForPlan =
    joaoActivityCount > 0
      ? Math.ceil(joaoActivityCount * joaoPlanVolumeFactor)
      : null;
  const joaoCompaniesFor24AtCurrentEfficiency =
    joaoCompanyCount > 0
      ? Math.ceil(joaoCompanyCount * joaoCurrentEfficiencyFactor)
      : null;
  const joaoCompaniesForPlan =
    joaoCompanyCount > 0
      ? Math.ceil(joaoCompanyCount * joaoPlanVolumeFactor)
      : null;
  const joaoActivityToScheduleRate =
    joaoActivityCount > 0 ? JOAO_BASELINE.scheduled / joaoActivityCount : null;
  const joaoCompanyToScheduleRatio =
    joaoCompanyCount > 0 ? JOAO_BASELINE.scheduled / joaoCompanyCount : null;
  const joaoNoShowsAtCurrentRateFor24 =
    joaoSchedulesNeededAtCurrentRate - JOAO_TARGET.held;
  const joaoWorkDays = 20;

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
    return (
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
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button
          type="button"
          className="brand-lockup"
          onClick={() => setSection("capa")}
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

        {isReadOnly && (
          <div className="readonly-banner">
            <span>Modo somente leitura — entre para criar, editar e mover negócios.</span>
            <a href="/signin-with-chatgpt?return_to=%2F">Entrar</a>
          </div>
        )}

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

            <div className="kpi-grid">
              <article className="kpi-card accent">
                <span>Crescimento de receita YoY</span>
                <strong>
                  {dashboardInsights.yoy.growthPct === null
                    ? "Sem base 2025 comparável"
                    : `${dashboardInsights.yoy.growthPct >= 0 ? "+" : ""}${(dashboardInsights.yoy.growthPct * 100).toFixed(1).replace(".", ",")}%`}
                </strong>
                <small>vendido 2026 vs. 2025 nos meses em comum</small>
              </article>
              <article className="kpi-card">
                <span>Meses acima da meta em 2026</span>
                <strong>
                  {dashboardInsights.yoy.monthsAboveTarget2026}/{dashboardInsights.yoy.totalMonths2026}
                </strong>
                <small>{dashboardInsights.yoy.monthsAtOrBelowTarget2026} mês(es) abaixo da meta</small>
              </article>
              <article className="kpi-card">
                <span>Vendido 2025 (período comparável)</span>
                <strong>{currency.format(dashboardInsights.yoy.sold2025PeriodTotal)}</strong>
                <small>mesmos meses cobertos por 2026</small>
              </article>
              <article className="kpi-card">
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

            <article className="panel dashboard-months-panel">
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
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>

            <article className="panel">
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
              <article className="panel">
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
                  {dashboardInsights.internalBottlenecks.map((item) => (
                    <div key={item.label} className={`bottleneck-item severity-${item.severity}`}>
                      <strong>{item.label}</strong>
                      <p>{item.detail}</p>
                    </div>
                  ))}
                </div>
              </article>

              <article className="panel">
                <div className="panel-heading">
                  <div>
                    <span className="section-kicker">Referência externa</span>
                    <h3>Auditoria Bitrix24</h3>
                  </div>
                  <span className="issue-count">{BITRIX_AUDIT_REFERENCE.source}</span>
                </div>
                <div className="bottleneck-list">
                  {BITRIX_AUDIT_REFERENCE.riscos.map((item) => (
                    <div key={item.label} className="bottleneck-item severity-alta">
                      <strong>{item.label} — {item.value}</strong>
                      <p>{item.detail}</p>
                    </div>
                  ))}
                  {BITRIX_AUDIT_REFERENCE.pioresEtapas.map((item) => (
                    <div key={`${item.pipeline}-${item.etapa}`} className="bottleneck-item severity-média">
                      <strong>{item.pipeline} — {item.dias.toFixed(1).replace(".", ",")}d parado</strong>
                      <p>Pior etapa observada: &quot;{item.etapa}&quot;.</p>
                    </div>
                  ))}
                  {BITRIX_AUDIT_REFERENCE.concentracao.map((item) => (
                    <div key={item.owner} className="bottleneck-item severity-baixa">
                      <strong>{item.owner}</strong>
                      <p>{item.detail}</p>
                    </div>
                  ))}
                </div>
              </article>
            </div>

            <article className="panel action-plan-panel">
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

                <div className="kpi-grid">
                  <article className="kpi-card">
                    <span>Realização da meta</span>
                    <strong>{percent.format(visaoCompanySummary.attainment)}</strong>
                    <small>{healthLabel(visaoCompanySummary.attainment)}</small>
                  </article>
                  <article className="kpi-card">
                    <span>Conversão em receita</span>
                    <strong>{percent.format(visaoCompanySummary.realization)}</strong>
                    <small>ajustado ÷ vendido</small>
                  </article>
                  <article className="kpi-card">
                    <span>Ciclo comercial médio</span>
                    <strong>
                      {visaoCompanySummary.averageSalesCycle.toFixed(1).replace(".", ",")}d
                    </strong>
                    <small>proposta até assinatura</small>
                  </article>
                  <article className="kpi-card accent">
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

                <div className="overview-grid">
                  <article className="panel revenue-panel">
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

                  <article className="panel attention-panel">
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
                  <article className="panel seller-month-panel">
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
              <article className="panel table-panel">
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
              {data.objectives.map((objective) => (
                <article className="okr-card" key={objective.id}>
                  <div className="okr-head">
                    <span>{objective.id}</span>
                    <i>{healthLabel(objective.progress)}</i>
                  </div>
                  <h3>{objective.title}</h3>
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

            <div className="seller-detail-grid">
              <article className="panel seller-month-panel">
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

              <article className="panel seller-summary-panel">
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

            <article className="panel seller-deals-panel">
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
              <article className="panel ranking-panel">
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

              <article className="panel channel-panel">
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

            <article className="panel historical-panel">
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

        {section === "joao-reis" && (
          <section className="page-content">
            <div className="page-intro">
              <div>
                <span className="section-kicker">Performance individual · SDR</span>
                <h2>João Reis: auditoria, reconhecimento e plano de aceleração.</h2>
                <p>
                  Uma leitura executiva do que já gerou impacto positivo, dos gargalos que limitam
                  a conversão e do plano de 30 dias para alcançar pelo menos 24 reuniões realizadas.
                </p>
              </div>
              <span className="security-badge">Meta operacional · 30 agendadas / 24 realizadas</span>
            </div>

            <article
              className="seller-hero"
              style={{
                background:
                  "linear-gradient(135deg, rgba(20, 39, 67, 0.98), rgba(14, 94, 88, 0.92))",
              }}
            >
              <div className="seller-identity">
                <span>{initials(joaoOwnerName)}</span>
                <div>
                  <small>Reconhecimento de performance</small>
                  <h3>Parabéns, {joaoOwnerName}.</h3>
                  <p>
                    As 15 reuniões agendadas colocaram novas oportunidades em movimento e 10 delas
                    viraram conversas reais. Esse resultado já produz impacto positivo no topo do
                    funil. O próximo salto é transformar consistência em escala, protegendo cada
                    agenda contra no-show e elevando a qualidade do registro no Bitrix24.
                  </p>
                </div>
              </div>
              <div className="seller-share">
                <span>Taxa atual de comparecimento</span>
                <strong>{percent.format(joaoShowRate)}</strong>
                <i>
                  <b style={{ width: `${joaoShowRate * 100}%` }} />
                </i>
                <small>Meta do plano: {percent.format(JOAO_TARGET.showRate)}</small>
              </div>
            </article>

            <div className="seller-kpi-grid">
              <article>
                <span>Atividades identificadas</span>
                <strong>{joaoActivityCount > 0 ? joaoActivityCount : "N/D"}</strong>
                <small>
                  {joaoActivityCount > 0
                    ? "Eventos relacionados no recorte da auditoria"
                    : "O recorte carregado não expôs atividades nominais"}
                </small>
              </article>
              <article>
                <span>Empresas identificadas</span>
                <strong>{joaoCompanyCount > 0 ? joaoCompanyCount : "N/D"}</strong>
                <small>
                  {joaoCompanyCount > 0
                    ? "Empresas únicas nos registros atribuídos"
                    : "Nenhuma empresa nominalmente atribuída no conjunto"}
                </small>
              </article>
              <article>
                <span>Reuniões agendadas</span>
                <strong>{JOAO_BASELINE.scheduled}</strong>
                <small>Base atual informada</small>
              </article>
              <article>
                <span>Reuniões realizadas</span>
                <strong>{JOAO_BASELINE.held}</strong>
                <small>{percent.format(joaoShowRate)} de comparecimento</small>
              </article>
              <article>
                <span>No-show</span>
                <strong>{JOAO_BASELINE.noShow}</strong>
                <small>{percent.format(joaoNoShowRate)} das agendas</small>
              </article>
              <article>
                <span>Meta de agendas</span>
                <strong>{JOAO_TARGET.scheduled}</strong>
                <small>+{percent.format(joaoScheduledGrowth)} de volume</small>
              </article>
              <article>
                <span>Meta realizadas</span>
                <strong>{JOAO_TARGET.held}</strong>
                <small>+{percent.format(joaoHeldGrowth)} sobre a base</small>
              </article>
              <article>
                <span>No-show máximo</span>
                <strong>{JOAO_TARGET.maxNoShow}</strong>
                <small>Limite de {percent.format(1 - JOAO_TARGET.showRate)}</small>
              </article>
            </div>

            <article className="panel">
              <div className="panel-heading">
                <div>
                  <span className="section-kicker">Funil completo auditado</span>
                  <h3>Atividades → empresas → agendas → realizadas → no-show</h3>
                </div>
                <span className="issue-count">Conta proporcional do esforço</span>
              </div>
              <p className="dashboard-note">
                As atividades e empresas abaixo são contadas diretamente no recorte disponível:
                eventos nominalmente relacionados a João e empresas únicas nos negócios atribuídos.
                Quando o Bitrix24 não expõe o dado, a tela mostra N/D em vez de transformar ausência
                de evidência em zero. As projeções mantêm a proporção atual de esforço por agenda.
              </p>
              <div className="data-table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Indicador</th>
                      <th>Atual observado</th>
                      <th>Relação atual</th>
                      <th>Somente escala<br />36 agendas / 24 realizadas</th>
                      <th>Plano corrigido<br />30 agendas / 24 realizadas</th>
                      <th>Meta média do plano</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td><strong>Atividades</strong></td>
                      <td>{joaoActivityCount > 0 ? joaoActivityCount : "N/D"}</td>
                      <td>
                        {joaoActivityCount > 0
                          ? `${(joaoActivityCount / JOAO_BASELINE.scheduled).toFixed(1).replace(".", ",")} por agenda`
                          : "Sem base suficiente"}
                      </td>
                      <td>{joaoActivitiesFor24AtCurrentEfficiency ?? "N/D"}</td>
                      <td className="emphasis">{joaoActivitiesForPlan ?? "N/D"}</td>
                      <td>
                        {joaoActivitiesForPlan
                          ? `${Math.ceil(joaoActivitiesForPlan / 4)} por semana · ${Math.ceil(joaoActivitiesForPlan / joaoWorkDays)} por dia`
                          : "Depende da extração integral"}
                      </td>
                    </tr>
                    <tr>
                      <td><strong>Empresas trabalhadas</strong></td>
                      <td>{joaoCompanyCount > 0 ? joaoCompanyCount : "N/D"}</td>
                      <td>
                        {joaoCompanyToScheduleRatio
                          ? `${joaoCompanyToScheduleRatio.toFixed(2).replace(".", ",")} agenda(s) por empresa`
                          : "Sem base suficiente"}
                      </td>
                      <td>{joaoCompaniesFor24AtCurrentEfficiency ?? "N/D"}</td>
                      <td className="emphasis">{joaoCompaniesForPlan ?? "N/D"}</td>
                      <td>
                        {joaoCompaniesForPlan
                          ? `${Math.ceil(joaoCompaniesForPlan / 4)} por semana · ${Math.ceil(joaoCompaniesForPlan / joaoWorkDays)} por dia`
                          : "Depende da atribuição dos negócios"}
                      </td>
                    </tr>
                    <tr>
                      <td><strong>Reuniões agendadas</strong></td>
                      <td>{JOAO_BASELINE.scheduled}</td>
                      <td>
                        {joaoActivityToScheduleRate
                          ? `${percent.format(joaoActivityToScheduleRate)} das atividades viraram agenda`
                          : "Base informada: 15"}
                      </td>
                      <td>{joaoSchedulesNeededAtCurrentRate}</td>
                      <td className="emphasis">{JOAO_TARGET.scheduled}</td>
                      <td>7,5 por semana · 1,5 por dia útil</td>
                    </tr>
                    <tr>
                      <td><strong>Reuniões realizadas</strong></td>
                      <td>{JOAO_BASELINE.held}</td>
                      <td>{percent.format(joaoShowRate)} das agendas</td>
                      <td>{JOAO_TARGET.held}</td>
                      <td className="emphasis">{JOAO_TARGET.held}</td>
                      <td>6 por semana · 1,2 por dia útil</td>
                    </tr>
                    <tr>
                      <td><strong>No-show</strong></td>
                      <td>{JOAO_BASELINE.noShow}</td>
                      <td>{percent.format(joaoNoShowRate)} das agendas</td>
                      <td>{joaoNoShowsAtCurrentRateFor24}</td>
                      <td className="emphasis">Até {JOAO_TARGET.maxNoShow}</td>
                      <td>Até 1,5 por semana · taxa máxima de 20%</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="dashboard-note">
                <strong>Leitura gerencial:</strong> se apenas multiplicarmos o esforço mantendo o
                comparecimento atual, João precisará de {joaoSchedulesNeededAtCurrentRate} agendas e
                poderá acumular cerca de {joaoNoShowsAtCurrentRateFor24} no-shows para chegar a 24
                realizadas. O plano recomendado reduz o desperdício: 30 agendas, 24 realizadas e no
                máximo 6 faltas. Atividades e empresas são ampliadas em {joaoPlanVolumeFactor.toFixed(1).replace(".", ",")}x,
                preservando inicialmente a produtividade histórica e recalibrando-a semanalmente.
              </p>
            </article>

            <article className="panel">
              <div className="panel-heading">
                <div>
                  <span className="section-kicker">Leitura matemática da meta</span>
                  <h3>Por que o alvo operacional precisa ser 30 agendas</h3>
                </div>
                <span className="issue-count">24 realizadas é o piso</span>
              </div>
              <p className="dashboard-note">
                Com a taxa atual de {percent.format(joaoShowRate)}, seriam necessárias aproximadamente
                {" "}{joaoSchedulesNeededAtCurrentRate} agendas para garantir 24 reuniões realizadas.
                O plano reduz essa dependência de volume bruto ao elevar o comparecimento para 80%,
                permitindo trabalhar com 30 agendas e margem de segurança de 6 possíveis ausências.
              </p>
              <div className="data-table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Indicador</th>
                      <th>Atual</th>
                      <th>Meta mínima</th>
                      <th>Meta operacional</th>
                      <th>Variação necessária</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td><strong>Agendadas</strong></td>
                      <td>{JOAO_BASELINE.scheduled}</td>
                      <td>24</td>
                      <td className="emphasis">{JOAO_TARGET.scheduled}</td>
                      <td>+{JOAO_TARGET.scheduled - JOAO_BASELINE.scheduled}</td>
                    </tr>
                    <tr>
                      <td><strong>Realizadas</strong></td>
                      <td>{JOAO_BASELINE.held}</td>
                      <td>24</td>
                      <td className="emphasis">{JOAO_TARGET.held}</td>
                      <td>+{JOAO_TARGET.held - JOAO_BASELINE.held}</td>
                    </tr>
                    <tr>
                      <td><strong>Taxa de comparecimento</strong></td>
                      <td>{percent.format(joaoShowRate)}</td>
                      <td>{percent.format(JOAO_TARGET.showRate)}</td>
                      <td className="emphasis">80% ou mais</td>
                      <td>+{((JOAO_TARGET.showRate - joaoShowRate) * 100).toFixed(1).replace(".", ",")} p.p.</td>
                    </tr>
                    <tr>
                      <td><strong>Taxa de no-show</strong></td>
                      <td>{percent.format(joaoNoShowRate)}</td>
                      <td>Até 20%</td>
                      <td className="emphasis">Até {JOAO_TARGET.maxNoShow} faltas em 30 agendas</td>
                      <td>-{((joaoNoShowRate - (1 - JOAO_TARGET.showRate)) * 100).toFixed(1).replace(".", ",")} p.p.</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </article>

            <div className="dashboard-bottleneck-grid">
              <article className="panel">
                <div className="panel-heading">
                  <div>
                    <span className="section-kicker">Feitos que merecem reconhecimento</span>
                    <h3>Impactos positivos já produzidos</h3>
                  </div>
                  <span className="issue-count">Base para escalar</span>
                </div>
                <div className="bottleneck-list">
                  <div className="bottleneck-item severity-baixa">
                    <strong>15 oportunidades de reunião colocadas no calendário</strong>
                    <p>João já demonstrou capacidade de gerar agenda e movimentar o topo do funil.</p>
                  </div>
                  <div className="bottleneck-item severity-baixa">
                    <strong>10 conversas efetivamente realizadas</strong>
                    <p>Cada reunião realizada cria espaço para diagnóstico, avanço comercial e aprendizagem sobre o mercado.</p>
                  </div>
                  <div className="bottleneck-item severity-baixa">
                    <strong>{joaoDeals.length} registro(s) comercial(is) atribuídos no conjunto carregado</strong>
                    <p>
                      {joaoDeals.length > 0
                        ? `${joaoAuditMetrics.activeRecords} permanecem ativos e ${joaoAuditMetrics.registeredNotes} possuem anotações.`
                        : "O conjunto carregado ainda não expôs negócios atribuídos nominalmente a João Reis."}
                    </p>
                  </div>
                  <div className="bottleneck-item severity-baixa">
                    <strong>{joaoAuditEntries.length} evento(s) identificados na trilha de auditoria disponível</strong>
                    <p>
                      {joaoAuditEntries.length > 0
                        ? "Há evidência rastreável de atuação ou referência ao SDR nos eventos retornados pela API."
                        : "O recorte atual do log não retornou eventos nominalmente atribuídos a João Reis."}
                    </p>
                  </div>
                </div>
              </article>

              <article className="panel">
                <div className="panel-heading">
                  <div>
                    <span className="section-kicker">Gargalos prioritários</span>
                    <h3>O que hoje impede o salto de performance</h3>
                  </div>
                  <span className="issue-count">Ação imediata</span>
                </div>
                <div className="bottleneck-list">
                  <div className="bottleneck-item severity-alta">
                    <strong>No-show de {percent.format(joaoNoShowRate)}</strong>
                    <p>Uma em cada três agendas não se converte em reunião realizada. Esse é o maior vazamento do funil atual.</p>
                  </div>
                  <div className="bottleneck-item severity-alta">
                    <strong>Gap de {JOAO_TARGET.held - JOAO_BASELINE.held} reuniões realizadas</strong>
                    <p>O resultado precisa crescer {percent.format(joaoHeldGrowth)} sem reduzir a qualidade da qualificação.</p>
                  </div>
                  <div className="bottleneck-item severity-média">
                    <strong>Volume atual abaixo da faixa de segurança</strong>
                    <p>Quinze agendas não suportam a meta de 24 realizadas. O plano cria uma margem operacional de 30 agendas.</p>
                  </div>
                  {joaoAuditMetrics.recordsWithoutNotes > 0 && (
                    <div className="bottleneck-item severity-média">
                      <strong>{joaoAuditMetrics.recordsWithoutNotes} registro(s) sem anotação</strong>
                      <p>Sem contexto registrado, o follow-up perde precisão e a gestão não consegue orientar a próxima ação.</p>
                    </div>
                  )}
                  {joaoAuditMetrics.openWithoutRecentUpdate > 0 && (
                    <div className="bottleneck-item severity-média">
                      <strong>{joaoAuditMetrics.openWithoutRecentUpdate} registro(s) ativo(s) sem atualização há mais de 7 dias</strong>
                      <p>Carteira parada tende a envelhecer e consumir energia sem uma próxima ação claramente definida.</p>
                    </div>
                  )}
                  {joaoAuditMetrics.recordsWithoutOrigin > 0 && (
                    <div className="bottleneck-item severity-média">
                      <strong>{joaoAuditMetrics.recordsWithoutOrigin} registro(s) sem origem confiável</strong>
                      <p>A ausência do canal impede descobrir quais fontes geram mais reuniões qualificadas.</p>
                    </div>
                  )}
                </div>
              </article>
            </div>

            <article className="panel activity-panel">
              <div className="panel-heading">
                <div>
                  <span className="section-kicker">Auditoria Bitrix24</span>
                  <h3>Atividades atribuídas ou relacionadas a João Reis</h3>
                </div>
                <span>{joaoAuditEntries.length} eventos no recorte carregado</span>
              </div>
              <p className="dashboard-note">
                O componente consulta atualmente até 500 eventos recentes da API de atividade.
                Esta lista apresenta tudo o que foi encontrado nesse recorte, sem inventar registros.
                Para uma auditoria histórica integral, a rota de atividade deve oferecer paginação completa
                ou filtro por usuário e período.
              </p>
              <div className="activity-list">
                {joaoAuditEntries.length === 0 && (
                  <p className="activity-empty">
                    Nenhum evento nominalmente associado a João Reis apareceu na trilha disponível.
                  </p>
                )}
                {joaoAuditEntries.map((entry) => {
                  const detail = (() => {
                    try {
                      return JSON.parse(entry.detailJson) as Record<string, unknown>;
                    } catch {
                      return {};
                    }
                  })();
                  const detailSummary = Object.entries(detail)
                    .filter(([, value]) => typeof value === "string" || typeof value === "number")
                    .slice(0, 3)
                    .map(([key, value]) => `${key}: ${String(value)}`)
                    .join(" · ");
                  return (
                    <div key={entry.id} className="activity-item">
                      <span className="activity-avatar">JR</span>
                      <span className="activity-copy">
                        <strong>{entry.actorEmail}</strong>{" "}
                        {ACTION_LABELS[entry.action] ?? entry.action}
                        {detailSummary ? ` · ${detailSummary}` : ""}
                      </span>
                      <small>{relativeTimestamp(entry.createdAt)}</small>
                    </div>
                  );
                })}
              </div>
            </article>

            <article className="panel">
              <div className="panel-heading">
                <div>
                  <span className="section-kicker">Plano de 30 dias</span>
                  <h3>Execução semanal para chegar a 30 agendadas e 24 realizadas</h3>
                </div>
                <span className="issue-count">4 semanas · 30 / 24</span>
              </div>
              <div className="data-table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Etapa</th>
                      <th>Foco</th>
                      <th>Escopo desenvolvido com João</th>
                      <th>Entregável</th>
                      <th>Meta semanal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {JOAO_WEEKLY_PLAN.map((item) => (
                      <tr key={item.week}>
                        <td><strong>{item.week}</strong></td>
                        <td>{item.theme}</td>
                        <td>
                          <ol style={{ margin: 0, paddingLeft: "1.1rem" }}>
                            {item.actions.map((action) => <li key={action}>{action}</li>)}
                          </ol>
                        </td>
                        <td>{item.deliverable}</td>
                        <td className="emphasis">
                          {item.scheduled} agendadas<br />
                          {item.held} realizadas
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={4}><strong>Total do ciclo</strong></td>
                      <td className="emphasis"><strong>30 agendadas<br />24 realizadas</strong></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </article>

            <div className="governance-grid">
              <article className="panel rhythm-panel">
                <div className="panel-heading">
                  <div>
                    <span className="section-kicker">Rotina diária do SDR</span>
                    <h3>Blocos que protegem execução e foco</h3>
                  </div>
                </div>
                <div className="rhythm-list">
                  {[
                    ["08:30–10:00", "Prospecção nova", "Lista priorizada, ligações e mensagens personalizadas sem reuniões internas."],
                    ["10:00–10:20", "Follow-up quente", "Responder interessados e avançar leads com sinal recente de intenção."],
                    ["11:30–11:45", "Confirmação D-1", "Confirmar agenda do dia seguinte e oferecer reagendamento simples."],
                    ["14:00–15:00", "Segundo bloco outbound", "Nova rodada multicanal e reativação de leads mornos."],
                    ["16:30–16:50", "Recuperação de no-show", "Contato rápido com faltantes e tentativa de remarcar ainda no mesmo dia."],
                    ["17:15–17:30", "Higiene do Bitrix24", "Atualizar status, motivo, próxima ação, tarefa, notas e resultado do dia."],
                  ].map(([cadence, ritual, evidence], index) => (
                    <div key={cadence}>
                      <span className="rhythm-step">{String(index + 1).padStart(2, "0")}</span>
                      <span><small>{cadence}</small><strong>{ritual}</strong></span>
                      <p>{evidence}</p>
                    </div>
                  ))}
                </div>
              </article>

              <article className="panel approval-panel">
                <div className="panel-heading">
                  <div>
                    <span className="section-kicker">Piso diário inicial</span>
                    <h3>Atividades controláveis</h3>
                  </div>
                </div>
                <ol>
                  <li><strong>50 novos contatos por dia</strong>, priorizados por ICP e potencial.</li>
                  <li><strong>20 follow-ups por dia</strong>, sempre com contexto e próxima ação.</li>
                  <li><strong>10 mensagens altamente personalizadas</strong> para contas prioritárias.</li>
                  <li><strong>4 conversas qualificadas por dia</strong> como indicador intermediário.</li>
                  <li><strong>1,5 reunião agendada por dia útil</strong>, média necessária para 30 no mês.</li>
                  <li><strong>100% das atividades registradas</strong> no Bitrix24 até o fim do expediente.</li>
                </ol>
                <p className="dashboard-note">
                  Esses pisos são uma referência inicial. Após cinco dias úteis, devem ser recalibrados
                  com a conversão real por canal, lista e faixa de horário.
                </p>
              </article>
            </div>

            <div className="dashboard-bottleneck-grid">
              <article className="panel">
                <div className="panel-heading">
                  <div>
                    <span className="section-kicker">Prevenção de no-show</span>
                    <h3>Protocolo obrigatório para cada agenda</h3>
                  </div>
                </div>
                <div className="bottleneck-list">
                  <div className="bottleneck-item severity-baixa">
                    <strong>Imediatamente após o agendamento</strong>
                    <p>Convite no calendário, pauta de três tópicos, duração, link e pedido de aceite.</p>
                  </div>
                  <div className="bottleneck-item severity-baixa">
                    <strong>D-1</strong>
                    <p>Mensagem de confirmação com benefício da conversa e opções “confirmar” ou “reagendar”.</p>
                  </div>
                  <div className="bottleneck-item severity-baixa">
                    <strong>H-2 e H-15</strong>
                    <p>Lembretes curtos, humanos e objetivos, sem excesso de texto.</p>
                  </div>
                  <div className="bottleneck-item severity-média">
                    <strong>Faltou: 5 min, 2 h e 24 h</strong>
                    <p>Tentativas de recuperação em três janelas, com link direto para nova data e motivo do no-show registrado.</p>
                  </div>
                </div>
              </article>

              <article className="panel">
                <div className="panel-heading">
                  <div>
                    <span className="section-kicker">Coaching e gestão</span>
                    <h3>Escopo de acompanhamento com João</h3>
                  </div>
                </div>
                <div className="bottleneck-list">
                  <div className="bottleneck-item severity-baixa">
                    <strong>1 sessão semanal de 60 minutos</strong>
                    <p>Revisão de métricas, prioridades, obstáculos e plano da semana seguinte.</p>
                  </div>
                  <div className="bottleneck-item severity-baixa">
                    <strong>2 role-plays por semana</strong>
                    <p>Abertura, diagnóstico, convite para reunião, objeções e recuperação de no-show.</p>
                  </div>
                  <div className="bottleneck-item severity-baixa">
                    <strong>5 conversas auditadas por semana</strong>
                    <p>Feedback com nota, evidência observável e uma competência prioritária por ciclo.</p>
                  </div>
                  <div className="bottleneck-item severity-baixa">
                    <strong>Check-in diário de 15 minutos nas primeiras duas semanas</strong>
                    <p>Volume, agenda, confirmações, bloqueios e compromissos do dia.</p>
                  </div>
                </div>
              </article>
            </div>

            <article className="panel access-panel">
              <div className="panel-heading">
                <div>
                  <span className="section-kicker">Governança no Bitrix24</span>
                  <h3>Regras de qualidade que sustentam a meta</h3>
                </div>
                <span>Sem dado limpo, não há coaching preciso</span>
              </div>
              <div className="data-table-wrap">
                <table className="data-table access-table">
                  <thead>
                    <tr>
                      <th>Regra</th>
                      <th>Critério de aceite</th>
                      <th>Frequência</th>
                      <th>Responsável</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td><strong>Nenhum lead sem próxima ação</strong></td>
                      <td>Tarefa futura com data, hora e objetivo</td>
                      <td>Diária</td>
                      <td>João Reis</td>
                    </tr>
                    <tr>
                      <td><strong>Reunião com convite e confirmação</strong></td>
                      <td>Calendário aceito, pauta e lembretes programados</td>
                      <td>Por agenda</td>
                      <td>João Reis</td>
                    </tr>
                    <tr>
                      <td><strong>Motivo de no-show obrigatório</strong></td>
                      <td>Categoria, observação e tentativa de recuperação</td>
                      <td>Por falta</td>
                      <td>João Reis</td>
                    </tr>
                    <tr>
                      <td><strong>Auditoria de qualidade</strong></td>
                      <td>Amostra de cinco registros e cinco conversas</td>
                      <td>Semanal</td>
                      <td>Gestor comercial</td>
                    </tr>
                    <tr>
                      <td><strong>Scorecard executivo</strong></td>
                      <td>Agendadas, realizadas, show rate, conversão e origem</td>
                      <td>Semanal e mensal</td>
                      <td>Gestor + João</td>
                    </tr>
                  </tbody>
                </table>
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
              <article className="panel rhythm-panel">
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

              <article className="panel approval-panel">
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

            <article className="panel activity-panel">
              <div className="panel-heading">
                <div>
                  <span className="section-kicker">Trilha de auditoria</span>
                  <h3>Atividade recente</h3>
                </div>
                <span>{activity.length} eventos</span>
              </div>
              <div className="activity-list">
                {activity.length === 0 && (
                  <p className="activity-empty">Nenhuma alteração registrada ainda.</p>
                )}
                {activity.map((entry) => {
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
                      </span>
                      <small>{relativeTimestamp(entry.createdAt)}</small>
                    </div>
                  );
                })}
              </div>
            </article>

            <article className="panel access-panel">
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

            <article className="panel quality-panel">
              <div className="panel-heading">
                <div>
                  <span className="section-kicker">Qualidade da informação</span>
                  <h3>Backlog de saneamento identificado na planilha</h3>
                </div>
                <span>{data.dataQualityIssues.length} itens</span>
              </div>
              <div className="quality-grid">
                {data.dataQualityIssues.map((issue) => (
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

              <article className="panel sheet-panel">
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

        <footer className="app-footer">
          <span>
            Atlas Comercial 360 · Base importada em{" "}
            {new Date(data.meta.generatedAt).toLocaleDateString("pt-BR")}
          </span>
          <span>Segurança · Governança · Previsibilidade</span>
        </footer>
      </main>

      {dealModal && (
        <DealModal
          mode={dealModal.mode}
          initialValues={
            dealModal.mode === "create"
              ? emptyForm({ monthNumber: dealModal.defaultMonthNumber, stage: dealModal.defaultStage })
              : formFromDeal(dealModal.deal)
          }
          owners={owners}
          origins={origins}
          saving={modalSaving}
          errorMessage={modalError}
          onClose={() => {
            setDealModal(null);
            setModalError(null);
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

      {toast && (
        <div className={`app-toast ${toast.tone}`} role="status">
          {toast.message}
        </div>
      )}
    </div>
  );
}
