import sys

def rewrite_bitrix_export():
    with open('app/api/integrations/bitrix/export/route.ts', 'r', encoding='utf-8') as f:
        content = f.read()

    # Import getDb, commercialDeals schema, eq
    imports = """import { getDb } from "@/db";
import { commercialDeals } from "@/db/schema";
import { eq } from "drizzle-orm";
"""
    if "import { getDb }" not in content:
        content = content.replace('import { env } from "cloudflare:workers";', imports + 'import { env } from "cloudflare:workers";')

    # Replace SELECT
    start_select = content.find('const row = await env.DB.prepare(')
    if start_select != -1:
        end_select = content.find('.first<DealRow>();', start_select) + len('.first<DealRow>();')
        drizzle_select = """const db = getDb();
        const row = await db.select({ id: commercialDeals.id, payload_json: commercialDeals.payloadJson })
          .from(commercialDeals)
          .where(eq(commercialDeals.id, dealId))
          .get();"""
        content = content[:start_select] + drizzle_select + content[end_select:]

    # Replace UPDATE
    start_update = content.find('await env.DB.prepare("UPDATE commercial_deals SET payload_json = ? WHERE id = ?")')
    if start_update != -1:
        end_update = content.find('.run();', start_update) + len('.run();')
        drizzle_update = """await db.update(commercialDeals)
            .set({ payloadJson: JSON.stringify(deal) })
            .where(eq(commercialDeals.id, dealId))
            .run();"""
        content = content[:start_update] + drizzle_update + content[end_update:]

    with open('app/api/integrations/bitrix/export/route.ts', 'w', encoding='utf-8') as f:
        f.write(content)

if __name__ == '__main__':
    rewrite_bitrix_export()
    print("Rewritten bitrix/export")
