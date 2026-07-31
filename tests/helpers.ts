import type { Deal, OwnerPerformance } from "../app/deriveMetrics";
import type { ActionItem } from "../app/deriveDashboard";

let counter = 0;

export function makeDeal(overrides: Partial<Deal> = {}): Deal {
  counter += 1;
  return {
    id: `deal-${counter}`,
    year: 2026,
    month: "Julho",
    monthNumber: 7,
    owner: "Vendedor Teste",
    company: `Empresa ${counter}`,
    origin: "Prospecção Ativa",
    sold: 1000,
    governedSold: 1000,
    adjusted: 1000,
    proposalAcceptedAt: "2026-07-01",
    contractSignedAt: "2026-07-05",
    billed: 0,
    variance: 0,
    billingStatus: "Sem status",
    stage: "aberto",
    notes: null,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    createdBy: "seed",
    updatedBy: "seed",
    ...overrides,
  };
}

export function makeOwnerPerformance(overrides: Partial<OwnerPerformance> = {}): OwnerPerformance {
  return {
    owner: "Vendedor Teste",
    deals: 1,
    sold: 1000,
    adjusted: 1000,
    billed: 0,
    ...overrides,
  };
}

export function makeActionItem(overrides: Partial<ActionItem> = {}): ActionItem {
  counter += 1;
  return {
    id: `action-${counter}`,
    title: `Ação ${counter}`,
    description: "",
    owner: "Vendedor Teste",
    horizon: "h1",
    status: "pendente",
    source: null,
    dueDate: null,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    createdBy: "seed",
    updatedBy: "seed",
    ...overrides,
  };
}
