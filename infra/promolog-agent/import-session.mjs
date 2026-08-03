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
// Detecta solo qué navegadores hay instalados y usa el más recientemente usado.
// Importa: en las Mac Minis puede haber SOLO "Chrome for Testing" (el que instala
// Playwright), que guarda su perfil en otra carpeta que Chrome normal.
//
// Requiere el navegador CERRADO (macOS bloquea el archivo de cookies si está abierto).

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, unlinkSync, existsSync, statSync } from "node:fs";
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

const cookiesDe = (n) => join(n.dir, "Default", "Cookies");
const instalados = NAVEGADORES.filter((n) => existsSync(cookiesDe(n)));
if (!instalados.length) {
  console.error("No encontré ningún navegador con perfil en esta máquina.");
  console.error("Buscado en: " + NAVEGADORES.map((n) => n.dir.replace(homedir(), "~")).join(", "));
  process.exit(1);
}
// Si se pidió uno explícitamente y NO está instalado, se corta. Caer al que sí
// está sería importar la sesión equivocada sin avisar: la persona pidió ese
// navegador porque es donde se logueó.
const flagPedido = NAVEGADORES.find((n) => process.argv.includes(n.flag));
if (flagPedido && !existsSync(cookiesDe(flagPedido))) {
  console.error(`Pediste ${flagPedido.nombre}, pero no tiene perfil en esta máquina (${flagPedido.dir.replace(homedir(), "~")}).`);
  console.error(`Instalados acá: ${instalados.map((n) => `${n.nombre} (${n.flag})`).join(", ")}`);
  process.exit(1);
}
const pedido = flagPedido ?? null;
// Sin flag: el que se usó más recientemente. Es casi siempre en el que la persona
// acaba de loguearse, que es justo lo que se quiere importar.
const nav = pedido ?? instalados.map((n) => ({ n, t: statSync(cookiesDe(n)).mtimeMs })).sort((a, b) => b.t - a.t)[0].n;

console.log(`🌐 Navegador: ${nav.nombre}${pedido ? "" : "  (el usado más recientemente)"}`);
if (instalados.length > 1) {
  console.log(`   Otros disponibles: ${instalados.filter((n) => n !== nav).map((n) => `${n.nombre} (${n.flag})`).join(", ")}`);
}
const cookiesDb = cookiesDe(nav);

// 1) Clave de cifrado: viene del Llavero de macOS. Cada navegador guarda la suya
// con su propio nombre de servicio; Chrome for Testing puede usar el de Chrome o
// el de Chromium según cómo se haya construido, así que se prueban los dos.
function chromeKey() {
  const fallos = [];
  for (const [service, account] of nav.llavero) {
    try {
      const pass = execFileSync("security", ["find-generic-password", "-w", "-s", service, "-a", account],
        { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
      return pbkdf2Sync(pass, "saltysalt", 1003, 16, "sha1");
    } catch (e) { fallos.push(`${service}/${account}`); }
  }
  console.error(`No pude leer la clave de cifrado de ${nav.nombre} en el Llavero (probé: ${fallos.join(", ")}).`);
  console.error("Si macOS mostró un cuadro de diálogo pidiendo permiso, hay que darle a «Permitir siempre».");
  process.exit(1);
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
  console.error(`   Abrí ${SITES[site].origin} EN ${nav.nombre.toUpperCase()} (no en otro), logueate, CERRÁ el navegador y repetí.`);
  if (instalados.length > 1) console.error(`   Si te logueaste en otro, elegilo: ${instalados.filter((n) => n !== nav).map((n) => n.flag).join(" o ")}`);
  console.error("   (No escribí nada: la sesión anterior queda como estaba.)");
  process.exit(1);
}

// destino: la cuenta indicada, o la primera de esa red
const list = accountsOf(site);
const acct = acctId ? list.find((a) => a.id === acctId) : list[0];
const dest = acct ? sessionPath(acct.session) : join(SESSIONS_DIR, `${site}.json`);
mkdirSync(SESSIONS_DIR, { recursive: true });
writeFileSync(dest, JSON.stringify(estado, null, 2));

console.log(`✅ Sesión de ${site} importada desde ${nav.nombre} → ${dest}`);
console.log(`   ${cookies.length} cookies · login verificado (${QUE_FALTA[site]}).`);
