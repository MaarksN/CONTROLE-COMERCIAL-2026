import sys

def rewrite_api_targets():
    with open('app/api/targets/[year]/[monthNumber]/route.ts', 'r', encoding='utf-8') as f:
        content = f.read()

    # Import getDb, monthlyMetrics and eq, and
    imports = """import { getDb } from "@/db";
import { monthlyMetrics } from "@/db/schema";
import { eq, and } from "drizzle-orm";
"""
    if "import { getDb }" not in content:
        content = content.replace('import { env } from "cloudflare:workers";', imports + 'import { env } from "cloudflare:workers";')

    # Replace SELECT existing
    start_select = content.find('const existing = await env.DB.prepare(')
    if start_select != -1:
        end_select = content.find('.first<{ sold: number; adjusted: number }>();', start_select) + len('.first<{ sold: number; adjusted: number }>();')
        
        drizzle_select = """const db = getDb();
    const existing = await db.select({ sold: monthlyMetrics.sold, adjusted: monthlyMetrics.adjusted })
      .from(monthlyMetrics)
      .where(and(eq(monthlyMetrics.year, year), eq(monthlyMetrics.monthNumber, monthNumber)))
      .get();"""
        
        content = content[:start_select] + drizzle_select + content[end_select:]
        
    # Replace INSERT ON CONFLICT
    start_insert = content.find('await env.DB.prepare(')
    if start_insert != -1:
        end_insert = content.find('.run();', start_insert) + len('.run();')
        
        drizzle_insert = """await db.insert(monthlyMetrics).values({
      year,
      monthNumber,
      month,
      target,
      sold: nextSold,
      adjusted: nextAdjusted,
      payloadJson: '{}',
    }).onConflictDoUpdate({
      targetWhere: and(eq(monthlyMetrics.year, year), eq(monthlyMetrics.monthNumber, monthNumber)),
      set: { target, sold: nextSold, adjusted: nextAdjusted }
    }).run();"""
        
        content = content[:start_insert] + drizzle_insert + content[end_insert:]

    with open('app/api/targets/[year]/[monthNumber]/route.ts', 'w', encoding='utf-8') as f:
        f.write(content)

if __name__ == '__main__':
    rewrite_api_targets()
    print("Rewritten api/targets")
