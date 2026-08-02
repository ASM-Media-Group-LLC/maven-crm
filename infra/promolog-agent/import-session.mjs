// import-session.mjs — importa la sesión de un sitio DESDE TU NAVEGADOR NORMAL
// (Chrome/Brave) al agente, sin pasar por el login automatizado.
//
// Por qué existe: sitios como X (Twitter) detectan el navegador de Playwright y
// bloquean el login con un "knowledge check" anti-bot que nunca avanza. Pero en tu
// navegador de siempre ya estás logueado — así que copiamos ESA sesión.
//
// Uso:
//   node import-session.mjs x            # importa x.com → sessions/x.json
//   node import-session.mjs x --brave    # desde Brave en vez de Chrome
//   node import-session.mjs instagram a  # importa instagram.com → sessions/a.json
//
// Requiere el navegador CERRADO (macOS bloquea el archivo de cookies si está abierto).

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { createDecipheriv, pbkdf2Sync } from "node:crypto";
import { homedir } from "node:os";
import { SESSIONS_DIR } from "./config.mjs";
import { accountsOf, sessionPath } from "./accounts.mjs";
import { tieneSesion, QUE_FALTA } from "./session-check.mjs";

const SITES = {
  x: { hosts: ["x.com", "twitter.com"], origin: "https://x.com" },
  instagram: { hosts: ["instagram.com"], origin: "https://www.instagram.com" },
  telegram: { hosts: ["telegram.org", "web.telegram.org"], origin: "https://web.telegram.org" },
  facebook: { hosts: ["facebook.com"], origin: "https://www.facebook.com" },
};

const site = (process.argv[2] || "").toLowerCase();
const acctId = process.argv[3] && !process.argv[3].startsWith("--") ? process.argv[3] : null;
const useBrave = process.argv.includes("--brave");
if (!SITES[site]) { console.error(`Uso: node import-session.mjs <x|instagram|facebook|telegram> [accountId] [--brave]`); process.exit(1); }

// ⚠️ Telegram no se puede importar por acá y hay que decirlo ANTES de trabajar:
// su sesión no vive en cookies sino en el localStorage de web.telegram.org, que
// Chrome guarda en un LevelDB aparte (no en la base de cookies que leemos abajo).
// Sin este corte el importador terminaba "bien" y escribía un archivo con dos
// cookies inservibles — el mismo falso éxito que el botón "ya me logueé".
if (site === "telegram") {
  console.error("Telegram no se importa desde el navegador: su sesión vive en el localStorage, no en las cookies.");
  console.error("Usá el panel → Telegram → Loguear, y escaneá el QR desde el celular.");
  process.exit(1);
}

const base = useBrave
  ? join(homedir(), "Library/Application Support/BraveSoftware/Brave-Browser/Default")
  : join(homedir(), "Library/Application Support/Google/Chrome/Default");
const cookiesDb = join(base, "Cookies");
const localState = join(useBrave ? join(base, "..") : join(base, ".."), "Local State");

// 1) Clave de cifrado: viene del Llavero de macOS.
function chromeKey() {
  const service = useBrave ? "Brave Safe Storage" : "Chrome Safe Storage";
  const account = useBrave ? "Brave" : "Chrome";
  const pass = execFileSync("security", ["find-generic-password", "-w", "-s", service, "-a", account], { encoding: "utf8" }).trim();
  return pbkdf2Sync(pass, "saltysalt", 1003, 16, "sha1");
}
function decryptCookie(buf, key) {
  if (!buf || buf.length === 0) return "";
  const version = buf.subarray(0, 3).toString();
  if (version !== "v10" && version !== "v11") return buf.toString(); // sin cifrar
  const iv = Buffer.alloc(16, " ");
  const d = createDecipheriv("aes-128-cbc", key, iv);
  d.setAutoPadding(false);
  let out = Buffer.concat([d.update(buf.subarray(3)), d.final()]);
  const pad = out[out.length - 1];
  if (pad >= 1 && pad <= 16) out = out.subarray(0, out.length - pad);
  // Chrome/Brave modernos prefijan 32 bytes con el hash SHA-256 del dominio al
  // plaintext. Si los primeros 32 bytes tienen binario (control chars), se sacan;
  // si no, el valor ya es el bueno. Sin esto el valor sale con basura al principio
  // y Playwright rechaza TODO el storageState ("Invalid cookie fields").
  if (out.length > 32 && out.subarray(0, 32).some((b) => b < 0x20)) out = out.subarray(32);
  return out.toString("utf8").replace(/[\x00-\x1F\x7F]/g, "");
}

