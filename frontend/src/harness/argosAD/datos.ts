// Datos del banco «antes → después» de Argos: copiados de PRODUCCIÓN el 11/11/2026
// (solo lectura). El día de Isabel Tuiran tal cual; El día y Dónde está, las filas
// reales de ese momento. No se sube al repo.

import "./reloj";
import { JUZGADAS_MARIA, TIEMPO_MARIA } from "./datosMaria";

export const VIEWER = "00000000-0000-4000-8000-0000000000aa";
export const ISA = "85726405-3037-456a-9af2-c167f707237a";
const uid = (c: string) => (c === "85726405" ? ISA : `${c}-0000-4000-8000-000000000000`);
/** ?persona=maria → el expediente de María (11/11); si no, el de Isabel. */
const esMaria = new URLSearchParams(window.location.search).get("persona") === "maria";
export const PERSONA = esMaria ? uid("91933cea") : ISA;

// ── Isabel, hoy: las capturas reales (tipo, hora Bogotá, cara visible, veredicto) ──
type C = ["c" | "p", string, boolean | null, string | null];
const CAPS: C[] = [
  ["c", "09:01:40", true, null], ["p", "09:01:41", null, "Maven Cowork · Uso de la plataforma de coworking virtual y videollamada de trabajo en Maven"],
  ["c", "09:02:03", true, null], ["p", "09:02:05", null, null], ["p", "09:04:24", null, null], ["c", "09:05:59", true, null], ["p", "09:06:00", null, null],
  ["c", "09:07:54", true, null], ["p", "09:07:56", null, "Claude · El usuario utiliza un asistente de IA para coordinar y gestionar tareas operativas y técnicas de trabajo."],
  ["c", "09:10:06", true, null], ["p", "09:10:07", null, null], ["c", "09:12:30", true, null],
  ["p", "09:12:32", null, "Claude / Google Chrome · Usa la aplicación de Claude y el navegador con pestañas de Maven para coordinar tareas de trabajo"],
  ["c", "09:14:42", true, null], ["p", "09:14:43", null, null], ["c", "09:17:12", true, null], ["p", "09:17:14", null, null], ["c", "09:18:09", true, null], ["p", "09:18:11", null, null],
  ["c", "09:19:49", true, null], ["p", "09:19:50", null, "Claude (Anthropic) · Uso de asistente de inteligencia artificial para tareas de trabajo y asistencia técnica"],
  ["c", "09:22:06", true, null], ["p", "09:22:07", null, null], ["c", "09:24:31", true, null],
  ["p", "09:24:32", null, "Claude (interfaz web/asistente de IA) · El usuario interactúa con un asistente de IA para tareas de desarrollo o automatización técnica."],
  ["c", "09:27:02", true, null], ["p", "09:27:03", null, null], ["c", "09:29:28", true, null], ["p", "09:29:29", null, null], ["c", "09:31:39", true, null],
  ["p", "09:31:40", null, "Claude AI · El usuario utiliza un asistente de inteligencia artificial para coordinar y gestionar tareas operativas y técnicas de trabajo."],
  ["c", "09:33:21", true, null], ["p", "09:33:22", null, null], ["c", "09:34:58", true, null], ["p", "09:35:01", null, null], ["c", "09:36:56", true, null],
  ["p", "09:36:57", null, "Claude (asistente de IA) · Uso de asistente de inteligencia artificial para tareas de trabajo y automatización"],
  ["c", "09:39:28", true, null], ["p", "09:39:29", null, null], ["c", "09:41:56", true, null],
  ["p", "09:41:58", null, "Claude (IA) · Uso de asistente de inteligencia artificial para tareas y automatización de trabajo"],
  ["c", "09:44:28", true, null], ["p", "09:44:29", null, null], ["c", "09:46:54", false, null],
  ["p", "09:46:55", null, "Claude / Google Flow · El usuario utiliza herramientas de inteligencia artificial y automatización para tareas de gestión y procesamiento técnico"],
  ["c", "09:49:15", true, null], ["p", "09:49:17", null, null], ["c", "09:51:20", true, null], ["p", "09:51:21", null, null], ["c", "09:52:54", true, null],
  ["p", "09:52:55", null, "Google Flow y Claude · El usuario utiliza herramientas de inteligencia artificial y edición de contenido multimedia para tareas operativas"],
  ["c", "09:55:04", true, null], ["p", "09:55:05", null, null], ["c", "09:57:03", true, null], ["p", "09:57:04", null, null], ["c", "09:59:02", true, null], ["p", "09:59:03", null, null],
  ["c", "09:59:59", false, null], ["p", "10:00:00", null, "Claude (asistente de IA) · Usa un asistente de inteligencia artificial para coordinar tareas y procesos de trabajo"],
  ["c", "10:01:57", true, null], ["p", "10:01:58", null, null], ["c", "10:04:10", true, null],
  ["p", "10:04:11", null, "Claude (Anthropic) · El usuario utiliza un asistente de inteligencia artificial para coordinar y ejecutar tareas de trabajo."],
  ["c", "10:06:25", true, null], ["p", "10:06:26", null, null], ["c", "10:08:37", true, null], ["p", "10:08:39", null, null], ["c", "10:10:25", true, null],
  ["p", "10:10:26", null, "Claude AI / Plataforma de inteligencia artificial · El usuario gestiona tareas de trabajo y edición asistidas por inteligencia artificial."],
  ["c", "10:12:14", true, null], ["p", "10:12:15", null, null], ["c", "10:12:50", true, null],
  ["p", "10:12:51", null, "Participa en una sala de trabajo colaborativo o videollamada en Maven Cowork compartiendo pantalla"],
  ["c", "10:20:50", true, null], ["p", "10:20:53", null, null], ["c", "10:21:06", true, null],
  ["p", "10:21:09", null, "Maven CRM · Revisión de la bandeja de entrada de correo dentro del CRM Maven"],
  ["c", "10:23:28", true, null], ["p", "10:23:29", null, null], ["c", "10:25:46", true, null], ["p", "10:25:47", null, null], ["c", "10:26:00", true, null],
  ["p", "10:26:03", null, "Google Chrome (flow.google.com) · Navega en la plataforma web de Google Flow con la pantalla cargando o en negro"],
  ["c", "10:28:06", false, null], ["p", "10:28:08", null, null], ["c", "10:30:03", true, null], ["p", "10:30:06", null, null], ["c", "10:32:00", true, null], ["p", "10:32:01", null, null],
  ["c", "10:33:36", true, null],
  ["p", "10:33:39", null, "Claude / Google Flow · Uso de asistente de inteligencia artificial y plataforma de generación de contenido para tareas de edición y producción"],
  ["c", "10:36:00", true, null], ["p", "10:36:02", null, "Google Flow en navegador web · Gestionando proyectos multimedia de la agencia en una herramienta de trabajo"],
];

