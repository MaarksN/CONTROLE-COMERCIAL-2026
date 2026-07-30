export function TargetEditable({
      label,
      target,
      disabled,
      onSave,
    }: {
          label: string;
          target: number;
          disabled: boolean;
          onSave: (value: number) => void;
        }) {
    const [editing, setEditing] = useState(false);
    const [value, setValue] = useState(String(target));
    if (disabled) return <strong>{label}</strong>;
    if (!editing) {
    return (
      <button
        type="button"
        className="target-edit-trigger"
        title="Clique para editar a meta"
        onClick={() => {
          setValue(String(target));
          setEditing(true);
        }}
      >
        {label}
      </button>
    );
    }

    return (
    <input
      className="target-edit-input"
      type="number"
      min="0"
      step="1"
      autoFocus
      value={value}
      onChange={(event) => setValue(event.target.value)}
      onBlur={() => {
        setEditing(false);
        const parsed = Number(value);
        if (Number.isFinite(parsed) && parsed >= 0 && parsed !== target) {
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
