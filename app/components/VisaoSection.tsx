import { healthLabel, initials, currency, percent } from "../utils/formatters";
import { GROWTH_PLAN_HORIZON_MONTHS, GROWTH_PLAN_MONTHLY_INCREASE } from "../utils/constants";



export function VisaoSection({
  visaoScope,
  setVisaoScope,
  selectedOwner,
  setSelectedOwner,
  owners,
  sellerRoleByName,
  visaoMonth,
  setVisaoMonth,
  monthlyMetrics,
  visaoCompanySummary,
  visaoMonthLabel,
  currentMonthMetric,
  maxMonthly,
  isReadOnly,
  updateTarget,
  data,
  setSection,
  visaoSellerDeals,
  visaoSellerSummary,
  visaoCompanyDeals,
  selectedOwnerWon,
  selectedOwnerOpen,
  selectedOwnerGrowthPlan,
  updateGrowthTarget
}: any) {
  return (
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
                {owners.map((owner: string) => (
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
              {monthlyMetrics.map((metric: any) => (
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
                {monthlyMetrics.map((metric: any) => (
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
                      onSave={(value: any) => void updateTarget(metric.monthNumber, value)}
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
                {data.dataQualityIssues.slice(0, 4).map((issue: any, index: number) => (
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
                  visaoSellerSummary.adjusted / Math.max(visaoCompanyDeals.reduce((s: number, d: any) => s + d.adjusted, 0), 1),
                )}
              </strong>
              <i>
                <b
                  style={{
                    width: `${Math.min(
                      (visaoSellerSummary.adjusted /
                        Math.max(visaoCompanyDeals.reduce((s: number, d: any) => s + d.adjusted, 0), 1)) *
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
                {visaoSellerSummary.months.map((month: any) => (
                  <div key={month.month}>
                    <span>{currency.format(month.adjusted)}</span>
                    <i>
                      <b
                        style={{
                          height: `${Math.max(
                            (month.adjusted /
                              Math.max(...visaoSellerSummary.months.map((m: any) => m.adjusted), 1)) *
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
                    selectedOwnerWon.reduce((sum: number, deal: any) => sum + deal.adjusted, 0),
                  )}
                </strong>
                <small>{selectedOwnerWon.length} negócios</small>
              </article>
              <article>
                <span>Ainda aberto / não fechado</span>
                <strong>
                  {currency.format(
                    selectedOwnerOpen.reduce((sum: number, deal: any) => sum + deal.adjusted, 0),
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
                  {selectedOwnerGrowthPlan.map((row: any) => (
                    <tr key={`${row.year}-${row.monthNumber}`}>
                      <td>
                        <strong>{row.label}</strong>
                      </td>
                      <td>
                        <EditableCurrencyCell
                          value={row.entryTarget}
                          disabled={isReadOnly}
                          suggested={row.isSuggested}
                          onSave={(value: any) =>
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
                          onSave={(value: any) =>
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
  );
}