/** María: cada pantallazo juzgado con su cámara 2 s antes (cara visible). */
function capturasMaria() {
  const out: Array<Record<string, unknown>> = [];
  JUZGADAS_MARIA.forEach(([h, f, v], i) => {
    const at = Date.parse(`2026-11-11T${h}-05:00`);
    const app = v.split(" · ")[0].slice(0, 40);
    out.push({ id: `m-cam-${i}`, user_id: uid("91933cea"), tipo: "camara", path: `${uid("91933cea")}/2026-11-11/camara-${i}|cara`, nas_path: null, en_nas: false, fuera_de_lugar: null, veredicto: null, cara_visible: true, perdonado: false, created_at: new Date(at - 2000).toISOString() });
    out.push({ id: `m-pan-${i}`, user_id: uid("91933cea"), tipo: "pantalla", path: `${uid("91933cea")}/2026-11-11/pantalla-${i}|${app}`, nas_path: null, en_nas: false, fuera_de_lugar: f === 1, veredicto: v, cara_visible: null, perdonado: false, created_at: new Date(at).toISOString() });
  });
  return out;
}

/** Variante de DEMO (?flojas=1): dos pantallazos marcados fuera de lugar y una grabación, para ver cómo se marcan. NO es el día real. */
const demo = new URLSearchParams(window.location.search).get("flojas") === "1";
const FLOJO_DEMO: Record<string, string> = {
  "09:52:55": "Instagram / Navegador web · Navega en un perfil de Instagram ajeno al trabajo",
  "10:26:03": "YouTube · Reproduce un video que no es de trabajo",
};

