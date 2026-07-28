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

const SEED_VERSION = "atlas-commercial-2026-v1";
const STAGE_BACKFILL_KEY = "stage_backfill_v1";
const SELLER_ROSTER_KEY = "team_roster";
const ACTION_ITEMS_SEED_KEY = "action_items_seed_v1";
const EXTRA_MONTHS_BACKFILL_KEY = "extra_month_targets_v1";
const ADMIN_SEED_KEY = "admin_role_seed_v1";
const BATCH_SIZE = 40;

// Matches governance.roles from the audited workbook: only these role names
// carry write access. Unknown/unassigned users fall back to the schema's own
// default role ("Diretoria (leitura)"), which is read-only by design.
const EDITABLE_ROLES = new Set(
  commercialDataJson.governance.roles.filter((role) => role.edit).map((role) => role.role),
);

// Seeded once so this account is never locked out by the write-access change
// below. Additional editors are granted by inserting/updating rows in
// `user_roles` (role must be one of EDITABLE_ROLES, active = true).
const DEFAULT_ADMIN_EMAIL = "marcelinmark@gmail.com";

// Targets for the months the original workbook's monthly tabs didn't cover
// yet (only Jan-Jul had dedicated sheets at import time). Sold/adjusted stay
// at 0 until the business books results for these months; edit them inline
// (same as any other month) once they do.
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
  objectives: StaticData["objectives"];
  governance: StaticData["governance"];
  dataQualityIssues: StaticData["dataQualityIssues"];
  rawSheets: StaticData["rawSheets"];
};

type CommercialDealRow = {
  id: string;
  year: number;
  month_number: number;
  month: string;
  owner: string;
  company: string;
  origin: string;
  sold: number;
  adjusted: number;
  billed: number;
  stage: string;
  notes: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  payload_json: string;
};

type ActionItemRow = {
  id: string;
  title: string;
  description: string;
  owner: string | null;
  horizon: string;
  status: string;
  source: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

function rowToActionItem(row: ActionItemRow): ActionItem {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    owner: row.owner,
    horizon: row.horizon as ActionHorizon,
    status: row.status as ActionStatus,
    source: row.source,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
  };
}

const ACTION_ITEM_COLUMNS =
  "id, title, description, owner, horizon, status, source, created_by, updated_by, created_at, updated_at";

type TargetRow = {
  year: number;
  month_number: number;
  month: string;
  target: number;
  sold: number;
  adjusted: number;
};
type D1Row = { payload_json: string };
type WorkbookRow = {
  sheet_name: string;
  row_number: number;
  data_json: string;
  formula_json: string;
};

async function runBatches(database: D1Database, statements: D1PreparedStatement[]) {
  for (let index = 0; index < statements.length; index += BATCH_SIZE) {
    await database.batch(statements.slice(index, index + BATCH_SIZE));
  }
}

async function ensureSeeded(database: D1Database) {
  const current = await database
    .prepare("SELECT value FROM app_state WHERE key = ?")
    .bind("seed_version")
    .first<{ value: string }>();

  if (current?.value === SEED_VERSION) return;

  await database.batch([
    database.prepare("DELETE FROM monthly_metrics"),
    database.prepare("DELETE FROM commercial_deals"),
    database.prepare("DELETE FROM workbook_rows"),
    database.prepare("DELETE FROM objectives"),
  ]);

  await runBatches(
    database,
    commercialDataJson.monthlyMetrics.map((metric) =>
      database
        .prepare(
          "INSERT INTO monthly_metrics (year, month_number, month, target, sold, adjusted, payload_json) VALUES (?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(
          2026,
          metric.monthNumber,
          metric.month,
          metric.target,
          metric.sold,
          metric.adjusted,
          JSON.stringify(metric),
        ),
    ),
  );

  await runBatches(
    database,
    commercialDataJson.deals2026.map((deal) =>
      database
        .prepare(
          "INSERT INTO commercial_deals (id, year, month_number, month, owner, company, origin, sold, adjusted, billed, stage, created_by, updated_by, payload_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(
          deal.id,
          deal.year,
          deal.monthNumber,
          deal.month,
          deal.owner,
          deal.company,
          deal.origin,
          deal.sold,
          deal.adjusted,
          deal.billed,
          inferStage(deal),
          "import",
          "import",
          JSON.stringify(deal),
        ),
    ),
  );

  const workbookStatements = commercialDataJson.rawSheets.flatMap((sheet) =>
    sheet.rows.map((row, index) =>
      database
        .prepare(
          "INSERT INTO workbook_rows (sheet_name, row_number, data_json, formula_json) VALUES (?, ?, ?, ?)",
        )
        .bind(
          sheet.name,
          index + 1,
          JSON.stringify(row),
          JSON.stringify(sheet.formulas[index] ?? []),
        ),
    ),
  );
  await runBatches(database, workbookStatements);

  await runBatches(
    database,
    commercialDataJson.objectives.map((objective) =>
      database
        .prepare(
          "INSERT INTO objectives (id, title, owner, progress, payload_json) VALUES (?, ?, ?, ?, ?)",
        )
        .bind(
          objective.id,
          objective.title,
          objective.owner,
          objective.progress,
          JSON.stringify(objective),
        ),
    ),
  );

  await database
    .prepare(
      "INSERT INTO app_state (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP",
    )
    .bind("seed_version", SEED_VERSION)
    .run();
}

