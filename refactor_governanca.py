import sys

def main():
    with open('app/CommercialControl.tsx', 'r', encoding='utf-8') as f:
        content = f.read()

    # Add exports
    content = content.replace('function relativeTimestamp(', 'export function relativeTimestamp(')
    content = content.replace('const ACTION_LABELS:', 'export const ACTION_LABELS:')

    # Add import if missing
    import_stmt = 'import { GovernancaSection } from "./components/GovernancaSection";\n'
    if 'import { GovernancaSection }' not in content:
        content = content.replace('import { EquipeSection } from "./components/EquipeSection";', import_stmt + 'import { EquipeSection } from "./components/EquipeSection";')

    # Replace the section
    start_str = '{section === "governanca" && ('
    end_str = ')}\n\n        {section === "dados" && currentSheet && ('
    
    start_idx = content.find(start_str)
    end_idx = content.find(end_str)

    if start_idx != -1 and end_idx != -1:
        replacement = """{section === "governanca" && (
          <GovernancaSection
            data={data}
            auditResults={auditResults}
            activity={activity}
            auditFilters={auditFilters}
            setAuditFilters={setAuditFilters}
            auditLoading={auditLoading}
            applyAuditFilters={applyAuditFilters}
            clearAuditFilters={clearAuditFilters}
            auditError={auditError}
            showAllActivity={showAllActivity}
            setShowAllActivity={setShowAllActivity}
            dataQualityMetrics={dataQualityMetrics}
            deals={deals}
            setDrilldown={setDrilldown}
            showAllQualityIssues={showAllQualityIssues}
            setShowAllQualityIssues={setShowAllQualityIssues}
            setSection={setSection}
          />
        """
        
        content = content[:start_idx] + replacement + content[end_idx:]
        
        with open('app/CommercialControl.tsx', 'w', encoding='utf-8') as f:
            f.write(content)
        print("Successfully refactored GovernancaSection.")
    else:
        print("Could not find start or end index for Governanca section.")

if __name__ == '__main__':
    main()
