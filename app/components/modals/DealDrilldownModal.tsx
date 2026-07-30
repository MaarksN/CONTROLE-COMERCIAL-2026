import { preciseCurrency, initials } from "../../utils/formatters";
import { downloadCsv } from "../../utils/csv";
import { STAGE_PILL_CLASS } from "../../utils/constants";
export function DealDrilldownModal({
      title,
      deals,
      onClose,
    }: {
          title: string;
          deals: Deal[];
          onClose: () => void;
        }) {
    const [search, setSearch] = useState("");
    const [sortKey, setSortKey] = useState<DrilldownSortKey>("adjusted");
    const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
    const normalizedSearch = search.trim().toLowerCase();
    const filtered = normalizedSearch
            ? deals.filter(
                (deal) =>
                  deal.company.toLowerCase().includes(normalizedSearch) ||
                  deal.owner.toLowerCase().includes(normalizedSearch) ||
                  deal.origin.toLowerCase().includes(normalizedSearch),
              )
            : deals;
    const sorted = [...filtered].sort((a, b) => {
            const dir = sortDir === "asc" ? 1 : -1;
            if (sortKey === "adjusted") return (a.adjusted - b.adjusted) * dir;
            return a[sortKey].localeCompare(b[sortKey], "pt-BR") * dir;
          });

    function toggleSort(key: DrilldownSortKey) {
        if (key === sortKey) {
          setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
        } else {
          setSortKey(key);
          setSortDir(key === "adjusted" ? "desc" : "asc");
        }
    }

    const total = filtered.reduce((sum, deal) => sum + deal.adjusted, 0);
    return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card modal-card-large" onClick={(event) => event.stopPropagation()}>
        <div className="modal-heading">
          <h3>{title}</h3>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Fechar">
            ×
          </button>
        </div>
        <p className="drilldown-summary">
          {filtered.length} negócio(s){filtered.length !== deals.length ? ` de ${deals.length}` : ""} ·{" "}
          {preciseCurrency.format(total)} em valor ajustado
        </p>
        <div className="drilldown-toolbar">
          <input
            placeholder="Buscar por empresa, responsável ou origem"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <button
            type="button"
            className="table-edit-button"
            onClick={() => downloadCsv(sorted, "atlas-drilldown.csv")}
            disabled={sorted.length === 0}
          >
            Exportar CSV
          </button>
        </div>
        {sorted.length === 0 ? (
          <p className="empty-state">Nenhum negócio encontrado para este critério.</p>
        ) : (
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th className="sortable-header" onClick={() => toggleSort("company")}>
                    Empresa {sortKey === "company" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                  </th>
                  <th className="sortable-header" onClick={() => toggleSort("month")}>
                    Mês {sortKey === "month" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                  </th>
                  <th className="sortable-header" onClick={() => toggleSort("owner")}>
                    Responsável {sortKey === "owner" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                  </th>
                  <th className="sortable-header" onClick={() => toggleSort("stage")}>
                    Etapa {sortKey === "stage" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                  </th>
                  <th className="sortable-header" onClick={() => toggleSort("adjusted")}>
                    Ajustado {sortKey === "adjusted" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                  </th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((deal) => (
                  <tr key={deal.id}>
                    <td>
                      <strong>{deal.company}</strong>
                      <small>{deal.id.slice(0, 12)}</small>
                    </td>
                    <td>{deal.month}</td>
                    <td>
                      <span className="owner-cell">
                        <i>{initials(deal.owner)}</i>
                        {deal.owner}
                      </span>
                    </td>
                    <td>
                      <span className={`status-pill ${STAGE_PILL_CLASS[deal.stage]}`}>
                        {STAGE_LABELS[deal.stage]}
                      </span>
                    </td>
                    <td className="emphasis">{preciseCurrency.format(deal.adjusted)}</td>
                          <td className="omnichannel-actions" onClick={(e) => e.stopPropagation()}>
                            <button title="WhatsApp" onClick={() => triggerWhatsapp("551199999999")}>📱</button>
                            <button title="E-mail" onClick={() => triggerEmail("contato@" + deal.company.toLowerCase().replace(/ /g, '') + ".com")}>✉️</button>
                            <button title="Meet" onClick={() => triggerMeet(deal.company)}>📅</button>
                          </td>
                        </tr>

                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
    );
}
