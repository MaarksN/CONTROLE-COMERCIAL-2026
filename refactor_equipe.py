import sys

def main():
    with open('app/CommercialControl.tsx', 'r', encoding='utf-8') as f:
        content = f.read()

    # Add exports
    content = content.replace('const STAGE_LABELS:', 'export const STAGE_LABELS:')

    # Add import if missing
    import_stmt = 'import { EquipeSection } from "./components/EquipeSection";\n'
    if 'import { EquipeSection }' not in content:
        content = content.replace('import { OkrsSection } from "./components/OkrsSection";', import_stmt + 'import { OkrsSection } from "./components/OkrsSection";')

    # Replace the section
    start_str = '{section === "equipe" && ('
    end_str = ')}\n\n        {section === "governanca" && ('
    
    start_idx = content.find(start_str)
    end_idx = content.find(end_str)

    if start_idx != -1 and end_idx != -1:
        replacement = """{section === "equipe" && (
          <EquipeSection
            selectedOwner={selectedOwner}
            setSelectedOwner={setSelectedOwner}
            selectedOwnerDeals={selectedOwnerDeals}
            isReadOnly={isReadOnly}
            setSellerModalOpen={setSellerModalOpen}
            ownerPerformance={ownerPerformance}
            sellerRoleByName={sellerRoleByName}
            selectedOwnerDashboard={selectedOwnerDashboard}
            executiveSummary={executiveSummary}
            sellerScores={sellerScores}
            selectedOwnerMaxMonth={selectedOwnerMaxMonth}
            originPerformance={originPerformance}
            maxOrigin={maxOrigin}
            data={data}
            setSection={setSection}
            setDealModal={setDealModal}
          />
        """
        
        content = content[:start_idx] + replacement + content[end_idx:]
        
        with open('app/CommercialControl.tsx', 'w', encoding='utf-8') as f:
            f.write(content)
        print("Successfully refactored EquipeSection.")
    else:
        print("Could not find start or end index for Equipe section.")

if __name__ == '__main__':
    main()
