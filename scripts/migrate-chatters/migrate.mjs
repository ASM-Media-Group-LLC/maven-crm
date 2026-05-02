// One-time migration: Roleplaychatters (Firebase Realtime DB + remote /uploads)
// → Maven Supabase branch (chatter_profiles, chatter_vault_items, chatter_config,
// chatter_criteria_defaults + Storage bucket "chatter-vault").
//
// Usage:
//   FIREBASE_SA_PATH=/path/to/serviceAccount.json \
//   SUPABASE_URL=https://<branch-ref>.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=<service-role-jwt> \
//   node migrate.mjs [--dry-run] [--skip-files]
//
// Flags:
//   --dry-run    : do not write to Supabase (read & report only)
//   --skip-files : insert vault rows but keep their original URLs (no download/upload)
//
// Idempotent: re-running upserts existing rows by natural key.
//
// The script is one-shot and intentionally chatty — every step is logged.

import { readFileSync } from "node:fs";
import { Buffer } from "node:buffer";
import admin from "firebase-admin";
import { createClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Args / env
// ---------------------------------------------------------------------------
const DRY_RUN     = process.argv.includes("--dry-run");
const SKIP_FILES  = process.argv.includes("--skip-files");

const SA_PATH       = process.env.FIREBASE_SA_PATH;
const FIREBASE_URL  = process.env.FIREBASE_DB_URL || "https://roleplaychatters-default-rtdb.firebaseio.com";
const SUPABASE_URL  = process.env.SUPABASE_URL;
const SUPABASE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
const VAULT_BUCKET  = process.env.SUPABASE_VAULT_BUCKET || "chatter-vault";

function fatal(msg) { console.error("\n❌ " + msg); process.exit(1); }

if (!SA_PATH) fatal("FIREBASE_SA_PATH is required");
if (!SUPABASE_URL) fatal("SUPABASE_URL is required");
if (!SUPABASE_KEY) fatal("SUPABASE_SERVICE_ROLE_KEY is required");

// ---------------------------------------------------------------------------
// Firebase + Supabase clients
// ---------------------------------------------------------------------------
admin.initializeApp({
  credential: admin.credential.cert(JSON.parse(readFileSync(SA_PATH, "utf8"))),
  databaseURL: FIREBASE_URL,
});

const supa = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const log     = (...a) => console.log(...a);
const section = (s) => log("\n" + "═".repeat(72) + "\n" + s + "\n" + "═".repeat(72));

function inferMediaType(url, name = "") {
  const target = (name || url || "").toLowerCase();
  if (/\.(mp4|mov|webm|m4v|avi|mkv)(\?|$)/.test(target)) return "video";
  if (/\.(jpg|jpeg|png|gif|webp|avif|svg|bmp)(\?|$)/.test(target)) return "image";
  return "other";
}

const CONTENT_TYPE_BY_EXT = {
  jpg:  "image/jpeg", jpeg: "image/jpeg",
  png:  "image/png",
  gif:  "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  svg:  "image/svg+xml",
  bmp:  "image/bmp",
  mp4:  "video/mp4",
  mov:  "video/quicktime",
  webm: "video/webm",
  m4v:  "video/x-m4v",
  avi:  "video/x-msvideo",
  mkv:  "video/x-matroska",
};

function inferContentType(name = "", url = "") {
  const target = (name || url).toLowerCase();
  const m = target.match(/\.([a-z0-9]+)(?:\?|$)/);
  if (!m) return "application/octet-stream";
  return CONTENT_TYPE_BY_EXT[m[1]] || "application/octet-stream";
}

const FIELDS_BILINGUAL = [
  "name", "nationality", "location", "age", "greeting", "users_term",
  "body", "nudity", "anal", "collabs", "videocall", "custom", "extra",
];

// Map Firebase profile fields → DB columns. Anything not explicitly mapped goes
// to extra_fields jsonb so we never lose data.
const FB_TO_DB_FIELD_MAP = {
  // bilingual + their _en counterparts handled inline below
  prices: "prices",
  avatar: "avatar_url",
  avatarX: "avatar_x",
  avatarY: "avatar_y",
  avatarZoom: "avatar_zoom",
  // Firebase calls "users" what we call "users_term" to avoid SQL keyword shadow
  users: "users_term",
  users_en: "users_term_en",
};

function transformProfile(key, fb) {
  const out = { key };
  const extra = {};

  for (const [fbKey, val] of Object.entries(fb || {})) {
    if (val === null || val === undefined) continue;

    const mapped = FB_TO_DB_FIELD_MAP[fbKey];
    if (mapped) { out[mapped] = val; continue; }

    // bilingual base fields (e.g. "name", "name_en")
    const baseEn = fbKey.endsWith("_en") ? fbKey.slice(0, -3) : null;
    if (baseEn && FIELDS_BILINGUAL.includes(baseEn)) {
      out[`${baseEn}_en`] = val; continue;
    }
    if (FIELDS_BILINGUAL.includes(fbKey)) { out[fbKey] = val; continue; }

    // Anything else → extra_fields
    extra[fbKey] = val;
  }

  if (Object.keys(extra).length > 0) out.extra_fields = extra;

  // age/age_en come as int or string in Firebase — DB column is text
  if (out.age !== undefined) out.age = String(out.age);
  if (out.age_en !== undefined) out.age_en = String(out.age_en);

  // Sanitize avatar coords to int
  for (const k of ["avatar_x", "avatar_y", "avatar_zoom"]) {
    if (out[k] !== undefined) out[k] = parseInt(out[k], 10);
  }

  // prices must be jsonb object
  if (out.prices && typeof out.prices !== "object") delete out.prices;

  return out;
}

async function downloadToBuffer(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  const ab = await res.arrayBuffer();
  return Buffer.from(ab);
}

function objectPathFromOriginalUrl(profileKey, name, originalUrl) {
  // Best-effort: keep the same folder/filename layout the source used.
  let cleanName = (name || "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!cleanName) {
    try {
      const u = new URL(originalUrl);
      cleanName = u.pathname.split("/").pop() || `item-${Date.now()}`;
    } catch { cleanName = `item-${Date.now()}`; }
  }
  return `${profileKey}/${Date.now()}-${cleanName}`;
}

async function ensureBucket() {
  if (DRY_RUN) { log(`(dry-run) would ensure bucket "${VAULT_BUCKET}"`); return; }
  const { data: list, error: listErr } = await supa.storage.listBuckets();
  if (listErr) throw listErr;
  if (list.find((b) => b.name === VAULT_BUCKET)) {
    log(`✓ bucket "${VAULT_BUCKET}" already exists`);
    return;
  }
  const { error: createErr } = await supa.storage.createBucket(VAULT_BUCKET, { public: true });
  if (createErr) throw createErr;
  log(`✓ bucket "${VAULT_BUCKET}" created (public)`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
section(`MIGRATION ${DRY_RUN ? "(DRY RUN)" : "(LIVE)"} ${SKIP_FILES ? "[skip-files]" : ""}`);
log(`Firebase :  ${FIREBASE_URL}`);
log(`Supabase :  ${SUPABASE_URL}`);
log(`Bucket   :  ${VAULT_BUCKET}`);

const fbDb = admin.database();
const root = (await fbDb.ref("/").once("value")).val() || {};

const fbProfiles = root.profiles || {};
const fbContent  = root.content  || {};
const fbConfig   = root.config   || {};

log(`\nFirebase snapshot:`);
log(`  profiles : ${Object.keys(fbProfiles).length}`);
log(`  content  : ${Object.keys(fbContent).length} keys, ${Object.values(fbContent).reduce((a, v) => a + (Array.isArray(v) ? v.length : 0), 0)} items`);
log(`  config   : ${fbConfig.appsScriptUrl ? "appsScriptUrl ✓" : "(none)"} ${fbConfig.emails ? `emails(${fbConfig.emails.length})` : ""}`);

await ensureBucket();

// -------- 1. profiles --------
section("1) profiles");
const profileIdByKey = {};
for (const [key, fb] of Object.entries(fbProfiles)) {
  const row = transformProfile(key, fb);
  log(`  • ${key.padEnd(12)} avatar=${row.avatar_url ? "✓" : "—"} fields=${Object.keys(row).length}`);

  if (DRY_RUN) { profileIdByKey[key] = "(dry)"; continue; }

  const { data, error } = await supa
    .from("chatter_profiles")
    .upsert(row, { onConflict: "key" })
    .select("id")
    .single();
  if (error) { log(`    ✗ ${error.message}`); continue; }
  profileIdByKey[key] = data.id;
}

// -------- 2. config singleton --------
section("2) config");
{
  const cfgRow = {
    id: 1,
    apps_script_url: fbConfig.appsScriptUrl ?? null,
    notification_emails: Array.isArray(fbConfig.emails) ? fbConfig.emails : [],
  };
  log(`  apps_script_url=${cfgRow.apps_script_url ? "✓" : "—"} emails=${cfgRow.notification_emails.length}`);
  if (!DRY_RUN) {
    const { error } = await supa.from("chatter_config").upsert(cfgRow, { onConflict: "id" });
    if (error) log(`    ✗ ${error.message}`);
  }
}

// -------- 3. criteria defaults --------
section("3) criteria defaults");
const DEFAULT_CRITERIA = [
  { label: "Saluda al usuario",                           label_en: "Greets the user" },
  { label: "Mantiene la personalidad del personaje",      label_en: "Stays in character" },
  { label: "Conexión emocional con el usuario",           label_en: "Emotional connection" },
  { label: "Cierra la venta cuando hay oportunidad",      label_en: "Closes the sale when possible" },
  { label: "Responde en tiempo razonable",                label_en: "Responds in reasonable time" },
  { label: "Maneja objeciones",                           label_en: "Handles objections" },
  { label: "Up-sell de contenido",                        label_en: "Content upsell" },
  { label: "Ortografía y gramática",                      label_en: "Spelling and grammar" },
  { label: "Tono coherente con el perfil",                label_en: "Tone matches profile" },
  { label: "Cierre de la conversación",                   label_en: "Conversation wrap-up" },
];
for (let i = 0; i < DEFAULT_CRITERIA.length; i++) {
  const row = { ...DEFAULT_CRITERIA[i], position: i + 1, weight: 1, is_active: true };
  log(`  • ${row.label}`);
  if (!DRY_RUN) {
    // upsert by label to avoid duplicates on re-run
    const { data: existing } = await supa
      .from("chatter_criteria_defaults").select("id").eq("label", row.label).maybeSingle();
    if (existing) continue;
    const { error } = await supa.from("chatter_criteria_defaults").insert(row);
    if (error) log(`    ✗ ${error.message}`);
  }
}

// -------- 4. vault items --------
section("4) vault items" + (SKIP_FILES ? " (skipping file copy)" : ""));
let totalItems = 0, copied = 0, copyFailed = 0;
for (const [profileKey, items] of Object.entries(fbContent)) {
  if (!Array.isArray(items)) continue;
  const profileId = profileIdByKey[profileKey];
  if (!profileId) {
    log(`  ! profile "${profileKey}" missing in chatter_profiles, skipping its ${items.length} item(s)`);
    continue;
  }
  log(`\n  ${profileKey} → ${items.length} item(s)`);
  let pos = 0;
  for (const item of items) {
    totalItems++;
    pos++;
    if (!item?.url) { log(`    ${pos}. ✗ no url`); continue; }

    let finalUrl = item.url;

    if (!SKIP_FILES && !DRY_RUN) {
      try {
        const buf = await downloadToBuffer(item.url);
        const objectPath = objectPathFromOriginalUrl(profileKey, item.name, item.url);
        const { error: upErr } = await supa.storage.from(VAULT_BUCKET).upload(objectPath, buf, {
          upsert: true,
          contentType: inferContentType(item.name, item.url),
        });
        if (upErr) throw upErr;
        const { data: pub } = supa.storage.from(VAULT_BUCKET).getPublicUrl(objectPath);
        finalUrl = pub.publicUrl;
        copied++;
      } catch (e) {
        copyFailed++;
        log(`    ${pos}. ⚠ keep original (copy failed): ${e.message}`);
      }
    }

    if (DRY_RUN) {
      log(`    ${pos}. (dry) ${item.name || "(no-name)"} → would insert (${inferMediaType(finalUrl, item.name)})`);
      continue;
    }

    const row = {
      profile_id: profileId,
      name: item.name || "(unnamed)",
      url: finalUrl,
      media_type: inferMediaType(finalUrl, item.name),
      position: pos,
    };
    const { error } = await supa.from("chatter_vault_items").insert(row);
    if (error) {
      // tolerate dup on re-run by ignoring unique violations
      if (!/duplicate/i.test(error.message)) log(`    ${pos}. ✗ ${error.message}`);
    } else {
      log(`    ${pos}. ✓ ${row.name}`);
    }
  }
}

// -------- 5. summary --------
section("DONE");
log(`profiles upserted    : ${Object.keys(profileIdByKey).length}`);
log(`vault items seen     : ${totalItems}`);
log(`vault files copied   : ${copied}`);
log(`vault copy failed    : ${copyFailed}  (URLs kept pointing at original host)`);
log(`mode                 : ${DRY_RUN ? "DRY RUN — no writes" : "LIVE"}`);
log(`bucket               : ${VAULT_BUCKET}`);
log("");
process.exit(0);
