import { env } from "cloudflare:workers";
import commercialDataJson from "../app/data/commercial-data.json";
import {
  deriveMetrics,
  inferStage,
  type Deal,
  type ExecutiveSummary,
  type MonthlyMetric,
  type OriginPerformance,
  type OwnerPerformance,
  type Seller,
  type SellerGrowthTarget,
  type Target,
} from "../app/deriveMetrics";
import {
  DEFAULT_ACTION_PLAN,
  type ActionHorizon,
  type ActionItem,
  type ActionStatus,
} from "../app/deriveDashboard";
import type { AlertState, IntegrationSyncState } from "../app/deriveAlerts";
import { getDb } from "./index";
import { eq, sql, desc, asc, and } from "drizzle-orm";
import {
  appState,
  monthlyMetrics,
  commercialDeals,
  workbookRows,
  objectives,
  userRoles,
  actionItems as actionItemsTable,
  sellerGrowthTargets as sgtTable,
  alertState as alertTable,
  integrationSettings as isettingsTable,
  integrationSyncState as syncStateTable,
  googleOauthTokens as googleTokensTable,
} from "./schema";

const SEED_VERSION = "atlas-commercial-2026-v1";
const STAGE_BACKFILL_KEY = "stage_backfill_v1";
const SELLER_ROSTER_KEY = "team_roster";
const ACTION_ITEMS_SEED_KEY = "action_items_seed_v1";
const EXTRA_MONTHS_BACKFILL_KEY = "extra_month_targets_v1";
const ADMIN_SEED_KEY = "admin_role_seed_v1";
// D1 caps bound parameters per statement at 100; commercialDeals binds 14
// columns/row, so this must stay small enough that batch_size * widest_row
// column count (14) stays comfortably under that cap.
const BATCH_SIZE = 6;

const EDITABLE_ROLES = new Set(
  commercialDataJson.governance.roles.filter((role) => role.edit).map((role) => role.role),
);

const DEFAULT_ADMIN_EMAIL = "marcelinmark@gmail.com";

const EXTRA_MONTH_TARGETS: Array<{ monthNumber: number; month: string; target: number }> = [
  { monthNumber: 8, month: "Agosto", target: 27300 },
  { monthNumber: 9, month: "Setembro", target: 32925 },
  { monthNumber: 10, month: "Outubro", target: 32975 },
  { monthNumber: 11, month: "Novembro", target: 27300 },
  { monthNumber: 12, month: "Dezembro", target: 13650 },
];

function fullYearTargets(): Target[] {
  const fromWorkbook: Target[] = commercialDataJson.monthlyMetrics.map((metric) => ({
    year: 2026,
    monthNumber: metric.monthNumber,
    month: metric.month,
    target: metric.target,
    sold: metric.sold,
    adjusted: metric.adjusted,
  }));
  const extra: Target[] = EXTRA_MONTH_TARGETS.map((entry) => ({
    year: 2026,
    monthNumber: entry.monthNumber,
    month: entry.month,
    target: entry.target,
    sold: 0,
    adjusted: 0,
  }));
  return [...fromWorkbook, ...extra];
}

function defaultSellerRoster(): Seller[] {
  const names = [...new Set(commercialDataJson.deals2026.map((deal) => deal.owner))]
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, "pt-BR"));
  return [
    ...names.map((name) => ({ name, role: "Vendedor" as const })),
    { name: "João Reis", role: "SDR" as const },
  ];
}

type StaticData = typeof commercialDataJson;

export type Objective = StaticData["objectives"][number];
export type ObjectiveKeyResult = Objective["keyResults"][number];

export type CommercialData = {
  meta: StaticData["meta"];
  asOf: string;
  executiveSummary: ExecutiveSummary;
  monthlyMetrics: MonthlyMetric[];
  targets: Target[];
  deals2026: Deal[];
  historicalDeals: StaticData["historicalDeals"];
  ownerPerformance: OwnerPerformance[];
  originPerformance: OriginPerformance[];
  sellers: Seller[];
  actionItems: ActionItem[];
  growthTargets: SellerGrowthTarget[];
  alertStates: AlertState[];
  integrationSyncStates: IntegrationSyncState[];
  objectives: StaticData["objectives"];
  governance: StaticData["governance"];
  dataQualityIssues: StaticData["dataQualityIssues"];
  rawSheets: StaticData["rawSheets"];
};

