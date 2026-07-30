import { Project, SyntaxKind } from "ts-morph";
import * as fs from "fs";

const project = new Project({ tsConfigFilePath: "tsconfig.json" });
const sourceFile = project.getSourceFile("app/CommercialControl.tsx");

if (!sourceFile) process.exit(1);

const functionDecl = sourceFile.getFunction("CommercialControl");
if (!functionDecl) process.exit(1);

// We will copy the entire function body up to the return statement.
const bodyText = functionDecl.getBodyText();
const returnIdx = bodyText.indexOf("return (");
const stateLogic = bodyText.substring(0, returnIdx);

// Now we generate useCommercialState.ts
const newFileContent = `import { useState, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { deriveMetrics, MONTH_NAMES, STAGES, STAGE_LABELS } from "../deriveMetrics";
import type { Deal, MonthlyMetric, Seller, SellerGrowthTarget, SellerRole, Stage, Target } from "../deriveMetrics";
import { buildDashboardInsights } from "../deriveDashboard";
import type { ActionHorizon, ActionItem, ActionStatus } from "../deriveDashboard";
import { classifyRevenue, computeForecastScenarios } from "../deriveRevenueIntelligence";
import { computeSalesHealthScore } from "../deriveHealthScore";
import { computeAlerts, type AlertState } from "../deriveAlerts";
import { computeSellerPerformanceScore } from "../deriveSellerScore";
import { ENTERPRISE_ROADMAP } from "../deriveEnterpriseRoadmap";
import type { CommercialData, Objective, ObjectiveKeyResult } from "@/db/commercial-data";
import { ACTION_LABELS } from "../utils/constants";
import { DealFormValues, ActionItemFormValues } from "../CommercialControl";

type ActivityEntry = any;
type IntegrationSettingsView = any;
type BitrixImportItem = any;
type EnrichedLead = any;
type Section = any;

export function useCommercialState(data: CommercialData, user: any, isReadOnly: boolean) {
${stateLogic}

  return {
    section, setSection, search, setSearch, monthFilter, setMonthFilter, ownerFilter, setOwnerFilter, selectedOwner, setSelectedOwner,
    selectedSheet, setSelectedSheet, sheetSearch, setSheetSearch, sheetMode, setSheetMode,
    deals, setDeals, targets, setTargets, sellers, setSellers, growthTargets, setGrowthTargets, alertStates, setAlertStates,
    alertActionKey, setAlertActionKey, alertJustifications, setAlertJustifications, drilldown, setDrilldown, auditFilters, setAuditFilters,
    auditResults, setAuditResults, auditLoading, setAuditLoading, auditError, setAuditError, asOf, setAsOf, activity, setActivity,
    lastSyncedAt, setLastSyncedAt, syncError, setSyncError, now, setNow,
    pipelineView, setPipelineView, dragOverStage, setDragOverStage, dealModal, setDealModal, modalSaving, setModalSaving, modalError, setModalError,
    sellerModalOpen, setSellerModalOpen, sellerModalSaving, setSellerModalSaving, sellerModalError, setSellerModalError, toast, setToast,
    actionItems, setActionItems, actionItemModal, setActionItemModal, actionItemModalSaving, setActionItemModalSaving, actionItemModalError, setActionItemModalError,
    monthlyRecordModal, setMonthlyRecordModal, monthlyRecordModalSaving, setMonthlyRecordModalSaving, monthlyRecordModalError, setMonthlyRecordModalError,
    visaoScope, setVisaoScope, visaoMonth, setVisaoMonth, dailyPromptOpen, setDailyPromptOpen, dailyPromptQuery, setDailyPromptQuery,
    showAllActivity, setShowAllActivity, showAllQualityIssues, setShowAllQualityIssues, showAllBottlenecks, setShowAllBottlenecks,
    integrationSettings, setIntegrationSettings, integrationForm, setIntegrationForm, integrationSaving, setIntegrationSaving, integrationError, setIntegrationError,
    bitrixImportItems, setBitrixImportItems, bitrixImportSelected, setBitrixImportSelected, bitrixImportLoading, setBitrixImportLoading, bitrixImportError, setBitrixImportError, bitrixImportConfirming, setBitrixImportConfirming, bitrixExporting, setBitrixExporting, bitrixExportError, setBitrixExportError, csvImporting, setCsvImporting, csvImportError, setCsvImportError,
    leadQuery, setLeadQuery, leadResult, setLeadResult, leadLoading, setLeadLoading, leadError, setLeadError, leadPrefill, setLeadPrefill,
    aiReportOpen, setAiReportOpen, aiReportLoading, setAiReportLoading, aiReportError, setAiReportError, aiReportText, setAiReportText,
    objectives, setObjectives, objectiveModal, setObjectiveModal, objectiveModalSaving, setObjectiveModalSaving, objectiveModalError, setObjectiveModalError,
    owners, sellerRoleByName, derived, dashboardInsights, revenueClassification, forecastScenarios, healthScore, alerts, alertStateByKey, dealsById, sellerScores, dataQualityMetrics, actionItemsByHorizon, origins,
    showToast, setAlertStatus, applyAuditFilters, clearAuditFilters, createDeal, updateDeal, deleteDeal, moveDealStage, updateMonthlyRecord, updateGrowthTarget, addSeller, createActionItem, updateActionItem, deleteActionItemFn, clockMounted, pendingIdsRef
  };
}
`;

