// Post-migration sanity check: count rows in Supabase vs. expected snapshot
// from Firebase. Run AFTER migrate.mjs completes successfully.
//
// Usage:
//   FIREBASE_SA_PATH=/path/to/serviceAccount.json \
//   SUPABASE_URL=https://<branch-ref>.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=<service-role-jwt> \
//   node verify.mjs

import { readFileSync } from "node:fs";
import admin from "firebase-admin";
import { createClient } from "@supabase/supabase-js";

const SA_PATH      = process.env.FIREBASE_SA_PATH;
const FIREBASE_URL = process.env.FIREBASE_DB_URL || "https://roleplaychatters-default-rtdb.firebaseio.com";
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SA_PATH || !SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing env: FIREBASE_SA_PATH / SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(JSON.parse(readFileSync(SA_PATH, "utf8"))),
  databaseURL: FIREBASE_URL,
});
const supa = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const fb = (await admin.database().ref("/").once("value")).val() || {};

const fbProfileCount = Object.keys(fb.profiles || {}).length;
const fbVaultCount   = Object.values(fb.content || {}).reduce(
  (a, v) => a + (Array.isArray(v) ? v.length : 0), 0
);

const cnt = async (table) => {
  const { count, error } = await supa.from(table).select("*", { count: "exact", head: true });
  if (error) throw error;
  return count;
};

const sbProfiles = await cnt("chatter_profiles");
const sbVault    = await cnt("chatter_vault_items");
const sbCriteria = await cnt("chatter_criteria_defaults");

const { data: cfg } = await supa.from("chatter_config").select("*").single();

const row = (l, fbN, sbN) => `  ${l.padEnd(22)} fb=${String(fbN).padStart(5)}   sb=${String(sbN).padStart(5)}   ${fbN === sbN ? "✓" : "✗"}`;

console.log("\nMIGRATION VERIFY\n────────────────");
console.log(row("profiles",       fbProfileCount, sbProfiles));
console.log(row("vault items",    fbVaultCount,   sbVault));
console.log(`  criteria_defaults                 sb=${String(sbCriteria).padStart(5)}   (target 10)`);
console.log(`  config.apps_script_url            ${cfg?.apps_script_url ? "✓ set" : "✗ missing"}`);
console.log(`  config.notification_emails        ${cfg?.notification_emails?.length || 0} email(s)`);
console.log(`  config.fan_name                   ${cfg?.fan_name ?? "(unset)"}`);
console.log("");

process.exit(0);