async function ensureSeeded(database: D1Database) {
  const db = getDb();
  const current = await db
    .select({ value: appState.value })
    .from(appState)
    .where(eq(appState.key, "seed_version"))
    .get();

  if (current?.value === SEED_VERSION) return;

  await db.delete(monthlyMetrics);
  await db.delete(commercialDeals);
  await db.delete(workbookRows);
  await db.delete(objectives);

  for (let index = 0; index < commercialDataJson.monthlyMetrics.length; index += BATCH_SIZE) {
    const batch = commercialDataJson.monthlyMetrics.slice(index, index + BATCH_SIZE);
    if (batch.length > 0) {
      await db.insert(monthlyMetrics).values(
        batch.map((metric) => ({
          year: 2026,
          monthNumber: metric.monthNumber,
          month: metric.month,
          target: metric.target,
          sold: metric.sold,
          adjusted: metric.adjusted,
          payloadJson: JSON.stringify(metric),
        })),
      );
    }
  }

  for (let index = 0; index < commercialDataJson.deals2026.length; index += BATCH_SIZE) {
    const batch = commercialDataJson.deals2026.slice(index, index + BATCH_SIZE);
    if (batch.length > 0) {
      await db.insert(commercialDeals).values(
        batch.map((deal) => ({
          id: deal.id,
          year: deal.year,
          monthNumber: deal.monthNumber,
          month: deal.month,
          owner: deal.owner,
          company: deal.company,
          origin: deal.origin,
          sold: deal.sold,
          adjusted: deal.adjusted,
          billed: deal.billed,
          stage: inferStage(deal),
          createdBy: "import",
          updatedBy: "import",
          payloadJson: JSON.stringify(deal),
        })),
      );
    }
  }

  const workbookStatements = commercialDataJson.rawSheets.flatMap((sheet) =>
    sheet.rows.map((row, index) => ({
      sheetName: sheet.name,
      rowNumber: index + 1,
      dataJson: JSON.stringify(row),
      formulaJson: JSON.stringify(sheet.formulas[index] ?? []),
    })),
  );
  for (let index = 0; index < workbookStatements.length; index += BATCH_SIZE) {
    const batch = workbookStatements.slice(index, index + BATCH_SIZE);
    if (batch.length > 0) {
      await db.insert(workbookRows).values(batch);
    }
  }

  for (let index = 0; index < commercialDataJson.objectives.length; index += BATCH_SIZE) {
    const batch = commercialDataJson.objectives.slice(index, index + BATCH_SIZE);
    if (batch.length > 0) {
      await db.insert(objectives).values(
        batch.map((objective) => ({
          id: objective.id,
          title: objective.title,
          owner: objective.owner,
          progress: objective.progress,
          payloadJson: JSON.stringify(objective),
        })),
      );
    }
  }

  await db
    .insert(appState)
    .values({ key: "seed_version", value: SEED_VERSION, updatedAt: sql`CURRENT_TIMESTAMP` })
    .onConflictDoUpdate({
      target: appState.key,
      set: { value: sql`excluded.value`, updatedAt: sql`CURRENT_TIMESTAMP` },
    });
}

async function ensureStageBackfill(database: D1Database) {
  const db = getDb();
  const current = await db
    .select({ value: appState.value })
    .from(appState)
    .where(eq(appState.key, STAGE_BACKFILL_KEY))
    .get();

  if (current?.value === "done") return;

  const rows = await db
    .select({
      id: commercialDeals.id,
      billed: commercialDeals.billed,
      payloadJson: commercialDeals.payloadJson,
    })
    .from(commercialDeals)
    .all();

  for (const row of rows) {
    const extra = JSON.parse(row.payloadJson) as {
      contractSigned?: string;
      contractSignedAt?: string | null;
      billingStatus?: string;
    };
    const stage = inferStage({
      billed: row.billed,
      contractSigned: extra.contractSigned,
      contractSignedAt: extra.contractSignedAt,
      billingStatus: extra.billingStatus,
    });
    await db.update(commercialDeals).set({ stage }).where(eq(commercialDeals.id, row.id));
  }

  await db
    .insert(appState)
    .values({ key: STAGE_BACKFILL_KEY, value: "done", updatedAt: sql`CURRENT_TIMESTAMP` })
    .onConflictDoUpdate({
      target: appState.key,
      set: { value: sql`excluded.value`, updatedAt: sql`CURRENT_TIMESTAMP` },
    });
}

async function ensureExtraMonthTargets(database: D1Database) {
  const db = getDb();
  const current = await db
    .select({ value: appState.value })
    .from(appState)
    .where(eq(appState.key, EXTRA_MONTHS_BACKFILL_KEY))
    .get();
  if (current) return;

  for (let index = 0; index < EXTRA_MONTH_TARGETS.length; index += BATCH_SIZE) {
    const batch = EXTRA_MONTH_TARGETS.slice(index, index + BATCH_SIZE);
    if (batch.length > 0) {
      await db
        .insert(monthlyMetrics)
        .values(
          batch.map((entry) => ({
            year: 2026,
            monthNumber: entry.monthNumber,
            month: entry.month,
            target: entry.target,
            sold: 0,
            adjusted: 0,
            payloadJson: "{}",
          })),
        )
        .onConflictDoNothing({ target: [monthlyMetrics.year, monthlyMetrics.monthNumber] });
    }
  }

  await db
    .insert(appState)
    .values({ key: EXTRA_MONTHS_BACKFILL_KEY, value: "done", updatedAt: sql`CURRENT_TIMESTAMP` })
    .onConflictDoNothing({ target: appState.key });
}

