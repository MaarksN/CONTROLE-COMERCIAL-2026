import sys

def rewrite_bitrix_import_confirm():
    with open('app/api/integrations/bitrix/import/confirm/route.ts', 'r', encoding='utf-8') as f:
        content = f.read()

    # Import getDb, commercialDeals schema
    imports = """import { getDb } from "@/db";
import { commercialDeals } from "@/db/schema";
"""
    if "import { getDb }" not in content:
        content = content.replace('import { env } from "cloudflare:workers";', imports + 'import { env } from "cloudflare:workers";')

    # Replace INSERT
    start_insert = content.find('await env.DB.prepare(')
    if start_insert != -1:
        end_insert = content.find('.run();', start_insert) + len('.run();')
        
        drizzle_insert = """const db = getDb();
      await db.insert(commercialDeals).values({
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
        stage: deal.stage,
        notes: deal.notes,
        createdBy: user.email,
        updatedBy: user.email,
        payloadJson: JSON.stringify(deal),
      }).run();"""
        
        content = content[:start_insert] + drizzle_insert + content[end_insert:]

    with open('app/api/integrations/bitrix/import/confirm/route.ts', 'w', encoding='utf-8') as f:
        f.write(content)

if __name__ == '__main__':
    rewrite_bitrix_import_confirm()
    print("Rewritten bitrix/import/confirm")
