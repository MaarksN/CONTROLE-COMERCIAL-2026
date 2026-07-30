export function MonthlyRecordModal({
      monthNumber,
      target,
      saving,
      errorMessage,
      onClose,
      onSubmit,
    }: {
          monthNumber: number;
          target: Target;
          saving: boolean;
          errorMessage: string | null;
          onClose: () => void;
          onSubmit: (values: { target: number; sold: number; adjusted: number }) => void;
        }) {
    const [values, setValues] = useState({
            target: String(target.target),
            sold: String(target.sold),
            adjusted: String(target.adjusted),
          });
    return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card modal-card-small" onClick={(event) => event.stopPropagation()}>
        <div className="modal-heading">
          <h3>Editar {MONTH_NAMES[monthNumber - 1]}</h3>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Fechar">
            ×
          </button>
        </div>
        <form
          className="modal-form"
          onSubmit={(event) => {
            event.preventDefault();
            const target = Number(values.target);
            const sold = Number(values.sold);
            const adjusted = Number(values.adjusted);
            if (
              !Number.isFinite(target) ||
              target < 0 ||
              !Number.isFinite(sold) ||
              sold < 0 ||
              !Number.isFinite(adjusted) ||
              adjusted < 0
            ) {
              return;
            }
            onSubmit({ target, sold, adjusted });
          }}
        >
          <label>
            <span>Meta (R$)</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={values.target}
              onChange={(event) => setValues({ ...values, target: event.target.value })}
              required
              autoFocus
            />
          </label>
          <label>
            <span>Vendido consolidado (R$)</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={values.sold}
              onChange={(event) => setValues({ ...values, sold: event.target.value })}
              required
            />
          </label>
          <label>
            <span>Ajustado consolidado (R$)</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={values.adjusted}
              onChange={(event) => setValues({ ...values, adjusted: event.target.value })}
              required
            />
          </label>
          <p className="modal-hint">
            Estes valores são o registro consolidado oficial do mês — o mesmo que aparece na
            planilha de controle. Não são recalculados a partir dos negócios individuais.
          </p>

          {errorMessage && <p className="modal-error">{errorMessage}</p>}

          <div className="modal-actions">
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