const tmp = "/tmp/promolog-cookies.db";
try { copyFileSync(cookiesDb, tmp); } catch (e) { console.error(`No pude leer ${cookiesDb}: ${e.message}`); process.exit(1); }

// OJO: LIKE '%x.com' también matchea netflix.com (termina en "x.com"). Hay que
// anclar al límite del dominio: exacto, o subdominio (".x.com").
const hostFilter = SITES[site].hosts.map((h) => `host_key = '${h}' OR host_key = '.${h}' OR host_key LIKE '%.${h}'`).join(" OR ");
const rows = execFileSync("sqlite3", ["-separator", "\t", tmp,
  `SELECT host_key, name, hex(encrypted_value), path, expires_utc, is_secure, is_httponly, samesite FROM cookies WHERE ${hostFilter};`,
], { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 }).trim().split("\n").filter(Boolean);
unlinkSync(tmp);

const key = chromeKey();
const cookies = [];
for (const line of rows) {
  const [host, name, hexVal, path, expires, secure, httponly, samesite] = line.split("\t");
  let value = "";
  try { value = decryptCookie(Buffer.from(hexVal, "hex"), key); } catch { /* */ }
  if (!value) continue;
  // Chrome guarda expires en microsegundos desde 1601; Playwright quiere segundos unix.
  const exp = Number(expires) > 0 ? Math.floor(Number(expires) / 1e6 - 11644473600) : -1;
  // Playwright valida el shape: sameSite:"None" EXIGE secure:true (si no, rechaza
  // TODO el storageState con "Invalid cookie fields"). Normalizamos.
  const isSecure = secure === "1";
  let sameSite = samesite === "2" ? "Strict" : samesite === "1" ? "Lax" : "None";
  if (sameSite === "None" && !isSecure) sameSite = "Lax";
  if (!name) continue;
  cookies.push({
    name, value, domain: host, path: path || "/",
    expires: Number.isFinite(exp) && exp > 0 ? exp : -1,
    httpOnly: httponly === "1", secure: isSecure, sameSite,
  });
}
if (!cookies.length) { console.error("No se encontraron cookies de ese sitio (¿estás logueado en ese navegador?)."); process.exit(1); }

// ── VERIFICAR ANTES DE ESCRIBIR ──────────────────────────────────────────────
// Encontrar cookies del dominio NO es lo mismo que encontrar una sesión: un Chrome
// deslogueado igual tiene guest_id, datr, lang… Antes se escribía el archivo igual
// y solo se avisaba con un "(ojo: no veo cookies de sesión)" al final, que es fácil
// de pasar por alto — y deja una sesión rota que recién falla en el próximo scan.
const estado = { cookies, origins: [] };
if (!tieneSesion(estado, site)) {
  console.error(`❌ Hay ${cookies.length} cookies de ${site}, pero falta ${QUE_FALTA[site]}: ese navegador NO está logueado.`);
  console.error(`   Abrí ${SITES[site].origin} en ${useBrave ? "Brave" : "Chrome"}, logueate, CERRÁ el navegador y repetí.`);
  console.error("   (No escribí nada: la sesión anterior queda como estaba.)");
  process.exit(1);
}

// destino: la cuenta indicada, o la primera de esa red
const list = accountsOf(site);
const acct = acctId ? list.find((a) => a.id === acctId) : list[0];
const dest = acct ? sessionPath(acct.session) : join(SESSIONS_DIR, `${site}.json`);
mkdirSync(SESSIONS_DIR, { recursive: true });
writeFileSync(dest, JSON.stringify(estado, null, 2));

console.log(`✅ Sesión de ${site} importada desde ${useBrave ? "Brave" : "Chrome"} → ${dest}`);
console.log(`   ${cookies.length} cookies · login verificado (${QUE_FALTA[site]}).`);
