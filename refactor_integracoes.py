import sys

def main():
    with open('app/CommercialControl.tsx', 'r', encoding='utf-8') as f:
        content = f.read()

    # Add import if missing
    import_stmt = 'import { IntegracoesSection } from "./components/IntegracoesSection";\n'
    if 'import { IntegracoesSection }' not in content:
        content = content.replace('import { DadosSection } from "./components/DadosSection";', import_stmt + 'import { DadosSection } from "./components/DadosSection";')

    # Replace the section
    start_str = '{section === "integracoes" && ('
    end_str = ')}\n\n        <footer className="app-footer">'
    
    start_idx = content.find(start_str)
    end_idx = content.find(end_str)

    if start_idx != -1 and end_idx != -1:
        replacement = """{section === "integracoes" && (
          <IntegracoesSection
            integrationSettings={integrationSettings}
            integrationError={integrationError}
            integrationForm={integrationForm}
            setIntegrationForm={setIntegrationForm}
            isReadOnly={isReadOnly}
            saveIntegrationSettings={saveIntegrationSettings}
            integrationSaving={integrationSaving}
            bitrixImportLoading={bitrixImportLoading}
            runBitrixImport={runBitrixImport}
            bitrixExporting={bitrixExporting}
            deals={deals}
            runBitrixExport={runBitrixExport}
            csvImporting={csvImporting}
            handleCsvImport={handleCsvImport}
            bitrixImportError={bitrixImportError}
            bitrixExportError={bitrixExportError}
            csvImportError={csvImportError}
            bitrixImportItems={bitrixImportItems}
            bitrixImportSelected={bitrixImportSelected}
            toggleBitrixImportSelection={toggleBitrixImportSelection}
            setBitrixImportItems={setBitrixImportItems}
            bitrixImportConfirming={bitrixImportConfirming}
            confirmBitrixImport={confirmBitrixImport}
            leadQuery={leadQuery}
            setLeadQuery={setLeadQuery}
            leadLoading={leadLoading}
            runLeadSearch={runLeadSearch}
            leadError={leadError}
            leadResult={leadResult}
            openDealModalFromLead={openDealModalFromLead}
            aiReportLoading={aiReportLoading}
            generateAiReport={generateAiReport}
          />
        """
        
        content = content[:start_idx] + replacement + content[end_idx:]
        
        with open('app/CommercialControl.tsx', 'w', encoding='utf-8') as f:
            f.write(content)
        print("Successfully refactored IntegracoesSection.")
    else:
        print("Could not find start or end index for Integracoes section.")

if __name__ == '__main__':
    main()
