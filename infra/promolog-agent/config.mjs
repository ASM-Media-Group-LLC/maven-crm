// Config del agente. Todo por env (poné un .env y usá `node --env-file=.env ...`,
// o exportá las variables). Ver .env.example.
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { hostname } from "node:os";

export const ROOT = dirname(fileURLToPath(import.meta.url));
export const SESSIONS_DIR = join(ROOT, "sessions");

export const MAVEN_URL = (process.env.MAVEN_URL || "https://lsagslbkliprespbyhts.supabase.co").replace(/\/+$/, "");
export const EXT_TOKEN = process.env.PROMOLOG_EXT_TOKEN || "";
// Token cron: SOLO lo usan los scrapers de Telegram y X (llaman a telegram-scan /
// x-scan en modo targets/ingest, que van con x-cron-token). IG no lo necesita.
export const CRON_TOKEN = process.env.CRON_INTERNAL_TOKEN || "";

// Sesiones de las OTRAS redes (Plan B local). Una cuenta cada una (no slots):
//   sessions/telegram.json  — cuenta dedicada, miembro de los canales (privados incl.)
//   sessions/x.json         — cuenta de X logueada
export const TG_SESSION = join(SESSIONS_DIR, "telegram.json");
export const X_SESSION = join(SESSIONS_DIR, "x.json");

// Las 2 cuentas scanner. Cada una = un slot (a, b, …) y su archivo de sesión.
// El slot define qué MITAD de las creadoras lee (scan-targets?slot=a&slots=2),
// así ninguna cuenta hace el volumen completo (que es lo que la quema).
export const ACCOUNTS = (process.env.SCANNER_SLOTS || "a,b")
  .split(",").map((s) => s.trim()).filter(Boolean)
  .map((slot) => ({ slot, sessionFile: join(SESSIONS_DIR, `${slot}.json`) }));
export const SLOTS_COUNT = ACCOUNTS.length;

// Anti-ban / pacing. Conservador a propósito: el enemigo es el VOLUMEN por sesión.
export const PACING = {
  minDelayMs: Number(process.env.MIN_DELAY_MS || 3500),   // entre creadoras
  maxDelayMs: Number(process.env.MAX_DELAY_MS || 8000),
  batchPauseEvery: Number(process.env.BATCH_EVERY || 8),  // pausa larga cada N creadoras
  batchPauseMs: Number(process.env.BATCH_PAUSE_MS || 20000),
  maxPerRun: Number(process.env.MAX_PER_RUN || 45),       // tope duro de lecturas por cuenta/corrida
  navTimeoutMs: Number(process.env.NAV_TIMEOUT_MS || 25000),
};

// Detector de soft-block: tras leer BIEN al menos una historia, una RACHA de
// vacíos/bloqueos = IG limitando la sesión → cortamos esa cuenta y ponemos el
// resto como pending (NUNCA "No" falso), y la dejamos en cooldown.
export const SOFTBLOCK = {
  streakAbort: Number(process.env.SOFTBLOCK_STREAK || 5),
  cooldownHours: Number(process.env.COOLDOWN_HOURS || 6),
};

export const HEADFUL = process.env.HEADFUL === "1"; // true = ventana visible (útil para depurar/challenges)

// ── Identidad de esta máquina ────────────────────────────────────────────────
// Con varias Mac Minis corriendo el agente hace falta saber CUÁL late y cuál se
// cayó. Default: el nombre del equipo.
export const AGENT_ID = (process.env.AGENT_ID || hostname() || "agente-local").trim().slice(0, 60);

// ── A qué interfaz se ata el panel ───────────────────────────────────────────
// ⚠️ EL PANEL NO TIENE CONTRASEÑA: quien lo abre puede lanzar escaneos y abrir
// ventanas de login con las sesiones de las cuentas. Hasta ahora `listen(PORT)`
// sin host ataba a TODAS las interfaces, o sea que quedaba expuesto a la red
// local. Ahora el default es solo la propia máquina.
// Para llegar desde otra computadora, lo correcto es Tailscale: poner acá la IP
// de Tailscale de la Mac Mini (100.x.y.z) → solo la alcanzan los equipos de tu
// red privada, no la oficina entera. `0.0.0.0` existe pero deja el panel abierto
// a cualquiera del LAN.
export const UI_HOST = process.env.UI_HOST || "127.0.0.1";

export function assertConfig() {
  const errs = [];
  if (!EXT_TOKEN) errs.push("Falta PROMOLOG_EXT_TOKEN (el mismo token de la extensión / secret de Supabase).");
  if (!existsSync(SESSIONS_DIR)) errs.push(`Falta la carpeta de sesiones: ${SESSIONS_DIR}. Corre primero: npm run login.`);
  for (const a of ACCOUNTS) {
    if (!existsSync(a.sessionFile)) errs.push(`Falta la sesión del slot "${a.slot}": ${a.sessionFile}. Corre: node login.mjs ${a.slot}`);
  }
  if (errs.length) { console.error("Config incompleta:\n- " + errs.join("\n- ")); process.exit(1); }
}
