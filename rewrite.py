import re

with open('db/commercial-data.ts', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Imports
content = re.sub(
    r'import { env } from "cloudflare:workers";',
    'import { env } from "cloudflare:workers";\nimport { getDb } from "./index";\nimport { eq, sql, desc, asc, and } from "drizzle-orm";\nimport { appState, monthlyMetrics, commercialDeals, workbookRows, objectives, userRoles, actionItems as actionItemsTable, sellerGrowthTargets, alertState, integrationSettings } from "./schema";',
    content
)

# 2. ensureSeeded
ensure_seeded_new = '''async function ensureSeeded(database: D1Database) {
  const db = getDb();
  const current = await db.select({ value: appState.value }).from(appState).where(eq(appState.key, "seed_version")).get();

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
        }))
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
        }))
      );
    }
  }

  const workbookStatements = commercialDataJson.rawSheets.flatMap((sheet) =>
    sheet.rows.map((row, index) => ({
      sheetName: sheet.name,
      rowNumber: index + 1,
      dataJson: JSON.stringify(row),
      formulaJson: JSON.stringify(sheet.formulas[index] ?? []),
    }))
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
        }))
      );
    }
  }

  await db.insert(appState).values({ key: "seed_version", value: SEED_VERSION, updatedAt: sqlCURRENT_TIMESTAMP })
    .onConflictDoUpdate({ target: appState.key, set: { value: sqlxcluded.value, updatedAt: sqlCURRENT_TIMESTAMP } });
}'''
content = re.sub(r'async function ensureSeeded\(database: D1Database\) \{.*?(?=\nasync function ensureStageBackfill)', ensure_seeded_new + '\n', content, flags=re.DOTALL)


# 3. ensureStageBackfill
ensure_stage_backfill_new = '''async function ensureStageBackfill(database: D1Database) {
  const db = getDb();
  const current = await db.select({ value: appState.value }).from(appState).where(eq(appState.key, STAGE_BACKFILL_KEY)).get();

  if (current?.value === "done") return;

  const rows = await db.select({ id: commercialDeals.id, billed: commercialDeals.billed, payloadJson: commercialDeals.payloadJson }).from(commercialDeals).all();

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

  await db.insert(appState).values({ key: STAGE_BACKFILL_KEY, value: "done", updatedAt: sqlCURRENT_TIMESTAMP })
    .onConflictDoUpdate({ target: appState.key, set: { value: sqlxcluded.value, updatedAt: sqlCURRENT_TIMESTAMP } });
}'''
content = re.sub(r'async function ensureStageBackfill\(database: D1Database\) \{.*?(?=\n/\*\*)', ensure_stage_backfill_new + '\n', content, flags=re.DOTALL)


with open('db/commercial-data2.ts', 'w', encoding='utf-8') as f:
    f.write(content)