let app = "Maven Cowork";
const CAPTURAS_ISABEL = CAPS.map(([tp, h, cara, ver], i) => {
  const fuera = demo && FLOJO_DEMO[h] ? FLOJO_DEMO[h] : null;
  const veredicto = fuera ?? ver;
  if (tp === "p" && veredicto) app = veredicto.split("·")[0].trim();
  const tipo = tp === "c" ? "camara" : "pantalla";
  return {
    id: `cap-${i}`, user_id: ISA, tipo,
    path: `${ISA}/2026-11-11/${tipo}-${i}|${tipo === "pantalla" ? app : cara === false ? "vacia" : "cara"}`,
    nas_path: null, en_nas: false,
    fuera_de_lugar: tipo === "pantalla" && veredicto ? !!fuera : null,
    veredicto: tipo === "pantalla" ? veredicto : null,
    cara_visible: tipo === "camara" ? cara : null,
    perdonado: false,
    created_at: new Date(`2026-11-11T${h}-05:00`).toISOString(),
  };
});
export const CLIPS = esMaria ? [] : demo
  ? [{ id: "clip-1", user_id: ISA, motivo: "distraido", started_at: "2026-11-11T15:26:10.000Z", ended_at: "2026-11-11T15:28:40.000Z", duracion_seg: 150, path: `${ISA}/clip-1.webm`, en_nas: false }]
  : [];

// ── Lo crudo del turno (argos_jornada_cruda), tal cual de la base ──
export const CRUDA_ISABEL = {
  id: ISA, nombre: "Isabel Tuiran", avatar_url: null, avatar_seed: null, objetivo: true,
  entrada: "09:00:00", salida: "19:00:00", exento: false,
  segmentos: [
    ["sin_camara", "2026-11-09T17:58:37.868+00:00", "2026-11-09T17:59:07.703+00:00"],
    ["activo", "2026-11-09T17:59:21.223+00:00", "2026-11-09T18:07:38.591+00:00"],
    ["activo", "2026-11-09T19:07:29.655+00:00", "2026-11-09T19:09:18.539+00:00"],
    ["activo", "2026-11-09T19:09:46.934+00:00", "2026-11-09T19:09:47.445+00:00"],
    ["sin_camara", "2026-11-09T19:10:09.106+00:00", "2026-11-09T19:11:38.984+00:00"],
    ["activo", "2026-11-10T14:04:36.869+00:00", "2026-11-10T14:42:47.837+00:00"],
    ["sin_camara", "2026-11-10T15:13:58.926+00:00", "2026-11-10T15:14:52.222+00:00"],
    ["activo", "2026-11-10T15:15:04.776+00:00", "2026-11-10T15:51:22.928+00:00"],
    ["activo", "2026-11-10T16:06:55.054+00:00", "2026-11-10T16:39:17.192+00:00"],
    ["activo", "2026-11-10T16:39:43.681+00:00", "2026-11-10T16:40:17.058+00:00"],
    ["activo", "2026-11-11T14:01:37.502+00:00", "2026-11-11T15:12:52.573+00:00"],
    ["sin_camara", "2026-11-11T15:20:13.213+00:00", "2026-11-11T15:20:43.59+00:00"],
    ["activo", "2026-11-11T15:20:51.254+00:00", "2026-11-11T15:37:44.303+00:00"],
    ["sin_camara", "2026-11-11T18:18:04.31+00:00", "2026-11-11T18:18:34.231+00:00"],
  ],
  pausas: [],
  fuera: [
    ["2026-11-11T15:12:52.573+00:00", "2026-11-11T15:21:00.101996+00:00"],
    ["2026-11-11T15:37:44.303+00:00", "2026-11-11T18:00:00.228589+00:00"],
    ["2026-11-11T18:00:46.773+00:00", "2026-11-11T18:19:00.079831+00:00"],
    ["2026-11-11T18:19:00.079831+00:00", "2026-11-12T00:00:00+00:00"],
  ],
  flojas: demo ? [["2026-11-11T14:52:55.000Z", "2026-11-11T14:55:04.000Z"], ["2026-11-11T15:26:03.000Z", "2026-11-11T15:28:08.000Z"]] : [],
  alertas: [],
};
export const AHORA = "2026-11-12T02:38:57.357819+00:00";
export const LIMITES = { bano: 600, break: 1800, almuerzo: 1800 };

