import { healthLabel, initials, formatKeyResult, percent } from "../utils/formatters";


export function OkrsSection({
  objectives,
  isReadOnly,
  setObjectiveModal,
}: any) {
  return (
    <section className="page-content">
      <div className="page-intro">
        <div>
          <span className="section-kicker">Execução da estratégia</span>
          <h2>OKRs ligados aos dados que já existem.</h2>
          <p>
            Objetivos de receita, previsibilidade e qualidade, com
            responsáveis, cadência e resultados-chave mensuráveis.
          </p>
        </div>
        <span className="cycle-badge">Ciclo atual · Q3 2026</span>
      </div>

      <div className="okr-grid">
        {objectives.map((objective: any) => (
          <article className="okr-card" key={objective.id}>
            <div className="okr-head">
              <span>{objective.id}</span>
              <i>{healthLabel(objective.progress)}</i>
            </div>
            <h3>{objective.title}</h3>
            {!isReadOnly && (
              <button
                type="button"
                className="list-toggle okr-edit-button"
                onClick={() => setObjectiveModal(objective)}
              >
                Editar
              </button>
            )}
            <div className="okr-owner">
              <span>{initials(objective.owner)}</span>
              <div>
                <strong>{objective.owner}</strong>
                <small>Revisão {objective.cadence.toLowerCase()}</small>
              </div>
            </div>
            <div className="okr-progress">
              <div>
                <span>Progresso</span>
                <strong>{percent.format(objective.progress)}</strong>
              </div>
              <i>
                <b
                  style={{
                    width: `${Math.min(objective.progress * 100, 100)}%`,
                  }}
                />
              </i>
            </div>
            <div className="kr-list">
              {objective.keyResults.map((result: any) => {
                const rawProgress = result.inverse
                  ? result.target / Math.max(result.actual, 0.0001)
                  : result.actual / Math.max(result.target, 0.0001);
                return (
                  <div key={result.title}>
                    <span>
                      <small>{result.title}</small>
                      <strong>
                        {formatKeyResult(result.actual, result.unit)}
                      </strong>
                    </span>
                    <span className="kr-target">
                      Meta {formatKeyResult(result.target, result.unit)}
                    </span>
                    <i>
                      <b
                        style={{
                          width: `${Math.min(rawProgress * 100, 100)}%`,
                        }}
                      />
                    </i>
                  </div>
                );
              })}
            </div>
          </article>
        ))}
      </div>

      <div className="okr-note">
        <img src="/atlas-symbol.png" alt="" />
        <div>
          <strong>Regra de ouro</strong>
          <p>
            O OKR não substitui a operação. Ele cria foco, enquanto o CRM
            registra a evidência que sustenta cada resultado-chave.
          </p>
        </div>
      </div>
    </section>
  );
}
