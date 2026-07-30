import sys

def main():
    with open('app/CommercialControl.tsx', 'r', encoding='utf-8') as f:
        content = f.read()

    # Add import if missing
    import_stmt = 'import { IntelligenceSection } from "./components/IntelligenceSection";\n'
    if 'import { IntelligenceSection }' not in content:
        content = content.replace('import { DashboardSection } from "./components/DashboardSection";', import_stmt + 'import { DashboardSection } from "./components/DashboardSection";')

    # Replace the section
    start_str = '{section === "inteligencia" && ('
    end_str = ')}\n\n        {section === "visao" && ('
    
    start_idx = content.find(start_str)
    end_idx = content.find(end_str)

    if start_idx != -1 and end_idx != -1:
        replacement = """{section === "inteligencia" && (
          <IntelligenceSection
            forecastScenarios={forecastScenarios}
            deals={deals}
            setDrilldown={setDrilldown}
            revenueClassification={revenueClassification}
            healthScore={healthScore}
            alerts={alerts}
            alertStateByKey={alertStateByKey}
            isReadOnly={isReadOnly}
            alertJustifications={alertJustifications}
            setAlertJustifications={setAlertJustifications}
            alertActionKey={alertActionKey}
            setAlertStatus={setAlertStatus}
          />
        """
        
        content = content[:start_idx] + replacement + content[end_idx:]
        
        with open('app/CommercialControl.tsx', 'w', encoding='utf-8') as f:
            f.write(content)
        print("Successfully refactored IntelligenceSection.")
    else:
        print("Could not find start or end index for Inteligencia section.")

if __name__ == '__main__':
    main()
