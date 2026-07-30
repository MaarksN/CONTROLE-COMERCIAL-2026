import { Project } from "ts-morph";
import * as fs from "fs";
import * as path from "path";

fs.mkdirSync("app/utils", { recursive: true });
fs.mkdirSync("app/components/modals", { recursive: true });
fs.mkdirSync("app/hooks", { recursive: true });

const project = new Project({
  tsConfigFilePath: "tsconfig.json",
});

const sourceFile = project.getSourceFile("app/CommercialControl.tsx");
if (!sourceFile) {
  console.error("Could not find CommercialControl.tsx");
  process.exit(1);
}

// 1. FORMATTERS -> app/utils/formatters.ts
const formattersFile = project.createSourceFile("app/utils/formatters.ts", "", { overwrite: true });
const formattersList = [
  "currency", "preciseCurrency", "percent",
  "initials", "formatKeyResult", "healthLabel", "timeAgoLabel",
  "relativeTimestamp", "capitalizeFirst", "isSameDate", "buildMonthGrid"
];
for (const name of formattersList) {
  const fn = sourceFile.getFunction(name);
  if (fn) {
    formattersFile.addFunction(fn.getStructure());
    fn.remove();
  }
  const varDecl = sourceFile.getVariableStatement(name);
  if (varDecl) {
    formattersFile.addVariableStatement(varDecl.getStructure());
    varDecl.remove();
  }
}
formattersFile.addImportDeclaration({
  namedImports: ["Stage"],
  moduleSpecifier: "../deriveMetrics"
});
// Need to export all functions/vars in formattersFile
formattersFile.getFunctions().forEach(f => f.setIsExported(true));
formattersFile.getVariableStatements().forEach(v => v.setIsExported(true));

// 2. CSV -> app/utils/csv.ts
const csvFile = project.createSourceFile("app/utils/csv.ts", "", { overwrite: true });
const csvNames = ["downloadCsv", "parseCsv"];
for (const name of csvNames) {
  const fn = sourceFile.getFunction(name);
  if (fn) {
    csvFile.addFunction(fn.getStructure());
    fn.remove();
  }
}
csvFile.getFunctions().forEach(f => f.setIsExported(true));
csvFile.addImportDeclaration({
  namedImports: ["Deal", "STAGE_LABELS"],
  moduleSpecifier: "../deriveMetrics"
});

// 3. CONSTANTS -> app/utils/constants.ts
const constantsFile = project.createSourceFile("app/utils/constants.ts", "", { overwrite: true });
const constantNames = [
  "SECTION_ICONS", "WEEKDAY_LABELS", "ACTION_LABELS", 
  "STAGE_PILL_CLASS", "ACTION_STATUS_LABELS", "ACTION_STATUS_ORDER",
  "nextActionStatus", "navItems"
];
for (const name of constantNames) {
  const fn = sourceFile.getFunction(name);
  if (fn) {
    constantsFile.addFunction(fn.getStructure());
    fn.remove();
  }
  const varDecl = sourceFile.getVariableStatement(name);
  if (varDecl) {
    constantsFile.addVariableStatement(varDecl.getStructure());
    varDecl.remove();
  }
}
constantsFile.getFunctions().forEach(f => f.setIsExported(true));
constantsFile.getVariableStatements().forEach(v => v.setIsExported(true));
constantsFile.addImportDeclaration({
  namedImports: ["Stage"],
  moduleSpecifier: "../deriveMetrics"
});
constantsFile.addImportDeclaration({
  namedImports: ["ActionStatus"],
  moduleSpecifier: "../deriveDashboard"
});
constantsFile.addImportDeclaration({
  namedImports: ["Section"],
  moduleSpecifier: "../CommercialControl" // or from a types file if it exists, for now just export Section in CommercialControl
});


// Save all files
project.saveSync();
console.log("Extracted formatters, csv, constants!");
