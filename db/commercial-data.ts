import { env } from "cloudflare:workers";
import commercialData from "../app/data/commercial-data.json";

const SEED_VERSION = "atlas-commercial-2026-v1";
const BATCH_SIZE = 40;

type SeedData = typeof commercialData;
type D1Row = { payload_json: string };
type WorkbookRow = {
  sheet_name: string;
  row_number: number;
  data_json: string;
  formula_json: string;
};

async function runBatches(
  database: D1Database,
  statements: D1PreparedStatement[],
) {
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
    commercialData.monthlyMetrics.map((metric) =>
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
    commercialData.deals2026.map((deal) =>
      database
        .prepare(
          "INSERT INTO commercial_deals (id, year, month_number, month, owner, company, origin, sold, adjusted, payload_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
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
          JSON.stringify(deal),
        ),
    ),
  );

  const workbookStatements = commercialData.rawSheets.flatMap((sheet) =>
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
    commercialData.objectives.map((objective) =>
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

function parsePayloads<T>(rows: D1Row[]): T[] {
  return rows.map((row) => JSON.parse(row.payload_json) as T);
}

export async function loadCommercialData(): Promise<SeedData> {
  if (!env.DB) return commercialData;

  try {
    await ensureSeeded(env.DB);

    const [metricResult, dealResult, objectiveResult, workbookResult] =
      await Promise.all([
        env.DB.prepare(
          "SELECT payload_json FROM monthly_metrics ORDER BY month_number",
        ).all<D1Row>(),
        env.DB.prepare(
          "SELECT payload_json FROM commercial_deals ORDER BY month_number, id",
        ).all<D1Row>(),
        env.DB.prepare(
          "SELECT payload_json FROM objectives ORDER BY id",
        ).all<D1Row>(),
        env.DB.prepare(
          "SELECT sheet_name, row_number, data_json, formula_json FROM workbook_rows ORDER BY id",
        ).all<WorkbookRow>(),
      ]);

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

    const rawSheets = commercialData.rawSheets.map((sheet) => {
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
      ...commercialData,
      monthlyMetrics: parsePayloads<
        SeedData["monthlyMetrics"][number]
      >(metricResult.results),
      deals2026: parsePayloads<SeedData["deals2026"][number]>(
        dealResult.results,
      ),
      objectives: parsePayloads<SeedData["objectives"][number]>(
        objectiveResult.results,
      ),
      rawSheets,
    };
  } catch {
    return commercialData;
  }
}
