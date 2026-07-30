import { initials, currency, preciseCurrency, percent } from "../utils/formatters";
import { downloadCsv } from "../utils/csv";
import { STAGE_PILL_CLASS } from "../utils/constants";
import { STAGE_LABELS } from "../deriveMetrics";


export function EquipeSection({
  selectedOwner,
  setSelectedOwner,
  selectedOwnerDeals,
  isReadOnly,
  setSellerModalOpen,
  ownerPerformance,
  sellerRoleByName,
  selectedOwnerDashboard,
  executiveSummary,
  sellerScores,
  selectedOwnerMaxMonth,
  originPerformance,
  maxOrigin,
  data,
  setSection,
  setDealModal,
}: any) {
  return (
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
        {ownerPerformance.map((person: any, index: number) => (
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
              {score.dimensions.map((dimension: any) =>
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
            {selectedOwnerDashboard.months.map((month: any) => (
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
                  Math.max(...selectedOwnerDeals.map((deal: any) => deal.adjusted), 0),
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
              {selectedOwnerDeals.map((deal: any) => (
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
                    <span className={`status-pill ${STAGE_PILL_CLASS[deal.stage as keyof typeof STAGE_PILL_CLASS]}`}>
                      {STAGE_LABELS[deal.stage as keyof typeof STAGE_LABELS]}
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
            {ownerPerformance.map((person: any, index: number) => (
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
            {originPerformance.map((origin: any, index: number) => (
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
              (deal: any) => deal.semester === semester,
            );
            const sold = rows.reduce((sum: number, deal: any) => sum + deal.sold, 0);
            const billed = rows.reduce((sum: number, deal: any) => sum + deal.billed, 0);
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
  );
}
