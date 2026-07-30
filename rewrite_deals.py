import sys

def rewrite_api_deals():
    with open('app/api/deals/route.ts', 'r', encoding='utf-8') as f:
        content = f.read()

    # Import getDb and commercialDeals schema
    imports = """import { getDb } from "@/db";
import { commercialDeals } from "@/db/schema";
"""
    if "import { getDb }" not in content:
        content = content.replace('import { env } from "cloudflare:workers";', imports + 'import { env } from "cloudflare:workers";')

    # Replace INSERT query with Drizzle insert
    # Find the env.DB.prepare block
    start_str = "await env.DB.prepare("
    end_str = ".run();"
    
    start_idx = content.find(start_str)
    if start_idx != -1:
        end_idx = content.find(end_str, start_idx) + len(end_str)
        
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
        
        content = content[:start_idx] + drizzle_insert + content[end_idx:]

    with open('app/api/deals/route.ts', 'w', encoding='utf-8') as f:
        f.write(content)

if __name__ == '__main__':
    rewrite_api_deals()
    print("Rewritten api/deals/route.ts")
