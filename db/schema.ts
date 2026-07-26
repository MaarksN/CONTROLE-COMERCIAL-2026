import { sql } from "drizzle-orm";
import {
  integer,
  real,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

export const appState = sqliteTable("app_state", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const monthlyMetrics = sqliteTable("monthly_metrics", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  year: integer("year").notNull(),
  monthNumber: integer("month_number").notNull(),
  month: text("month").notNull(),
  target: real("target").notNull(),
  sold: real("sold").notNull(),
  adjusted: real("adjusted").notNull(),
  payloadJson: text("payload_json").notNull(),
});

export const commercialDeals = sqliteTable("commercial_deals", {
  id: text("id").primaryKey(),
  year: integer("year").notNull(),
  monthNumber: integer("month_number").notNull(),
  month: text("month").notNull(),
  owner: text("owner").notNull(),
  company: text("company").notNull(),
  origin: text("origin").notNull(),
  sold: real("sold").notNull(),
  adjusted: real("adjusted").notNull(),
  payloadJson: text("payload_json").notNull(),
});

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

export const auditLog = sqliteTable("audit_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  actorEmail: text("actor_email").notNull(),
  action: text("action").notNull(),
  entity: text("entity").notNull(),
  entityId: text("entity_id"),
  detailJson: text("detail_json").notNull().default("{}"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
