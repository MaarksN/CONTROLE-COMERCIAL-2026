/**
 * Contracts for the modules of the original Enterprise Revenue OS spec that
 * have NO real data source in this application today (no marketing/SDR/CS/
 * financial/NPS integration, no CRM activity log, single-tenant only). Per
 * the spec's own rule — "implemente a arquitetura completa, os contratos e
 * um estado vazio profissional; nunca simule resultados como reais" — this
 * file defines the shape each module's data would take once a real source
 * exists, and `ENTERPRISE_ROADMAP` documents exactly what's missing so nothing
 * is silently dropped. None of these types are populated with fabricated
 * data anywhere in the app; they exist purely as forward-looking contracts.
 */

export type RevenueJourneyStage =
  | "lead"
  | "mql"
  | "sdr"
  | "sql"
  | "reuniao"
  | "oportunidade"
  | "proposta"
  | "fechamento"
  | "implantacao"
  | "ativacao"
  | "sucesso_cliente"
  | "renovacao"
  | "upsell"
  | "financeiro"
  | "nps";

/** One customer's position across the full Marketing→NPS journey. Requires
 * marketing/SDR/CS/financial system integrations that don't exist today. */
export type RevenueJourney = {
  id: string;
  customerId: string;
  currentStage: RevenueJourneyStage;
  origin: string | null;
  campaign: string | null;
  firstContactAt: string | null;
  sdrOwner: string | null;
  closerOwner: string | null;
  csOwner: string | null;
  activatedAt: string | null;
  renewalDueAt: string | null;
  npsScore: number | null;
  churnedAt: string | null;
};

/** Post-sale lifecycle snapshot for a customer — requires a Customer
 * Success / support ticketing integration. */
export type CustomerLifecycle = {
  customerId: string;
  healthStatus: "saudavel" | "atencao" | "risco" | "critico" | null;
  openTickets: number | null;
  lastTicketAt: string | null;
  billingUpToDate: boolean | null;
  npsScore: number | null;
  npsCollectedAt: string | null;
};

export type SimulationAssumption = {
  key: string;
  label: string;
  value: number;
  source: "historico" | "premissa_manual";
};

export type SimulationResult = {
  scenario: "melhor" | "provavel" | "pior";
  projectedRevenue: number;
  requiredPipeline: number;
  requiredLeads: number;
  requiredMeetings: number;
  timeToImpactDays: number;
  confidence: "alta" | "moderada" | "baixa";
};

/** A Digital Twin run — requires enough historical volume (12+ months) to
 * fit real conversion-rate distributions per stage; not safe to compute
 * from ~7 months of data without fabricating precision. */
export type SimulationScenario = {
  id: string;
  title: string;
  createdBy: string;
  createdAt: string;
  assumptions: SimulationAssumption[];
  results: SimulationResult[];
  approvedBy: string | null;
  approvedAt: string | null;
};

/** A single Q&A turn with the future Commercial Copilot. Requires an LLM
 * integration wired to real, permission-scoped data — not built here since
 * this pass explicitly excludes AI-generated text (see deriveAlerts.ts). */
export type AIConversation = {
  id: string;
  userEmail: string;
  question: string;
  answeredAt: string | null;
};

export type AIInsight = {
  id: string;
  conversationId: string;
  fact: string;
  sourceRefs: string[];
  confidence: "alta" | "moderada" | "baixa";
};

export type AIRecommendation = {
  id: string;
  insightId: string;
  action: string;
  requiresHumanConfirmation: boolean;
};

export type AIQueryAudit = {
  id: string;
  userEmail: string;
  question: string;
  filtersApplied: Record<string, unknown>;
  createdAt: string;
};

export type AutomationRule = {
  id: string;
  name: string;
  trigger: string;
  action: string;
  active: boolean;
};

export type AutomationExecution = {
  id: string;
  ruleId: string;
  executedAt: string;
  result: "sucesso" | "falha";
  detail: string | null;
};

export type RoadmapCategory =
  | "revenue_operations"
  | "ai_copilot"
  | "digital_twin"
  | "automation"
  | "customer_revenue"
  | "financial_revenue";

export type RoadmapModule = {
  key: RoadmapCategory;
  title: string;
  summary: string;
  missingData: string[];
  contractTypeNames: string[];
  status: "Arquitetura definida — aguardando fonte de dados";
};

