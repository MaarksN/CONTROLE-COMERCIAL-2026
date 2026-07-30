export function ObjectiveModal({
      objective,
      saving,
      errorMessage,
      onClose,
      onSubmit,
    }: {
          objective: Objective;
          saving: boolean;
          errorMessage: string | null;
          onClose: () => void;
          onSubmit: (values: {
            title: string;
            owner: string;
            cadence: string;
            keyResults: ObjectiveKeyResult[];
          }) => void;
        }) {
    const [title, setTitle] = useState(objective.title);
    const [owner, setOwner] = useState(objective.owner);
    const [cadence, setCadence] = useState(objective.cadence);
    const [keyResults, setKeyResults] = useState(objective.keyResults);

    function updateKeyResult(index: number, patch: Partial<ObjectiveKeyResult>) {
        setKeyResults((prev) => prev.map((kr, i) => (i === index ? { ...kr, ...patch } : kr)));
    }

    return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(event) => event.stopPropagation()}>
        <div className="modal-heading">
          <h3>Editar OKR — {objective.id}</h3>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Fechar">
            ×
          </button>
        </div>
        <form
          className="modal-form"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit({ title, owner, cadence, keyResults });
          }}
        >
          <label className="modal-form-notes">
            <span>Título do objetivo</span>
            <input value={title} onChange={(event) => setTitle(event.target.value)} required />
          </label>
          <label>
            <span>Responsável</span>
            <input value={owner} onChange={(event) => setOwner(event.target.value)} required />
          </label>
          <label>
            <span>Cadência</span>
            <input value={cadence} onChange={(event) => setCadence(event.target.value)} required />
          </label>

          {keyResults.map((keyResult, index) => (
            <Fragment key={keyResult.title}>
              <label>
                <span>{keyResult.title} — atual</span>
                <input
                  type="number"
                  step="0.01"
                  value={keyResult.actual}
                  onChange={(event) =>
                    updateKeyResult(index, { actual: Number(event.target.value) })
                  }
                  required
                />
              </label>
              <label>
                <span>{keyResult.title} — meta</span>
                <input
                  type="number"
                  step="0.01"
                  value={keyResult.target}
                  onChange={(event) =>
                    updateKeyResult(index, { target: Number(event.target.value) })
                  }
                  required
                />
              </label>
            </Fragment>
          ))}

          {errorMessage && <p className="modal-error">{errorMessage}</p>}

          <div className="modal-actions">
            <div />
            <div className="modal-actions-right">
              <button type="button" className="modal-cancel" onClick={onClose}>
                Cancelar
              </button>
              <button type="submit" className="primary-button" disabled={saving}>
                {saving ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
    );
}
