// Migración de data Scouter: kash Postgres (Dokploy) → Maven Supabase.
//
// Este script es one-shot: lee scouter_companies + scouter_leads de la
// DB origen y los inserta en Maven mapeando tenant_id explícitamente.
// Idempotente: si lo corrés dos veces, los upserts no duplican.
//
// LO QUE NO MIGRA (a propósito):
//  - scouter_jobs: son volátiles, no tiene sentido migrar la queue.
//  - scouter_lead_favorites: están atados a user_id que no existe en Maven.
//  - scouter_apify_token_state / scouter_apify_budget: estado runtime.
//  - scouter_notifications / scouter_notification_reads: volátiles.
//
// MAPEO DE TENANT_ID:
// kash NO era multi-tenant; Maven sí. Todas las rows migradas se le
// asignan al MAVEN_TENANT_ID que pasás por env. Si querés filtrar
// rows de kash por algún campo (e.g. solo las de "ASM Tech"), agregá
// un WHERE en las queries de origin.
//
// USO:
//   1. cd servicios/scouter-worker && bun install
//   2. Crear servicios/scouter-worker/scripts/.env con:
//        KASH_DATABASE_URL=postgres://user:pass@dokploy-host:5432/kash_db
//        MAVEN_SUPABASE_URL=https://ygsjkbqpnrsbohygmhyw.supabase.co
//        MAVEN_SUPABASE_SERVICE_ROLE_KEY=eyJ...
//        MAVEN_TENANT_ID=<uuid de ASM Tech en Maven>
//   3. bun run scripts/migrate-from-kash.ts --dry-run
//      (te muestra qué haría sin escribir nada)
//   4. Si todo ok: bun run scripts/migrate-from-kash.ts --apply

import "node:process";
import { createClient } from "@supabase/supabase-js";
import { Client as PgClient } from "pg";

// ─── CLI args ────────────────────────────────────────────────────────
const args = new Set(process.argv.slice(2));
const DRY_RUN = !args.has("--apply");
if (DRY_RUN) {
  console.log("🟡 Modo DRY-RUN (pasá --apply para escribir en Maven)");
} else {
  console.log("🔴 Modo APPLY — los cambios se van a escribir en Maven Supabase.");
}