async function ensureAdminRoleSeed(database: D1Database) {
  const db = getDb();
  const current = await db
    .select({ value: appState.value })
    .from(appState)
    .where(eq(appState.key, ADMIN_SEED_KEY))
    .get();
  if (current) return;

  await db
    .insert(userRoles)
    .values({
      email: DEFAULT_ADMIN_EMAIL,
      role: "Administrador",
      active: true,
      updatedAt: sql`CURRENT_TIMESTAMP`,
    })
    .onConflictDoNothing({ target: userRoles.email });

  await db
    .insert(appState)
    .values({ key: ADMIN_SEED_KEY, value: "done", updatedAt: sql`CURRENT_TIMESTAMP` })
    .onConflictDoNothing({ target: appState.key });
}

export async function resolveCanEdit(email: string | null): Promise<boolean> {
  if (!email) return false;
  if (!env.DB) return true;

  try {
    await ensureAdminRoleSeed(env.DB);
    const db = getDb();
    const row = await db
      .select({ role: userRoles.role, active: userRoles.active })
      .from(userRoles)
      .where(eq(userRoles.email, email))
      .get();
    if (!row || !row.active) return false;
    return EDITABLE_ROLES.has(row.role);
  } catch {
    return false;
  }
}

async function ensureSellerRoster(database: D1Database) {
  const db = getDb();
  const current = await db
    .select({ value: appState.value })
    .from(appState)
    .where(eq(appState.key, SELLER_ROSTER_KEY))
    .get();
  if (current) return;

  await db
    .insert(appState)
    .values({
      key: SELLER_ROSTER_KEY,
      value: JSON.stringify(defaultSellerRoster()),
      updatedAt: sql`CURRENT_TIMESTAMP`,
    })
    .onConflictDoNothing({ target: appState.key });
}

export async function readSellerRoster(database: D1Database): Promise<Seller[]> {
  await ensureSellerRoster(database);
  const db = getDb();
  const row = await db
    .select({ value: appState.value })
    .from(appState)
    .where(eq(appState.key, SELLER_ROSTER_KEY))
    .get();
  if (!row) return [];
  try {
    return JSON.parse(row.value) as Seller[];
  } catch {
    return [];
  }
}

export async function addSellerToRoster(database: D1Database, seller: Seller): Promise<Seller[]> {
  const db = getDb();
  const roster = await readSellerRoster(database);
  const exists = roster.some(
    (item) => item.name.toLocaleLowerCase("pt-BR") === seller.name.toLocaleLowerCase("pt-BR"),
  );
  const next = exists
    ? roster.map((item) =>
        item.name.toLocaleLowerCase("pt-BR") === seller.name.toLocaleLowerCase("pt-BR")
          ? seller
          : item,
      )
    : [...roster, seller];

  await db
    .insert(appState)
    .values({
      key: SELLER_ROSTER_KEY,
      value: JSON.stringify(next),
      updatedAt: sql`CURRENT_TIMESTAMP`,
    })
    .onConflictDoUpdate({
      target: appState.key,
      set: { value: sql`excluded.value`, updatedAt: sql`CURRENT_TIMESTAMP` },
    });

  return next;
}

