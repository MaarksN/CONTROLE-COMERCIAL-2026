import sys

def fix_imports_and_exports():
    # 1. CommercialControl.tsx
    with open('app/CommercialControl.tsx', 'r', encoding='utf-8') as f:
        cc_content = f.read()

    # move downloadActivityCsv outside of CommercialControl
    # Find downloadActivityCsv
    start_dl = cc_content.find('  function downloadActivityCsv(entries: ActivityEntry[], filename: string) {')
    end_dl = cc_content.find('  async function createDeal(')
    if start_dl != -1 and end_dl != -1:
        # Extract the function
        func_body = cc_content[start_dl:end_dl]
        # Remove it from inside the component
        cc_content = cc_content[:start_dl] + cc_content[end_dl:]
        # Add it outside the component (before export function CommercialControl)
        func_body = func_body.replace('  function downloadActivityCsv', 'export function downloadActivityCsv')
        
        insert_idx = cc_content.find('export function CommercialControl({')
        cc_content = cc_content[:insert_idx] + func_body + '\n' + cc_content[insert_idx:]

        with open('app/CommercialControl.tsx', 'w', encoding='utf-8') as f:
            f.write(cc_content)
        print("Fixed CommercialControl.tsx")
    else:
        print("Not found", start_dl, end_dl)


if __name__ == '__main__':
    fix_imports_and_exports()
