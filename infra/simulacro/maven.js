// SIMULACRO DE MAVEN — una persona inventada usando la app según su posición.
//
// Corre contra la COPIA aparte (maven-simulacro), nunca contra producción. Cada
// persona entra con su cuenta de prueba, carga la app como lo hace el navegador
// (puesto, permisos, avisos) y luego repite lo que hace su posición en un día
// normal, con pausas de persona real. Cada función se mide por separado
// (tiempo y si funcionó) con la etiqueta de su posición, para el tablero
// semáforo: función × posición × ciudad × conexión.
import http from "k6/http";
import { sleep } from "k6";
import { Trend, Rate } from "k6/metrics";
import exec from "k6/execution";

const URL = __ENV.SIM_URL;
const ANON = __ENV.SIM_ANON;
const PASS = __ENV.SIM_PASS;
if (!URL || URL.includes("lsagslbkliprespbyhts")) throw new Error("El simulacro nunca corre contra producción");

// Quiénes son (sim0001…sim1000, en este orden; ver la siembra de la copia).
const RANGOS = [
  ["dueno", 1, 1], ["admin", 2, 40], ["hhrr", 41, 79], ["closer", 80, 138], ["operations", 139, 158],
  ["supervisor", 159, 217], ["chatter", 218, 745], ["finanzas", 746, 804], ["pr", 805, 843],
  ["marketing", 844, 902], ["editores", 903, 941], ["freelance", 942, 980], ["comunicacion", 981, 1000],
];
const posDe = (n) => RANGOS.find(([, a, b]) => n >= a && n <= b)[0];

// Qué hace cada posición (peso = cuántas veces por vuelta).
const TODOS = { entrar: 0, cargar_app: 0, notificaciones: 1, cowork_estado: 1, messenger_lista: 1, messenger_leer: 2, messenger_enviar: 1 };
const PERFIL = {
  dueno: { ...TODOS, argos_presencia: 2, argos_hub: 1, creadoras: 1, finanzas: 1, rrhh: 1, drive: 1 },
  admin: { ...TODOS, argos_presencia: 2, argos_hub: 1, creadoras: 1, closers: 1, contactos: 1, tickets: 1, drive: 1 },
  hhrr: { ...TODOS, argos_presencia: 2, rrhh: 2, creadoras: 1, contactos: 1, promolog: 1, tickets: 1, drive: 1 },
  closer: { ...TODOS, argos_captura: 2, closers: 2, contactos: 2, creadoras: 1, tickets: 1, subir_foto: 1 },
  operations: { ...TODOS, argos_presencia: 2, argos_hub: 1, closers: 1, contactos: 1, creadoras: 1, promolog: 1, chatters_grupos: 1, tickets: 1, drive: 1 },
  supervisor: { ...TODOS, messenger_leer: 3, messenger_enviar: 2, argos_presencia: 2, argos_hub: 1, chatters_grupos: 1, creadoras: 1, tickets: 1 },
  chatter: { ...TODOS, messenger_leer: 3, messenger_enviar: 2, argos_captura: 3, chatters_grupos: 1, subir_foto: 1 },
  finanzas: { ...TODOS, finanzas: 3, creadoras: 1, tickets: 1, drive: 1 },
  pr: { ...TODOS, creadoras: 2, contactos: 1, promolog: 2, drive: 1 },
  marketing: { ...TODOS, argos_captura: 2, creadoras: 2, promolog: 1, contactos: 1, drive: 2, subir_foto: 2 },
  editores: { ...TODOS, drive: 2, subir_foto: 2 },
  freelance: { notificaciones: 1, drive: 2, subir_foto: 1 },
  comunicacion: { ...TODOS },
};
const FUNCIONES = ["entrar", "cargar_app", ...new Set(Object.values(PERFIL).flatMap((p) => Object.keys(p)))];

// Métricas: una por función × posición (tiempo y éxito).
const ms = {}, ok = {};
for (const [pos] of RANGOS) for (const fn of FUNCIONES) {
  if (fn !== "entrar" && fn !== "cargar_app" && !(fn in PERFIL[pos])) continue;
  ms[`${pos}|${fn}`] = new Trend(`ms__${pos}__${fn}`, true);
  ok[`${pos}|${fn}`] = new Rate(`ok__${pos}__${fn}`);
}

const FOTO = "x".repeat(300 * 1024); // ~300 KB, como una foto del celular

