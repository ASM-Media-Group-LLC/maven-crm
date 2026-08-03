// import-session.mjs — importa la sesión de un sitio DESDE UN NAVEGADOR NORMAL al
// agente, sin pasar por el login automatizado.
//
// Por qué existe: sitios como X (Twitter) detectan el navegador de Playwright y
// bloquean el login con un "knowledge check" anti-bot que nunca avanza. Pero en el
// navegador de siempre uno ya está logueado — así que copiamos ESA sesión.
//
// ⚠️ CORRERLO DESDE ESTA CARPETA (infra/promolog-agent), no desde la raíz del repo.
//
// Uso:
//   node import-session.mjs x              # x.com → sessions/x.json
//   node import-session.mjs facebook       # facebook.com → sessions/facebook.json
//   node import-session.mjs instagram a    # instagram.com → sessions/a.json
//   node import-session.mjs x --testing    # forzar un navegador (ver lista abajo)
//
// NO adivina dónde está la sesión: revisa TODOS los navegadores instalados y TODOS
// sus perfiles, y usa el que de verdad tiene la cookie de login. Dos cosas que
// rompían la adivinanza:
//   · en las Mac Minis puede haber solo "Chrome for Testing" (el que instala
//     Playwright), con su perfil en otra carpeta que Chrome normal;
//   · un mismo Chrome tiene un perfil por cuenta ("Default", "Profile 1"…) y las
//     cookies del perfil "Work" no están en Default.
// Mirando un solo lugar, el error era "no estás logueado" — falso, y mandaba a
// re-loguearse donde no correspondía.
//
// Requiere el navegador CERRADO (macOS bloquea el archivo de cookies si está abierto).

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, unlinkSync, existsSync, statSync, readdirSync } from "node:fs";
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
if (!SITES[site]) { console.error("Uso: node import-session.mjs <x|instagram|facebook> [accountId] [--chrome|--testing|--brave|--chromium|--edge]"); process.exit(1); }

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

// ── QUÉ NAVEGADOR ────────────────────────────────────────────────────────────
// No alcanza con "Chrome o Brave". En las Mac Minis, el único navegador instalado
// puede ser **Chrome for Testing** (el que baja Playwright), que guarda su perfil
// en otra carpeta: si uno se loguea ahí, el importador miraba la carpeta de Chrome
// normal, no encontraba nada y decía "no estás logueado" — que era falso y mandaba
// a re-loguearse en un navegador que no era el correcto.
// Ahora se listan los que EXISTEN y se elige, con el más recién usado por defecto.
const APP_SUPPORT = join(homedir(), "Library/Application Support");
const NAVEGADORES = [
  { flag: "--chrome", nombre: "Google Chrome", dir: join(APP_SUPPORT, "Google/Chrome"), llavero: [["Chrome Safe Storage", "Chrome"]] },
  { flag: "--testing", nombre: "Chrome for Testing", dir: join(APP_SUPPORT, "Google/Chrome for Testing"), llavero: [["Chrome Safe Storage", "Chrome"], ["Chromium Safe Storage", "Chromium"]] },
  { flag: "--brave", nombre: "Brave", dir: join(APP_SUPPORT, "BraveSoftware/Brave-Browser"), llavero: [["Brave Safe Storage", "Brave"]] },
  { flag: "--chromium", nombre: "Chromium", dir: join(APP_SUPPORT, "Chromium"), llavero: [["Chromium Safe Storage", "Chromium"]] },
  { flag: "--edge", nombre: "Microsoft Edge", dir: join(APP_SUPPORT, "Microsoft Edge"), llavero: [["Microsoft Edge Safe Storage", "Microsoft Edge"]] },
];

