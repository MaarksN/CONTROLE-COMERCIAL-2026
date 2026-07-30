import sys

def rewrite_api_deals_id():
    with open('app/api/deals/[id]/route.ts', 'r', encoding='utf-8') as f:
        content = f.read()

    # Import getDb and commercialDeals schema, and eq from drizzle-orm
    imports = """import { getDb } from "@/db";
import { commercialDeals } from "@/db/schema";
import { eq } from "drizzle-orm";
"""
    if "import { getDb }" not in content:
        content = content.replace('import { env } from "cloudflare:workers";', imports + 'import { env } from "cloudflare:workers";')

    # Fix fetchRow function
    start_fetch = content.find('async function fetchRow(id: string): Promise<ExistingRow | null> {')
    end_fetch = content.find('  return row ?? null;\n}', start_fetch) + len('  return row ?? null;\n}')
    
    fetch_drizzle = """async function fetchRow(id: string): Promise<ExistingRow | null> {
  const db = getDb();
  const row = await db.select().from(commercialDeals).where(eq(commercialDeals.id, id)).get();
  if (!row) return null;
  return {
    id: row.id,
    year: row.year,
    month_number: row.monthNumber,
    month: row.month,
    owner: row.owner,
    company: row.company,
    origin: row.origin,
    sold: row.sold,
    adjusted: row.adjusted,
    billed: row.billed,
    stage: row.stage,
    notes: row.notes,
    created_by: row.createdBy,
    updated_by: row.updatedBy,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
    payload_json: row.payloadJson,
  };
}"""
    
    if start_fetch != -1:
        content = content[:start_fetch] + fetch_drizzle + content[end_fetch:]

    # Fix UPDATE query
    start_upd = content.find('    await env.DB.prepare(')
    end_upd = content.find('.run();', start_upd) + len('.run();')
    
    drizzle_update = """    const db = getDb();
    await db.update(commercialDeals).set({
      year: next.year,
      monthNumber: next.monthNumber,
      month: next.month,
      owner: next.owner,
      company: next.company,
      origin: next.origin,
      sold: next.sold,
      adjusted: next.adjusted,
      billed: next.billed,
      stage: next.stage,
      notes: next.notes,
      updatedBy: user.email,
      updatedAt: next.updatedAt,
      payloadJson: JSON.stringify(next),
    }).where(eq(commercialDeals.id, id)).run();"""
    
    if start_upd != -1:
        content = content[:start_upd] + drizzle_update + content[end_upd:]
        
    # Fix DELETE query
    start_del = content.find('await env.DB.prepare("DELETE FROM commercial_deals WHERE id = ?").bind(id).run();')
    if start_del != -1:
        content = content.replace(
            'await env.DB.prepare("DELETE FROM commercial_deals WHERE id = ?").bind(id).run();',
            'const db = getDb();\n    await db.delete(commercialDeals).where(eq(commercialDeals.id, id)).run();'
        )

    with open('app/api/deals/[id]/route.ts', 'w', encoding='utf-8') as f:
        f.write(content)

if __name__ == '__main__':
    rewrite_api_deals_id()
    print("Rewritten api/deals/[id]/route.ts")
