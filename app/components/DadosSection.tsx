export function DadosSection({
  data,
  currentSheet,
  setSelectedSheet,
  setSheetSearch,
  sheetSearch,
  sheetMode,
  setSheetMode,
  visibleSheetRows,
}: any) {
  return (
    <section className="page-content">
      <div className="page-intro">
        <div>
          <span className="section-kicker">Data room comercial</span>
          <h2>Todos os dados da planilha, sem perda de contexto.</h2>
          <p>
            As 20 abas, {data.meta.importedCells.toLocaleString("pt-BR")}{" "}
            células preenchidas e {data.meta.formulaCells} fórmulas estão
            disponíveis para consulta e auditoria.
          </p>
        </div>
        <div className="source-stamp">
          <span>Fonte original</span>
          <strong>{data.meta.sourceFile}</strong>
        </div>
      </div>

      <div className="data-room">
        <aside className="sheet-list">
          <div>
            <span>Abas do arquivo</span>
            <strong>{data.rawSheets.length}</strong>
          </div>
          {data.rawSheets.map((sheet: any) => (
            <button
              type="button"
              key={sheet.name}
              className={sheet.name === currentSheet.name ? "active" : ""}
              onClick={() => {
                setSelectedSheet(sheet.name);
                setSheetSearch("");
              }}
            >
              <span>{sheet.name}</span>
              <small>{sheet.rowCount} × {sheet.columnCount}</small>
            </button>
          ))}
        </aside>

        <article className="panel rounded-3xl glassmorphism card-3d-inner sheet-panel">
          <div className="sheet-toolbar">
            <div>
              <span className="section-kicker">Aba selecionada</span>
              <h3>{currentSheet.name}</h3>
            </div>
            <label className="sheet-search">
              <span>Buscar nesta aba</span>
              <input
                value={sheetSearch}
                onChange={(event) => setSheetSearch(event.target.value)}
                placeholder="Digite um valor"
              />
            </label>
            <div className="mode-toggle">
              <button
                type="button"
                className={sheetMode === "values" ? "active" : ""}
                onClick={() => setSheetMode("values")}
              >
                Valores
              </button>
              <button
                type="button"
                className={sheetMode === "formulas" ? "active" : ""}
                onClick={() => setSheetMode("formulas")}
              >
                Fórmulas
              </button>
            </div>
          </div>
          <div className="sheet-meta">
            <span>{currentSheet.rowCount} linhas</span>
            <span>{currentSheet.columnCount} colunas</span>
            <span>{currentSheet.nonEmptyCells} células</span>
            <span>{currentSheet.formulaCells} fórmulas</span>
          </div>
          <div className="spreadsheet-wrap">
            <table className="spreadsheet">
              <thead>
                <tr>
                  <th>#</th>
                  {Array.from(
                    { length: currentSheet.columnCount },
                    (_, index) => (
                      <th key={index}>
                        {String.fromCharCode(65 + (index % 26))}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {visibleSheetRows.map(({ row, rowNumber }: any) => (
                  <tr key={rowNumber}>
                    <th>{rowNumber}</th>
                    {Array.from(
                      { length: currentSheet.columnCount },
                      (_, index) => (
                        <td key={index}>{String(row[index] ?? "")}</td>
                      ),
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      </div>
    </section>
  );
}