// Las personas de este contenedor: n % PARTES == PARTE.
const PARTES = parseInt(__ENV.PARTES || "1"), PARTE = parseInt(__ENV.PARTE || "0");
const MIAS = [];
for (let n = 1; n <= 1000; n++) if (n % PARTES === PARTE) MIAS.push(n);
const SOLO = __ENV.SOLO ? __ENV.SOLO.split(",") : null; // filtrar posiciones (pruebas de condición)

const estado = {}; // por VU

function medir(pos, fn, res, esperado = [200, 201, 204, 206]) {
  const k = `${pos}|${fn}`;
  if (!ms[k]) return;
  const bien = res && esperado.includes(res.status);
  ok[k].add(bien);
  if (res && res.timings) ms[k].add(res.timings.duration);
}

function h(token, extra = {}) {
  return { headers: { apikey: ANON, Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...extra }, timeout: "30s" };
}

function entrar(n, pos) {
  const email = `sim${String(n).padStart(4, "0")}@simulacro.maven.test`;
  const r = http.post(`${URL}/auth/v1/token?grant_type=password`, JSON.stringify({ email, password: PASS }),
    { headers: { apikey: ANON, "Content-Type": "application/json" }, timeout: "30s", tags: { fn: "entrar", pos } });
  medir(pos, "entrar", r);
  if (r.status !== 200) return null;
  const d = r.json();
  return { token: d.access_token, uid: d.user.id, convs: [] };
}

function cargarApp(e, pos) {
  // Lo que pide el navegador al abrir Maven (useUserRole + usePermissions + banderas).
  const t0 = Date.now();
  const rs = http.batch([
    ["GET", `${URL}/rest/v1/user_roles?select=role&user_id=eq.${e.uid}`, null, h(e.token)],
    ["GET", `${URL}/rest/v1/profiles?select=*&id=eq.${e.uid}`, null, h(e.token)],
    ["GET", `${URL}/rest/v1/app_flags?select=key,enabled,valor`, null, h(e.token)],
    ["GET", `${URL}/rest/v1/roles_config?select=id,name`, null, h(e.token)],
  ]);
  const bien = rs.every((r) => r.status === 200);
  const k = `${pos}|cargar_app`;
  ok[k].add(bien); ms[k].add(Date.now() - t0);
  if (bien) {
    const rol = (rs[0].json()[0] || {}).role;
    const rc = (rs[3].json() || []).find((x) => x.name === rol);
    if (rc) {
      const r = http.get(`${URL}/rest/v1/role_permissions?select=module,submodule,can_access,data_scope&role_id=eq.${rc.id}`, h(e.token));
      ok[k].add(r.status === 200);
    }
  }
}

