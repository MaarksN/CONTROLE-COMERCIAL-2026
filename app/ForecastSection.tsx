"use client";

/**
 * Seção "Forecast Comercial" — porta o relatório Bitrix24 para dentro da
 * central, somando a ele a camada que o relatório original não tinha:
 * diagnóstico de gargalos e plano de contenção.
 *
 * A tabela Meta × Vendido lê `monthlyMetrics` da própria central em vez de
 * duplicar os números do relatório, para que as duas visões não divirjam.
 */

import { useMemo, useState } from "react";
import type { MonthlyMetric } from "./deriveMetrics";
import {
  COUNTING_RULE,
  CONVERSION_RATES,
  FORECAST_FOOTNOTE,
  FORECAST_META,
  FUNNEL_PIPELINES,
  FUNNEL_SOURCE_LABELS,
  HEADLINE_KPIS,
  ITEM_CARDS,
} from "./data/forecast-bitrix";
import { analyzeForecast, type Bottleneck, type ContainmentStep } from "./deriveForecastFunnel";

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
          <span className="fc-band-logo">
            <i aria-hidden="true">◭</i> Atlas
          </span>
          <div className="fc-band-title">
            <h2>{FORECAST_META.title}</h2>
            <p>{FORECAST_META.flow}</p>
          </div>
        </div>
        <span className="fc-band-pill">
          Competência {FORECAST_META.competence} · gerado em {FORECAST_META.generatedAtLabel}
        </span>
      </header>

      <div className="fc-kpi-grid">
        {HEADLINE_KPIS.map((kpi) => (
          <article key={kpi.id} className={KPI_TONE_CLASS[kpi.tone] ?? "fc-kpi"}>
            <span>{kpi.label}</span>
            <strong>{kpi.value}</strong>
            <small>{kpi.caption}</small>
          </article>
        ))}
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
          <article key={card.id} className={`fc-item fc-item-${card.tone}`}>
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
