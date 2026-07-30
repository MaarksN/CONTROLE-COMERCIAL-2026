import { currency, preciseCurrency, initials } from "../utils/formatters";
import { downloadCsv } from "../utils/csv";
import { STAGE_PILL_CLASS } from "../utils/constants";
import { STAGES, STAGE_LABELS } from "../deriveMetrics";


export function PipelineSection({
  deals,
  pipelineView,
  setPipelineView,
  filteredDeals,
  isReadOnly,
  setDealModal,
  search,
  setSearch,
  monthFilter,
  setMonthFilter,
  monthlyMetrics,
  ownerFilter,
  setOwnerFilter,
  owners,
  dragOverStage,
  setDragOverStage,
  moveDealStage,
  dealsByStage,
  now
}: any) {
  return (
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
            {monthlyMetrics.map((metric: any) => (
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
            {owners.map((owner: string) => (
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
          {STAGES.map((stage: any) => (
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
              onDragLeave={() => setDragOverStage((current: any) => (current === stage ? null : current))}
              onDrop={(event) => {
                event.preventDefault();
                setDragOverStage(null);
                if (isReadOnly) return;
                const id = event.dataTransfer.getData("text/plain");
                if (id) moveDealStage(id, stage);
              }}
            >
              <div className="kanban-column-heading">
                <span>{STAGE_LABELS[stage as keyof typeof STAGE_LABELS]}</span>
                <b>{dealsByStage[stage].length}</b>
              </div>
              <div className="kanban-column-total">
                {currency.format(
                  dealsByStage[stage].reduce((sum: number, deal: any) => sum + deal.adjusted, 0),
                )}
              </div>
              <div className="kanban-cards">
                {dealsByStage[stage].length === 0 && (
                  <div className="kanban-empty">Nenhum negócio nesta etapa.</div>
                )}
                {dealsByStage[stage].map((deal: any) => {
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
                {filteredDeals.map((deal: any) => (
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
      )}
    </section>
  );
}
