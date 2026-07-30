import { Project } from "ts-morph";
import * as fs from "fs";

const project = new Project({ tsConfigFilePath: "tsconfig.json" });

const sourceFile = project.getSourceFile("app/CommercialControl.tsx");
if (!sourceFile) process.exit(1);

const modals = [
  "DealModal", "SellerModal", "ActionItemModal", 
  "MonthlyRecordModal", "DealDrilldownModal", 
  "DailyPromptModal", "ObjectiveModal"
];
for (const modal of modals) {
  const fn = sourceFile.getFunction(modal);
  if (fn) {
    const newFile = project.createSourceFile(`app/components/modals/${modal}.tsx`, "", { overwrite: true });
    newFile.addFunction(fn.getStructure());
    newFile.getFunction(modal).setIsExported(true);
    // Add generic imports - we will fix TS errors iteratively
    fn.remove();
  }
}

const components = ["TargetEditable", "EditableCurrencyCell"];
for (const comp of components) {
  const fn = sourceFile.getFunction(comp);
  if (fn) {
    const newFile = project.createSourceFile(`app/components/${comp}.tsx`, "", { overwrite: true });
    newFile.addFunction(fn.getStructure());
    newFile.getFunction(comp).setIsExported(true);
    fn.remove();
  }
}

// Add types like DealFormValues, etc. if they are next to Modals.
const types = [
  "DealFormValues", "SellerFormValues", "ActionItemFormValues", 
  "MonthlyRecordFormValues", "ObjectiveFormValues",
  "emptyForm", "formFromDeal"
];
for (const t of types) {
  const typeDecl = sourceFile.getTypeAlias(t);
  const fnDecl = sourceFile.getFunction(t);
  
  if (typeDecl) {
    // If it's a DealModal type, put in DealModal.tsx
    // But since I don't know easily, I'll just put them in a shared types or keep them.
    // Actually, ts-morph is fine, I can just leave them in CommercialControl.tsx and export them.
    typeDecl.setIsExported(true);
  }
  if (fnDecl) {
    fnDecl.setIsExported(true);
  }
}

// Pure functions for derive
const pureFuncs = ["buildSellerSummary", "buildGrowthPlan"];
const deriveMetricsFile = project.getSourceFile("app/deriveMetrics.ts");
for (const func of pureFuncs) {
  const fn = sourceFile.getFunction(func);
  if (fn) {
    deriveMetricsFile.addFunction(fn.getStructure());
    deriveMetricsFile.getFunction(func).setIsExported(true);
    fn.remove();
  }
}


project.saveSync();
console.log("Extracted modals, components, pure functions!");
