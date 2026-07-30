import { navItems, SECTION_ICONS } from "../../utils/constants";
import type { Section } from "../../CommercialControl";
export function DailyPromptModal({
      query,
      onQueryChange,
      onSelect,
      onClose,
    }: {
          query: string;
          onQueryChange: (value: string) => void;
          onSelect: (section: Section) => void;
          onClose: () => void;
        }) {
    const normalized = query.trim().toLowerCase();
    const items = navItems.filter((item) => item.label.toLowerCase().includes(normalized));
    return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-card modal-card-daily-prompt"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-heading">
          <h3>O que você quer olhar hoje?</h3>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Fechar">
            ×
          </button>
        </div>
        <p className="daily-prompt-subtitle">
          Escolha um atalho ou digite para filtrar.
        </p>
        <input
          type="text"
          className="daily-prompt-search"
          placeholder="Buscar seção..."
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          autoFocus
        />
        {items.length === 0 ? (
          <p className="daily-prompt-empty">Nenhuma seção encontrada para “{query}”.</p>
        ) : (
          <div className="daily-prompt-grid">
            {items.map((item) => (
              <button
                type="button"
                key={item.id}
                className="daily-prompt-item"
                onClick={() => onSelect(item.id)}
              >
                <span className="daily-prompt-item-icon">{SECTION_ICONS[item.id]}</span>
                <span className="daily-prompt-item-label">{item.label}</span>
              </button>
            ))}
          </div>
        )}
        <div className="daily-prompt-actions">
          <button type="button" className="modal-cancel" onClick={onClose}>
            Agora não
          </button>
        </div>
      </div>
    </div>
    );
}
