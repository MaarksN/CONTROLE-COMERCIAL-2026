import { healthLabel, currency, preciseCurrency, percent } from "../utils/formatters";
import { nextActionStatus, ACTION_STATUS_LABELS } from "../utils/constants";
import type { ActionHorizon, ActionItem } from "../deriveDashboard";
import { HORIZON_LABELS, BITRIX_AUDIT_REFERENCE } from "../deriveDashboard";


export function DashboardSection({
  dashboardInsights,
  deals,
  isReadOnly,
  showAllBottlenecks,
  setShowAllBottlenecks,
  actionItemsByHorizon,
  updateActionItem,
  setMonthlyRecordModal,
  setActionItemModal
}: any) {
  return (
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
              {dashboardInsights.monthlyComparison.map((row: any) => (
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
          {dashboardInsights.progression.map((row: any) => {
            const maxCumulative = Math.max(
              ...dashboardInsights.progression.flatMap((p: any) => [p.cumulativeAdjusted, p.cumulativeTarget]),
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
            ).map((item: any) => (
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
              onClick={() => setShowAllBottlenecks((prev: boolean) => !prev)}
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
            {actionItemsByHorizon[horizon].map((item: any) => (
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
                  {ACTION_STATUS_LABELS[item.status as any]}
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
  );
}