async function ensureActionItemsTable(database: D1Database) {
  const db = getDb();
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS action_items (
      id text PRIMARY KEY NOT NULL,
      title text NOT NULL,
      description text DEFAULT '' NOT NULL,
      owner text,
      horizon text DEFAULT 'h1' NOT NULL,
      status text DEFAULT 'pendente' NOT NULL,
      source text,
      created_by text,
      updated_by text,
      created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,
      updated_at text DEFAULT CURRENT_TIMESTAMP NOT NULL
    )
  `);
  await db.run(sql`CREATE INDEX IF NOT EXISTS action_items_status_idx ON action_items (status)`);
  await db.run(sql`CREATE INDEX IF NOT EXISTS action_items_horizon_idx ON action_items (horizon)`);
}

async function ensureActionItemsSeed(database: D1Database) {
  await ensureActionItemsTable(database);
  const db = getDb();

  const current = await db
    .select({ value: appState.value })
    .from(appState)
    .where(eq(appState.key, ACTION_ITEMS_SEED_KEY))
    .get();
  if (current) return;

  for (let index = 0; index < DEFAULT_ACTION_PLAN.length; index += BATCH_SIZE) {
    const batch = DEFAULT_ACTION_PLAN.slice(index, index + BATCH_SIZE);
    if (batch.length > 0) {
      await db.insert(actionItemsTable).values(
        batch.map((item) => ({
          id: crypto.randomUUID(),
          title: item.title,
          description: item.description,
          owner: item.owner,
          horizon: item.horizon,
          status: "pendente",
          source: item.source,
          createdBy: "import",
          updatedBy: "import",
        })),
      );
    }
  }

  await db
    .insert(appState)
    .values({ key: ACTION_ITEMS_SEED_KEY, value: "done", updatedAt: sql`CURRENT_TIMESTAMP` })
    .onConflictDoNothing({ target: appState.key });
}

export async function readActionItems(database: D1Database): Promise<ActionItem[]> {
  await ensureActionItemsSeed(database);
  const db = getDb();
  const rows = await db
    .select()
    .from(actionItemsTable)
    .orderBy(asc(actionItemsTable.horizon), asc(actionItemsTable.createdAt))
    .all();
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description,
    owner: row.owner,
    horizon: row.horizon as ActionHorizon,
    status: row.status as ActionStatus,
    source: row.source,
    dueDate: row.dueDate,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
  }));
}

export async function addActionItem(
  database: D1Database,
  input: {
    title: string;
    description: string;
    owner: string | null;
    horizon: ActionHorizon;
    source: string | null;
    dueDate: string | null;
    actorEmail: string;
  },
): Promise<ActionItem> {
  await ensureActionItemsTable(database);
  const db = getDb();
  const id = crypto.randomUUID();

  await db
    .insert(actionItemsTable)
    .values({
      id,
      title: input.title,
      description: input.description,
      owner: input.owner,
      horizon: input.horizon,
      status: "pendente",
      source: input.source,
      dueDate: input.dueDate,
      createdBy: input.actorEmail,
      updatedBy: input.actorEmail,
    });

  const row = await db.select().from(actionItemsTable).where(eq(actionItemsTable.id, id)).get();
  if (!row) throw new Error("Falha ao criar item do plano de ação.");
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    owner: row.owner,
    horizon: row.horizon as ActionHorizon,
    status: row.status as ActionStatus,
    source: row.source,
    dueDate: row.dueDate,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
  };
}

export async function updateActionItem(
  database: D1Database,
  id: string,
  patch: Partial<{
    title: string;
    description: string;
    owner: string | null;
    horizon: ActionHorizon;
    status: ActionStatus;
    dueDate: string | null;
  }>,
  actorEmail: string,
): Promise<ActionItem | null> {
  await ensureActionItemsTable(database);
  const db = getDb();
  const existing = await db
    .select()
    .from(actionItemsTable)
    .where(eq(actionItemsTable.id, id))
    .get();
  if (!existing) return null;

  await db
    .update(actionItemsTable)
    .set({
      title: patch.title ?? existing.title,
      description: patch.description ?? existing.description,
      owner: patch.owner !== undefined ? patch.owner : existing.owner,
      horizon: patch.horizon ?? existing.horizon,
      status: patch.status ?? existing.status,
      dueDate: patch.dueDate !== undefined ? patch.dueDate : existing.dueDate,
      updatedBy: actorEmail,
      updatedAt: sql`CURRENT_TIMESTAMP`,
    })
    .where(eq(actionItemsTable.id, id));

  const row = await db.select().from(actionItemsTable).where(eq(actionItemsTable.id, id)).get();
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    owner: row.owner,
    horizon: row.horizon as ActionHorizon,
    status: row.status as ActionStatus,
    source: row.source,
    dueDate: row.dueDate,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
  };
}

export async function deleteActionItem(
  database: D1Database,
  id: string,
): Promise<ActionItem | null> {
  await ensureActionItemsTable(database);
  const db = getDb();
  const existing = await db
    .select()
    .from(actionItemsTable)
    .where(eq(actionItemsTable.id, id))
    .get();
  if (!existing) return null;
  await db.delete(actionItemsTable).where(eq(actionItemsTable.id, id));
  return {
    id: existing.id,
    title: existing.title,
    description: existing.description,
    owner: existing.owner,
    horizon: existing.horizon as ActionHorizon,
    status: existing.status as ActionStatus,
    source: existing.source,
    dueDate: existing.dueDate,
    createdAt: existing.createdAt,
    updatedAt: existing.updatedAt,
    createdBy: existing.createdBy,
    updatedBy: existing.updatedBy,
  };
}

async function ensureSellerGrowthTargetsTable(database: D1Database) {
  const db = getDb();
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS seller_growth_targets (
      id text PRIMARY KEY NOT NULL,
      owner text NOT NULL,
      year integer NOT NULL,
      month_number integer NOT NULL,
      month text NOT NULL,
      entry_target real DEFAULT 0 NOT NULL,
      realized_target real DEFAULT 0 NOT NULL,
      created_by text,
      updated_by text,
      created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,
      updated_at text DEFAULT CURRENT_TIMESTAMP NOT NULL
    )
  `);
  await db.run(
    sql`CREATE UNIQUE INDEX IF NOT EXISTS seller_growth_targets_owner_year_month_unique ON seller_growth_targets (owner, year, month_number)`,
  );
  await db.run(
    sql`CREATE INDEX IF NOT EXISTS seller_growth_targets_owner_idx ON seller_growth_targets (owner)`,
  );
}

export async function readSellerGrowthTargets(database: D1Database): Promise<SellerGrowthTarget[]> {
  await ensureSellerGrowthTargetsTable(database);
  const db = getDb();
  const rows = await db
    .select()
    .from(sgtTable)
    .orderBy(asc(sgtTable.owner), asc(sgtTable.year), asc(sgtTable.monthNumber))
    .all();
  return rows.map((row) => ({
    owner: row.owner,
    year: row.year,
    monthNumber: row.monthNumber,
    month: row.month,
    entryTarget: row.entryTarget,
    realizedTarget: row.realizedTarget,
  }));
}

