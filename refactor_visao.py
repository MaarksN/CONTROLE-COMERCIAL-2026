import sys

def main():
    with open('app/CommercialControl.tsx', 'r', encoding='utf-8') as f:
        content = f.read()

    # Add exports
    content = content.replace('function TargetEditable(', 'export function TargetEditable(')
    content = content.replace('function EditableCurrencyCell(', 'export function EditableCurrencyCell(')

    # Add import if missing
    import_stmt = 'import { VisaoSection } from "./components/VisaoSection";\n'
    if 'import { VisaoSection }' not in content:
        content = content.replace('import { IntelligenceSection } from "./components/IntelligenceSection";', import_stmt + 'import { IntelligenceSection } from "./components/IntelligenceSection";')

    # Replace the section
    start_str = '{section === "visao" && ('
    end_str = ')}\n\n        {section === "pipeline" && ('
    
    start_idx = content.find(start_str)
    end_idx = content.find(end_str)

    if start_idx != -1 and end_idx != -1:
        replacement = """{section === "visao" && (
          <VisaoSection
            visaoScope={visaoScope}
            setVisaoScope={setVisaoScope}
            selectedOwner={selectedOwner}
            setSelectedOwner={setSelectedOwner}
            owners={owners}
            sellerRoleByName={sellerRoleByName}
            visaoMonth={visaoMonth}
            setVisaoMonth={setVisaoMonth}
            monthlyMetrics={monthlyMetrics}
            visaoCompanySummary={visaoCompanySummary}
            visaoMonthLabel={visaoMonthLabel}
            currentMonthMetric={currentMonthMetric}
            maxMonthly={maxMonthly}
            isReadOnly={isReadOnly}
            updateTarget={updateTarget}
            data={data}
            setSection={setSection}
            visaoSellerDeals={visaoSellerDeals}
            visaoSellerSummary={visaoSellerSummary}
            visaoCompanyDeals={visaoCompanyDeals}
            selectedOwnerWon={selectedOwnerWon}
            selectedOwnerOpen={selectedOwnerOpen}
            selectedOwnerGrowthPlan={selectedOwnerGrowthPlan}
            updateGrowthTarget={updateGrowthTarget}
          />
        """
        
        content = content[:start_idx] + replacement + content[end_idx:]
        
        with open('app/CommercialControl.tsx', 'w', encoding='utf-8') as f:
            f.write(content)
        print("Successfully refactored VisaoSection.")
    else:
        print("Could not find start or end index for Visao section.")

if __name__ == '__main__':
    main()
