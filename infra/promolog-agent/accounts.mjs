// accounts.mjs — registro DINÁMICO de cuentas por red, editable desde el panel.
// Cada red (instagram, telegram, x) tiene una lista de cuentas; agregás/quitás
// desde la UI y el scan se REPARTE entre las que haya (N cuentas → en N).
//
// Se persiste en sessions/accounts.json. Si no existe, se siembra desde lo que ya
// había: IG desde SCANNER_SLOTS (a,b) con sus sesiones a.json/b.json; Telegram y X
// desde telegram.json / x.json (para no perder logins previos).

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { SESSIONS_DIR } from "./config.mjs";

const FILE = join(SESSIONS_DIR, "accounts.json");
export const NETWORKS = ["instagram", "telegram", "x"];

// Hash determinístico (FNV-1a) del creator_id → índice de cuenta. MISMO que
// promolog-scan-targets, así IG (server) y TG/X (client) reparten igual.
export function creatorSlot(creatorId, n) {
  let h = 0x811c9dc5;
  for (let i = 0; i < creatorId.length; i++) { h ^= creatorId.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0) % n;
}

function seed() {
  const igSlots = (process.env.SCANNER_SLOTS || "a,b").split(",").map((s) => s.trim()).filter(Boolean);
  const reg = {
    instagram: igSlots.map((id) => ({ id, session: `${id}.json` })),
    telegram: [{ id: "tg1", session: "telegram.json" }],
    x: [{ id: "x1", session: "x.json" }],
  };
  return reg;
}

export function load() {
  try { return { ...seed(), ...JSON.parse(readFileSync(FILE, "utf8")) }; }
  catch { const r = seed(); save(r); return r; }
}
export function save(reg) { mkdirSync(SESSIONS_DIR, { recursive: true }); writeFileSync(FILE, JSON.stringify(reg, null, 2)); }

export function accountsOf(network) { return load()[network] || []; }
export function sessionPath(session) { return join(SESSIONS_DIR, session); }

// Agrega una cuenta a una red. Devuelve la cuenta nueva { id, session }.
export function addAccount(network) {
  if (!NETWORKS.includes(network)) throw new Error("red inválida");
  const reg = load();
  const list = reg[network] || [];
  // id incremental que no colisione
  let n = list.length + 1, id;
  do { id = `${network[0]}${n++}`; } while (list.some((a) => a.id === id));
  const acct = { id, session: `${network}-${id}.json` };
  reg[network] = [...list, acct];
  save(reg);
  return acct;
}
export function removeAccount(network, id) {
  const reg = load();
  reg[network] = (reg[network] || []).filter((a) => a.id !== id);
  save(reg);
}
