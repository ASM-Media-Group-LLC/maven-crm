// Migrate scouter data from Supabase v2 → Supabase v3
// This is needed because the original kash→Maven migration accidentally
// wrote to v2 instead of v3 (wrong service_role_key in .env).
//
// Usage:
//   cd servicios/scouter-worker
//   npx tsx scripts/migrate-v2-to-v3.ts --dry-run
//   npx tsx scripts/migrate-v2-to-v3.ts --apply

import { createClient } from "@supabase/supabase-js";

const args = new Set(process.argv.slice(2));
const DRY_RUN = !args.has("--apply");

if (DRY_RUN) {
  console.log("🟡 DRY-RUN mode (pass --apply to write to v3)");
} else {
  console.log("🔴 APPLY mode — writing to v3 Supabase");
}

// v2 — source (where the data accidentally landed)
const V2_URL = "https://lsagslbkliprespbyhts.supabase.co";
const V2_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxzYWdzbGJrbGlwcmVzcGJ5aHRzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTI4NjMyNiwiZXhwIjoyMDgwODYyMzI2fQ.jtnDoanZwhkencE2Yb7LY4QxTWqJ8GWUOkeomOhcM-M";
const V2_TENANT = "f1027359-8b6e-4afb-88e0-68863ba48234";

// v3 — destination (where production actually reads from)
const V3_URL = "https://ygsjkbqpnrsbohygmhyw.supabase.co";
const V3_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlnc2prYnFwbnJzYm9oeWdtaHl3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzY5Mjc3MSwiZXhwIjoyMDkzMjY4NzcxfQ.PG8iJ6j9NN7rTfnojRk6tb9GghZ8RsJ7H1cQ1L5tBOo";
const V3_TENANT = "30869615-f579-4981-8a1f-dbebc61eae2d";

const v2 = createClient(V2_URL, V2_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const v3 = createClient(V3_URL, V3_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

async function migrateCompanies(): Promise<Map<string, string>> {
  console.log("\n📁 Reading companies from v2…");
  const { data: v2Companies, error } = await v2
    .from("scouter_companies")
    .select("*")
    .eq("tenant_id", V2_TENANT);
  if (error) throw error;
  console.log(`  Found ${v2Companies?.length ?? 0} companies in v2`);

  const idMap = new Map<string, string>();
  if (!v2Companies || v2Companies.length === 0) return idMap;

  // Check which already exist in v3 by slug
  const slugs = v2Companies.map((c: any) => c.slug);
  const { data: existing } = await v3
    .from("scouter_companies")
    .select("id, slug")
    .in("slug", slugs)
    .eq("tenant_id", V3_TENANT);
  const existingBySlug = new Map<string, string>();
  for (const row of (existing ?? []) as any[]) {
    existingBySlug.set(row.slug, row.id);
  }

  for (const c of v2Companies) {
    const existingId = existingBySlug.get(c.slug);
    if (existingId) {
      idMap.set(c.id, existingId);
      console.log(`  · ${c.slug} already in v3 (${existingId.slice(0, 8)}…)`);
      continue;
    }
    if (DRY_RUN) {
      console.log(`  + ${c.slug} (would insert)`);
      idMap.set(c.id, `<DRY_${c.slug}>`);
      continue;
    }
    const { data, error: insertErr } = await v3
      .from("scouter_companies")
      .insert({
        slug: c.slug,
        name: c.name,
        description: c.description,
        active: c.active,
        search_config: c.search_config ?? {},
        tenant_id: V3_TENANT,
      })
      .select("id")
      .single();
    if (insertErr) {
      console.error(`  ✗ ${c.slug} error:`, insertErr.message);
      continue;
    }
    idMap.set(c.id, (data as any).id);
    console.log(`  + ${c.slug} inserted (${(data as any).id.slice(0, 8)}…)`);
  }
  return idMap;
}

async function migrateLeads(companyIdMap: Map<string, string>) {
  console.log("\n🎯 Reading leads from v2…");

  // Fetch all leads from v2 in pages (Supabase caps at 1000 per request)
  let allLeads: any[] = [];
  let offset = 0;
  const PAGE = 1000;
  while (true) {
    const { data, error } = await v2
      .from("scouter_leads")
      .select("*")
      .eq("tenant_id", V2_TENANT)
      .order("created_at", { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    allLeads = allLeads.concat(data);
    console.log(`  Read ${allLeads.length} leads so far…`);
    if (data.length < PAGE) break;
    offset += PAGE;
  }
  console.log(`  Total leads in v2: ${allLeads.length}`);

  if (DRY_RUN) {
    console.log("  DRY-RUN: would insert these leads into v3");
    return { inserted: 0, skipped: allLeads.length, errors: 0 };
  }

  let inserted = 0;
  let skipped = 0;
  let errors = 0;
  const BATCH = 50;

  for (let i = 0; i < allLeads.length; i += BATCH) {
    const slice = allLeads.slice(i, i + BATCH);
    const rows: any[] = [];

    for (const l of slice) {
      const newCompanyId = companyIdMap.get(l.company_id);
      if (!newCompanyId) {
        skipped++;
        continue;
      }
      // Remove v2-specific fields
      const { id, tenant_id, created_at, updated_at, ...rest } = l;
      rows.push({
        ...rest,
        company_id: newCompanyId,
        tenant_id: V3_TENANT,
      });
    }

    if (rows.length === 0) continue;

    const { data, error } = await v3
      .from("scouter_leads")
      .upsert(rows, { onConflict: "company_id,instagram_handle" })
      .select("id");
    if (error) {
      console.error(`  ✗ batch ${Math.floor(i / BATCH) + 1} error:`, error.message);
      errors += rows.length;
      continue;
    }
    inserted += (data ?? []).length;
    if ((i / BATCH + 1) % 10 === 0 || i + BATCH >= allLeads.length) {
      console.log(`  · batch ${Math.floor(i / BATCH) + 1}: total inserted ${inserted}`);
    }
  }

  return { inserted, skipped, errors };
}

async function main() {
  console.log("\n🚀 v2 → v3 Supabase migration");
  console.log(`   source:  ${V2_URL} (tenant ${V2_TENANT.slice(0, 8)}…)`);
  console.log(`   dest:    ${V3_URL} (tenant ${V3_TENANT.slice(0, 8)}…)`);

  const companyIdMap = await migrateCompanies();
  const result = await migrateLeads(companyIdMap);

  console.log("\n📝 Result:");
  console.log(`   companies: ${companyIdMap.size}`);
  console.log(`   leads inserted: ${result.inserted}`);
  console.log(`   leads skipped: ${result.skipped}`);
  console.log(`   errors: ${result.errors}`);
  if (DRY_RUN) {
    console.log("\n🟡 DRY-RUN. Re-run with --apply to write.");
  } else {
    console.log("\n✅ Done! Check v3 production.");
  }
}

main().catch((e) => {
  console.error("\n❌ Migration failed:", e);
  process.exit(1);
});