export const ENTERPRISE_ROADMAP: RoadmapModule[] = [
  {
    key: "revenue_operations",
    title: "Revenue Operations — jornada Marketing → NPS",
    summary:
      "Hoje o app só cobre Closer → Faturamento/Pago (via commercial_deals.stage). Não há Marketing, SDR, MQL/SQL, Implantação, CS, Renovação, Upsell ou NPS.",
    missingData: [
      "Integração de marketing (origem de lead, campanha, custo por lead)",
      "Fila/CRM de SDR com estágios MQL/SQL e agendamento de reuniões",
      "Sistema de implantação/ativação pós-venda",
      "Módulo de Customer Success (saúde do cliente, tickets)",
      "Processo de renovação/upsell com datas de vencimento de contrato",
      "Coleta de NPS",
    ],
    contractTypeNames: ["RevenueJourney", "RevenueJourneyStage"],
    status: "Arquitetura definida — aguardando fonte de dados",
  },
  {
    key: "customer_revenue",
    title: "Customer Revenue — ciclo de vida pós-venda",
    summary: "Sem dado de suporte, saúde do cliente ou NPS para calcular retenção/expansão de forma real.",
    missingData: [
      "Integração de suporte/ticketing (contagem e idade de tickets abertos)",
      "Pesquisa de NPS recorrente",
      "Status de billing recorrente (assinatura ativa vs. inadimplente)",
    ],
    contractTypeNames: ["CustomerLifecycle"],
    status: "Arquitetura definida — aguardando fonte de dados",
  },
  {
    key: "financial_revenue",
    title: "Financial Revenue — CAC, LTV, Payback",
    summary:
      "commercial_deals tem receita (sold/adjusted/billed), mas não tem custo de marketing, custo por reunião/oportunidade/venda nem duração de contrato para LTV real.",
    missingData: [
      "Custo de marketing e vendas por período (para CAC)",
      "Duração média de contrato e churn real (para LTV)",
      "Custo por reunião/oportunidade/venda (integração de despesas comerciais)",
    ],
    contractTypeNames: ["RevenueMetric (CAC/LTV/Payback fields)"],
    status: "Arquitetura definida — aguardando fonte de dados",
  },
  {
    key: "ai_copilot",
    title: "Enterprise Commercial Copilot",
    summary:
      "Nenhuma consulta em linguagem natural é respondida por IA nesta versão — todos os textos de alertas/recomendações são templates determinísticos (deriveAlerts.ts), nunca gerados por LLM.",
    missingData: [
      "Integração com um provedor de LLM autorizado para este app",
      "Escopo de permissão por usuário para o que a IA pode consultar",
      "Log de auditoria de perguntas/respostas (AIQueryAudit)",
    ],
    contractTypeNames: ["AIConversation", "AIInsight", "AIRecommendation", "AIQueryAudit"],
    status: "Arquitetura definida — aguardando fonte de dados",
  },
  {
    key: "digital_twin",
    title: "Digital Twin da operação",
    summary:
      "Simulações de cenário (contratar SDR, mudar conversão, etc.) exigem taxas de conversão por etapa validadas estatisticamente. Com ~7 meses de histórico consolidado, qualquer simulação teria precisão artificial — o que o próprio spec proíbe.",
    missingData: [
      "12+ meses de histórico mensal consolidado para validar taxas de conversão por etapa",
      "Aprovação de um formato de premissas assumidas vs. históricas",
    ],
    contractTypeNames: ["SimulationScenario", "SimulationAssumption", "SimulationResult"],
    status: "Arquitetura definida — aguardando fonte de dados",
  },
  {
    key: "automation",
    title: "Automation Center",
    summary: "Nenhuma automação (ex.: criar tarefa automaticamente, notificar Slack/e-mail) está implementada.",
    missingData: [
      "Definição de gatilhos aprovados pelo negócio (ex.: 'negócio parado 15 dias → notificar owner')",
      "Canal de notificação (e-mail/Slack/webhook) autorizado",
    ],
    contractTypeNames: ["AutomationRule", "AutomationExecution"],
    status: "Arquitetura definida — aguardando fonte de dados",
  },
];
