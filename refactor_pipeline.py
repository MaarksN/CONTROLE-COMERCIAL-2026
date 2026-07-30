import sys

def main():
    with open('app/CommercialControl.tsx', 'r', encoding='utf-8') as f:
        content = f.read()

    # Add exports
    content = content.replace('const STAGE_PILL_CLASS:', 'export const STAGE_PILL_CLASS:')
    content = content.replace('function initials(', 'export function initials(')
    content = content.replace('function downloadCsv(', 'export function downloadCsv(')

    # Add import if missing
    import_stmt = 'import { PipelineSection } from "./components/PipelineSection";\n'
    if 'import { PipelineSection }' not in content:
        content = content.replace('import { IntelligenceSection } from "./components/IntelligenceSection";', import_stmt + 'import { IntelligenceSection } from "./components/IntelligenceSection";')

    # Replace the section
    start_str = '{section === "pipeline" && ('
    end_str = ')}\n\n        {section === "okrs" && ('
    
    start_idx = content.find(start_str)
    end_idx = content.find(end_str)

    if start_idx != -1 and end_idx != -1:
        replacement = """{section === "pipeline" && (
          <PipelineSection
            deals={deals}
            pipelineView={pipelineView}
            setPipelineView={setPipelineView}
            filteredDeals={filteredDeals}
            isReadOnly={isReadOnly}
            setDealModal={setDealModal}
            search={search}
            setSearch={setSearch}
            monthFilter={monthFilter}
            setMonthFilter={setMonthFilter}
            monthlyMetrics={monthlyMetrics}
            ownerFilter={ownerFilter}
            setOwnerFilter={setOwnerFilter}
            owners={owners}
            dragOverStage={dragOverStage}
            setDragOverStage={setDragOverStage}
            moveDealStage={moveDealStage}
            dealsByStage={dealsByStage}
            now={now}
          />
        """
        
        content = content[:start_idx] + replacement + content[end_idx:]
        
        with open('app/CommercialControl.tsx', 'w', encoding='utf-8') as f:
            f.write(content)
        print("Successfully refactored PipelineSection.")
    else:
        print("Could not find start or end index for Pipeline section.")

if __name__ == '__main__':
    main()
