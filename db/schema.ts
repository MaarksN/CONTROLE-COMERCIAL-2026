import { sql } from "drizzle-orm";
import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const appState = sqliteTable("app_state", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const monthlyMetrics = sqliteTable(
  "monthly_metrics",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    year: integer("year").notNull(),
    monthNumber: integer("month_number").notNull(),
    month: text("month").notNull(),
    target: real("target").notNull(),
    sold: real("sold").notNull(),
    adjusted: real("adjusted").notNull(),
    payloadJson: text("payload_json").notNull(),
  },
  (table) => ({
    yearMonthUnique: uniqueIndex("monthly_metrics_year_month_unique").on(
      table.year,
      table.monthNumber,
    ),
  }),
);

// Financial pipeline stage: aberto (open) -> ganho (won) -> faturado (billed) -> pago (paid).
export const commercialDeals = sqliteTable(
  "commercial_deals",
  {
    id: text("id").primaryKey(),
    year: integer("year").notNull(),
    monthNumber: integer("month_number").notNull(),
    month: text("month").notNull(),
    owner: text("owner").notNull(),
    company: text("company").notNull(),
    origin: text("origin").notNull(),
    sold: real("sold").notNull(),
    adjusted: real("adjusted").notNull(),
    billed: real("billed").notNull().default(0),
    stage: text("stage").notNull().default("aberto"),
    notes: text("notes"),
    createdBy: text("created_by"),
    updatedBy: text("updated_by"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    payloadJson: text("payload_json").notNull(),
  },
  (table) => ({
    stageIdx: index("commercial_deals_stage_idx").on(table.stage),
    ownerIdx: index("commercial_deals_owner_idx").on(table.owner),
    yearMonthIdx: index("commercial_deals_year_month_idx").on(
      table.year,
      table.monthNumber,
    ),
  }),
);

// Action plan horizons (Bitrix roadmap): h0 0-30d, h1 31-90d, h2 3-6m, h3 6-12m.
export const actionItems = sqliteTable(
  "action_items",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    owner: text("owner"),
    horizon: text("horizon").notNull().default("h1"),
    status: text("status").notNull().default("pendente"),
    source: text("source"),
    createdBy: text("created_by"),
    updatedBy: text("updated_by"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    statusIdx: index("action_items_status_idx").on(table.status),
    horizonIdx: index("action_items_horizon_idx").on(table.horizon),
  }),
);

export const workbookRows = sqliteTable("workbook_rows", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sheetName: text("sheet_name").notNull(),
  rowNumber: integer("row_number").notNull(),
  dataJson: text("data_json").notNull(),
  formulaJson: text("formula_json").notNull(),
});

export const objectives = sqliteTable("objectives", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  owner: text("owner").notNull(),
  progress: real("progress").notNull(),
  payloadJson: text("payload_json").notNull(),
});

export const userRoles = sqliteTable("user_roles", {
  email: text("email").primaryKey(),
  role: text("role").notNull().default("Diretoria (leitura)"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

// Forward-looking growth plan per seller: monthly targets for pipeline
// entry ("entrada") and closed/realized revenue ("realizado"), spanning a
// 20-24 month horizon so leadership can track increase over time, not just
// the current year.
export const sellerGrowthTargets = sqliteTable(
  "seller_growth_targets",
  {
    id: text("id").primaryKey(),
    owner: text("owner").notNull(),
    year: integer("year").notNull(),
    monthNumber: integer("month_number").notNull(),
    month: text("month").notNull(),
    entryTarget: real("entry_target").notNull().default(0),
    realizedTarget: real("realized_target").notNull().default(0),
    createdBy: text("created_by"),
    updatedBy: text("updated_by"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    ownerYearMonthUnique: uniqueIndex("seller_growth_targets_owner_year_month_unique").on(
      table.owner,
      table.year,
      table.monthNumber,
    ),
    ownerIdx: index("seller_growth_targets_owner_idx").on(table.owner),
  }),
);

export const auditLog = sqliteTable("audit_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  actorEmail: text("actor_email").notNull(),
  action: text("action").notNull(),
  entity: text("entity").notNull(),
  entityId: text("entity_id"),
  detailJson: text("detail_json").notNull().default("{}"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
