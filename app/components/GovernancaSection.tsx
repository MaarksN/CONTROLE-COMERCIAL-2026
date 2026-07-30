import { relativeTimestamp, initials, percent } from "../utils/formatters";
import { ACTION_LABELS } from "../utils/constants";
import { ENTERPRISE_ROADMAP } from "../deriveEnterpriseRoadmap";


export function GovernancaSection({
  data,
  auditResults,
  activity,
  auditFilters,
  setAuditFilters,
  auditLoading,
  applyAuditFilters,
  clearAuditFilters,
  auditError,
  showAllActivity,
  setShowAllActivity,
  dataQualityMetrics,
  deals,
  setDrilldown,
  showAllQualityIssues,
  setShowAllQualityIssues,
  setSection
}: any) {
  return (
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
        <article className="panel rounded-3xl glassmorphism card-3d-inner rhythm-panel">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">Modelo operacional</span>
              <h3>Cadência de gestão</h3>
            </div>
          </div>
          <div className="rhythm-list">
            {data.governance.operatingRhythm.map((item: any, index: number) => (
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

        <article className="panel rounded-3xl glassmorphism card-3d-inner approval-panel">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">Controles</span>
              <h3>Regras de aprovação</h3>
            </div>
          </div>
          <ol>
            {data.governance.approvalRules.map((rule: string) => (
              <li key={rule}>{rule}</li>
            ))}
          </ol>
        </article>
      </div>

      <article className="panel rounded-3xl glassmorphism card-3d-inner activity-panel">
        <div className="panel-heading">
          <div>
            <span className="section-kicker">Trilha de auditoria</span>
            <h3>Atividade recente</h3>
          </div>
          <span>{(auditResults ?? activity).length} eventos{auditResults ? " (filtrado)" : ""}</span>
        </div>

        <div className="audit-filter-row">
          <input
            placeholder="Usuário (e-mail)"
            value={auditFilters.actor}
            onChange={(event) => setAuditFilters((prev: any) => ({ ...prev, actor: event.target.value }))}
          />
          <select
            value={auditFilters.action}
            onChange={(event) => setAuditFilters((prev: any) => ({ ...prev, action: event.target.value }))}
          >
            <option value="">Todas as ações</option>
            {Object.entries(ACTION_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label as string}
              </option>
            ))}
          </select>
          <input
            placeholder="Entidade (ex.: commercial_deal)"
            value={auditFilters.entity}
            onChange={(event) => setAuditFilters((prev: any) => ({ ...prev, entity: event.target.value }))}
          />
          <input
            type="date"
            value={auditFilters.from}
            onChange={(event) => setAuditFilters((prev: any) => ({ ...prev, from: event.target.value }))}
          />
          <input
            type="date"
            value={auditFilters.to}
            onChange={(event) => setAuditFilters((prev: any) => ({ ...prev, to: event.target.value }))}
          />
          <button type="button" className="primary-button" disabled={auditLoading} onClick={() => void applyAuditFilters()}>
            {auditLoading ? "Filtrando..." : "Aplicar filtros"}
          </button>
          <button type="button" className="modal-cancel" onClick={clearAuditFilters}>
            Limpar
          </button>
          <button
            type="button"
            className="table-edit-button"
            onClick={() => downloadActivityCsv(auditResults ?? activity, "atlas-auditoria.csv")}
          >
            Exportar CSV
          </button>
        </div>
        {auditError && <p className="modal-error">{auditError}</p>}

        <div className="activity-list">
          {(auditResults ?? activity).length === 0 && (
            <p className="activity-empty">Nenhuma alteração registrada para os filtros atuais.</p>
          )}
          {(auditResults ?? (showAllActivity ? activity : activity.slice(0, 5))).map((entry: any) => {
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
                  {ACTION_LABELS[entry.action as keyof typeof ACTION_LABELS] ?? entry.action}
                  {company ? ` — ${company}` : ""}
                  <small className="activity-entity">
                    {entry.entity}
                    {entry.entityId ? ` #${entry.entityId}` : ""}
                  </small>
                </span>
                <small>{relativeTimestamp(entry.createdAt)}</small>
              </div>
            );
          })}
        </div>
        {!auditResults && activity.length > 5 && (
          <button
            type="button"
            className="list-toggle"
            onClick={() => setShowAllActivity((prev: boolean) => !prev)}
          >
            {showAllActivity ? "Ver menos" : `Ver mais (${activity.length - 5})`}
          </button>
        )}
      </article>

      <article className="panel rounded-3xl glassmorphism card-3d-inner access-panel">
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
              {data.governance.roles.map((role: any) => (
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

      <article className="panel rounded-3xl glassmorphism card-3d-inner quality-panel">
        <div className="panel-heading">
          <div>
            <span className="section-kicker">Qualidade da informação · ao vivo</span>
            <h3>Completude dos negócios em {deals.length} negócio(s) cadastrados agora</h3>
          </div>
        </div>
        <div className="quality-metric-grid">
          {dataQualityMetrics.map((metric: any) => (
            <button
              type="button"
              key={metric.key}
              className="quality-metric-card"
              onClick={() => setDrilldown({ title: metric.label, dealIds: metric.dealIds })}
            >
              <span>{metric.label}</span>
              <strong>{percent.format(metric.ratio)}</strong>
              <small>{metric.count} de {deals.length} negócio(s) · clique para ver</small>
            </button>
          ))}
        </div>
      </article>

      <article className="panel rounded-3xl glassmorphism card-3d-inner quality-panel">
        <div className="panel-heading">
          <div>
            <span className="section-kicker">Qualidade da informação · histórico</span>
            <h3>Backlog de saneamento identificado na planilha</h3>
          </div>
          <span>{data.dataQualityIssues.length} itens</span>
        </div>
        <div className="quality-grid">
          {(showAllQualityIssues
            ? data.dataQualityIssues
            : data.dataQualityIssues.slice(0, 5)
          ).map((issue: any) => (
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
        {data.dataQualityIssues.length > 5 && (
          <button
            type="button"
            className="list-toggle"
            onClick={() => setShowAllQualityIssues((prev: boolean) => !prev)}
          >
            {showAllQualityIssues
              ? "Ver menos"
              : `Ver mais (${data.dataQualityIssues.length - 5})`}
          </button>
        )}
      </article>

      <article className="panel rounded-3xl glassmorphism card-3d-inner roadmap-panel">
        <div className="panel-heading">
          <div>
            <span className="section-kicker">Roadmap Enterprise</span>
            <h3>Módulos com arquitetura pronta, aguardando fonte de dados</h3>
          </div>
          <span>{ENTERPRISE_ROADMAP.length} módulo(s)</span>
        </div>
        <p className="dashboard-note">
          Estes módulos do Revenue Operating System não têm fonte de dado real neste
          aplicativo hoje (sem integração de marketing/SDR/CS/financeiro/NPS, sem log de
          atividades de CRM). Os contratos de dados já estão definidos em{" "}
          <code>app/deriveEnterpriseRoadmap.ts</code> para quando a integração existir —
          nenhum número abaixo é simulado.
        </p>
        <div className="roadmap-grid">
          {ENTERPRISE_ROADMAP.map((module: any) => (
            <div key={module.key} className="roadmap-card">
              <div className="roadmap-card-head">
                <strong>{module.title}</strong>
                <span className="roadmap-status-pill">{module.status}</span>
              </div>
              <p>{module.summary}</p>
              <div>
                <small className="roadmap-missing">Dados/integrações faltantes:</small>
                <ul>
                  {module.missingData.map((item: string) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
              <span className="roadmap-contract">
                Contratos: {module.contractTypeNames.join(", ")}
              </span>
            </div>
          ))}
        </div>
      </article>
    </section>
  );
}
