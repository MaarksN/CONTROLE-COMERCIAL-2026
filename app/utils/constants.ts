import type { Stage } from "../deriveMetrics";
import type { ActionStatus } from "../deriveDashboard";
import type { Section } from "../CommercialControl";

export const SECTION_ICONS: Record<Exclude<Section, "capa">, string> = {
      dashboard: "📊",
      inteligencia: "🧠",
      forecast: "🔭",
      visao: "🗂️",
      pipeline: "🧩",
      okrs: "🎯",
      equipe: "👥",
      governanca: "⚖️",
      dados: "📚",
      integracoes: "🔌",
    };
export const WEEKDAY_LABELS = ["D", "S", "T", "Q", "Q", "S", "S"];
export const ACTION_LABELS: Record<string, string> = {
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
export const STAGE_PILL_CLASS: Record<Stage, string> = {
      aberto: "",
      ganho: "info",
      faturado: "waiting",
      pago: "positive",
    };
export const ACTION_STATUS_LABELS: Record<ActionStatus, string> = {
      pendente: "Pendente",
      andamento: "Em andamento",
      concluido: "Concluído",
    };
export const ACTION_STATUS_ORDER: ActionStatus[] = ["pendente", "andamento", "concluido"];

export function nextActionStatus(status: ActionStatus): ActionStatus {
    const index = ACTION_STATUS_ORDER.indexOf(status);
    return ACTION_STATUS_ORDER[(index + 1) % ACTION_STATUS_ORDER.length];
}

export const navItems: Array<{ id: Exclude<Section, "capa">; label: string; index: string }> = [
      { id: "dashboard", label: "Dashboard", index: "00" },
      { id: "inteligencia", label: "Inteligência de receita", index: "01" },
      { id: "forecast", label: "Forecast & gargalos", index: "02" },
      { id: "visao", label: "Visão completa", index: "03" },
      { id: "pipeline", label: "Negócios", index: "04" },
      { id: "okrs", label: "OKRs", index: "05" },
      { id: "equipe", label: "Equipe & canais", index: "06" },
      { id: "governanca", label: "Governança", index: "07" },
      { id: "dados", label: "Base completa", index: "08" },
      { id: "integracoes", label: "Integrações", index: "09" },
    ];

// Forward-looking growth plan horizon: between 20 and 24 months so a
// seller's targets keep stretching well past the current fiscal year.
export const GROWTH_PLAN_HORIZON_MONTHS = 24;
// Suggested month-over-month increase applied on top of the seller's own
// historical monthly average, compounding across the horizon.
export const GROWTH_PLAN_MONTHLY_INCREASE = 0.03;
