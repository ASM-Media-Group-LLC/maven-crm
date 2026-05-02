// One-shot script: migrate the 5 chatter_profile avatars from the legacy
// roleplaychatters.imaginehub.me host into the Maven Supabase Storage bucket.
// The earlier migrate.mjs only handled vault items and left avatar URLs
// pointing at the legacy host. Run this to detach completely.
//
// Usage:
//   SUPABASE_URL=https://<branch-ref>.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=<service-role-jwt> \
//   node migrate-avatars.mjs [--dry-run]
//
// Idempotent: a profile whose avatar_url is already on Supabase Storage is
// skipped. Re-running after a previous failure is safe.

import { Buffer } from "node:buffer";
import { createClient } from "@supabase/supabase-js";

const DRY_RUN     = process.argv.includes("--dry-run");
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const VAULT_BUCKET = process.env.SUPABASE_VAULT_BUCKET || "chatter-vault";

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing env: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supa = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const log = (...a) => console.log(...a);
const section = (s) => log("\n" + "═".repeat(72) + "\n" + s + "\n" + "═".repeat(72));

const TIMEOUT_MS = 60_000;
const CT_BY_EXT = {
  jpg: "image/jpeg", jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
};
function inferContentType(name = "") {
  const m = name.toLowerCase().match(/\.([a-z0-9]+)(?:\?|$)/);
  return (m && CT_BY_EXT[m[1]]) || "application/octet-stream";
}
function inferExt(url, fallback = "png") {
  try {
    const path = new URL(url).pathname;
    const m = path.match(/\.([a-z0-9]+)$/i);
    if (m) return m[1].toLowerCase();
  } catch {}
  return fallback;
}

async function downloadToBuffer(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  } finally {
    clearTimeout(t);
  }
}

const isOurStorageUrl = (url) =>
  url.includes(`/storage/v1/object/public/${VAULT_BUCKET}/`);

section(`AVATAR MIGRATION ${DRY_RUN ? "(DRY RUN)" : "(LIVE)"}`);
log(`Supabase: ${SUPABASE_URL}`);
log(`Bucket  : ${VAULT_BUCKET}`);

const { data: profiles, error: pErr } = await supa
  .from("chatter_profiles")
  .select("id, key, name, avatar_url");
if (pErr) {
  console.error("✗ failed to read chatter_profiles:", pErr.message);
  process.exit(1);
}

let migrated = 0, skipped = 0, failed = 0;
for (const p of profiles ?? []) {
  if (!p.avatar_url) {
    log(`  • ${p.key.padEnd(12)} — no avatar URL, skipping`);
    skipped++;
    continue;
  }
  if (isOurStorageUrl(p.avatar_url)) {
    log(`  ↺ ${p.key.padEnd(12)} — already in our Storage, skipping`);
    skipped++;
    continue;
  }
  log(`  ↓ ${p.key.padEnd(12)} downloading from ${new URL(p.avatar_url).host}…`);
  if (DRY_RUN) {
    log(`        (dry-run) would upload + update avatar_url`);
    continue;
  }
  try {
    const buf = await downloadToBuffer(p.avatar_url);
    const ext = inferExt(p.avatar_url, "png");
    const path = `_avatars/${p.key}-${Date.now()}.${ext}`;
    const { error: upErr } = await supa.storage
      .from(VAULT_BUCKET)
      .upload(path, buf, {
        upsert: false,
        contentType: inferContentType(`x.${ext}`),
        cacheControl: "3600",
      });
    if (upErr) throw upErr;
    const { data: pub } = supa.storage.from(VAULT_BUCKET).getPublicUrl(path);
    const { error: updErr } = await supa
      .from("chatter_profiles")
      .update({ avatar_url: pub.publicUrl })
      .eq("id", p.id);
    if (updErr) throw updErr;
    log(`        ✓ ${(buf.length / 1024).toFixed(1)} KB → ${path}`);
    migrated++;
  } catch (e) {
    log(`        ✗ ${e.message}`);
    failed++;
  }
}

section("DONE");
log(`migrated : ${migrated}`);
log(`skipped  : ${skipped}`);
log(`failed   : ${failed}`);
log(`mode     : ${DRY_RUN ? "DRY RUN — no writes" : "LIVE"}`);
process.exit(0);
