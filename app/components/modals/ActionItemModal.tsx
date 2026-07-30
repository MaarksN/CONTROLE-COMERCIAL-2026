export function ActionItemModal({
      mode,
      initialValues,
      saving,
      errorMessage,
      onClose,
      onSubmit,
      onDelete,
    }: {
          mode: "create" | "edit";
          initialValues: ActionItemFormValues;
          saving: boolean;
          errorMessage: string | null;
          onClose: () => void;
          onSubmit: (values: ActionItemFormValues) => void;
          onDelete?: () => void;
        }) {
    const [values, setValues] = useState(initialValues);
    const [confirmingDelete, setConfirmingDelete] = useState(false);
    return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card modal-card-small" onClick={(event) => event.stopPropagation()}>
        <div className="modal-heading">
          <h3>{mode === "create" ? "Novo item do plano de ação" : "Editar item do plano"}</h3>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Fechar">
            ×
          </button>
        </div>
        <form
          className="modal-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (!values.title.trim()) return;
            onSubmit(values);
          }}
        >
          <label>
            <span>Título</span>
            <input
              value={values.title}
              onChange={(event) => setValues({ ...values, title: event.target.value })}
              required
              autoFocus
            />
          </label>
          <label className="modal-form-notes">
            <span>Descrição / entrega / critério de aceite</span>
            <textarea
              rows={3}
              value={values.description}
              onChange={(event) => setValues({ ...values, description: event.target.value })}
            />
          </label>
          <label>
            <span>Responsável</span>
            <input
              value={values.owner}
              onChange={(event) => setValues({ ...values, owner: event.target.value })}
            />
          </label>
          <label>
            <span>Horizonte</span>
            <select
              value={values.horizon}
              onChange={(event) =>
                setValues({ ...values, horizon: event.target.value as ActionHorizon })
              }
            >
              {(Object.keys(HORIZON_LABELS) as ActionHorizon[]).map((horizon) => (
                <option key={horizon} value={horizon}>
                  {HORIZON_LABELS[horizon]}
                </option>
              ))}
            </select>
          </label>

          {errorMessage && <p className="modal-error">{errorMessage}</p>}

          <div className="modal-actions">
            {mode === "edit" && onDelete && (
              <button
                type="button"
                className={confirmingDelete ? "modal-delete confirming" : "modal-delete"}
                onClick={() => {
                  if (confirmingDelete) {
                    onDelete();
                  } else {
                    setConfirmingDelete(true);
                    setTimeout(() => setConfirmingDelete(false), 4000);
                  }
                }}
              >
                {confirmingDelete ? "Confirmar exclusão" : "Excluir"}
              </button>
            )}
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
