export function SellerModal({
      saving,
      errorMessage,
      onClose,
      onSubmit,
    }: {
          saving: boolean;
          errorMessage: string | null;
          onClose: () => void;
          onSubmit: (values: { name: string; role: SellerRole }) => void;
        }) {
    const [name, setName] = useState("");
    const [role, setRole] = useState<SellerRole>("Vendedor");
    return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card modal-card-small" onClick={(event) => event.stopPropagation()}>
        <div className="modal-heading">
          <h3>Adicionar vendedor</h3>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Fechar">
            ×
          </button>
        </div>
        <form
          className="modal-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (!name.trim()) return;
            onSubmit({ name: name.trim(), role });
          }}
        >
          <label>
            <span>Nome</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Ex.: João Reis"
              required
              autoFocus
            />
          </label>
          <label>
            <span>Papel</span>
            <select value={role} onChange={(event) => setRole(event.target.value as SellerRole)}>
              <option value="Vendedor">Vendedor</option>
              <option value="SDR">SDR</option>
            </select>
          </label>

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
