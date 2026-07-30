import { currency } from "../utils/formatters";
export function EditableCurrencyCell({
      value,
      disabled,
      suggested,
      onSave,
    }: {
          value: number;
          disabled: boolean;
          suggested: boolean;
          onSave: (value: number) => void;
        }) {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(String(value));
    if (disabled) {
    return <span className={suggested ? "growth-cell suggested" : "growth-cell"}>{currency.format(value)}</span>;
    }

    if (!editing) {
    return (
      <button
        type="button"
        className={suggested ? "growth-cell-edit suggested" : "growth-cell-edit"}
        title="Clique para editar"
        onClick={() => {
          setDraft(String(value));
          setEditing(true);
        }}
      >
        {currency.format(value)}
      </button>
    );
    }

    return (
    <input
      className="growth-cell-input"
      type="number"
      min="0"
      step="1"
      autoFocus
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        setEditing(false);
        const parsed = Number(draft);
        if (Number.isFinite(parsed) && parsed >= 0 && parsed !== value) {
          onSave(parsed);
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") setEditing(false);
      }}
    />
    );
}