// ── El día (argos_dia_personas, argos_horas_dia) y la gente, reales ──
type FilaDia = [string, number, number, number, number, number, number];
const TODO: FilaDia[] = [["3359fe2a",26167,16,375,0,80,79],["ea6bc55e",19272,7,0,0,61,59],["62cb1cb8",199,0,0,0,2,2],["3f1478b4",18814,6,62,0,58,58],["7b1048ea",26461,63,420,0,77,77],["b10e053c",21571,702,249,0,64,64],["b63b05e0",26682,23,0,0,79,79],["2567542c",19279,822,30,0,56,55],["91933cea",26678,5,61,0,81,80],["283cfcfa",19384,12,0,0,59,59],["dd959846",25833,84,209,0,82,80],["086367f4",17669,0,0,0,50,49],["0964f0b1",23362,0,181,2100,76,54],["85726405",5288,0,60,0,18,18],["151b6902",19173,53,61,0,59,59],["9d42d8b1",25449,34,91,90,81,81],["4ae71401",26011,33,205,0,83,83],["960fc020",20598,6,22,0,61,61],["ac4906d1",26674,26,0,0,80,80],["e3355f39",24867,47,73,0,75,75],["e856abe7",18923,49,0,0,61,61],["cfa32ef2",24051,354,361,242,73,73],["34b72e86",19061,87,17,0,59,59],["dd4028d8",27250,10,109,0,87,86],["25a329af",24790,1,0,0,73,70],["28d71c15",18425,209,1440,0,58,58],["0473bcfa",26343,106,150,120,80,80],["3c7df465",17775,430,4,0,56,56],["3d78dc82",0,0,0,0,1,1],["c7c1fd14",0,0,0,0,3,3]];
const AM: FilaDia[] = [["3359fe2a",26167,16,375,0,77,76],["ea6bc55e",0,7,0,0,0,0],["62cb1cb8",199,0,0,0,2,2],["7b1048ea",26461,63,0,0,74,74],["b10e053c",18535,652,249,0,33,33],["b63b05e0",26682,23,0,0,77,77],["2567542c",0,821,30,0,0,0],["91933cea",26678,5,61,0,77,76],["dd959846",16949,34,149,0,51,51],["0964f0b1",15475,0,181,840,45,31],["85726405",5288,0,60,0,18,18],["9d42d8b1",25449,34,91,90,79,79],["4ae71401",24493,0,205,0,78,78],["960fc020",9347,0,22,0,10,10],["ac4906d1",453,0,0,0,2,2],["e3355f39",18069,47,73,0,49,49],["cfa32ef2",24051,354,211,242,72,72],["dd4028d8",25042,10,109,0,75,74],["25a329af",24790,1,0,0,71,68],["0473bcfa",26343,106,150,120,77,77]];
const fila = (f: FilaDia) => ({ user_id: uid(f[0]), seg_activo: f[1], seg_sin_pantalla: f[2], seg_sin_camara: f[3], seg_fuera_camara: f[4], juzgadas: f[5], juzgadas_ok: f[6] });
export const DIA_PERSONAS = (desde: number, hasta: number) => (desde === 8 && hasta === 16 ? AM : TODO).map(fila);
export const HORAS_DIA = [[0,96,99,100,13],[1,100,100,100,1],[2,100,93,100,1],[3,100,100,100,1],[4,100,100,100,1],[5,100,100,100,1],[6,100,96,100,1],[7,100,100,100,3],[8,99,99,100,12],[9,99,98,98,11],[10,99,96,99,14],[11,96,96,97,14],[12,100,97,99,14],[13,99,97,98,14],[14,99,99,92,14],[15,87,97,98,16],[16,98,99,98,24],[17,100,97,98,16],[18,100,99,97,15],[19,100,99,99,12],[20,98,99,99,11],[21,97,99,100,11]]
  .map(([hora, pantalla, camara, atencion, personas]) => ({ hora, pantalla, camara, atencion, personas }));

