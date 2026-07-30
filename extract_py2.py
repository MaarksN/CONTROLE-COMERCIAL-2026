import os

with open('app/CommercialControl.tsx', 'r', encoding='utf-8') as f:
    lines = f.readlines()

start_idx = -1
for i, line in enumerate(lines):
    if "export function CommercialControl" in line:
        start_idx = i
        break

if start_idx == -1:
    print("Could not find CommercialControl")
    exit(1)

# Find where the main return starts
return_idx = -1
for i in range(start_idx, len(lines)):
    if lines[i].startswith("  return ("):
        return_idx = i
        break

state_lines = lines[start_idx+1:return_idx]
return_lines = lines[return_idx:]

state_body = "".join(state_lines)

# We wrote useCommercialState.ts already, let's fix its syntax just in case
with open('app/hooks/useCommercialState.ts', 'r', encoding='utf-8') as f:
    hook_content = f.read()

# Let's write the new CommercialControl.tsx
new_component = """  const state = useCommercialState(data, user, isReadOnly);
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
"""

final_lines = lines[:start_idx] + [
    "import { useCommercialState } from './hooks/useCommercialState';\n",
    "export function CommercialControl({\n  data,\n  user,\n  isReadOnly,\n}: { data: CommercialData; user: User; isReadOnly: boolean }) {\n",
    new_component
] + return_lines

with open('app/CommercialControl.tsx', 'w', encoding='utf-8') as f:
    f.writelines(final_lines)

print("Replaced state inside CommercialControl.tsx")
