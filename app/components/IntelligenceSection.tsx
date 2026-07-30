import { currency, percent } from "../utils/formatters";


export function IntelligenceSection({
  forecastScenarios,
  deals,
  setDrilldown,
  revenueClassification,
  healthScore,
  alerts,
  alertStateByKey,
  isReadOnly,
  alertJustifications,
  setAlertJustifications,
  alertActionKey,
  setAlertStatus,
}: any) {
  return (
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
                .filter((d: any) => d.monthNumber === forecastScenarios.monthNumber && d.stage === "aberto")
                .map((d: any) => d.id),
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
          {healthScore.dimensions.map((dimension: any) => (
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
            {alerts.map((alert: any) => {
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
                            setAlertJustifications((prev: any) => ({ ...prev, [alert.key]: event.target.value }))
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
  );
}