fs.writeFileSync("app/hooks/useCommercialState.ts", newFileContent);

// Now update CommercialControl to use this hook
const returnBlock = bodyText.substring(returnIdx);
const newComponentBody = `  const state = useCommercialState(data, user, isReadOnly);
  const {
    section, setSection, search, setSearch, monthFilter, setMonthFilter, ownerFilter, setOwnerFilter, selectedOwner, setSelectedOwner,
    selectedSheet, setSelectedSheet, sheetSearch, setSheetSearch, sheetMode, setSheetMode,
    deals, setDeals, targets, setTargets, sellers, setSellers, growthTargets, setGrowthTargets, alertStates, setAlertStates,
    alertActionKey, setAlertActionKey, alertJustifications, setAlertJustifications, drilldown, setDrilldown, auditFilters, setAuditFilters,
    auditResults, setAuditResults, auditLoading, setAuditLoading, auditError, setAuditError, asOf, setAsOf, activity, setActivity,
    lastSyncedAt, setLastSyncedAt, syncError, setSyncError, now, setNow,
    pipelineView, setPipelineView, dragOverStage, setDragOverStage, dealModal, setDealModal, modalSaving, setModalSaving, modalError, setModalError,
    sellerModalOpen, setSellerModalOpen, sellerModalSaving, setSellerModalSaving, sellerModalError, setSellerModalError, toast, setToast,
    actionItems, setActionItems, actionItemModal, setActionItemModal, actionItemModalSaving, setActionItemModalSaving, actionItemModalError, setActionItemModalError,
    monthlyRecordModal, setMonthlyRecordModal, monthlyRecordModalSaving, setMonthlyRecordModalSaving, monthlyRecordModalError, setMonthlyRecordModalError,
    visaoScope, setVisaoScope, visaoMonth, setVisaoMonth, dailyPromptOpen, setDailyPromptOpen, dailyPromptQuery, setDailyPromptQuery,
    showAllActivity, setShowAllActivity, showAllQualityIssues, setShowAllQualityIssues, showAllBottlenecks, setShowAllBottlenecks,
    integrationSettings, setIntegrationSettings, integrationForm, setIntegrationForm, integrationSaving, setIntegrationSaving, integrationError, setIntegrationError,
    bitrixImportItems, setBitrixImportItems, bitrixImportSelected, setBitrixImportSelected, bitrixImportLoading, setBitrixImportLoading, bitrixImportError, setBitrixImportError, bitrixImportConfirming, setBitrixImportConfirming, bitrixExporting, setBitrixExporting, bitrixExportError, setBitrixExportError, csvImporting, setCsvImporting, csvImportError, setCsvImportError,
    leadQuery, setLeadQuery, leadResult, setLeadResult, leadLoading, setLeadLoading, leadError, setLeadError, leadPrefill, setLeadPrefill,
    aiReportOpen, setAiReportOpen, aiReportLoading, setAiReportLoading, aiReportError, setAiReportError, aiReportText, setAiReportText,
    objectives, setObjectives, objectiveModal, setObjectiveModal, objectiveModalSaving, setObjectiveModalSaving, objectiveModalError, setObjectiveModalError,
    owners, sellerRoleByName, derived, dashboardInsights, revenueClassification, forecastScenarios, healthScore, alerts, alertStateByKey, dealsById, sellerScores, dataQualityMetrics, actionItemsByHorizon, origins,
    showToast, setAlertStatus, applyAuditFilters, clearAuditFilters, createDeal, updateDeal, deleteDeal, moveDealStage, updateMonthlyRecord, updateGrowthTarget, addSeller, createActionItem, updateActionItem, deleteActionItemFn, clockMounted, pendingIdsRef
  } = state;

  // We need to keep a few types locally or export them
  ${returnBlock}
`;

functionDecl.setBodyText(newComponentBody);

// add import to CommercialControl
sourceFile.addImportDeclaration({
  namedImports: ["useCommercialState"],
  moduleSpecifier: "./hooks/useCommercialState"
});

project.saveSync();
console.log("Extracted state to useCommercialState!");