type Gente = [string, string, string, string, string, string | null, string | null];
const GENTE: Gente[] = [["9d42d8b1","Julian Rojas","Chatter","08:00:00","16:00:00","2026-11-11T13:00:20.606+00:00","2026-11-11T21:06:26.312+00:00"],["91933cea","María de los Ángeles Suárez","Chatter","08:00:00","16:00:00","2026-11-11T13:07:16.623+00:00","2026-11-11T21:17:43.238+00:00"],["3359fe2a","Juan Velez","Chatter","08:00:00","16:00:00","2026-11-11T13:01:20.903+00:00","2026-11-11T21:10:29.383+00:00"],["c7c1fd14","Claudia Giraldo","Chatter","16:00:00","00:00:00",null,null],["3d78dc82","Paul Sandoval","Chatter","16:00:00","00:00:00",null,null],["0473bcfa","Karem Gomez","Chatter","16:00:00","00:00:00","2026-11-11T13:00:31.998+00:00","2026-11-11T21:13:49.931+00:00"],["3c7df465","Xiorangel Caraballo","Chatter","16:00:00","00:00:00","2026-11-11T21:02:24.918+00:00","2026-11-12T02:58:51.913+00:00"],["cfa32ef2","Karen Parada","Chatter","08:00:00","16:00:00","2026-11-11T13:11:58.559+00:00","2026-11-11T21:21:30.315+00:00"],["283cfcfa","Diego Martinez","Chatter","16:00:00","00:00:00","2026-11-11T05:09:18.476+00:00","2026-11-12T02:58:56.212+00:00"],["b10e053c","Camila Sogamoso","Coordinador","10:00:00","19:00:00","2026-11-11T16:39:26.857+00:00","2026-11-12T00:00:08.778+00:00"],["ea6bc55e","Ana Escobar","Chatter","16:00:00","00:00:00","2026-11-11T20:59:39.46+00:00","2026-11-12T02:59:16.689+00:00"],["2567542c","Daniel Velez","Chatter","16:00:00","00:00:00","2026-11-11T20:56:06.145+00:00","2026-11-12T02:59:06.075+00:00"],["62cb1cb8","Luis Mercado","Chatter","08:00:00","16:00:00","2026-11-11T13:05:36.897+00:00","2026-11-11T13:09:07.161+00:00"],["34b72e86","Julian Burbano","Chatter","16:00:00","00:00:00","2026-11-11T21:01:15.536+00:00","2026-11-12T02:59:14.039+00:00"],["3f1478b4","Alejandra Hurtado","Chatter","16:00:00","00:00:00","2026-11-11T21:05:41.391+00:00","2026-11-12T02:58:52.961+00:00"],["7b1048ea","Delsys Fuentes","Chatter","08:00:00","16:00:00","2026-11-11T12:58:59.283+00:00","2026-11-11T21:22:46.678+00:00"],["25a329af","Gian Estarita","Chatter","08:00:00","16:00:00","2026-11-11T13:00:09.727+00:00","2026-11-11T21:09:22.456+00:00"],["086367f4","Maria Villegas","Coordinador Supervisor","12:00:00","21:00:00","2026-11-11T21:59:57.962+00:00","2026-11-12T02:58:57.462+00:00"],["dd4028d8","Katherin Ferrer","Coordinador","08:00:00","17:00:00","2026-11-11T13:00:40.829+00:00","2026-11-11T22:04:33.759+00:00"],["960fc020","Lorena Lozano","PR","15:00:00","00:00:00","2026-11-11T20:01:36.644+00:00","2026-11-12T02:59:00.41+00:00"],["e856abe7","Yerson Espinosa","Chatter","08:00:00","16:00:00","2026-11-11T21:00:23.229+00:00","2026-11-12T02:58:53.383+00:00"],["151b6902","Jonathan Hurtado","Chatter","16:00:00","00:00:00","2026-11-11T21:00:09.345+00:00","2026-11-12T02:58:49.554+00:00"],["4ae71401","Lina Perez","Chatter","08:00:00","16:00:00","2026-11-11T12:56:30.217+00:00","2026-11-11T21:21:08.503+00:00"],["28d71c15","Brayan Hernandez","Chatter","16:00:00","00:00:00","2026-11-11T05:01:39.037+00:00","2026-11-12T02:59:03.235+00:00"],["b63b05e0","Juan Castellanos","Chatter","08:00:00","16:00:00","2026-11-11T13:01:38.194+00:00","2026-11-11T21:05:38.022+00:00"],["85726405","Isabel Tuiran","Warming","09:00:00","19:00:00","2026-11-11T14:01:22.357+00:00","2026-11-12T00:07:21.08+00:00"],["dd959846","Fabiana Durán","PR","10:00:00","19:00:00","2026-11-11T15:03:20.171+00:00","2026-11-11T23:58:42.043+00:00"],["ac4906d1","Erick Mosquera","Chatter","00:00:00","08:00:00","2026-11-11T05:01:02.97+00:00","2026-11-11T13:09:45.56+00:00"],["0964f0b1","Daniel Felipe Duque Cortes","closer","10:00:00","19:00:00","2026-11-11T15:01:09.836+00:00","2026-11-12T00:01:19.813+00:00"],["e3355f39","Carolina Jaramillo","PR","10:00:00","19:00:00","2026-11-11T15:02:30.894+00:00","2026-11-11T23:35:23.34+00:00"]];
export const PROFILES = [
  ...GENTE.map(([c, nombre, , entrada, salida]) => ({ id: uid(c), full_name: nombre, avatar_url: null, avatar_seed: null, hora_entrada: entrada, hora_salida: salida, comida_min: null, bano_min: null, turno_id: null, deleted_at: null })),
  { id: VIEWER, full_name: "Alvaro Stephan Mejía", avatar_url: null, avatar_seed: null, hora_entrada: null, hora_salida: null, comida_min: null, bano_min: null, turno_id: null, deleted_at: null },
];
export const USER_ROLES = [
  ...GENTE.map(([c, , rol]) => ({ user_id: uid(c), role: rol, tenant_id: "t" })),
  { user_id: VIEWER, role: "admin", tenant_id: "t" },
];
// Para entró/salió de cada uno en El día: su primer y último tramo de trabajo.
export const SEGMENTOS_DIA = GENTE.flatMap(([c, , , , , ini, fin]) => (ini && fin ? [
  { user_id: uid(c), started_at: ini, seconds: 60, estado: "activo" },
  { user_id: uid(c), started_at: new Date(Date.parse(fin) - 60_000).toISOString(), seconds: 60, estado: "activo" },
] : []));

