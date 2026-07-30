import { preciseCurrency } from "../utils/formatters";
import { downloadCsv } from "../utils/csv";


export function IntegracoesSection({
  integrationSettings,
  integrationError,
  integrationForm,
  setIntegrationForm,
  isReadOnly,
  saveIntegrationSettings,
  integrationSaving,
  bitrixImportLoading,
  runBitrixImport,
  bitrixExporting,
  deals,
  runBitrixExport,
  csvImporting,
  handleCsvImport,
  bitrixImportError,
  bitrixExportError,
  csvImportError,
  bitrixImportItems,
  bitrixImportSelected,
  toggleBitrixImportSelection,
  setBitrixImportItems,
  bitrixImportConfirming,
  confirmBitrixImport,
  leadQuery,
  setLeadQuery,
  leadLoading,
  runLeadSearch,
  leadError,
  leadResult,
  openDealModalFromLead,
  aiReportLoading,
  generateAiReport,
}: any) {
  return (
    <section className="page-content">
      <div className="page-intro">
        <div>
          <span className="section-kicker">Integrações</span>
          <h2>Hub Omnichannel: IA, Comunicação e Inteligência.</h2>
          <p>
            Configure as chaves uma vez e use para importar/exportar negócios, enriquecer
            leads e gerar relatórios executivos com IA.
          </p>
        </div>
      </div>

      <article className="panel rounded-3xl glassmorphism card-3d-inner">
        <div className="panel-heading">
          <div>
            <span className="section-kicker">Chaves de API</span>
            <h3>Credenciais dos serviços externos</h3>
          </div>
          {!integrationSettings && !integrationError && <span>Carregando...</span>}
        </div>
        <form
          className="modal-form integration-form"
          onSubmit={(event) => {
            event.preventDefault();
            void saveIntegrationSettings();
          }}
        >
          <label>
            <span>Webhook Bitrix24</span>
            <input
              placeholder={
                integrationSettings?.bitrixWebhookMasked ?? "https://seuportal.bitrix24.com.br/rest/1/xxxx/"
              }
              value={integrationForm.bitrixWebhookUrl}
              onChange={(event) =>
                setIntegrationForm((prev: any) => ({ ...prev, bitrixWebhookUrl: event.target.value }))
              }
              disabled={isReadOnly}
            />
          </label>
          <label>
            <span>Chave da API Apollo</span>
            <input
              placeholder={integrationSettings?.apolloKeyMasked ?? "Chave não configurada"}
              value={integrationForm.apolloApiKey}
              onChange={(event) =>
                setIntegrationForm((prev: any) => ({ ...prev, apolloApiKey: event.target.value }))
              }
              disabled={isReadOnly}
            />
          </label>
          <label>
            <span>Chave da API Google</span>
            <input
              placeholder={integrationSettings?.googleKeyMasked ?? "Chave não configurada"}
              value={integrationForm.googleApiKey}
              onChange={(event) =>
                setIntegrationForm((prev: any) => ({ ...prev, googleApiKey: event.target.value }))
              }
              disabled={isReadOnly}
            />
          </label>
          <label>
            <span>Provedor de IA</span>
            <select
              value={integrationForm.aiProvider}
              onChange={(event) =>
                setIntegrationForm((prev: any) => ({
                  ...prev,
                  aiProvider: event.target.value as "auto" | "openai" | "anthropic",
                }))
              }
              disabled={isReadOnly}
            >
              <option value="auto">Automático (usa a chave preenchida)</option>
              <option value="openai">OpenAI</option>
              <option value="anthropic">Anthropic</option>
            </select>
          </label>
          <label>
            <span>Chave da API OpenAI</span>
            <input
              placeholder={integrationSettings?.openaiKeyMasked ?? "Chave não configurada"}
              value={integrationForm.openaiApiKey}
              onChange={(event) =>
                setIntegrationForm((prev: any) => ({ ...prev, openaiApiKey: event.target.value }))
              }
              disabled={isReadOnly}
            />
          </label>
          <label>
            <span>Chave da API Anthropic</span>
            <input
              placeholder={integrationSettings?.anthropicKeyMasked ?? "Chave não configurada"}
              value={integrationForm.anthropicApiKey}
              onChange={(event) =>
                setIntegrationForm((prev: any) => ({ ...prev, anthropicApiKey: event.target.value }))
              }
              disabled={isReadOnly}
            />
          </label>

          {integrationError && !integrationError.includes("Autenticação") && <p className="modal-error">{integrationError}</p>}

          {!isReadOnly && (
            <div className="modal-actions">
              <div />
              <div className="modal-actions-right">
                <button type="submit" className="primary-button" disabled={integrationSaving}>
                  {integrationSaving ? "Salvando..." : "Salvar"}
                </button>
              </div>
            </div>
          )}
        </form>
      </article>

      <article className="panel rounded-3xl glassmorphism card-3d-inner">
        <div className="panel-heading">
          <div>
            <span className="section-kicker">Bitrix24</span>
            <h3>Importar e exportar negócios</h3>
          </div>
        </div>
        <div className="integration-actions">
          <button
            type="button"
            className="primary-button"
            disabled={isReadOnly || bitrixImportLoading}
            onClick={() => void runBitrixImport()}
          >
            {bitrixImportLoading ? "Buscando..." : "Importar do Bitrix24"}
          </button>
          <button
            type="button"
            className="primary-button"
            disabled={isReadOnly || bitrixExporting || deals.length === 0}
            onClick={() => void runBitrixExport()}
          >
            {bitrixExporting ? "Exportando..." : "Exportar todos para o Bitrix24"}
          </button>
          <button
            type="button"
            className="primary-button"
            onClick={() => downloadCsv(deals, "atlas-negocios-2026.csv")}
          >
            Exportar CSV
          </button>
          <label className={isReadOnly ? "csv-import-button disabled" : "csv-import-button"}>
            {csvImporting ? "Importando..." : "Importar CSV"}
            <input
              type="file"
              accept=".csv"
              disabled={isReadOnly || csvImporting}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) void handleCsvImport(file);
              }}
            />
          </label>
        </div>
        {bitrixImportError && !bitrixImportError.includes("Autenticação") && <p className="modal-error">{bitrixImportError}</p>}
        {bitrixExportError && !bitrixExportError.includes("Autenticação") && <p className="modal-error">{bitrixExportError}</p>}
        {csvImportError && !csvImportError.includes("Autenticação") && <p className="modal-error">{csvImportError}</p>}

        {bitrixImportItems && (
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th></th>
                  <th>Título</th>
                  <th>Valor</th>
                  <th>Etapa (Bitrix)</th>
                </tr>
              </thead>
              <tbody>
                {bitrixImportItems.map((item: any) => (
                  <tr key={item.bitrixId}>
                    <td>
                      <input
                        type="checkbox"
                        checked={bitrixImportSelected.has(item.bitrixId)}
                        onChange={() => toggleBitrixImportSelection(item.bitrixId)}
                      />
                    </td>
                    <td>{item.title}</td>
                    <td>{preciseCurrency.format(item.amount)}</td>
                    <td>{item.stageId}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="modal-actions">
              <div />
              <div className="modal-actions-right">
                <button
                  type="button"
                  className="modal-cancel"
                  onClick={() => setBitrixImportItems(null)}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="primary-button"
                  disabled={bitrixImportConfirming || bitrixImportSelected.size === 0}
                  onClick={() => void confirmBitrixImport()}
                >
                  {bitrixImportConfirming
                    ? "Importando..."
                    : `Confirmar importação (${bitrixImportSelected.size})`}
                </button>
              </div>
            </div>
          </div>
        )}
      </article>

      <article className="panel rounded-3xl glassmorphism card-3d-inner">
        <div className="panel-heading">
          <div>
            <span className="section-kicker">Prospecção</span>
            <h3>Buscar ou enriquecer um lead</h3>
          </div>
        </div>
        <div className="lead-search-form">
          <label>
            <span>Empresa</span>
            <input
              value={leadQuery.company}
              onChange={(event) =>
                setLeadQuery((prev: any) => ({ ...prev, company: event.target.value }))
              }
            />
          </label>
          <label>
            <span>Domínio</span>
            <input
              placeholder="empresa.com.br"
              value={leadQuery.domain}
              onChange={(event) =>
                setLeadQuery((prev: any) => ({ ...prev, domain: event.target.value }))
              }
            />
          </label>
          <label>
            <span>E-mail da pessoa</span>
            <input
              value={leadQuery.email}
              onChange={(event) =>
                setLeadQuery((prev: any) => ({ ...prev, email: event.target.value }))
              }
            />
          </label>
        </div>
        <div className="integration-actions">
          <button
            type="button"
            className="primary-button"
            disabled={isReadOnly || leadLoading !== null}
            onClick={() => void runLeadSearch("apollo")}
          >
            {leadLoading === "apollo" ? "Buscando..." : "Buscar no Apollo"}
          </button>
          <button
            type="button"
            className="primary-button"
            disabled={isReadOnly || leadLoading !== null}
            onClick={() => void runLeadSearch("google")}
          >
            {leadLoading === "google" ? "Buscando..." : "Buscar no Google"}
          </button>
        </div>
        {leadError && !leadError.includes("Autenticação") && <p className="modal-error">{leadError}</p>}
        {leadResult && (
          <div className="lead-result-card">
            <div>
              <span>Nome</span>
              <strong>{leadResult.name ?? "—"}</strong>
            </div>
            <div>
              <span>Empresa</span>
              <strong>{leadResult.company ?? "—"}</strong>
            </div>
            <div>
              <span>Cargo</span>
              <strong>{leadResult.title ?? "—"}</strong>
            </div>
            <div>
              <span>E-mail</span>
              <strong>{leadResult.email ?? "—"}</strong>
            </div>
            <div>
              <span>Telefone</span>
              <strong>{leadResult.phone ?? "—"}</strong>
            </div>
            <div>
              <span>Endereço</span>
              <strong>{leadResult.address ?? "—"}</strong>
            </div>
            <div>
              <span>Site</span>
              <strong>{leadResult.website ?? "—"}</strong>
            </div>
            {!isReadOnly && (
              <button
                type="button"
                className="primary-button"
                onClick={() => openDealModalFromLead(leadResult)}
              >
                Salvar como negócio
              </button>
            )}
          </div>
        )}
      </article>

      <article className="panel rounded-3xl glassmorphism card-3d-inner">
        <div className="panel-heading">
          <div>
            <span className="section-kicker">Relatórios</span>
            <h3>Gerar relatório executivo com IA</h3>
          </div>
        </div>
        <p>
          Usa o resumo executivo, health score, alertas ativos e desempenho por vendedor já
          calculados nesta tela para escrever um relatório narrativo.
        </p>
        <button
          type="button"
          className="primary-button"
          disabled={isReadOnly || aiReportLoading}
          onClick={() => void generateAiReport()}
        >
          Gerar relatório com IA
        </button>
      </article>
    </section>
  );
}