const ACCION = {
  notificaciones: (e, pos) => medir(pos, "notificaciones", http.get(`${URL}/rest/v1/notifications?select=*&user_id=eq.${e.uid}&order=created_at.desc&limit=30`, h(e.token))),
  cowork_estado: (e, pos) => medir(pos, "cowork_estado", http.post(`${URL}/rest/v1/rpc/mi_cowork_estado`, "{}", h(e.token))),
  messenger_lista: (e, pos) => {
    const r = http.get(`${URL}/rest/v1/chat_participants?select=conversation_id&user_id=eq.${e.uid}`, h(e.token));
    medir(pos, "messenger_lista", r);
    if (r.status === 200) e.convs = r.json().map((x) => x.conversation_id);
  },
  messenger_leer: (e, pos) => {
    if (!e.convs.length) return;
    const c = e.convs[Math.floor(Math.random() * e.convs.length)];
    medir(pos, "messenger_leer", http.get(`${URL}/rest/v1/chat_messages?select=*&conversation_id=eq.${c}&order=created_at.desc&limit=50`, h(e.token)));
  },
  messenger_enviar: (e, pos) => {
    if (!e.convs.length) return;
    const c = e.convs[e.convs.length > 1 ? 1 : 0]; // su grupo de equipo, si tiene
    medir(pos, "messenger_enviar", http.post(`${URL}/rest/v1/chat_messages`,
      JSON.stringify({ conversation_id: c, sender_id: e.uid, content: `sim ${Date.now()}`, type: "text" }), h(e.token, { Prefer: "return=minimal" })));
  },
  subir_foto: (e, pos) => medir(pos, "subir_foto", http.post(`${URL}/storage/v1/object/chat-files/${e.uid}/${Date.now()}.jpg`, FOTO,
    { headers: { apikey: ANON, Authorization: `Bearer ${e.token}`, "Content-Type": "image/jpeg", "x-upsert": "true" }, timeout: "60s" })),
  argos_captura: (e, pos) => medir(pos, "argos_captura", http.post(`${URL}/rest/v1/monitor_capturas`,
    JSON.stringify({ user_id: e.uid, tipo: Math.random() < 0.5 ? "pantalla" : "camara", path: `sim/${e.uid}/${Date.now()}.jpg` }), h(e.token, { Prefer: "return=minimal" }))),
  argos_presencia: (e, pos) => medir(pos, "argos_presencia", http.get(`${URL}/rest/v1/monitor_capturas?select=user_id,tipo,path,created_at&order=created_at.desc&limit=200`, h(e.token))),
  argos_hub: (e, pos) => medir(pos, "argos_hub", http.post(`${URL}/rest/v1/rpc/hub_estado_supervisores`, "{}", h(e.token))),
  creadoras: (e, pos) => medir(pos, "creadoras", http.get(`${URL}/rest/v1/creators?select=*&limit=100`, h(e.token))),
  closers: (e, pos) => medir(pos, "closers", http.get(`${URL}/rest/v1/v_closers_contacts?select=*&limit=100`, h(e.token))),
  contactos: (e, pos) => medir(pos, "contactos", http.get(`${URL}/rest/v1/closers_contacts?select=*&limit=100`, h(e.token))),
  finanzas: (e, pos) => medir(pos, "finanzas", http.get(`${URL}/rest/v1/invoices?select=*&limit=50`, h(e.token))),
  rrhh: (e, pos) => medir(pos, "rrhh", http.get(`${URL}/rest/v1/absences?select=*&limit=50`, h(e.token))),
  promolog: (e, pos) => medir(pos, "promolog", http.get(`${URL}/rest/v1/promolog_entries?select=*&limit=50`, h(e.token))),
  tickets: (e, pos) => medir(pos, "tickets", http.get(`${URL}/rest/v1/tickets?select=*&limit=50`, h(e.token))),
  drive: (e, pos) => medir(pos, "drive", http.get(`${URL}/rest/v1/drive_items?select=id,nombre,tipo,parent_id&limit=100`, h(e.token))),
  chatters_grupos: (e, pos) => medir(pos, "chatters_grupos", http.get(`${URL}/rest/v1/chatter_groups?select=*&limit=50`, h(e.token))),
};

export const options = {
  scenarios: {
    gente: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: __ENV.SUBIDA || "2m", target: parseInt(__ENV.VUS || "111") },
        { duration: __ENV.DURACION || "8m", target: parseInt(__ENV.VUS || "111") },
        { duration: "30s", target: 0 },
      ],
      gracefulRampDown: "30s",
    },
  },
  summaryTrendStats: ["avg", "p(50)", "p(95)", "p(99)", "max", "count"],
  noConnectionReuse: false,
};

export default function () {
  const vu = exec.vu.idInTest;
  let lista = MIAS;
  if (SOLO) lista = MIAS.filter((n) => SOLO.includes(posDe(n)));
  const n = lista[(vu - 1) % lista.length];
  const pos = posDe(n);
  let e = estado[vu];
  if (!e || !e.token || exec.vu.iterationInInstance % 40 === 39) {
    e = entrar(n, pos);
    if (!e) { sleep(20 + Math.random() * 20); return; }
    estado[vu] = e;
    cargarApp(e, pos);
    if (PERFIL[pos].messenger_lista) ACCION.messenger_lista(e, pos);
  }
  // Una vuelta: cada función según su peso, en orden mezclado, con pausas de persona.
  const vuelta = [];
  for (const [fn, peso] of Object.entries(PERFIL[pos])) for (let i = 0; i < peso; i++) if (ACCION[fn]) vuelta.push(fn);
  vuelta.sort(() => Math.random() - 0.5);
  for (const fn of vuelta) {
    ACCION[fn](e, pos);
    sleep(2 + Math.random() * 4);
  }
}

export function handleSummary(data) {
  const out = __ENV.SALIDA || "/resultados/resumen.json";
  return { [out]: JSON.stringify({ region: __ENV.REGION, cond: __ENV.COND, parte: PARTE, metricas: data.metrics }) };
}