export async function upsertSellerGrowthTarget(
  database: D1Database,
  input: {
    owner: string;
    year: number;
    monthNumber: number;
    month: string;
    entryTarget: number;
    realizedTarget: number;
    actorEmail: string;
  },
): Promise<SellerGrowthTarget> {
  await ensureSellerGrowthTargetsTable(database);
  const db = getDb();
  const id = `${input.owner}-${input.year}-${input.monthNumber}`;

  await db
    .insert(sgtTable)
    .values({
      id,
      owner: input.owner,
      year: input.year,
      monthNumber: input.monthNumber,
      month: input.month,
      entryTarget: input.entryTarget,
      realizedTarget: input.realizedTarget,
      createdBy: input.actorEmail,
      updatedBy: input.actorEmail,
    })
    .onConflictDoUpdate({
      target: [sgtTable.owner, sgtTable.year, sgtTable.monthNumber],
      set: {
        entryTarget: sql`excluded.entry_target`,
        realizedTarget: sql`excluded.realized_target`,
        updatedBy: sql`excluded.updated_by`,
        updatedAt: sql`CURRENT_TIMESTAMP`,
      },
    });

  const row = await db
    .select()
    .from(sgtTable)
    .where(
      and(
        eq(sgtTable.owner, input.owner),
        eq(sgtTable.year, input.year),
        eq(sgtTable.monthNumber, input.monthNumber),
      ),
    )
    .get();
  if (!row) throw new Error("Falha ao salvar a meta de crescimento.");
  return {
    owner: row.owner,
    year: row.year,
    monthNumber: row.monthNumber,
    month: row.month,
    entryTarget: row.entryTarget,
    realizedTarget: row.realizedTarget,
  };
}

async function ensureIntegrationSyncStateTable(database: D1Database) {
  const db = getDb();
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS integration_sync_state (
      id text PRIMARY KEY NOT NULL,
      last_status text DEFAULT 'ok' NOT NULL,
      last_error text,
      last_attempt_at text,
      last_success_at text
    )
  `);
}

export async function readIntegrationSyncStates(
  database: D1Database,
): Promise<IntegrationSyncState[]> {
  await ensureIntegrationSyncStateTable(database);
  const db = getDb();
  const rows = await db.select().from(syncStateTable).all();
  return rows.map((row) => ({
    id: row.id,
    lastStatus: row.lastStatus as IntegrationSyncState["lastStatus"],
    lastError: row.lastError,
    lastAttemptAt: row.lastAttemptAt,
    lastSuccessAt: row.lastSuccessAt,
  }));
}

export async function recordIntegrationSyncResult(
  database: D1Database,
  input: { id: string; ok: boolean; error?: string | null },
): Promise<void> {
  await ensureIntegrationSyncStateTable(database);
  const db = getDb();
  const now = sql`CURRENT_TIMESTAMP`;

  await db
    .insert(syncStateTable)
    .values({
      id: input.id,
      lastStatus: input.ok ? "ok" : "error",
      lastError: input.ok ? null : (input.error ?? "Falha desconhecida."),
      lastAttemptAt: now,
      lastSuccessAt: input.ok ? now : null,
    })
    .onConflictDoUpdate({
      target: syncStateTable.id,
      set: {
        lastStatus: input.ok ? "ok" : "error",
        lastError: input.ok ? null : (input.error ?? "Falha desconhecida."),
        lastAttemptAt: now,
        ...(input.ok ? { lastSuccessAt: now } : {}),
      },
    });
}

async function ensureGoogleOAuthTokensTable(database: D1Database) {
  const db = getDb();
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS google_oauth_tokens (
      user_email text PRIMARY KEY NOT NULL,
      access_token text NOT NULL,
      refresh_token text,
      expires_at text NOT NULL,
      scopes text DEFAULT '' NOT NULL,
      google_account_email text,
      updated_at text DEFAULT CURRENT_TIMESTAMP NOT NULL
    )
  `);
}

export type GoogleOAuthToken = {
  userEmail: string;
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string;
  scopes: string;
  googleAccountEmail: string | null;
  updatedAt: string;
};

export async function readGoogleOAuthToken(
  database: D1Database,
  userEmail: string,
): Promise<GoogleOAuthToken | null> {
  await ensureGoogleOAuthTokensTable(database);
  const db = getDb();
  const row = await db
    .select()
    .from(googleTokensTable)
    .where(eq(googleTokensTable.userEmail, userEmail))
    .get();
  if (!row) return null;
  return {
    userEmail: row.userEmail,
    accessToken: row.accessToken,
    refreshToken: row.refreshToken,
    expiresAt: row.expiresAt,
    scopes: row.scopes,
    googleAccountEmail: row.googleAccountEmail,
    updatedAt: row.updatedAt,
  };
}