// ── PERFILES ─────────────────────────────────────────────────────────────────
// ⚠️ Un navegador NO tiene una sola carpeta de cookies. Chrome guarda cada perfil
// aparte: "Default", "Profile 1", "Profile 2"… Si la persona usa un perfil con
// nombre (el chip "Work" arriba a la derecha), sus cookies NO están en Default —
// y mirar solo ahí daba "no se encontraron cookies de ese sitio (¿estás logueado?)",
// que es un diagnóstico equivocado: sí estaba logueada, en otro perfil.
// Pasó el 02/08 en la Mac Mini.
function perfilesDe(nav) {
  if (!existsSync(nav.dir)) return [];
  // Nombre lindo del perfil ("Work", "Personal") desde Local State, si está.
  let nombres = {};
  try {
    const ls = JSON.parse(readFileSync(join(nav.dir, "Local State"), "utf8"));
    for (const [dir, info] of Object.entries(ls?.profile?.info_cache ?? {})) nombres[dir] = info?.name;
  } catch { /* sin Local State: se usan los nombres de carpeta */ }
  return readdirSync(nav.dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(nav.dir, d.name, "Cookies")))
    .map((d) => ({
      nav, carpeta: d.name, nombre: nombres[d.name] || d.name,
      cookiesDb: join(nav.dir, d.name, "Cookies"),
      usado: statSync(join(nav.dir, d.name, "Cookies")).mtimeMs,
    }));
}

const flagPedido = NAVEGADORES.find((n) => process.argv.includes(n.flag));
const candidatos = (flagPedido ? [flagPedido] : NAVEGADORES).flatMap(perfilesDe).sort((a, b) => b.usado - a.usado);
if (!candidatos.length) {
  if (flagPedido) {
    console.error(`Pediste ${flagPedido.nombre}, pero no tiene ningún perfil en esta máquina (${flagPedido.dir.replace(homedir(), "~")}).`);
    console.error(`Con perfil acá: ${NAVEGADORES.flatMap(perfilesDe).map((p) => `${p.nav.nombre} ${p.nav.flag}`).filter((v, i, a) => a.indexOf(v) === i).join(", ") || "ninguno"}`);
  } else {
    console.error("No encontré ningún navegador con perfil en esta máquina.");
    console.error("Buscado en: " + NAVEGADORES.map((n) => n.dir.replace(homedir(), "~")).join(", "));
  }
  process.exit(1);
}
console.log(`🔎 Perfiles a revisar (${candidatos.length}): ${candidatos.map((p) => `${p.nav.nombre}/${p.nombre}`).join(" · ")}`);

