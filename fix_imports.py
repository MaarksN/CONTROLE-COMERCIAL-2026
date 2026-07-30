import os
import re
import glob

components_dir = "app/components"
utils_map = {
    "currency": "app/utils/formatters",
    "preciseCurrency": "app/utils/formatters",
    "percent": "app/utils/formatters",
    "initials": "app/utils/formatters",
    "formatKeyResult": "app/utils/formatters",
    "healthLabel": "app/utils/formatters",
    "timeAgoLabel": "app/utils/formatters",
    "relativeTimestamp": "app/utils/formatters",
    "capitalizeFirst": "app/utils/formatters",
    
    "downloadCsv": "app/utils/csv",
    "parseCsv": "app/utils/csv",
    
    "STAGE_PILL_CLASS": "app/utils/constants",
    "SECTION_ICONS": "app/utils/constants",
    "WEEKDAY_LABELS": "app/utils/constants",
    "ACTION_LABELS": "app/utils/constants",
    "ACTION_STATUS_LABELS": "app/utils/constants",
    "ACTION_STATUS_ORDER": "app/utils/constants",
    "nextActionStatus": "app/utils/constants"
}

for root, _, files in os.walk(components_dir):
    for f in files:
        if f.endswith(".tsx") or f.endswith(".ts"):
            path = os.path.join(root, f)
            with open(path, "r", encoding="utf-8") as file:
                content = file.read()

            new_content = content
            # Quick hack: we can just add imports at the top
            imports_to_add = {}
            for name, mod in utils_map.items():
                if name in new_content:
                    mod_path = mod.replace("app/", "../")
                    if root != components_dir:
                        mod_path = "../" + mod_path
                    if mod_path not in imports_to_add:
                        imports_to_add[mod_path] = set()
                    imports_to_add[mod_path].add(name)
            
            # Remove from original CommercialControl import
            def repl(m):
                # m.group(0) is the entire import { ... } from "../CommercialControl"
                return ""
                
            new_content = re.sub(r'import\s*\{[^}]*\}\s*from\s*["\']\.\.?/CommercialControl["\'];?', '', new_content)
            
            import_str = ""
            for mod, names in imports_to_add.items():
                import_str += f'import {{ {", ".join(names)} }} from "{mod}";\n'
                
            if import_str:
                new_content = import_str + new_content

            with open(path, "w", encoding="utf-8") as file:
                file.write(new_content)

print("Imports fixed in components!")
