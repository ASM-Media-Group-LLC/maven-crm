// Config del agente. Todo por env (poné un .env y usá `node --env-file=.env ...`,
// o exportá las variables). Ver .env.example.
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

export const ROOT = dirname(fileURLToPath(import.meta.url));
export const SESSIONS_DIR = join(ROOT, "sessions");

export const MAVEN_URL = (process.env.MAVEN_URL || "https://lsagslbkliprespbyhts.supabase.co").replace(/\/+$/, "");
export const EXT_TOKEN = process.env.PROMOLOG_EXT_TOKEN || "";

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

export function assertConfig() {
  const errs = [];
  if (!EXT_TOKEN) errs.push("Falta PROMOLOG_EXT_TOKEN (el mismo token de la extensión / secret de Supabase).");
  if (!existsSync(SESSIONS_DIR)) errs.push(`Falta la carpeta de sesiones: ${SESSIONS_DIR}. Corré primero: npm run login.`);
  for (const a of ACCOUNTS) {
    if (!existsSync(a.sessionFile)) errs.push(`Falta la sesión del slot "${a.slot}": ${a.sessionFile}. Corré: node login.mjs ${a.slot}`);
  }
  if (errs.length) { console.error("Config incompleta:\n- " + errs.join("\n- ")); process.exit(1); }
}
