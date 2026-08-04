"use client";

/**
 * Seção "Forecast Comercial" — porta o relatório Bitrix24 para dentro da
 * central, somando a ele a camada que o relatório original não tinha:
 * diagnóstico de gargalos e plano de contenção.
 *
 * A tabela Meta × Vendido lê `monthlyMetrics` da própria central em vez de
 * duplicar os números do relatório, para que as duas visões não divirjam.
 */

import { useMemo, useState, type KeyboardEvent } from "react";
import type { MonthlyMetric } from "./deriveMetrics";
import {
  COUNTING_RULE,
  CONVERSION_RATES,
  CURRENT_FORECAST,
  FORECAST_FOOTNOTE,
  FORECAST_META,
  FUNNEL_PIPELINES,
  FUNNEL_SOURCE_LABELS,
  HEADLINE_KPIS,
  ITEM_CARDS,
  findItemCard,
  type ForecastPortfolio,
  type SellerBreakdown,
} from "./data/forecast-bitrix";
import { analyzeForecast, type Bottleneck, type ContainmentStep } from "./deriveForecastFunnel";
import { findForecastRecords, type ForecastRecord } from "./data/forecast-records";

const currency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 2,
});

const percent = new Intl.NumberFormat("pt-BR", {
  style: "percent",
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const KPI_TONE_CLASS: Record<string, string> = {
  won: "fc-kpi fc-kpi-won",
  open: "fc-kpi fc-kpi-open",
  neutral: "fc-kpi",
  risk: "fc-kpi fc-kpi-risk",
};

/* ------------------------- Gaveta de detalhe ------------------------- */

type DrawerRequest =
  | { kind: "card"; cardId: string }
  | { kind: "combo"; cardIds: [string, string]; title: string; description: string }
  | { kind: "conversion" }
  | { kind: "cnpj" };

type DrawerContent = {
  title: string;
  description: string;
  value: number | null;
  sellers: SellerBreakdown[];
  records: ForecastRecord[];
  mode: "records" | "conversion" | "cnpj";
};

const KPI_DRAWER_REQUEST: Record<string, DrawerRequest> = {
  "vendas-confirmadas": { kind: "card", cardId: "contratos-assinados" },
  "pipeline-aberto": {
    kind: "combo",
    cardIds: ["em-negociacao", "em-processo-financeiro"],
    title: "Pipeline em Aberto (Forecast)",
    description:
      'Soma de "Em Negociação" (Pipeline Negócios) + "Em Processo no Pipeline Financeiro" — ' +
      "oportunidades ainda não fechadas, visão do momento atual.",
  },
  "conversao-geral": { kind: "conversion" },
  "cobertura-cnpj": { kind: "cnpj" },
};

/** Soma as quebras por vendedor de dois cards, para as gavetas combinadas (KPIs). */
function mergeSellers(a: SellerBreakdown[], b: SellerBreakdown[]): SellerBreakdown[] {
  const map = new Map<string, SellerBreakdown>();
  for (const row of a) map.set(row.seller, { ...row, value: row.value ?? 0 });
  for (const row of b) {
    const existing = map.get(row.seller);
    if (existing) {
      existing.count += row.count;
      existing.value = (existing.value ?? 0) + (row.value ?? 0);
    } else {
      map.set(row.seller, { ...row, value: row.value ?? 0 });
    }
  }
  return [...map.values()].sort((x, y) => y.count - x.count);
}

function resolveDrawerContent(request: DrawerRequest): DrawerContent | null {
  if (request.kind === "conversion") {
    return {
      title: "Taxa de conversão geral",
      description:
        "Conversão etapa a etapa do funil em julho/2026: do lead recebido até o contrato assinado.",
      value: null,
      sellers: [],
      records: [],
      mode: "conversion",
    };
  }

  if (request.kind === "cnpj") {
    const processo = findItemCard("em-processo-financeiro");
    const assinados = findItemCard("contratos-assinados");
    const records = [
      ...findForecastRecords("em-processo-financeiro"),
      ...findForecastRecords("contratos-assinados"),
    ];
    return {
      title: "Cobertura de CNPJ no CRM",
      description:
        "Clientes do Pipeline Financeiro (em processo + contratos assinados) em julho/2026, com o " +
        "status de cadastro de CNPJ no Bitrix24.",
      value: null,
      sellers: mergeSellers(processo?.sellers ?? [], assinados?.sellers ?? []),
      records,
      mode: "cnpj",
    };
  }

  if (request.kind === "card") {
    const card = findItemCard(request.cardId);
    if (!card) return null;
    return {
      title: `${card.title} (${card.records})`,
      description: card.description,
      value: card.value,
      sellers: card.sellers,
      records: findForecastRecords(card.id),
      mode: "records",
    };
  }

  const [idA, idB] = request.cardIds;
  const cardA = findItemCard(idA);
  const cardB = findItemCard(idB);
  if (!cardA || !cardB) return null;
  return {
    title: request.title,
    description: request.description,
    value: (cardA.value ?? 0) + (cardB.value ?? 0),
    sellers: mergeSellers(cardA.sellers, cardB.sellers),
    records: [...findForecastRecords(idA), ...findForecastRecords(idB)],
    mode: "records",
  };
}

type Props = {
  monthlyMetrics: MonthlyMetric[];
  /**
   * Saldo acumulado calculado pela central. Serve de reserva: a seção prefere
   * o saldo dos meses efetivamente realizados, porque o acumulado da central
   * já debita a meta cheia do mês corrente antes de ele terminar.
   */
  ytdGap: number;
};

export function ForecastSection({ monthlyMetrics, ytdGap }: Props) {
  const quarters = useMemo(() => computeQuarters(monthlyMetrics), [monthlyMetrics]);
  const cutoffMonth = useMemo(() => lastRealizedMonth(monthlyMetrics), [monthlyMetrics]);
  const totalBalance = quarters.reduce((sum, q) => sum + q.balance, 0);
  const pendingTarget = monthlyMetrics
    .filter((m) => m.monthNumber > cutoffMonth)
    .reduce((sum, m) => sum + m.target, 0);

  // A análise planeja contra a obrigação total até dezembro: recuperar o saldo
  // já perdido MAIS entregar as metas dos meses que ainda não aconteceram.
  // Dimensionar só pelo déficit acumulado faria a operação parecer folgada.
  const analysisGap = cutoffMonth > 0 ? totalBalance - pendingTarget : ytdGap;
  const analysis = useMemo(() => analyzeForecast(analysisGap), [analysisGap]);
  const [openBottleneck, setOpenBottleneck] = useState<string | null>(
    analysis.bottlenecks[0]?.id ?? null,
  );
  const [activePortfolio, setActivePortfolio] = useState<ForecastPortfolio>("forecast");
  const [drawer, setDrawer] = useState<DrawerRequest | null>(null);

  const portfolios = useMemo(() => {
    return (Object.entries(CURRENT_FORECAST.portfolios) as Array<
      [ForecastPortfolio, (typeof CURRENT_FORECAST.portfolios)[ForecastPortfolio]]
    >).map(([id, portfolio]) => ({
      id,
      ...portfolio,
      count: "count" in portfolio ? portfolio.count : portfolio.items.length,
      value:
        "value" in portfolio
          ? portfolio.value
          : portfolio.items.reduce((sum, item) => sum + item.value, 0),
    }));
  }, []);
  const selectedPortfolio = portfolios.find((portfolio) => portfolio.id === activePortfolio)!;
  const totalPotential = portfolios.reduce((sum, portfolio) => sum + portfolio.value, 0);

  const stepsByBottleneck = useMemo(() => {
    const grouped = new Map<string, ContainmentStep[]>();
    for (const step of analysis.plan) {
      const list = grouped.get(step.bottleneckId) ?? [];
      list.push(step);
      grouped.set(step.bottleneckId, list);
    }
    return grouped;
  }, [analysis.plan]);

  return (
    <section className="page-content">
      {/* ----------------------------- Cabeçalho ---------------------------- */}
      <header className="fc-band">
        <div className="fc-band-top">
          <span className="fc-band-logo"><img src="/atlas-logo.png" alt="Atlas GR" /></span>
          <div className="fc-band-title">
            <h2>{FORECAST_META.title}</h2>
            <p>{FORECAST_META.flow}</p>
          </div>
        </div>
        <span className="fc-band-pill">
          Competência {FORECAST_META.competence} · gerado em {FORECAST_META.generatedAtLabel}
        </span>
      </header>

      <section className="fc-live" aria-labelledby="fc-live-title">
        <div className="fc-live-heading">
          <div>
            <span className="fc-live-eyebrow">Posição comercial atualizada</span>
            <h3 id="fc-live-title">Do contrato em assinatura à próxima venda</h3>
            <p>{CURRENT_FORECAST.source} · atualizado em {CURRENT_FORECAST.updatedAtLabel}</p>
          </div>
          <div className="fc-live-total">
            <span>Volume comercial mapeado</span>
            <strong>{currency.format(totalPotential)}</strong>
            <small>{portfolios.reduce((sum, item) => sum + item.count, 0)} negócios em visão</small>
          </div>
        </div>

        <div className="fc-portfolio-tabs" role="tablist" aria-label="Carteiras do forecast">
          {portfolios.map((portfolio) => (
            <button
              key={portfolio.id}
              type="button"
              role="tab"
              aria-selected={activePortfolio === portfolio.id}
              className={`fc-portfolio-tab fc-portfolio-${portfolio.tone}`}
              onClick={() => setActivePortfolio(portfolio.id)}
            >
              <span>{portfolio.label}</span>
              <strong>{portfolio.count}</strong>
              <small>{currency.format(portfolio.value)}</small>
            </button>
          ))}
        </div>

        <div className="fc-portfolio-detail" role="tabpanel">
          <div className="fc-portfolio-detail-head">
            <div>
              <span className={`fc-status-dot fc-dot-${selectedPortfolio.tone}`} />
              <h4>{selectedPortfolio.label}</h4>
            </div>
            <p>{selectedPortfolio.caption}</p>
          </div>
          {selectedPortfolio.items.length > 0 ? (
            <div className="fc-opportunity-grid">
              {selectedPortfolio.items.map((item) => (
                <article key={`${activePortfolio}-${item.company}`} className="fc-opportunity">
                  <div>
                    <strong>{item.company}</strong>
                    <span>{item.owner}</span>
                  </div>
                  <div>
                    {"origin" in item && item.origin && <small>{item.origin}</small>}
                    <b>{currency.format(item.value)}</b>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="fc-won-summary">
              <strong>{selectedPortfolio.count} contratos consolidados</strong>
              <span>O detalhe nominal permanece na base auditada para preservar a rastreabilidade.</span>
            </div>
          )}
        </div>
      </section>

      <div className="fc-heading fc-heading-history">
        <h3>Auditoria histórica do funil</h3>
      </div>

      <div className="fc-kpi-grid">
        {HEADLINE_KPIS.map((kpi) => {
          const request = KPI_DRAWER_REQUEST[kpi.id];
          return (
            <article
              key={kpi.id}
              className={`${KPI_TONE_CLASS[kpi.tone] ?? "fc-kpi"}${request ? " fc-clickable" : ""}`}
              {...(request
                ? {
                    role: "button",
                    tabIndex: 0,
                    onClick: () => setDrawer(request),
                    onKeyDown: (event: KeyboardEvent) => {
                      if (event.key === "Enter" || event.key === " ") setDrawer(request);
                    },
                  }
                : {})}
            >
              <span>{kpi.label}</span>
              <strong>{kpi.value}</strong>
              <small>{kpi.caption}</small>
              {request && <span className="fc-item-cta">Ver detalhe →</span>}
            </article>
          );
        })}
      </div>

      <p className="fc-callout">
        <b>{COUNTING_RULE.headline}:</b> {COUNTING_RULE.body}
      </p>

      {/* -------------------------- Leitura executiva ----------------------- */}
      <div className="fc-heading">
        <h3>O que estes números dizem</h3>
      </div>

      <article className="panel rounded-3xl glassmorphism">
        <div className="panel-heading">
          <div>
            <span className="section-kicker">Forecast ponderado</span>
            <h3>
              {currency.format(analysis.forecast.rawPipeline)} de pipeline valem{" "}
              {currency.format(analysis.forecast.weightedTotal)}
            </h3>
          </div>
        </div>
        <p className="dashboard-note">
          Tratar o pipeline aberto como receita superestima o mês em{" "}
          {currency.format(analysis.forecast.rawPipeline - analysis.forecast.weightedTotal)}. Cada
          bloco só vale a probabilidade de atravessar as etapas que ainda faltam — e essas
          probabilidades são as taxas reais do próprio funil, não um chute.
        </p>
        <div className="fc-table-wrap">
          <table className="fc-table">
            <thead>
              <tr>
                <th>Bloco do pipeline</th>
                <th>Valor bruto</th>
                <th>Etapas restantes</th>
                <th>Probabilidade</th>
                <th>Valor ponderado</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th>Em Negociação (Avan)</th>
                <td>{currency.format(analysis.forecast.negotiationValue)}</td>
                <td>proposta → aprovação → financeiro</td>
                <td>{percent.format(analysis.forecast.negotiationProbability)}</td>
                <td>{currency.format(analysis.forecast.negotiationWeighted)}</td>
              </tr>
              <tr>
                <th>Em Processo (Financeiro)</th>
                <td>{currency.format(analysis.forecast.financeValue)}</td>
                <td>assinatura</td>
                <td>{percent.format(analysis.forecast.financeProbability)}</td>
                <td>{currency.format(analysis.forecast.financeWeighted)}</td>
              </tr>
              <tr className="fc-table-row-accent">
                <th>Total</th>
                <td>{currency.format(analysis.forecast.rawPipeline)}</td>
                <td>—</td>
                <td>{percent.format(analysis.forecast.weightedShareOfRaw)}</td>
                <td>
                  <strong>{currency.format(analysis.forecast.weightedTotal)}</strong>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </article>

      <article className="panel rounded-3xl glassmorphism">
        <div className="panel-heading">
          <div>
            <span className="section-kicker">Dimensionamento do gap</span>
            <h3>
              Faltam {analysis.closure.contractsNeeded} contratos —{" "}
              {analysis.closure.volumeIsSufficient
                ? "e leads não são o problema"
                : "e mídia não resolve"}
            </h3>
          </div>
        </div>
        <p className="dashboard-note">
          A obrigação até dezembro é de {currency.format(analysis.closure.gap)}:{" "}
          {currency.format(Math.abs(totalBalance))} de saldo já perdido mais{" "}
          {currency.format(pendingTarget)} de metas ainda não realizadas. Com ticket médio de{" "}
          {currency.format(analysis.closure.wonTicket)}, isso são{" "}
          {analysis.closure.contractsNeeded} contratos. Pela taxa publicada bastariam{" "}
          {analysis.closure.leadsAtReportedRate} leads; pela conversão encadeada,{" "}
          {analysis.closure.leadsAtChainedRate} —{" "}
          {analysis.closure.leadsUnderestimatedBy.toFixed(1)}× mais.
        </p>
        <p className="dashboard-note">
          {analysis.closure.volumeIsSufficient ? (
            <>
              No ritmo atual de {analysis.closure.currentMonthlyLeads} leads/mês a operação gerará{" "}
              {analysis.closure.leadsAvailableRemaining} leads em{" "}
              {analysis.closure.monthsRemaining} meses — folga de{" "}
              {analysis.closure.leadSurplus}. O gargalo é conversão, não geração.
            </>
          ) : (
            <>
              No ritmo atual serão {analysis.closure.leadsAvailableRemaining} leads em{" "}
              {analysis.closure.monthsRemaining} meses, contra{" "}
              {analysis.closure.leadsAtChainedRate} necessários pela conversão de hoje. Não existe
              volume de mídia que cubra isso: a única saída viável é elevar a conversão para{" "}
              {percent.format(analysis.closure.conversionNeededAtCurrentVolume)} — hoje em{" "}
              {percent.format(analysis.chain.leadToContract)}.
            </>
          )}
        </p>
        <p className="fc-caveat">{analysis.closure.scopeNote}</p>
      </article>

      {/* ------------------------------ Gargalos ---------------------------- */}
      <div className="fc-heading">
        <h3>Gargalos priorizados por impacto</h3>
      </div>

      {analysis.bottlenecks.map((bottleneck) => (
        <BottleneckCard
          key={bottleneck.id}
          bottleneck={bottleneck}
          steps={stepsByBottleneck.get(bottleneck.id) ?? []}
          expanded={openBottleneck === bottleneck.id}
          onToggle={() =>
            setOpenBottleneck((current) => (current === bottleneck.id ? null : bottleneck.id))
          }
        />
      ))}

      {/* ------------------------- Taxas de conversão ----------------------- */}
      <div className="fc-heading">
        <h3>Taxa de conversão por etapa do funil</h3>
      </div>

      <div className="fc-rate-grid">
        {CONVERSION_RATES.map((rate) => (
          <article key={rate.id} className="fc-rate">
            <span className="fc-rate-source">{FUNNEL_SOURCE_LABELS[rate.source]}</span>
            <span className="fc-rate-flow">
              {rate.from} → {rate.to}
            </span>
            <strong>{percent.format(rate.rate)}</strong>
            <i className="fc-bar">
              <b style={{ width: `${Math.min(rate.rate * 100, 100)}%` }} />
            </i>
          </article>
        ))}
      </div>

      {/* ------------------------------- Funis ------------------------------ */}
      <div className="fc-heading">
        <h3>Funil de cada etapa</h3>
      </div>

      {FUNNEL_PIPELINES.map((pipeline) => {
        const top = pipeline.stages[0]?.count ?? 1;
        return (
          <article key={pipeline.source} className="fc-funnel">
            <h4>{FUNNEL_SOURCE_LABELS[pipeline.source]}</h4>
            <p>{pipeline.note}</p>
            {pipeline.stages.map((stage, index) => (
              <div key={stage.label}>
                <div className="fc-funnel-row">
                  <span>{stage.label}</span>
                  <i className="fc-funnel-track">
                    <i
                      data-depth={index}
                      style={{ width: `${top === 0 ? 0 : (stage.count / top) * 100}%` }}
                    />
                  </i>
                  <b>{stage.count}</b>
                </div>
                {stage.rateFromPrevious !== null && (
                  <p className="fc-funnel-note">
                    ↳ {percent.format(stage.rateFromPrevious)} em relação à etapa anterior
                  </p>
                )}
              </div>
            ))}
            <p className="fc-funnel-foot">▸ {pipeline.sellerCount} vendedores com funil próprio</p>
          </article>
        );
      })}

      {/* --------------------------- Cards por item ------------------------- */}
      <div className="fc-heading">
        <h3>Visão geral por item</h3>
      </div>

      <div className="fc-item-grid">
        {ITEM_CARDS.map((card) => (
          <article
            key={card.id}
            className={`fc-item fc-item-${card.tone} fc-clickable`}
            role="button"
            tabIndex={0}
            onClick={() => setDrawer({ kind: "card", cardId: card.id })}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                setDrawer({ kind: "card", cardId: card.id });
              }
            }}
          >
            <span className="fc-item-source">{FUNNEL_SOURCE_LABELS[card.source]}</span>
            <h4>{card.title}</h4>
            <p>{card.description}</p>
            <div className="fc-item-count">
              <strong>{card.records}</strong>
              <span>registros</span>
            </div>
            {card.value !== null && (
              <span className="fc-item-value">{currency.format(card.value)}</span>
            )}
            <div className="fc-item-sellers">
              {card.sellers.map((seller) => (
                <div key={seller.seller} className="fc-seller-row">
                  <span>{seller.seller}</span>
                  <i>{seller.count}</i>
                  <b>{seller.value === null ? "—" : currency.format(seller.value)}</b>
                </div>
              ))}
            </div>
            <span className="fc-item-cta">Ver todos os itens →</span>
          </article>
        ))}
      </div>

      {/* ------------------------ Eficiência por vendedor -------------------- */}
      <div className="fc-heading">
        <h3>Onde os leads vão x quem converte</h3>
      </div>

      <article className="panel rounded-3xl glassmorphism">
        <p className="dashboard-note">
          Cruzamento entre &ldquo;Leads Recebidos&rdquo; e &ldquo;Reuniões Agendadas&rdquo; do mesmo
          mês. A coluna de desvio compara cada vendedor com a média do time (
          {percent.format(analysis.allocation.teamConversion)}).
        </p>
        <div className="fc-table-wrap">
          <table className="fc-table">
            <thead>
              <tr>
                <th>Vendedor</th>
                <th>Leads</th>
                <th>% dos leads</th>
                <th>Reuniões</th>
                <th>% das reuniões</th>
                <th>Conversão</th>
                <th>Desvio vs time</th>
              </tr>
            </thead>
            <tbody>
              {analysis.allocation.sellers.map((seller) => (
                <tr key={seller.seller}>
                  <th>{seller.seller}</th>
                  <td>{seller.leads}</td>
                  <td>{percent.format(seller.leadShare)}</td>
                  <td>{seller.meetings}</td>
                  <td>{percent.format(seller.meetingShare)}</td>
                  <td className={seller.deltaVsTeam >= 0 ? "fc-pos" : "fc-neg"}>
                    {percent.format(seller.conversion)}
                  </td>
                  <td className={seller.deltaVsTeam >= 0 ? "fc-pos" : "fc-neg"}>
                    {seller.deltaVsTeam >= 0 ? "+" : ""}
                    {percent.format(seller.deltaVsTeam)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>

      {/* ----------------------- Integridade de valor ----------------------- */}
      <div className="fc-heading">
        <h3>Integridade do valor no CRM</h3>
      </div>

      <article className="panel rounded-3xl glassmorphism">
        <p className="dashboard-note">
          Ticket dos negócios perdidos contra o ticket que o vendedor de fato fecha. Um fator alto
          indica valor inflado no cadastro — que contamina o forecast — e não necessariamente perda
          real de receita.
        </p>
        <div className="fc-table-wrap">
          <table className="fc-table">
            <thead>
              <tr>
                <th>Vendedor</th>
                <th>Perdidos</th>
                <th>Valor perdido</th>
                <th>Ticket perdido</th>
                <th>Ganhos</th>
                <th>Ticket ganho</th>
                <th>Fator</th>
              </tr>
            </thead>
            <tbody>
              {analysis.integrity.map((row) => (
                <tr key={row.seller}>
                  <th>{row.seller}</th>
                  <td>{row.lostDeals}</td>
                  <td className="fc-neg">{currency.format(row.lostValue)}</td>
                  <td>{currency.format(row.lostTicket)}</td>
                  <td>{row.wonDeals}</td>
                  <td>{row.wonTicket === 0 ? "—" : currency.format(row.wonTicket)}</td>
                  <td className={row.inflationFactor > 3 ? "fc-neg" : "fc-zero"}>
                    {row.inflationFactor === 0 ? "—" : `${row.inflationFactor.toFixed(1)}×`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>

      {/* --------------------------- Meta x vendido ------------------------- */}
      <div className="fc-heading">
        <h3>Meta × vendido — 2026</h3>
      </div>

      <div className="fc-table-wrap">
        <table className="fc-table">
          <thead>
            <tr>
              <th>Indicador</th>
              {monthlyMetrics.map((metric) => (
                <th key={metric.monthNumber}>{metric.month}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <th>Meta</th>
              {monthlyMetrics.map((m) => (
                <td key={m.monthNumber}>{currency.format(m.target)}</td>
              ))}
            </tr>
            <tr>
              <th>Vendido</th>
              {monthlyMetrics.map((m) => (
                <td key={m.monthNumber}>{currency.format(m.sold)}</td>
              ))}
            </tr>
            <tr>
              <th>Valor ajustado</th>
              {monthlyMetrics.map((m) => (
                <td key={m.monthNumber}>{currency.format(m.adjusted)}</td>
              ))}
            </tr>
            <tr>
              <th>% Ajuste</th>
              {monthlyMetrics.map((m) => (
                <td key={m.monthNumber} className={m.adjustmentRate < 0 ? "fc-neg" : "fc-zero"}>
                  {m.monthNumber > cutoffMonth ? "—" : percent.format(m.adjustmentRate)}
                </td>
              ))}
            </tr>
            <tr>
              <th>Saldo</th>
              {monthlyMetrics.map((m) => (
                <td
                  key={m.monthNumber}
                  className={
                    m.monthNumber > cutoffMonth ? "fc-zero" : m.gap < 0 ? "fc-neg" : "fc-pos"
                  }
                >
                  {m.monthNumber > cutoffMonth ? "a realizar" : currency.format(m.gap)}
                </td>
              ))}
            </tr>
            <tr className="fc-table-row-accent">
              <th>% Meta</th>
              {monthlyMetrics.map((m) => (
                <td
                  key={m.monthNumber}
                  className={
                    m.monthNumber > cutoffMonth ? "fc-zero" : m.attainment >= 1 ? "fc-pos" : "fc-neg"
                  }
                >
                  {m.monthNumber > cutoffMonth ? "—" : percent.format(m.attainment)}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <div className="fc-quarter-grid">
        {quarters.map((quarter) => (
          <article key={quarter.label} className="fc-quarter">
            <span>Saldo {quarter.label}</span>
            <strong className={quarter.balance < 0 ? "fc-neg" : "fc-pos"}>
              {currency.format(quarter.balance)}
            </strong>
          </article>
        ))}
        <article className="fc-quarter fc-quarter-total">
          <span>Saldo realizado 2026</span>
          <strong className={totalBalance < 0 ? "fc-neg" : "fc-pos"}>
            {currency.format(totalBalance)}
          </strong>
        </article>
      </div>

      <p className="fc-caveat">
        O saldo soma apenas os meses já realizados (até{" "}
        {monthlyMetrics.find((m) => m.monthNumber === cutoffMonth)?.month.toLowerCase() ?? "—"}).
        Contar a meta cheia dos meses que ainda não aconteceram como déficit transformaria
        compromisso futuro em prejuízo realizado. Restam{" "}
        <strong>{currency.format(pendingTarget)}</strong> de meta a cumprir no período não
        realizado — esse valor é adicional ao saldo acima.
      </p>

      <p className="fc-footnote">{FORECAST_FOOTNOTE}</p>

      <ForecastDrawer request={drawer} onClose={() => setDrawer(null)} />
    </section>
  );
}

/* -------------------------------------------------------------------- */

function BottleneckCard({
  bottleneck,
  steps,
  expanded,
  onToggle,
}: {
  bottleneck: Bottleneck;
  steps: ContainmentStep[];
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <article className="fc-bottleneck">
      <div className="fc-bottleneck-head">
        <span className="fc-rank">{bottleneck.rank}</span>
        <h4>{bottleneck.title}</h4>
        <span className={`fc-tag fc-tag-${bottleneck.severity}`}>{bottleneck.severity}</span>
        <span className="fc-tag fc-tag-conf">confiança {bottleneck.confidence}</span>
      </div>

      <span className="fc-bottleneck-headline">{bottleneck.headline}</span>
      <p>{bottleneck.finding}</p>
      <p className="fc-bottleneck-impact">{bottleneck.impact}</p>

      <button type="button" className="fc-funnel-foot" onClick={onToggle}>
        {expanded ? "▾" : "▸"} Evidência e próximo passo ({steps.length})
      </button>

      {expanded && (
        <>
          <ul className="fc-evidence">
            {bottleneck.evidence.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>

          {steps.map((step) => (
            <div key={step.order} className="fc-step">
              <span className="fc-step-order">{step.order}</span>
              <div className="fc-step-body">
                <p>{step.action}</p>
                <div className="fc-step-meta">
                  <span className={step.horizon === "72h" ? "fc-chip fc-chip-urgent" : "fc-chip"}>
                    Prazo <b>{step.horizon}</b>
                  </span>
                  <span className="fc-chip">
                    Dono <b>{step.owner}</b>
                  </span>
                  <span className="fc-chip">
                    Esforço <b>{step.effort}</b>
                  </span>
                </div>
                <span className="fc-step-target">Meta: {step.target}</span>
                <span className="fc-step-evidence">Evidência de aceite: {step.evidence}</span>
              </div>
            </div>
          ))}

          {bottleneck.caveat && <p className="fc-caveat">Limite do dado: {bottleneck.caveat}</p>}
        </>
      )}
    </article>
  );
}

/* -------------------------------------------------------------------- */

function ForecastDrawer({
  request,
  onClose,
}: {
  request: DrawerRequest | null;
  onClose: () => void;
}) {
  const content = request ? resolveDrawerContent(request) : null;

  return (
    <div
      className={`fc-overlay${content ? " fc-overlay-open" : ""}`}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      {content && (
        <div className="fc-drawer">
          <div className="fc-drawer-head">
            <div>
              <h3>{content.title}</h3>
              <p>{content.description}</p>
            </div>
            <button type="button" className="fc-drawer-close" onClick={onClose} aria-label="Fechar">
              ✕
            </button>
          </div>
          <div className="fc-drawer-body">
            {content.mode === "conversion" ? (
              <div className="fc-rate-grid">
                {CONVERSION_RATES.map((rate) => (
                  <article key={rate.id} className="fc-rate">
                    <span className="fc-rate-source">{FUNNEL_SOURCE_LABELS[rate.source]}</span>
                    <span className="fc-rate-flow">
                      {rate.from} → {rate.to}
                    </span>
                    <strong>{percent.format(rate.rate)}</strong>
                    <i className="fc-bar">
                      <b style={{ width: `${Math.min(rate.rate * 100, 100)}%` }} />
                    </i>
                  </article>
                ))}
              </div>
            ) : (
              <>
                {content.sellers.length > 0 && (
                  <div className="fc-drawer-summary">
                    <span className="fc-drawer-summary-label">Total geral</span>
                    <div className="fc-drawer-summary-main">
                      <span className="fc-drawer-summary-count">{content.records.length}</span>
                      <span className="fc-drawer-summary-count-label">
                        registro{content.records.length === 1 ? "" : "s"} no total
                      </span>
                      {content.value !== null && (
                        <span className="fc-drawer-summary-value">
                          {currency.format(content.value)}
                        </span>
                      )}
                    </div>
                    <div className="fc-drawer-summary-breakdown">
                      {content.sellers.map((seller) => (
                        <span key={seller.seller}>
                          <b>{seller.seller}:</b> {seller.count} registro
                          {seller.count === 1 ? "" : "s"}
                          {seller.value ? ` · ${currency.format(seller.value)}` : ""}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {content.mode === "cnpj" ? (
                  <div className="fc-table-wrap">
                    <table className="fc-table">
                      <thead>
                        <tr>
                          <th>Empresa</th>
                          <th>Responsável</th>
                          <th>Valor</th>
                          <th>CNPJ no CRM</th>
                        </tr>
                      </thead>
                      <tbody>
                        {content.records.map((record) => (
                          <tr key={record.id}>
                            <th>{record.company ?? record.title}</th>
                            <td>{record.owner}</td>
                            <td>{record.valueFmt}</td>
                            <td>
                              {record.cnpjStatus === "cadastrado no CRM" ? (
                                <span className="fc-cnpj-pill fc-cnpj-ok">
                                  Cadastrado ({record.cnpj})
                                </span>
                              ) : record.cnpjStatus?.includes("Bitrix24") ? (
                                <span className="fc-cnpj-pill fc-cnpj-missing">
                                  Não cadastrado
                                </span>
                              ) : (
                                <span className="fc-rec-k">não informado nesta fonte</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="fc-rec-grid">
                    {content.records.map((record) => (
                      <RecordCard key={record.id} record={record} />
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function RecordCard({ record }: { record: ForecastRecord }) {
  const hasEvidence = record.cnpjStatus !== undefined || record.contactName !== undefined;
  const stageLine = [record.stage, record.signedDate ? `assinado em ${record.signedDate}` : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <article className="fc-rec-card">
      <div className="fc-rec-title">{record.title}</div>
      {stageLine && <div className="fc-rec-stage">{stageLine}</div>}

      {hasEvidence ? (
        <>
          {(record.cnpj || record.cnpjStatus?.includes("Bitrix24")) && (
            <div className="fc-rec-row">
              <span className="fc-rec-k">CNPJ</span>
              <span className="fc-rec-v">
                {record.cnpj ? (
                  <span className="fc-cnpj-pill fc-cnpj-ok">{record.cnpj}</span>
                ) : (
                  <span className="fc-cnpj-pill fc-cnpj-missing">não cadastrado no CRM</span>
                )}
              </span>
            </div>
          )}
          {record.contactName && (
            <div className="fc-rec-row">
              <span className="fc-rec-k">Contato</span>
              <span className="fc-rec-v">{record.contactName}</span>
            </div>
          )}
          {record.contactPhone && (
            <div className="fc-rec-row">
              <span className="fc-rec-k">Telefone</span>
              <span className="fc-rec-v">{record.contactPhone}</span>
            </div>
          )}
          {record.contactEmail && (
            <div className="fc-rec-row">
              <span className="fc-rec-k">E-mail</span>
              <span className="fc-rec-v">{record.contactEmail}</span>
            </div>
          )}
          <div className="fc-rec-row">
            <span className="fc-rec-k">Valor</span>
            <span className="fc-rec-v">{record.valueFmt}</span>
          </div>
          {record.entryDate && (
            <div className="fc-rec-row">
              <span className="fc-rec-k">Entrada no Financeiro</span>
              <span className="fc-rec-v">{record.entryDate}</span>
            </div>
          )}
          {record.origin && (
            <div className="fc-rec-row">
              <span className="fc-rec-k">Origem</span>
              <span className="fc-rec-v">{record.origin}</span>
            </div>
          )}
        </>
      ) : (
        <>
          {record.company && (
            <div className="fc-rec-row">
              <span className="fc-rec-k">Empresa</span>
              <span className="fc-rec-v">{record.company}</span>
            </div>
          )}
          {record.origin && (
            <div className="fc-rec-row">
              <span className="fc-rec-k">Origem</span>
              <span className="fc-rec-v">{record.origin}</span>
            </div>
          )}
          <div className="fc-rec-row">
            <span className="fc-rec-k">Valor</span>
            <span className="fc-rec-v">{record.valueFmt}</span>
          </div>
          {record.date && (
            <div className="fc-rec-row">
              <span className="fc-rec-k">Data</span>
              <span className="fc-rec-v">{record.date}</span>
            </div>
          )}
        </>
      )}

      {record.diagnostics.length > 0 && (
        <>
          <div className="fc-diag-title">Diagnóstico</div>
          <ul className="fc-diag-list">
            {record.diagnostics.map((entry, index) => (
              <li key={index} className={`fc-diag-${entry.type}`}>
                {entry.text}
              </li>
            ))}
          </ul>
        </>
      )}

      {record.link ? (
        <a className="fc-rec-link" href={record.link} target="_blank" rel="noopener noreferrer">
          Abrir registro no Bitrix24 ↗
        </a>
      ) : (
        <span className="fc-rec-link fc-rec-link-disabled">Sem link direto (origem: planilha)</span>
      )}
    </article>
  );
}

type Quarter = { label: string; balance: number };

/**
 * Último mês com venda registrada. Meses depois dele ainda não aconteceram:
 * somar a meta cheia deles como déficit transformaria compromisso futuro em
 * prejuízo realizado e inflaria o saldo do ano.
 */
function lastRealizedMonth(metrics: MonthlyMetric[]): number {
  return metrics.reduce((last, m) => (m.sold > 0 ? Math.max(last, m.monthNumber) : last), 0);
}

/** Agrupa o saldo mensal em trimestres, ignorando meses ainda não realizados. */
function computeQuarters(metrics: MonthlyMetric[]): Quarter[] {
  const cutoff = lastRealizedMonth(metrics);
  const labels = ["1º trimestre", "2º trimestre", "3º trimestre", "4º trimestre"];
  return labels.map((label, index) => ({
    label,
    balance: metrics
      .filter((m) => Math.ceil(m.monthNumber / 3) === index + 1 && m.monthNumber <= cutoff)
      .reduce((sum, m) => sum + m.gap, 0),
  }));
}
