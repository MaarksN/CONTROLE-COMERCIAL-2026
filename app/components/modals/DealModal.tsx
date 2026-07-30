export function DealModal({
      mode,
      initialValues,
      owners,
      origins,
      saving,
      errorMessage,
      onClose,
      onSubmit,
      onDelete,
    }: {
          mode: "create" | "edit";
          initialValues: DealFormValues;
          owners: string[];
          origins: string[];
          saving: boolean;
          errorMessage: string | null;
          onClose: () => void;
          onSubmit: (values: DealFormValues) => void;
          onDelete?: () => void;
        }) {
    const [values, setValues] = useState(initialValues);
    const [confirmingDelete, setConfirmingDelete] = useState(false);
    return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(event) => event.stopPropagation()}>
        <div className="modal-heading">
          <h3>{mode === "create" ? "Novo negócio" : "Editar negócio"}</h3>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Fechar">
            ×
          </button>
        </div>
        <form
          className="modal-form"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit(values);
          }}
        >
          <label>
            <span>Empresa</span>
            <input
              value={values.company}
              onChange={(event) => setValues({ ...values, company: event.target.value })}
              required
            />
          </label>
          <label>
            <span>Responsável</span>
            <input
              value={values.owner}
              onChange={(event) => setValues({ ...values, owner: event.target.value })}
              list="owners-datalist"
              required
            />
          </label>
          <label>
            <span>Origem</span>
            <input
              value={values.origin}
              onChange={(event) => setValues({ ...values, origin: event.target.value })}
              list="origins-datalist"
            />
          </label>
          <label>
            <span>Mês</span>
            <select
              value={values.monthNumber}
              onChange={(event) =>
                setValues({ ...values, monthNumber: Number(event.target.value) })
              }
            >
              {MONTH_NAMES.map((name, index) => (
                <option key={name} value={index + 1}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Etapa</span>
            <select
              value={values.stage}
              onChange={(event) =>
                setValues({ ...values, stage: event.target.value as Stage })
              }
            >
              {STAGES.map((stage) => (
                <option key={stage} value={stage}>
                  {STAGE_LABELS[stage]}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Valor vendido (R$)</span>
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
            <span>Valor ajustado (R$)</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={values.adjusted}
              onChange={(event) => setValues({ ...values, adjusted: event.target.value })}
            />
          </label>
          <label>
            <span>Faturado (R$)</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={values.billed}
              onChange={(event) => setValues({ ...values, billed: event.target.value })}
            />
          </label>
          <label>
            <span>Proposta aceita em</span>
            <input
              type="date"
              value={values.proposalAcceptedAt}
              onChange={(event) =>
                setValues({ ...values, proposalAcceptedAt: event.target.value })
              }
            />
          </label>
          <label>
            <span>Contrato assinado em</span>
            <input
              type="date"
              value={values.contractSignedAt}
              onChange={(event) =>
                setValues({ ...values, contractSignedAt: event.target.value })
              }
            />
          </label>
          <label className="modal-form-notes">
            <span>Notas</span>
            <textarea
              rows={3}
              value={values.notes}
              onChange={(event) => setValues({ ...values, notes: event.target.value })}
            />
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
      <datalist id="owners-datalist">
        {owners.map((owner) => (
          <option key={owner} value={owner} />
        ))}
      </datalist>
      <datalist id="origins-datalist">
        {origins.map((origin) => (
          <option key={origin} value={origin} />
        ))}
      </datalist>
    </div>
    );
}