export async function upsertGoogleOAuthToken(
  database: D1Database,
  input: {
    userEmail: string;
    accessToken: string;
    refreshToken: string | null;
    expiresAt: string;
    scopes: string;
    googleAccountEmail: string | null;
  },
): Promise<void> {
  await ensureGoogleOAuthTokensTable(database);
  const db = getDb();

  await db
    .insert(googleTokensTable)
    .values({
      userEmail: input.userEmail,
      accessToken: input.accessToken,
      refreshToken: input.refreshToken,
      expiresAt: input.expiresAt,
      scopes: input.scopes,
      googleAccountEmail: input.googleAccountEmail,
      updatedAt: sql`CURRENT_TIMESTAMP`,
    })
    .onConflictDoUpdate({
      target: googleTokensTable.userEmail,
      set: {
        accessToken: sql`excluded.access_token`,
        // A refresh token is only issued on the very first consent (prompt=consent);
        // keep the existing one on subsequent token refreshes where Google omits it.
        refreshToken: input.refreshToken ?? sql`${googleTokensTable.refreshToken}`,
        expiresAt: sql`excluded.expires_at`,
        scopes: sql`excluded.scopes`,
        googleAccountEmail: sql`excluded.google_account_email`,
        updatedAt: sql`CURRENT_TIMESTAMP`,
      },
    });
}

export async function deleteGoogleOAuthToken(database: D1Database, userEmail: string): Promise<void> {
  await ensureGoogleOAuthTokensTable(database);
  const db = getDb();
  await db.delete(googleTokensTable).where(eq(googleTokensTable.userEmail, userEmail)).run();
}

async function ensureAlertStateTable(database: D1Database) {
  const db = getDb();
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS alert_state (
      key text PRIMARY KEY NOT NULL,
      status text DEFAULT 'aberto' NOT NULL,
      justification text,
      actor_email text,
      updated_at text DEFAULT CURRENT_TIMESTAMP NOT NULL
    )
  `);
}

export async function readAlertStates(database: D1Database): Promise<AlertState[]> {
  await ensureAlertStateTable(database);
  const db = getDb();
  const rows = await db.select().from(alertTable).orderBy(desc(alertTable.updatedAt)).all();
  return rows.map((row) => ({
    key: row.key,
    status: row.status as AlertState["status"],
    justification: row.justification,
    actorEmail: row.actorEmail,
    updatedAt: row.updatedAt,
  }));
}

export async function upsertAlertState(
  database: D1Database,
  input: {
    key: string;
    status: AlertState["status"];
    justification: string | null;
    actorEmail: string;
  },
): Promise<AlertState> {
  await ensureAlertStateTable(database);
  const db = getDb();

  await db
    .insert(alertTable)
    .values({
      key: input.key,
      status: input.status,
      justification: input.justification,
      actorEmail: input.actorEmail,
      updatedAt: sql`CURRENT_TIMESTAMP`,
    })
    .onConflictDoUpdate({
      target: alertTable.key,
      set: {
        status: sql`excluded.status`,
        justification: sql`excluded.justification`,
        actorEmail: sql`excluded.actor_email`,
        updatedAt: sql`CURRENT_TIMESTAMP`,
      },
    });

  const row = await db.select().from(alertTable).where(eq(alertTable.key, input.key)).get();
  if (!row) throw new Error("Falha ao salvar o estado do alerta.");
  return {
    key: row.key,
    status: row.status as AlertState["status"],
    justification: row.justification,
    actorEmail: row.actorEmail,
    updatedAt: row.updatedAt,
  };
}

export type IntegrationSettings = {
  bitrixWebhookUrl: string | null;
  apolloApiKey: string | null;
  googleApiKey: string | null;
  googleClientId: string | null;
  googleClientSecret: string | null;
  aiProvider: "auto" | "openai" | "anthropic";
  openaiApiKey: string | null;
  anthropicApiKey: string | null;
  updatedBy: string | null;
  updatedAt: string;
};

const EMPTY_INTEGRATION_SETTINGS: IntegrationSettings = {
  bitrixWebhookUrl: null,
  apolloApiKey: null,
  googleApiKey: null,
  googleClientId: null,
  googleClientSecret: null,
  aiProvider: "auto",
  openaiApiKey: null,
  anthropicApiKey: null,
  updatedBy: null,
  updatedAt: new Date(0).toISOString(),
};

async function ensureIntegrationSettingsTable(database: D1Database) {
  const db = getDb();
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS integration_settings (
      id text PRIMARY KEY NOT NULL DEFAULT 'default',
      bitrix_webhook_url text,
      apollo_api_key text,
      google_api_key text,
      google_client_id text,
      google_client_secret text,
      ai_provider text DEFAULT 'auto' NOT NULL,
      openai_api_key text,
      anthropic_api_key text,
      updated_by text,
      updated_at text DEFAULT CURRENT_TIMESTAMP NOT NULL
    )
  `);
}

export async function readIntegrationSettings(database: D1Database): Promise<IntegrationSettings> {
  await ensureIntegrationSettingsTable(database);
  const db = getDb();
  const row = await db
    .select()
    .from(isettingsTable)
    .where(eq(isettingsTable.id, "default"))
    .get();
  if (!row) return EMPTY_INTEGRATION_SETTINGS;
  return {
    bitrixWebhookUrl: row.bitrixWebhookUrl,
    apolloApiKey: row.apolloApiKey,
    googleApiKey: row.googleApiKey,
    googleClientId: row.googleClientId,
    googleClientSecret: row.googleClientSecret,
    aiProvider: (row.aiProvider as IntegrationSettings["aiProvider"]) || "auto",
    openaiApiKey: row.openaiApiKey,
    anthropicApiKey: row.anthropicApiKey,
    updatedBy: row.updatedBy,
    updatedAt: row.updatedAt,
  };
}

