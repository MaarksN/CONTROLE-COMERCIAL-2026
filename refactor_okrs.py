import sys

def main():
    with open('app/CommercialControl.tsx', 'r', encoding='utf-8') as f:
        content = f.read()

    # Add exports
    content = content.replace('function formatKeyResult(', 'export function formatKeyResult(')

    # Add import if missing
    import_stmt = 'import { OkrsSection } from "./components/OkrsSection";\n'
    if 'import { OkrsSection }' not in content:
        content = content.replace('import { VisaoSection } from "./components/VisaoSection";', import_stmt + 'import { VisaoSection } from "./components/VisaoSection";')

    # Replace the section
    start_str = '{section === "okrs" && ('
    end_str = ')}\n\n        {section === "equipe" && ('
    
    start_idx = content.find(start_str)
    end_idx = content.find(end_str)

    if start_idx != -1 and end_idx != -1:
        replacement = """{section === "okrs" && (
          <OkrsSection
            objectives={objectives}
            isReadOnly={isReadOnly}
            setObjectiveModal={setObjectiveModal}
          />
        """
        
        content = content[:start_idx] + replacement + content[end_idx:]
        
        with open('app/CommercialControl.tsx', 'w', encoding='utf-8') as f:
            f.write(content)
        print("Successfully refactored OkrsSection.")
    else:
        print("Could not find start or end index for Okrs section.")

if __name__ == '__main__':
    main()
