import sys

def replace_block(content, start_marker, end_marker, new_block):
    start_idx = content.find(start_marker)
    if start_idx == -1:
        print(f"Error: {start_marker} not found")
        sys.exit(1)
    
    # if end_marker is empty, we just replace from start to the end of the file? No, we find end_marker.
    if end_marker:
        end_idx = content.find(end_marker, start_idx)
        if end_idx == -1:
            print(f"Error: {end_marker} not found")
            sys.exit(1)
        return content[:start_idx] + new_block + content[end_idx:]
    else:
        return content

with open('db/commercial-data.ts', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add imports
if 'import { getDb }' not in content:
    content = content.replace(
        'import { env } from "cloudflare:workers";',
        'import { env } from "cloudflare:workers";\nimport { getDb } from "./index";\nimport { eq, sql, desc, asc, and } from "drizzle-orm";\nimport { appState, monthlyMetrics, commercialDeals, workbookRows, objectives, userRoles, actionItems as actionItemsTable, sellerGrowthTargets as sgtTable, alertState as alertTable, integrationSettings as isettingsTable } from "./schema";'
    )

# Remove runBatches
content = content.replace('''async function runBatches(database: D1Database, statements: D1PreparedStatement[]) {
  for (let index = 0; index < statements.length; index += BATCH_SIZE) {
    await database.batch(statements.slice(index, index + BATCH_SIZE));
  }
}''', '')

# Replace ensureSeeded
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

  await db.insert(appState)
    .values({ key: "seed_version", value: SEED_VERSION, updatedAt: sql\CURRENT_TIMESTAMP\ })
    .onConflictDoUpdate({ target: appState.key, set: { value: sql\xcluded.value\, updatedAt: sql\CURRENT_TIMESTAMP\ } });
}'''
content = replace_block(content, 'async function ensureSeeded(database: D1Database) {', '/**\n * Additive, non-destructive', ensure_seeded_new + '\n\n')

# Replace ensureStageBackfill
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

  await db.insert(appState)
    .values({ key: STAGE_BACKFILL_KEY, value: "done", updatedAt: sql\CURRENT_TIMESTAMP\ })
    .onConflictDoUpdate({ target: appState.key, set: { value: sql\xcluded.value\, updatedAt: sql\CURRENT_TIMESTAMP\ } });
}'''
content = replace_block(content, 'async function ensureStageBackfill(database: D1Database) {', '/**\n * Additive: the original workbook', ensure_stage_backfill_new + '\n\n')

with open('db/commercial-data.ts', 'w', encoding='utf-8') as f:
    f.write(content)
print("done step 1")