export async function upsertIntegrationSettings(
  database: D1Database,
  input: {
    bitrixWebhookUrl?: string | null;
    apolloApiKey?: string | null;
    googleApiKey?: string | null;
    googleClientId?: string | null;
    googleClientSecret?: string | null;
    aiProvider?: IntegrationSettings["aiProvider"];
    openaiApiKey?: string | null;
    anthropicApiKey?: string | null;
    updatedBy: string;
  },
): Promise<IntegrationSettings> {
  await ensureIntegrationSettingsTable(database);
  const db = getDb();
  const current = await readIntegrationSettings(database);
  const next: IntegrationSettings = {
    bitrixWebhookUrl: input.bitrixWebhookUrl !== undefined ? input.bitrixWebhookUrl : current.bitrixWebhookUrl,
    apolloApiKey: input.apolloApiKey !== undefined ? input.apolloApiKey : current.apolloApiKey,
    googleApiKey: input.googleApiKey !== undefined ? input.googleApiKey : current.googleApiKey,
    googleClientId: input.googleClientId !== undefined ? input.googleClientId : current.googleClientId,
    googleClientSecret:
      input.googleClientSecret !== undefined ? input.googleClientSecret : current.googleClientSecret,
    aiProvider: input.aiProvider ?? current.aiProvider,
    openaiApiKey: input.openaiApiKey !== undefined ? input.openaiApiKey : current.openaiApiKey,
    anthropicApiKey: input.anthropicApiKey !== undefined ? input.anthropicApiKey : current.anthropicApiKey,
    updatedBy: input.updatedBy,
    updatedAt: new Date().toISOString(),
  };

  await db
    .insert(isettingsTable)
    .values({
      id: "default",
      bitrixWebhookUrl: next.bitrixWebhookUrl,
      apolloApiKey: next.apolloApiKey,
      googleApiKey: next.googleApiKey,
      googleClientId: next.googleClientId,
      googleClientSecret: next.googleClientSecret,
      aiProvider: next.aiProvider,
      openaiApiKey: next.openaiApiKey,
      anthropicApiKey: next.anthropicApiKey,
      updatedBy: next.updatedBy,
      updatedAt: next.updatedAt,
    })
    .onConflictDoUpdate({
      target: isettingsTable.id,
      set: {
        bitrixWebhookUrl: sql`excluded.bitrix_webhook_url`,
        apolloApiKey: sql`excluded.apollo_api_key`,
        googleApiKey: sql`excluded.google_api_key`,
        googleClientId: sql`excluded.google_client_id`,
        googleClientSecret: sql`excluded.google_client_secret`,
        aiProvider: sql`excluded.ai_provider`,
        openaiApiKey: sql`excluded.openai_api_key`,
        anthropicApiKey: sql`excluded.anthropic_api_key`,
        updatedBy: sql`excluded.updated_by`,
        updatedAt: sql`excluded.updated_at`,
      },
    });

  return next;
}

export async function readObjectives(database: D1Database): Promise<Objective[]> {
  const db = getDb();
  const rows = await db.select({ payloadJson: objectives.payloadJson }).from(objectives).orderBy(asc(objectives.id)).all();
  return rows.map((row) => JSON.parse(row.payloadJson) as Objective);
}

function computeObjectiveProgress(keyResults: ObjectiveKeyResult[]): number {
  if (keyResults.length === 0) return 0;
  const ratios = keyResults.map((kr) =>
    kr.inverse ? kr.target / Math.max(kr.actual, 0.0001) : kr.actual / Math.max(kr.target, 0.0001),
  );
  return ratios.reduce((sum, ratio) => sum + ratio, 0) / ratios.length;
}

export async function updateObjective(
  database: D1Database,
  id: string,
  patch: { title: string; owner: string; cadence: string; keyResults: ObjectiveKeyResult[] },
): Promise<Objective> {
  const db = getDb();
  const row = await db.select({ payloadJson: objectives.payloadJson }).from(objectives).where(eq(objectives.id, id)).get();
  if (!row) throw new Error("Objetivo não encontrado.");

  const existing = JSON.parse(row.payloadJson) as Objective;
  const progress = computeObjectiveProgress(patch.keyResults);
  const next: Objective = {
    ...existing,
    title: patch.title,
    owner: patch.owner,
    cadence: patch.cadence,
    keyResults: patch.keyResults,
    progress,
  };

  await db
    .update(objectives)
    .set({
      title: next.title,
      owner: next.owner,
      progress: next.progress,
      payloadJson: JSON.stringify(next),
    })
    .where(eq(objectives.id, id));

  return next;
}

export function rowToDeal(row: any): Deal {
  const extra = JSON.parse(row.payloadJson) as Record<string, unknown>;
  return {
    ...extra,
    id: row.id,
    year: row.year,
    month: row.month,
    monthNumber: row.monthNumber,
    owner: row.owner,
    company: row.company,
    origin: row.origin,
    sold: row.sold,
    adjusted: row.adjusted,
    billed: row.billed,
    stage: row.stage,
    notes: row.notes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
  } as Deal;
}