/**
 * Additive, non-destructive backfill: `ALTER TABLE ... ADD COLUMN stage
 * DEFAULT 'aberto'` sets every pre-existing row to "aberto" regardless of
 * its actual billing state. This runs once (guarded by its own app_state
 * key, never `SEED_VERSION`) to recompute the correct stage for rows that
 * predate the stage column, without ever touching the destructive
 * delete-and-reinsert path in `ensureSeeded` — that path must stay
 * untouched once real user-created deals can exist in the table.
 */
async function ensureStageBackfill(database: D1Database) {
  const current = await database
    .prepare("SELECT value FROM app_state WHERE key = ?")
    .bind(STAGE_BACKFILL_KEY)
    .first<{ value: string }>();

  if (current?.value === "done") return;

  const rows = await database
    .prepare("SELECT id, billed, payload_json FROM commercial_deals")
    .all<{ id: string; billed: number; payload_json: string }>();

  const statements = rows.results.map((row) => {
    const extra = JSON.parse(row.payload_json) as {
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
    return database
      .prepare("UPDATE commercial_deals SET stage = ? WHERE id = ?")
      .bind(stage, row.id);
  });
  await runBatches(database, statements);

  await database
    .prepare(
      "INSERT INTO app_state (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP",
    )
    .bind(STAGE_BACKFILL_KEY, "done")
    .run();
}

/**
 * Additive: the original workbook only had monthly tabs through July, so
 * `ensureSeeded()` never inserts Aug-Dec targets. This backfills them once
 * (guarded by its own app_state key, never `SEED_VERSION`) so the full year
 * shows up in the monthly table/selectors — sold/adjusted start at 0 until
 * the business books results for those months.
 */
async function ensureExtraMonthTargets(database: D1Database) {
  const current = await database
    .prepare("SELECT value FROM app_state WHERE key = ?")
    .bind(EXTRA_MONTHS_BACKFILL_KEY)
    .first<{ value: string }>();
  if (current) return;

  await runBatches(
    database,
    EXTRA_MONTH_TARGETS.map((entry) =>
      database
        .prepare(
          "INSERT INTO monthly_metrics (year, month_number, month, target, sold, adjusted, payload_json) VALUES (?, ?, ?, ?, 0, 0, '{}') ON CONFLICT(year, month_number) DO NOTHING",
        )
        .bind(2026, entry.monthNumber, entry.month, entry.target),
    ),
  );

  await database
    .prepare(
      "INSERT INTO app_state (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(key) DO NOTHING",
    )
    .bind(EXTRA_MONTHS_BACKFILL_KEY, "done")
    .run();
}

/**
 * Additive: grants DEFAULT_ADMIN_EMAIL the "Administrador" role once, so
 * turning on role-gated write access never locks out the one account that
 * needs it. Never re-runs (own app_state key), so it won't fight an admin
 * who later changes/revokes this role on purpose.
 */
async function ensureAdminRoleSeed(database: D1Database) {
  const current = await database
    .prepare("SELECT value FROM app_state WHERE key = ?")
    .bind(ADMIN_SEED_KEY)
    .first<{ value: string }>();
  if (current) return;

  await database
    .prepare(
      "INSERT INTO user_roles (email, role, active, updated_at) VALUES (?, ?, 1, CURRENT_TIMESTAMP) ON CONFLICT(email) DO NOTHING",
    )
    .bind(DEFAULT_ADMIN_EMAIL, "Administrador")
    .run();

  await database
    .prepare(
      "INSERT INTO app_state (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(key) DO NOTHING",
    )
    .bind(ADMIN_SEED_KEY, "done")
    .run();
}

/**
 * Write access is gated by `user_roles`, not merely by being signed in.
 * Unknown emails (no row yet) default to read-only, matching the schema's
 * own default role ("Diretoria (leitura)"). Locally (`env.DB` unavailable)
 * there is no real SIWC session anyway, so this only matters when deployed.
 */
export async function resolveCanEdit(email: string | null): Promise<boolean> {
  if (!email) return false;
  if (!env.DB) return true;

  try {
    await ensureAdminRoleSeed(env.DB);
    const row = await env.DB.prepare("SELECT role, active FROM user_roles WHERE email = ?")
      .bind(email)
      .first<{ role: string; active: number }>();
    if (!row || !row.active) return false;
    return EDITABLE_ROLES.has(row.role);
  } catch {
    return false;
  }
}

/**
 * Additive: seeds the team roster only if the `app_state` key doesn't exist
 * yet — never overwrites, so sellers added later via `POST /api/sellers`
 * are never clobbered by a redeploy.
 */
async function ensureSellerRoster(database: D1Database) {
  const current = await database
    .prepare("SELECT value FROM app_state WHERE key = ?")
    .bind(SELLER_ROSTER_KEY)
    .first<{ value: string }>();
  if (current) return;

  await database
    .prepare(
      "INSERT INTO app_state (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(key) DO NOTHING",
    )
    .bind(SELLER_ROSTER_KEY, JSON.stringify(defaultSellerRoster()))
    .run();
}

export async function readSellerRoster(database: D1Database): Promise<Seller[]> {
  await ensureSellerRoster(database);
  const row = await database
    .prepare("SELECT value FROM app_state WHERE key = ?")
    .bind(SELLER_ROSTER_KEY)
    .first<{ value: string }>();
  if (!row) return [];
  try {
    return JSON.parse(row.value) as Seller[];
  } catch {
    return [];
  }
}

export async function addSellerToRoster(database: D1Database, seller: Seller): Promise<Seller[]> {
  const roster = await readSellerRoster(database);
  const exists = roster.some((item) => item.name.toLocaleLowerCase("pt-BR") === seller.name.toLocaleLowerCase("pt-BR"));
  const next = exists
    ? roster.map((item) =>
        item.name.toLocaleLowerCase("pt-BR") === seller.name.toLocaleLowerCase("pt-BR")
          ? seller
          : item,
      )
    : [...roster, seller];

  await database
    .prepare(
      "INSERT INTO app_state (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP",
    )
    .bind(SELLER_ROSTER_KEY, JSON.stringify(next))
    .run();

  return next;
}

/**
 * Additive: seeds the action plan from the Bitrix24 90-day roadmap only once
 * (guarded by its own app_state key). Never re-runs, so items created or
 * edited later by users are never overwritten by a redeploy.
 */
/**
 * This project has no wrangler.jsonc / migrations_dir wiring, so drizzle
 * migrations are generated but never auto-applied to the local D1 database
 * (`npm run db:generate` only writes the SQL file). Creating the table here,
 * guarded by `IF NOT EXISTS`, makes the action plan self-healing regardless
 * of whether the migration was actually run against this environment's D1.
 */
async function ensureActionItemsTable(database: D1Database) {
  await database.batch([
    database.prepare(
      `CREATE TABLE IF NOT EXISTS action_items (
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
      )`,
    ),
    database.prepare(
      "CREATE INDEX IF NOT EXISTS action_items_status_idx ON action_items (status)",
    ),
    database.prepare(
      "CREATE INDEX IF NOT EXISTS action_items_horizon_idx ON action_items (horizon)",
    ),
  ]);
}

async function ensureActionItemsSeed(database: D1Database) {
  await ensureActionItemsTable(database);

  const current = await database
    .prepare("SELECT value FROM app_state WHERE key = ?")
    .bind(ACTION_ITEMS_SEED_KEY)
    .first<{ value: string }>();
  if (current) return;

  await runBatches(
    database,
    DEFAULT_ACTION_PLAN.map((item) =>
      database
        .prepare(
          `INSERT INTO action_items (${ACTION_ITEM_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        )
        .bind(
          crypto.randomUUID(),
          item.title,
          item.description,
          item.owner,
          item.horizon,
          "pendente",
          item.source,
          "import",
          "import",
        ),
    ),
  );

  await database
    .prepare(
      "INSERT INTO app_state (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(key) DO NOTHING",
    )
    .bind(ACTION_ITEMS_SEED_KEY, "done")
    .run();
}

export async function readActionItems(database: D1Database): Promise<ActionItem[]> {
  await ensureActionItemsSeed(database);
  const rows = await database
    .prepare(`SELECT ${ACTION_ITEM_COLUMNS} FROM action_items ORDER BY horizon, created_at`)
    .all<ActionItemRow>();
  return rows.results.map(rowToActionItem);
}

export async function addActionItem(
  database: D1Database,
  input: {
    title: string;
    description: string;
    owner: string | null;
    horizon: ActionHorizon;
    source: string | null;
    actorEmail: string;
  },
): Promise<ActionItem> {
  await ensureActionItemsTable(database);
  const id = crypto.randomUUID();
  await database
    .prepare(
      `INSERT INTO action_items (${ACTION_ITEM_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    )
    .bind(
      id,
      input.title,
      input.description,
      input.owner,
      input.horizon,
      "pendente",
      input.source,
      input.actorEmail,
      input.actorEmail,
    )
    .run();

  const row = await database
    .prepare(`SELECT ${ACTION_ITEM_COLUMNS} FROM action_items WHERE id = ?`)
    .bind(id)
    .first<ActionItemRow>();
  if (!row) throw new Error("Falha ao criar item do plano de ação.");
  return rowToActionItem(row);
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
  }>,
  actorEmail: string,
): Promise<ActionItem | null> {
  await ensureActionItemsTable(database);
  const existing = await database
    .prepare(`SELECT ${ACTION_ITEM_COLUMNS} FROM action_items WHERE id = ?`)
    .bind(id)
    .first<ActionItemRow>();
  if (!existing) return null;

  const next = {
    title: patch.title ?? existing.title,
    description: patch.description ?? existing.description,
    owner: patch.owner !== undefined ? patch.owner : existing.owner,
    horizon: patch.horizon ?? existing.horizon,
    status: patch.status ?? existing.status,
  };

  await database
    .prepare(
      "UPDATE action_items SET title = ?, description = ?, owner = ?, horizon = ?, status = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    )
    .bind(next.title, next.description, next.owner, next.horizon, next.status, actorEmail, id)
    .run();

  const row = await database
    .prepare(`SELECT ${ACTION_ITEM_COLUMNS} FROM action_items WHERE id = ?`)
    .bind(id)
    .first<ActionItemRow>();
  return row ? rowToActionItem(row) : null;
}

export async function deleteActionItem(database: D1Database, id: string): Promise<ActionItem | null> {
  await ensureActionItemsTable(database);
  const existing = await database
    .prepare(`SELECT ${ACTION_ITEM_COLUMNS} FROM action_items WHERE id = ?`)
    .bind(id)
    .first<ActionItemRow>();
  if (!existing) return null;
  await database.prepare("DELETE FROM action_items WHERE id = ?").bind(id).run();
  return rowToActionItem(existing);
}

type SellerGrowthTargetRow = {
  owner: string;
  year: number;
  month_number: number;
  month: string;
  entry_target: number;
  realized_target: number;
};

const GROWTH_TARGET_COLUMNS = "owner, year, month_number, month, entry_target, realized_target";

function rowToGrowthTarget(row: SellerGrowthTargetRow): SellerGrowthTarget {
  return {
    owner: row.owner,
    year: row.year,
    monthNumber: row.month_number,
    month: row.month,
    entryTarget: row.entry_target,
    realizedTarget: row.realized_target,
  };
}

/**
 * Same self-healing rationale as `ensureActionItemsTable`: this project has
 * no auto-applied migrations, so the table is created here, guarded by
 * `IF NOT EXISTS`, regardless of whether `npm run db:generate`'s SQL file
 * was actually run against this environment's D1.
 */
async function ensureSellerGrowthTargetsTable(database: D1Database) {
  await database.batch([
    database.prepare(
      `CREATE TABLE IF NOT EXISTS seller_growth_targets (
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
      )`,
    ),
    database.prepare(
      "CREATE UNIQUE INDEX IF NOT EXISTS seller_growth_targets_owner_year_month_unique ON seller_growth_targets (owner, year, month_number)",
    ),
    database.prepare(
      "CREATE INDEX IF NOT EXISTS seller_growth_targets_owner_idx ON seller_growth_targets (owner)",
    ),
  ]);
}

export async function readSellerGrowthTargets(
  database: D1Database,
): Promise<SellerGrowthTarget[]> {
  await ensureSellerGrowthTargetsTable(database);
  const rows = await database
    .prepare(
      `SELECT ${GROWTH_TARGET_COLUMNS} FROM seller_growth_targets ORDER BY owner, year, month_number`,
    )
    .all<SellerGrowthTargetRow>();
  return rows.results.map(rowToGrowthTarget);
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
  const id = `${input.owner}-${input.year}-${input.monthNumber}`;

  await database
    .prepare(
      `INSERT INTO seller_growth_targets (id, owner, year, month_number, month, entry_target, realized_target, created_by, updated_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT(owner, year, month_number) DO UPDATE SET
         entry_target = excluded.entry_target,
         realized_target = excluded.realized_target,
         updated_by = excluded.updated_by,
         updated_at = CURRENT_TIMESTAMP`,
    )
    .bind(
      id,
      input.owner,
      input.year,
      input.monthNumber,
      input.month,
      input.entryTarget,
      input.realizedTarget,
      input.actorEmail,
      input.actorEmail,
    )
    .run();

  const row = await database
    .prepare(
      `SELECT ${GROWTH_TARGET_COLUMNS} FROM seller_growth_targets WHERE owner = ? AND year = ? AND month_number = ?`,
    )
    .bind(input.owner, input.year, input.monthNumber)
    .first<SellerGrowthTargetRow>();
  if (!row) throw new Error("Falha ao salvar a meta de crescimento.");
  return rowToGrowthTarget(row);
}

function parsePayloads<T>(rows: D1Row[]): T[] {
  return rows.map((row) => JSON.parse(row.payload_json) as T);
}

export function rowToDeal(row: CommercialDealRow): Deal {
  const extra = JSON.parse(row.payload_json) as Record<string, unknown>;
  return {
    ...extra,
    id: row.id,
    year: row.year,
    month: row.month,
    monthNumber: row.month_number,
    owner: row.owner,
    company: row.company,
    origin: row.origin,
    sold: row.sold,
    adjusted: row.adjusted,
    billed: row.billed,
    stage: row.stage,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
  } as Deal;
}

/** Shared by `loadCommercialData()` and the polling `GET /api/deals` route. */
export async function readDealsAndTargets(
  database: D1Database,
): Promise<{ deals: Deal[]; targets: Target[] }> {
  await ensureSeeded(database);
  await ensureStageBackfill(database);
  await ensureExtraMonthTargets(database);

  const [dealResult, targetResult] = await Promise.all([
    database
      .prepare(
        "SELECT id, year, month_number, month, owner, company, origin, sold, adjusted, billed, stage, notes, created_by, updated_by, created_at, updated_at, payload_json FROM commercial_deals ORDER BY month_number, id",
      )
      .all<CommercialDealRow>(),
    database
      .prepare(
        "SELECT year, month_number, month, target, sold, adjusted FROM monthly_metrics ORDER BY month_number",
      )
      .all<TargetRow>(),
  ]);

  const deals = dealResult.results.map(rowToDeal);
  const targets: Target[] = targetResult.results.map((row) => ({
    year: row.year,
    monthNumber: row.month_number,
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
    // Sequenced: readDealsAndTargets() runs ensureSeeded()/ensureStageBackfill()
    // first, which the objectives/workbook queries below depend on existing.
    const { deals, targets } = await readDealsAndTargets(env.DB);
    const [sellers, actionItems, growthTargets, objectiveResult, workbookResult] =
      await Promise.all([
        readSellerRoster(env.DB),
        readActionItems(env.DB),
        readSellerGrowthTargets(env.DB),
        env.DB.prepare("SELECT payload_json FROM objectives ORDER BY id").all<D1Row>(),
        env.DB.prepare(
          "SELECT sheet_name, row_number, data_json, formula_json FROM workbook_rows ORDER BY id",
        ).all<WorkbookRow>(),
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
    for (const row of workbookResult.results) {
      const rows = rawRows.get(row.sheet_name) ?? [];
      rows.push({
        rowNumber: row.row_number,
        row: JSON.parse(row.data_json) as unknown[],
        formula: JSON.parse(row.formula_json) as unknown[],
      });
      rawRows.set(row.sheet_name, rows);
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
      objectives: parsePayloads<StaticData["objectives"][number]>(objectiveResult.results),
      governance: commercialDataJson.governance,
      dataQualityIssues: commercialDataJson.dataQualityIssues,
      rawSheets,
    };
  } catch {
    return buildFromStaticJson(asOf);
  }
}
