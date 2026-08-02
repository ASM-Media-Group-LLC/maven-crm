// schedules.mjs — corridas AUTOMÁTICAS por red, configurables desde el panel.
//
// POR QUÉ ACÁ Y NO EN pg_cron: los crons de Maven disparan los edges (x-scan,
// fb-scan), que salen por Apify y por IP de datacenter. Este agente existe
// justamente para lo contrario: leer con Playwright desde una IP residencial. El
// server no puede "invocar" al agente (está detrás del NAT de la oficina), así
// que el reloj tiene que vivir del lado del agente.
//
// Pensado para las Mac Minis siempre encendidas: se configura una vez y corre
// solo. En una laptop que se cierra, el intervalo simplemente se saltea — al
// volver, si ya pasó el tiempo, corre en el próximo tick.
//
// Se persiste en sessions/schedules.json (mismo patrón que accounts.json).

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { SESSIONS_DIR } from "./config.mjs";
import { NETWORKS } from "./accounts.mjs";

const FILE = join(SESSIONS_DIR, "schedules.json");

// Intervalos ofrecidos. No hay "cada 15 min" a propósito: leer el mismo perfil
// muchas veces por hora no aporta (una historia dura 24h) y sí acerca el burn de
// sesión de Instagram, que es por VOLUMEN por cuenta.
export const INTERVALOS = [1, 2, 3, 4, 6, 8, 12, 24];

function porDefecto() {
  const r = {};
  for (const n of NETWORKS) r[n] = { activo: false, cada_horas: 3, desde: "06:00", hasta: "23:59", ultima: null };
  return r;
}

function leer() {
  try {
    const disco = JSON.parse(readFileSync(FILE, "utf8"));
    // Merge contra el default: si mañana se agrega una red, las viejas no se pierden
    // y la nueva arranca apagada en vez de quedar undefined.
    const base = porDefecto();
    for (const n of NETWORKS) if (disco[n]) base[n] = { ...base[n], ...disco[n] };
    return base;
  } catch { return porDefecto(); }
}

function escribir(reg) {
  mkdirSync(SESSIONS_DIR, { recursive: true });
  writeFileSync(FILE, JSON.stringify(reg, null, 2));
  return reg;
}

export function getSchedules() { return leer(); }

/** Actualiza la programación de UNA red. Devuelve el registro completo. */
export function setSchedule(network, patch) {
  if (!NETWORKS.includes(network)) throw new Error("red desconocida");
  const reg = leer();
  const s = { ...reg[network] };
  if (patch.activo !== undefined) s.activo = !!patch.activo;
  if (patch.cada_horas !== undefined) {
    const h = Number(patch.cada_horas);
    // Se acota contra la lista: un valor arbitrario por API (o un 0) dejaría el
    // tick disparando en bucle.
    s.cada_horas = INTERVALOS.includes(h) ? h : 3;
  }
  if (typeof patch.desde === "string" && /^\d{2}:\d{2}$/.test(patch.desde)) s.desde = patch.desde;
  if (typeof patch.hasta === "string" && /^\d{2}:\d{2}$/.test(patch.hasta)) s.hasta = patch.hasta;
  reg[network] = s;
  return escribir(reg);
}

/** Marca que una red acaba de correr (la dispare el reloj o una persona: en los
 *  dos casos el intervalo se cuenta desde la última lectura real). */
export function marcarCorrida(network, at = Date.now()) {
  const reg = leer();
  if (!reg[network]) return reg;
  reg[network] = { ...reg[network], ultima: at };
  return escribir(reg);
}

const minutosDelDia = (d) => d.getHours() * 60 + d.getMinutes();
const hhmmAMin = (s) => { const [h, m] = String(s).split(":").map(Number); return h * 60 + m; };

/** ¿`ahora` cae dentro de la ventana horaria? Soporta ventanas que cruzan la
 *  medianoche (22:00 → 02:00), que es un caso real: las creadoras publican de
 *  madrugada y ahí es cuando conviene escanear. */
export function enVentana(s, ahora = new Date()) {
  const m = minutosDelDia(ahora), a = hhmmAMin(s.desde), b = hhmmAMin(s.hasta);
  return a <= b ? (m >= a && m <= b) : (m >= a || m <= b);
}

/** Próxima corrida estimada (ms epoch) o null si está apagada. Es lo que muestra
 *  el panel: sin esto, "activo cada 3h" no dice cuándo va a pasar algo. */
export function proximaCorrida(s, ahora = Date.now()) {
  if (!s?.activo) return null;
  const base = s.ultima ? s.ultima + s.cada_horas * 3600_000 : ahora;
  // Si ya venció, la próxima es al entrar en ventana; el tick decide el momento
  // exacto. Devolver "ahora" es honesto: está pendiente.
  return Math.max(base, ahora);
}

/** Redes que deberían correr YA. `ocupado` corta todo: hay un solo navegador y un
 *  solo lock de corrida, así que encolar dos no serviría de nada. */
export function vencidas(ahora = Date.now()) {
  const reg = leer();
  const out = [];
  for (const n of NETWORKS) {
    const s = reg[n];
    if (!s?.activo) continue;
    if (!enVentana(s, new Date(ahora))) continue;
    // Sin `ultima` (recién activado) NO se dispara al instante: se toma el momento
    // de activación como punto de partida. Si no, tocar el switch lanzaría un scan
    // sin que nadie lo pidiera.
    if (!s.ultima) { marcarCorrida(n, ahora); continue; }
    if (ahora - s.ultima >= s.cada_horas * 3600_000) out.push(n);
  }
  return out;
}