export async function readDealsAndTargets(
  database: D1Database,
): Promise<{ deals: Deal[]; targets: Target[] }> {
  await ensureSeeded(database);
  await ensureStageBackfill(database);
  await ensureExtraMonthTargets(database);
  const db = getDb();

  const [dealResult, targetResult] = await Promise.all([
    db.select().from(commercialDeals).orderBy(asc(commercialDeals.monthNumber), asc(commercialDeals.id)).all(),
    db.select().from(monthlyMetrics).orderBy(asc(monthlyMetrics.monthNumber)).all(),
  ]);

  const deals = dealResult.map(rowToDeal);
  const targets: Target[] = targetResult.map((row) => ({
    year: row.year,
    monthNumber: row.monthNumber,
    month: row.month,
    target: row.target,
    sold: row.sold,
    adjusted: row.adjusted,
  }));

  return { deals, targets };
}

function buildFromStaticJson(asOf: string): CommercialData {
  const deals: Deal[] = commercialDataJson.deals2026.map((deal) => ({
    ...deal,
    stage: inferStage(deal),
    notes: null,
    createdAt: commercialDataJson.meta.generatedAt,
    updatedAt: commercialDataJson.meta.generatedAt,
    createdBy: "import",
    updatedBy: "import",
  })) as Deal[];

  const targets: Target[] = fullYearTargets();

  const sellers = defaultSellerRoster();
  const derived = deriveMetrics({
    deals,
    targets,
    asOf,
    knownOwners: sellers.map((seller) => seller.name),
  });
  const actionItems: ActionItem[] = DEFAULT_ACTION_PLAN.map((item, index) => ({
    id: `static-action-${index}`,
    title: item.title,
    description: item.description,
    owner: item.owner,
    horizon: item.horizon,
    status: "pendente",
    source: item.source,
    dueDate: null,
    createdAt: commercialDataJson.meta.generatedAt,
    updatedAt: commercialDataJson.meta.generatedAt,
    createdBy: "import",
    updatedBy: "import",
  }));

  return {
    meta: commercialDataJson.meta,
    asOf,
    ...derived,
    targets,
    deals2026: deals,
    historicalDeals: commercialDataJson.historicalDeals,
    sellers,
    actionItems,
    growthTargets: [],
    alertStates: [],
    integrationSyncStates: [],
    objectives: commercialDataJson.objectives,
    governance: commercialDataJson.governance,
    dataQualityIssues: commercialDataJson.dataQualityIssues,
    rawSheets: commercialDataJson.rawSheets,
  };
}

export async function loadCommercialData(): Promise<CommercialData> {
  const asOf = new Date().toISOString();

  if (!env.DB) return buildFromStaticJson(asOf);

  try {
    const { deals, targets } = await readDealsAndTargets(env.DB);
    const db = getDb();
    const [sellers, actionItems, growthTargets, alertStates, integrationSyncStates, objectiveResult, workbookResult] =
      await Promise.all([
        readSellerRoster(env.DB),
        readActionItems(env.DB),
        readSellerGrowthTargets(env.DB),
        readAlertStates(env.DB),
        readIntegrationSyncStates(env.DB),
        db.select({ payloadJson: objectives.payloadJson }).from(objectives).orderBy(asc(objectives.id)).all(),
        db.select().from(workbookRows).orderBy(asc(workbookRows.id)).all(),
      ]);

    const derived = deriveMetrics({
      deals,
      targets,
      asOf,
      knownOwners: sellers.map((seller) => seller.name),
    });

    const rawRows = new Map<
      string,
      Array<{ rowNumber: number; row: unknown[]; formula: unknown[] }>
    >();
    for (const row of workbookResult) {
      const rows = rawRows.get(row.sheetName) ?? [];
      rows.push({
        rowNumber: row.rowNumber,
        row: JSON.parse(row.dataJson) as unknown[],
        formula: JSON.parse(row.formulaJson) as unknown[],
      });
      rawRows.set(row.sheetName, rows);
    }

    const rawSheets = commercialDataJson.rawSheets.map((sheet) => {
      const rows = rawRows.get(sheet.name);
      if (!rows?.length) return sheet;
      rows.sort((a, b) => a.rowNumber - b.rowNumber);
      return {
        ...sheet,
        rows: rows.map((item) => item.row),
        formulas: rows.map((item) => item.formula),
      };
    });

    return {
      meta: commercialDataJson.meta,
      asOf,
      ...derived,
      targets,
      deals2026: deals,
      historicalDeals: commercialDataJson.historicalDeals,
      sellers,
      actionItems,
      growthTargets,
      alertStates,
      integrationSyncStates,
      objectives: objectiveResult.map((r) => JSON.parse(r.payloadJson) as StaticData["objectives"][number]),
      governance: commercialDataJson.governance,
      dataQualityIssues: commercialDataJson.dataQualityIssues,
      rawSheets,
    };
  } catch (err) {
    return buildFromStaticJson(asOf);
  }
}