// ─── Env loading (poor-man, sin dotenv) ──────────────────────────────
// Si tenés bun, podés usar `bun --env-file=.env run …` y omitir esto.
// Para que ande con node, mantenemos lectura naïve.
function loadEnv(path: string): void {
  try {
    const fs = require("node:fs") as typeof import("node:fs");
    if (!fs.existsSync(path)) return;
    const content = fs.readFileSync(path, "utf8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed
        .slice(eq + 1)
        .trim()
        .replace(/^["']|["']$/g, "");
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    // ignorar
  }
}
loadEnv("scripts/.env");

const KASH_DATABASE_URL = process.env.KASH_DATABASE_URL;
const MAVEN_SUPABASE_URL = process.env.MAVEN_SUPABASE_URL;
const MAVEN_SUPABASE_SERVICE_ROLE_KEY = process.env.MAVEN_SUPABASE_SERVICE_ROLE_KEY;
const MAVEN_TENANT_ID = process.env.MAVEN_TENANT_ID;

if (!KASH_DATABASE_URL || !MAVEN_SUPABASE_URL || !MAVEN_SUPABASE_SERVICE_ROLE_KEY || !MAVEN_TENANT_ID) {
  console.error("❌ Faltan env vars. Necesitás:");
  console.error("   KASH_DATABASE_URL, MAVEN_SUPABASE_URL,");
  console.error("   MAVEN_SUPABASE_SERVICE_ROLE_KEY, MAVEN_TENANT_ID");
  process.exit(1);
}

// ─── Tipos ───────────────────────────────────────────────────────────
interface KashCompany {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  active: boolean;
  created_at: string;
}

interface KashLead {
  id: string;
  company_id: string;
  instagram_handle: string;
  instagram_url: string | null;
  name: string | null;
  phone: string | null;
  country: string | null;
  city: string | null;
  category: string | null;
  status: string;
  platform: string | null;
  onlyfans_url: string | null;
  followers: number | null;
  bio: string | null;
  verified: boolean;
  photo_data_url: string | null;
  ai_score: number | null;
  ai_status: string | null;
  ai_reason: string | null;
  link_in_bio_platform: string | null;
  prefilter_score: number;
  discovery_source: string | null;
  contact_account: string | null;
  target_companies: unknown;
  assigned_closer: string | null;
  sub_product: string | null;
  assigned_agency: string | null;
  monetization_usd: number | null;
  split_pct: number | null;
  notes: string | null;
  date_added: string | null;
  date_contacted: string | null;
  date_confirmed: string | null;
  date_active: string | null;
  date_rejected: string | null;
  contact_touches: unknown;
  created_at: string;
  updated_at: string;
}

// ─── Conexiones ──────────────────────────────────────────────────────
const kashDb = new PgClient({ connectionString: KASH_DATABASE_URL });
const maven = createClient(MAVEN_SUPABASE_URL, MAVEN_SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ─── Helpers ─────────────────────────────────────────────────────────
async function fetchKashCompanies(): Promise<KashCompany[]> {
  const res = await kashDb.query<KashCompany>(
    "select id, slug, name, description, active, created_at from scouter_companies order by created_at asc",
  );
  return res.rows;
}

async function fetchKashLeads(): Promise<KashLead[]> {
  // Mantener el orden por created_at para que duplicados resuelvan
  // hacia el más reciente vía upsert (postgrest hace LAST WINS).
  const res = await kashDb.query<KashLead>(
    `select
        id, company_id, instagram_handle, instagram_url, name, phone,
        country, city, category, status, platform, onlyfans_url,
        followers, bio, verified, photo_data_url, ai_score, ai_status,
        ai_reason, link_in_bio_platform, prefilter_score, discovery_source,
        contact_account, target_companies, assigned_closer, sub_product,
        assigned_agency, monetization_usd, split_pct, notes,
        date_added, date_contacted, date_confirmed, date_active,
        date_rejected, contact_touches, created_at, updated_at
     from scouter_leads
     order by created_at asc`,
  );
  return res.rows;
}

/** Upsert companies a Maven, devolviendo un map {kashId → mavenId}.
 *  Maven puede ya tener companies con el mismo slug → en ese caso
 *  reusamos su id. Si no, insertamos con el slug + name de kash. */
async function migrateCompanies(
  companies: KashCompany[],
): Promise<Map<string, string>> {
  console.log(`\n📁 Migrando ${companies.length} companies…`);
  const idMap = new Map<string, string>();

  // 1) Pre-fetch las companies que ya existen en Maven con esos slugs.
  const slugs = companies.map((c) => c.slug);
  const { data: existing, error: existingErr } = await maven
    .from("scouter_companies")
    .select("id, slug, tenant_id")
    .in("slug", slugs)
    .eq("tenant_id", MAVEN_TENANT_ID);
  if (existingErr) throw existingErr;
  const existingBySlug = new Map<string, string>();
  for (const row of existing as Array<{ id: string; slug: string }>) {
    existingBySlug.set(row.slug, row.id);
  }

  // 2) Insertar las que faltan. Si DRY_RUN solo logueamos.
  for (const c of companies) {
    const existingId = existingBySlug.get(c.slug);
    if (existingId) {
      idMap.set(c.id, existingId);
      console.log(`  · ${c.slug} ya existe en Maven (${existingId.slice(0, 8)}…)`);
      continue;
    }
    if (DRY_RUN) {
      console.log(`  + ${c.slug} (would insert)`);
      // En dry-run usamos un placeholder para mantener el flujo.
      idMap.set(c.id, `<DRY_${c.slug}>`);
      continue;
    }
    const { data, error } = await maven
      .from("scouter_companies")
      .insert({
        slug: c.slug,
        name: c.name,
        description: c.description,
        active: c.active,
        tenant_id: MAVEN_TENANT_ID,
      })
      .select("id")
      .single();
    if (error) {
      console.error(`  ✗ ${c.slug} error:`, error.message);
      continue;
    }
    const newId = (data as { id: string }).id;
    idMap.set(c.id, newId);
    console.log(`  + ${c.slug} insertada (${newId.slice(0, 8)}…)`);
  }
  return idMap;
}

async function migrateLeads(
  leads: KashLead[],
  companyIdMap: Map<string, string>,
): Promise<{ inserted: number; updated: number; skipped: number; errors: number }> {
  console.log(`\n🎯 Migrando ${leads.length} leads…`);
  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  let errors = 0;

  // Procesamos en batches de 50 para no saturar Supabase.
  const BATCH = 50;
  for (let i = 0; i < leads.length; i += BATCH) {
    const slice = leads.slice(i, i + BATCH);
    const rows: Array<Record<string, unknown>> = [];

    for (const l of slice) {
      const newCompanyId = companyIdMap.get(l.company_id);
      if (!newCompanyId) {
        console.warn(`  · skip ${l.instagram_handle} — company ${l.company_id} no mapeada`);
        skipped += 1;
        continue;
      }
      // En dry-run el placeholder no es UUID válido, salteamos el insert real.
      if (DRY_RUN) {
        skipped += 1;
        continue;
      }
      rows.push({
        company_id: newCompanyId,
        instagram_handle: l.instagram_handle,
        instagram_url: l.instagram_url,
        name: l.name,
        phone: l.phone,
        country: l.country,
        city: l.city,
        category: l.category,
        status: l.status,
        platform: l.platform,
        onlyfans_url: l.onlyfans_url,
        followers: l.followers,
        bio: l.bio,
        verified: l.verified,
        photo_data_url: l.photo_data_url,
        ai_score: l.ai_score,
        ai_status: l.ai_status,
        ai_reason: l.ai_reason,
        link_in_bio_platform: l.link_in_bio_platform,
        prefilter_score: l.prefilter_score,
        discovery_source: l.discovery_source,
        contact_account: l.contact_account,
        target_companies: l.target_companies ?? [],
        assigned_closer: l.assigned_closer,
        sub_product: l.sub_product,
        assigned_agency: l.assigned_agency,
        monetization_usd: l.monetization_usd,
        split_pct: l.split_pct,
        notes: l.notes,
        date_added: l.date_added,
        date_contacted: l.date_contacted,
        date_confirmed: l.date_confirmed,
        date_active: l.date_active,
        date_rejected: l.date_rejected,
        contact_touches: l.contact_touches ?? [],
        tenant_id: MAVEN_TENANT_ID,
      });
    }

    if (DRY_RUN || rows.length === 0) {
      console.log(
        `  · batch ${i / BATCH + 1}: ${slice.length} leads — DRY (no insert)`,
      );
      continue;
    }

    const { data, error } = await maven
      .from("scouter_leads")
      .upsert(rows, { onConflict: "company_id,instagram_handle" })
      .select("id");
    if (error) {
      console.error(`  ✗ batch ${i / BATCH + 1} error:`, error.message);
      errors += rows.length;
      continue;
    }
    const count = (data ?? []).length;
    inserted += count;
    console.log(
      `  · batch ${i / BATCH + 1}: ${count} leads upserted (acumulado ${inserted}).`,
    );
  }

  return { inserted, updated, skipped, errors };
}

// ─── Main ────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  console.log("\n🚀 scouter migration kash → maven");
  console.log(`   tenant destino: ${MAVEN_TENANT_ID}`);
  console.log(`   maven URL:      ${MAVEN_SUPABASE_URL}`);

  await kashDb.connect();
  console.log("✅ Conectado a kash Postgres.");

  try {
    // Sanity check: que las tablas existan en kash.
    const t = await kashDb.query<{ table_name: string }>(
      "select table_name from information_schema.tables where table_schema='public' and table_name like 'scouter_%' order by table_name",
    );
    console.log(`✅ Tablas scouter_* en kash: ${t.rows.map((r) => r.table_name).join(", ")}`);
    if (t.rows.length === 0) {
      console.error("❌ kash no tiene ninguna tabla scouter_* — ¿es la DB correcta?");
      process.exit(2);
    }

    const companies = await fetchKashCompanies();
    const leads = await fetchKashLeads();
    console.log(`📊 kash: ${companies.length} companies, ${leads.length} leads.`);

    if (companies.length === 0 && leads.length === 0) {
      console.log("ℹ️  Nada para migrar. Saliendo.");
      return;
    }

    const companyIdMap = await migrateCompanies(companies);
    const result = await migrateLeads(leads, companyIdMap);

    console.log("\n📝 Resultado:");
    console.log(`   companies migradas: ${companyIdMap.size}`);
    console.log(`   leads insertados/upserted: ${result.inserted}`);
    console.log(`   leads skip: ${result.skipped}`);
    console.log(`   errors: ${result.errors}`);
    if (DRY_RUN) {
      console.log("\n🟡 Era DRY-RUN. Si todo se ve bien, re-correr con --apply.");
    } else {
      console.log("\n✅ Listo. Verificá en Maven que veas los leads en /scouter-assist.");
    }
  } finally {
    await kashDb.end();
  }
}

main().catch((e) => {
  console.error("\n❌ Migration falló:", e);
  process.exit(1);
});