// La clave del Llavero es POR NAVEGADOR (no por perfil). Se cachea: si no, macOS
// pediría permiso una vez por perfil revisado.
const clavesCache = new Map();
function claveDe(nav) {
  if (clavesCache.has(nav.nombre)) return clavesCache.get(nav.nombre);
  let clave = null;
  for (const [service, account] of nav.llavero) {
    try {
      const pass = execFileSync("security", ["find-generic-password", "-w", "-s", service, "-a", account],
        { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
      clave = pbkdf2Sync(pass, "saltysalt", 1003, 16, "sha1");
      break;
    } catch { /* probamos el siguiente nombre de servicio */ }
  }
  clavesCache.set(nav.nombre, clave);
  return clave;
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

// OJO: LIKE '%x.com' también matchea netflix.com (termina en "x.com"). Hay que
// anclar al límite del dominio: exacto, o subdominio (".x.com").
const hostFilter = SITES[site].hosts.map((h) => `host_key = '${h}' OR host_key = '.${h}' OR host_key LIKE '%.${h}'`).join(" OR ");

// Lee las cookies del sitio en UN perfil. Devuelve [] si no hay o si no se pudo.
function cookiesDelPerfil(p) {
  const tmp = "/tmp/promolog-cookies.db";
  try { copyFileSync(p.cookiesDb, tmp); } catch { return []; }
  let rows = [];
  try {
    rows = execFileSync("sqlite3", ["-separator", "\t", tmp,
      `SELECT host_key, name, hex(encrypted_value), path, expires_utc, is_secure, is_httponly, samesite FROM cookies WHERE ${hostFilter};`,
    ], { encoding: "utf8", maxBuffer: 20 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] }).trim().split("\n").filter(Boolean);
  } catch { /* base bloqueada o corrupta */ }
  try { unlinkSync(tmp); } catch { /* */ }
  const key = claveDe(p.nav);
  if (!key) return [];
  const out = [];
  for (const line of rows) {
    const [host, name, hexVal, path, expires, secure, httponly, samesite] = line.split("\t");
    let value = "";
    try { value = decryptCookie(Buffer.from(hexVal, "hex"), key); } catch { /* */ }
    if (!value || !name) continue;
    // Chrome guarda expires en microsegundos desde 1601; Playwright quiere segundos unix.
    const exp = Number(expires) > 0 ? Math.floor(Number(expires) / 1e6 - 11644473600) : -1;
    // Playwright valida el shape: sameSite:"None" EXIGE secure:true (si no, rechaza
    // TODO el storageState con "Invalid cookie fields"). Normalizamos.
    const isSecure = secure === "1";
    let sameSite = samesite === "2" ? "Strict" : samesite === "1" ? "Lax" : "None";
    if (sameSite === "None" && !isSecure) sameSite = "Lax";
    out.push({
      name, value, domain: host, path: path || "/",
      expires: Number.isFinite(exp) && exp > 0 ? exp : -1,
      httpOnly: httponly === "1", secure: isSecure, sameSite,
    });
  }
  return out;
}

// ── BUSCAR LA SESIÓN, NO ADIVINAR DÓNDE ESTÁ ─────────────────────────────────
// Antes se elegía un navegador/perfil por heurística y se importaba de ahí. Si la
// corazonada fallaba, el mensaje era "no estás logueado" — un diagnóstico falso.
// Ahora se revisan TODOS y se usa el que de verdad tiene la cookie de sesión; el
// informe dice qué se miró y qué se encontró en cada uno.
const revisados = [];
let elegido = null;
for (const p of candidatos) {
  const cookies = cookiesDelPerfil(p);
  const logueado = cookies.length > 0 && tieneSesion({ cookies, origins: [] }, site) === true;
  revisados.push({ p, n: cookies.length, logueado });
  if (logueado && !elegido) { elegido = { p, cookies }; break; }   // el más recién usado gana
}

for (const r of revisados) {
  const etiqueta = `${r.p.nav.nombre}/${r.p.nombre}`.padEnd(34);
  console.log(`   ${r.logueado ? "✅" : "· "} ${etiqueta} ${r.n === 0 ? "sin cookies del sitio" : `${r.n} cookies, ${r.logueado ? "LOGUEADO" : "sin sesión"}`}`);
}

if (!elegido) {
  console.error(`\n❌ Ninguno de los ${revisados.length} perfiles revisados tiene sesión de ${site} (falta ${QUE_FALTA[site]}).`);
  console.error(`   Abrí ${SITES[site].origin}, logueate, CERRÁ el navegador entero y repetí.`);
  console.error("   Si te logueaste recién, puede que el navegador todavía no haya escrito las cookies al disco: cerralo del todo (Cmd+Q).");
  console.error("   (No escribí nada: la sesión anterior queda como estaba.)");
  process.exit(1);
}
const { p: nav_perfil, cookies } = elegido;
const nav = nav_perfil.nav;
console.log(`\n🌐 Uso: ${nav.nombre} · perfil "${nav_perfil.nombre}"`);
const estado = { cookies, origins: [] };

// destino: la cuenta indicada, o la primera de esa red
const list = accountsOf(site);
const acct = acctId ? list.find((a) => a.id === acctId) : list[0];
const dest = acct ? sessionPath(acct.session) : join(SESSIONS_DIR, `${site}.json`);
mkdirSync(SESSIONS_DIR, { recursive: true });
writeFileSync(dest, JSON.stringify(estado, null, 2));

console.log(`✅ Sesión de ${site} importada desde ${nav.nombre} → ${dest}`);
console.log(`   ${cookies.length} cookies · login verificado (${QUE_FALTA[site]}).`);