// ── Dónde está (donde_esta_cada_uno), real ──
type D = [string, string, string | null, string, string, string, boolean, string, string | null, string | null, string | null, boolean | null, string | null, number, number, boolean];
const DONDE: D[] = [["3f1478b4","Alejandra Hurtado","Chatter","Chatters","16:00:00","00:00:00",true,"activo","2026-11-12T01:11:33.961+00:00","2026-11-12T02:55:40.487869+00:00","CRM Maven / Cowork · El usuario gestiona conversaciones con fans a través de la plataforma",false,"2026-11-12T02:59:05.668059+00:00",1,5,false],["ea6bc55e","Ana Escobar","Chatter","Chatters","16:00:00","00:00:00",true,"activo","2026-11-12T02:40:27.689+00:00","2026-11-12T02:55:49.126715+00:00","Media Vault (OnlyFans / Fansly) · Navegación y selección de archivos en la bóveda de medio",false,"2026-11-12T02:57:29.74061+00:00",0,0,false],["246e7c28","Andrea Palacio","HHRR","RRHH","10:00:00","19:00:00",false,"fuera_de_turno",null,null,null,null,null,0,0,false],["f36d2394","Angie Ramirez","Finanzas","Finanzas","10:00:00","19:00:00",false,"fuera_de_turno",null,null,null,null,null,0,0,false],["28d71c15","Brayan Hernandez","Chatter","Chatters","16:00:00","00:00:00",true,"activo","2026-11-12T02:50:13.235+00:00","2026-11-12T02:54:59.745943+00:00","CRM Maven / OnlyFans CRM · Gestionando mensajes y chats con suscriptores en la plataforma",false,"2026-11-12T02:59:18.542086+00:00",0,0,false],["b10e053c","Camila Sogamoso","Coordinador","Editores","10:00:00","19:00:00",false,"fuera_de_turno",null,"2026-11-11T23:59:32.839567+00:00","Participa en una videollamada de coordinación de trabajo con pantalla compartida en Maven",false,"2026-11-11T23:59:32.839567+00:00",3,8,false],["e3355f39","Carolina Jaramillo","PR","PR","10:00:00","19:00:00",false,"fuera_de_turno",null,"2026-11-11T23:34:58.033216+00:00","Participa en una sala de trabajo virtual de Maven Cowork compartiendo pantalla",false,"2026-11-11T23:34:58.033216+00:00",4,107,false],["c7c1fd14","Claudia Giraldo","Chatter","Chatters","16:00:00","00:00:00",true,"no_ha_entrado",null,null,null,null,null,0,0,false],["0964f0b1","Daniel Felipe Duque Cortes","closer","Closers","10:00:00","19:00:00",false,"fuera_de_turno",null,"2026-11-12T00:01:33.198397+00:00","Maven CRM / ONLYOFFICE y WhatsApp · El usuario gestiona una hoja de cálculo en la plataforma",false,"2026-11-12T00:01:33.198397+00:00",2,102,false],["4d502376","Daniel Ospina","Chatter Supervisor","Chatters","08:00:00","16:00:00",false,"en_llamada",null,null,null,null,null,0,0,false],["2567542c","Daniel Velez","Chatter","Chatters","16:00:00","00:00:00",true,"activo","2026-11-12T02:02:14.075+00:00","2026-11-12T02:56:13.387951+00:00","CRM Maven / OnlyFans CRM · Gestionando mensajes y chats de fans dentro de la plataforma CRM",false,"2026-11-12T02:58:05.434347+00:00",0,0,false],["3671c9da","David Aunta","Coordinador","Editores","15:00:00","00:00:00",true,"no_ha_entrado",null,null,null,null,null,0,0,false],["283cfcfa","Diego Martinez","Chatter","Chatters","16:00:00","00:00:00",true,"activo","2026-11-12T02:49:38.212+00:00","2026-11-12T02:57:44.308612+00:00","Media Vault (OnlyFans / CRM) · Navegación y selección de archivos en la bóveda de contenido",false,"2026-11-12T02:59:18.481425+00:00",0,0,false],["dd959846","Fabiana Durán","PR","PR","10:00:00","19:00:00",false,"fuera_de_turno",null,"2026-11-11T23:56:42.923736+00:00","Uso de la plataforma de mensajería interna y gestión de creadoras Maven.",false,"2026-11-11T23:56:42.923736+00:00",4,80,false],["85726405","Isabel Tuiran","Warming","Warming","09:00:00","19:00:00",false,"fuera_de_turno",null,"2026-11-11T15:36:01.615244+00:00","Google Flow en navegador web · Gestionando proyectos multimedia de la agencia en una herramienta",false,"2026-11-11T15:36:01.615244+00:00",4,510,false],["151b6902","Jonathan Hurtado","Chatter","Chatters","16:00:00","00:00:00",true,"activo","2026-11-12T02:25:48.554+00:00","2026-11-12T02:55:41.739299+00:00","CRM Maven · El usuario gestiona conversaciones con fans a través de la mensajería del CRM",false,"2026-11-12T02:58:09.287129+00:00",0,0,false],["34b72e86","Julian Burbano","Chatter","Chatters","16:00:00","00:00:00",true,"activo","2026-11-12T02:34:24.039+00:00","2026-11-12T02:57:43.179846+00:00","El usuario se encuentra en una sala de videollamada y monitoreo de Maven Cowork compartiendo",false,"2026-11-12T02:57:43.179846+00:00",0,0,false],["0473bcfa","Karem Gomez","Chatter","Chatters","16:00:00","00:00:00",true,"fuera_de_cowork","2026-11-11T21:13:50.429+00:00","2026-11-11T21:12:41.465103+00:00","Maven Cowork · Participando en una sesión de videollamada y monitoreo de trabajo en equipo",false,"2026-11-11T21:12:41.465103+00:00",1,346,false],["dd4028d8","Katherin Ferrer","Coordinador","Editores","08:00:00","17:00:00",false,"fuera_de_turno",null,"2026-11-11T22:02:56.631024+00:00","Maven Cowork · Participa en una sala de videollamada y monitoreo de trabajo dentro de Maven",false,"2026-11-11T22:02:56.631024+00:00",4,16,false],["960fc020","Lorena Lozano","PR","PR","15:00:00","00:00:00",true,"activo","2026-11-12T01:59:14.41+00:00","2026-11-12T02:52:54.885744+00:00","Maven CRM · Utiliza la mensajería interna del CRM Maven para comunicarse con el equipo",false,"2026-11-12T02:59:25.092307+00:00",1,2,false],["62cb1cb8","Luis Mercado","Chatter","Chatters","08:00:00","16:00:00",false,"fuera_de_turno",null,null,null,null,null,1,471,false],["086367f4","Maria Villegas","Coordinador Supervisor","Editores","12:00:00","21:00:00",false,"activo","2026-11-12T01:23:12.462+00:00","2026-11-12T02:53:46.063314+00:00","Maven / OnlyOffice · El usuario gestiona una hoja de cálculo de trabajo dentro de la plataforma",false,"2026-11-12T02:59:11.208147+00:00",0,0,false],["de5c589d","Nicole Rodriguez","Chatter","Chatters","16:00:00","00:00:00",true,"no_ha_entrado",null,null,null,null,null,0,0,false],["3d78dc82","Paul Sandoval","Chatter","Chatters","16:00:00","00:00:00",true,"no_ha_entrado",null,null,null,null,null,0,0,false],["3c7df465","Xiorangel Caraballo","Chatter","Chatters","16:00:00","00:00:00",true,"activo","2026-11-12T01:46:57.913+00:00","2026-11-12T02:54:25.661406+00:00","CRM Maven · Uso de la plataforma de mensajería del CRM para gestionar chats de fans",false,"2026-11-12T02:59:02.530769+00:00",1,9,false],["e856abe7","Yerson Espinosa","Chatter","Chatters","08:00:00","16:00:00",false,"activo","2026-11-12T02:40:48.383+00:00","2026-11-12T02:55:24.858324+00:00","CRM Maven · Gestionando mensajes y chats con usuarios en el CRM de trabajo",false,"2026-11-12T02:59:11.111056+00:00",0,0,false]];
// Dónde está se lee «ahora»: se corren las horas para que «hace X min» se vea como a esa hora.
const corrimiento = Date.now() - Date.parse("2026-11-12T03:00:00Z");
const mover = (iso: string | null) => (iso ? new Date(Date.parse(iso) + corrimiento).toISOString() : null);
export const DONDE_ESTA = DONDE.map((d) => ({
  user_id: uid(d[0]), nombre: d[1], puesto: d[2], equipo: d[3], entrada: d[4], salida: d[5], en_turno: d[6], estado: d[7],
  estado_desde: mover(d[8]), ultimo_latido: null, pantalla_at: mover(d[9]), pantalla_que: d[10], pantalla_fuera_de_lugar: d[11],
  captura_at: mover(d[12]), fuera_hoy_veces: d[13], fuera_hoy_min: d[14], exento: d[15],
}));

// cowork_tiempo_diario de Isabel (lo que lee el expediente viejo para su nota).
const TIEMPO_DIARIO_ISABEL = [
  { dia: "2026-11-11", seg_activo: 5288, seg_sin_pantalla: 0, seg_sin_camara: 60, seg_fuera_de_camara: 0, primer_ingreso: "2026-11-11T14:01:37.502Z", ultima_salida: "2026-11-11T18:18:34.231Z" },
  { dia: "2026-11-10", seg_activo: 6430, seg_sin_pantalla: 0, seg_sin_camara: 53, seg_fuera_de_camara: 0, primer_ingreso: "2026-11-10T14:04:36.869Z", ultima_salida: "2026-11-10T16:40:17.058Z" },
  { dia: "2026-11-09", seg_activo: 607, seg_sin_pantalla: 0, seg_sin_camara: 120, seg_fuera_de_camara: 0, primer_ingreso: "2026-11-09T17:58:37.868Z", ultima_salida: "2026-11-09T19:11:38.984Z" },
];

export const CAPTURAS = esMaria ? capturasMaria() : CAPTURAS_ISABEL;
export const TIEMPO_DIARIO = esMaria ? [TIEMPO_MARIA] : TIEMPO_DIARIO_ISABEL;
