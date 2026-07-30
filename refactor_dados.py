import sys

def main():
    with open('app/CommercialControl.tsx', 'r', encoding='utf-8') as f:
        content = f.read()

    # Add import if missing
    import_stmt = 'import { DadosSection } from "./components/DadosSection";\n'
    if 'import { DadosSection }' not in content:
        content = content.replace('import { GovernancaSection } from "./components/GovernancaSection";', import_stmt + 'import { GovernancaSection } from "./components/GovernancaSection";')

    # Replace the section
    start_str = '{section === "dados" && currentSheet && ('
    end_str = ')}\n\n        {section === "integracoes" && ('
    
    start_idx = content.find(start_str)
    end_idx = content.find(end_str)

    if start_idx != -1 and end_idx != -1:
        replacement = """{section === "dados" && currentSheet && (
          <DadosSection
            data={data}
            currentSheet={currentSheet}
            setSelectedSheet={setSelectedSheet}
            setSheetSearch={setSheetSearch}
            sheetSearch={sheetSearch}
            sheetMode={sheetMode}
            setSheetMode={setSheetMode}
            visibleSheetRows={visibleSheetRows}
          />
        """
        
        content = content[:start_idx] + replacement + content[end_idx:]
        
        with open('app/CommercialControl.tsx', 'w', encoding='utf-8') as f:
            f.write(content)
        print("Successfully refactored DadosSection.")
    else:
        print("Could not find start or end index for Dados section.")

if __name__ == '__main__':
    main()
