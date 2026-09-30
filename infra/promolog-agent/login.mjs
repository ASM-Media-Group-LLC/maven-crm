// login.mjs — abre un navegador VISIBLE para que loguees UNA vez cada cuenta
// scanner y guarda su sesión (storageState) en sessions/<slot>.json. La sesión
// queda persistida; el scanner la reusa sin volver a pedir login (hasta que IG
// la caduque, ahí re-corrés esto).
//
// Uso:  node login.mjs a      → loguea la cuenta del slot A
//       node login.mjs b      → slot B
//
// Logueá con la cuenta scanner que corresponde (la que YA sigue a las creadoras).
// Resolvé cualquier challenge/2FA a mano en la ventana. Cuando estés en el feed
// de IG logueado, volvé a la terminal y apretá ENTER — ahí se guarda la sesión.

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { createInterface } from "node:readline";
import { SESSIONS_DIR, ACCOUNTS } from "./config.mjs";

const slot = (process.argv[2] || "").trim().toLowerCase();
if (!slot) { console.error("Uso: node login.mjs <slot>   (ej. node login.mjs a)"); process.exit(1); }
const acct = ACCOUNTS.find((a) => a.slot === slot);
if (!acct) { console.error(`Slot "${slot}" no está en SCANNER_SLOTS (${ACCOUNTS.map((a) => a.slot).join(",")}).`); process.exit(1); }

mkdirSync(SESSIONS_DIR, { recursive: true });

const browser = await chromium.launch({ headless: false });
const context = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
});
const page = await context.newPage();
await page.goto("https://www.instagram.com/accounts/login/", { waitUntil: "domcontentloaded" });

console.log(`\n➡️  Loguea la cuenta scanner del SLOT "${slot}" en la ventana que se abrió.`);
console.log("   (resuelve 2FA/challenge si aparece). Cuando estés en el feed logueado, vuelve aquí y aprieta ENTER.\n");

await new Promise((resolve) => {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  rl.question("ENTER cuando estés logueado… ", () => { rl.close(); resolve(); });
});

await context.storageState({ path: acct.sessionFile });
console.log(`\n✅ Sesión guardada en ${acct.sessionFile}`);
await browser.close();
