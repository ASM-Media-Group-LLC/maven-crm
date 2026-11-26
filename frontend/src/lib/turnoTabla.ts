// EL PARTE DEL TURNO (Alvaro, 25/11/2026): «en Argos uno no sabe quién salió al
// lunch, a qué hora salió, cuántas veces le dijo la pantalla que atendiera… el
// baño, cuándo estuvo conectado, si llegó tarde, en un solo lugar».
//
// Decisiones del dueño (con botones, 25/11/2026):
//   · Argos abre con una tabla del turno: una fila por persona con llegada,
//     comida, baño, avisos y conexión; tocar la fila abre su expediente.
//   · Semáforo «normal»: ámbar si se pasó poco o corrigió avisos; rojo si se pasó
//     más, ignoró un aviso o se fue antes.
//   · «Almuerzo» y «break» son lo mismo: una sola columna «Comida».
//
// Aquí solo hay cuentas puras (se prueban sin red). Los datos los trae
// hooks/useTurnoTabla.ts de tablas que ya existen: cowork_tiempo_segmentos,
// cowork_breaks, argos_nudges, turno_marcas y el horario de cada persona.

export type Nivel = "ok" | "ambar" | "rojo";
export type NivelFila = Nivel;

/** Umbrales del semáforo «normal», en un solo lugar. */
export const UMBRALES = {
  /** Minutos tarde desde los que la llegada es roja (antes, ámbar). */
  tardeRojoMin: 30,
  /** Irse antes: ámbar desde 15 min antes, rojo desde 60. */
  antesAmbarMin: 15,
  antesRojoMin: 60,
  /** Comida: cortesía sobre el tope; ámbar hasta 10 min de más, luego rojo. */
  comidaCortesiaMin: 2,
  comidaRojoMin: 10,
  /** Baño (saldo del día): ámbar hasta 5 min de más, luego rojo. */
  banoRojoMin: 5,
  /** Avisos de Argos en el día. */
  avisosAmbar: 6,
  avisosRojo: 10,
  /** Avisos ignorados (escalaron al supervisor). */
  ignoradosRojo: 2,
  /** Cortes de internet: solo avisan desde aquí (nunca rojo: puede no ser culpa suya). */
  cortesAmbar: 5,
  cortesMinAmbar: 15,
  /** Parte del tiempo conectado en que estuvo trabajando. */
  activoAmbar: 0.7,
  activoRojo: 0.5,
} as const;

/** Estados de cowork_tiempo_segmentos que son «sin conexión». */
const SIN_CONEXION = new Set(["sin_conexion", "sin_conexion_larga"]);

export interface Segmento { estado: string; inicio: number; fin: number }
export interface Pausa { kind: string; inicio: number; fin: number | null; autoCerrada: boolean }
export interface Aviso { tipo: string; at: number; escalado: boolean; cerrado: boolean }
export interface Marca { inicio: number; fin: number | null; cierre: string | null }

export interface Horario {
  /** «HH:MM[:SS]» de ese día, o null si ese día no tiene turno. */
  entrada: string | null;
  salida: string | null;
  toleranciaMin: number;
  /** Sin horario confirmado no se cuenta tarde (regla del 19/11/2026). */
  confirmado: boolean;
  comidaMin: number;
  banoMin: number;
}

export interface EntradaPersona {
  userId: string;
  nombre: string;
  horario: Horario;
  segmentos: Segmento[];
  pausas: Pausa[];
  avisos: Aviso[];
  marcas: Marca[];
}

/** Instante (ms) de «AAAA-MM-DD» + «HH:MM» en Bogotá (UTC−5 todo el año). */
export function instanteBogota(dia: string, hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return Date.parse(`${dia}T00:00:00-05:00`) + ((h || 0) * 60 + (m || 0)) * 60_000;
}

/** Inicio y fin del turno de ese día (cruza la medianoche si la salida es antes). */
export function ventanaTurno(dia: string, h: Pick<Horario, "entrada" | "salida">): { inicio: number; fin: number } | null {
  if (!h.entrada || !h.salida) return null;
  const inicio = instanteBogota(dia, h.entrada);
  let fin = instanteBogota(dia, h.salida);
  if (fin <= inicio) fin += 24 * 3_600_000;
  return { inicio, fin };
}

/** Desde dónde y hasta dónde se miran los datos de esa persona ese día: una hora
 *  antes de su entrada hasta tres después de su salida; sin turno, el día entero. */
export function ventanaDatos(dia: string, h: Pick<Horario, "entrada" | "salida">): { desde: number; hasta: number } {
  const v = ventanaTurno(dia, h);
  if (v) return { desde: v.inicio - 60 * 60_000, hasta: v.fin + 3 * 3_600_000 };
  const d0 = Date.parse(`${dia}T00:00:00-05:00`);
  return { desde: d0, hasta: d0 + 24 * 3_600_000 };
}

const min = (ms: number) => Math.round(ms / 60_000);

export interface TramoComida { inicio: number; fin: number | null }

export interface FilaTurno {
  userId: string;
  nombre: string;
  /** Horario del día «HH:MM» (o null sin turno). */
  entrada: string | null;
  salida: string | null;
  turnoInicio: number | null;
  turnoFin: number | null;
  /** ¿El turno está pasando ahora? */
  enCurso: boolean;
  /** ¿Aún no empieza (hoy)? */
  empiezaLuego: boolean;

  llegada: number | null;
  /** ¿La llegada salió de la marca de entrada (y no hubo trabajo en Cowork)? */
  sinMarca: boolean;
  tardeMin: number | null;
  /** Hoy: minutos desde su entrada sin aparecer. */
  noLlegaMin: number | null;
  noVino: boolean;
  salidaAt: number | null;
  cierre: string | null;
  antesMin: number | null;
  sigueMin: number | null;
  nivelLlegada: Nivel;

  comida: TramoComida[];
  comidaMin: number;
  comidaTope: number;
  comidaAhora: number | null;
  comidaDeMas: number;
  nivelComida: Nivel;

  banos: number;
  banoMin: number;
  banoTope: number;
  banoAhora: number | null;
  nivelBano: Nivel;

  avisos: number;
  ignorados: number;
  corregidos: number;
  avisosPorTipo: Record<string, number>;
  avisoAbierto: string | null;
  nivelAvisos: Nivel;

  activoMin: number;
  conectadoMin: number;
  cortes: number;
  cortesMin: number;
  nivelConexion: Nivel;

  /** El peor de todos. */
  nivel: NivelFila;
  /** Por qué (claves de motivo, de la más grave a la menos). */
  motivos: Motivo[];
}

export type Motivo =
  | { k: "noVino" }
  | { k: "noLlega"; min: number }
  | { k: "tarde"; min: number }
  | { k: "seFue"; min: number }
  | { k: "ignoro"; n: number }
  | { k: "avisos"; n: number }
  | { k: "comida"; min: number }
  | { k: "bano"; min: number }
  | { k: "pocoActivo"; pct: number }
  | { k: "cortes"; n: number }
  | { k: "sinMarca" }
  | { k: "sinCierre" };

const PESO: Record<Nivel, number> = { ok: 0, ambar: 1, rojo: 2 };
export const peor = (...n: Nivel[]): Nivel => n.reduce((a, b) => (PESO[b] > PESO[a] ? b : a), "ok" as Nivel);

/** Arma la fila de una persona para un día. `ahora` permite probar sin reloj. */
export function armarFila(dia: string, p: EntradaPersona, ahora: number): FilaTurno {
  const h = p.horario;
  const turno = ventanaTurno(dia, h);
  const { desde, hasta } = ventanaDatos(dia, h);
  const dentro = (t: number) => t >= desde && t < hasta;
  const segs = p.segmentos.filter((s) => dentro(s.inicio) && s.fin > s.inicio).sort((a, b) => a.inicio - b.inicio);
  const pausas = p.pausas.filter((x) => dentro(x.inicio)).sort((a, b) => a.inicio - b.inicio);
  const avisos = p.avisos.filter((a) => dentro(a.at)).sort((a, b) => a.at - b.at);
  const marcas = p.marcas.filter((m) => dentro(m.inicio)).sort((a, b) => a.inicio - b.inicio);

  const enCurso = !!turno && ahora >= turno.inicio && ahora < turno.fin;
  const empiezaLuego = !!turno && ahora < turno.inicio;
  const terminado = !turno || ahora >= turno.fin;

  // LLEGADA: el primer rato de trabajo en Cowork (la misma cuenta que Jornada:
  // «In at 4:17 PM +17 min»). Sin Cowork, su marca de entrada.
  const trabajo = segs.filter((s) => !SIN_CONEXION.has(s.estado));
  const primerTrabajo = trabajo[0]?.inicio ?? null;
  const marca = marcas[0] ?? null;
  const llegada = primerTrabajo ?? marca?.inicio ?? null;
  const sinMarca = primerTrabajo == null && marca != null;
  let tardeMin: number | null = null;
  if (turno && llegada != null && h.confirmado) {
    const dif = min(llegada - turno.inicio);
    tardeMin = dif > h.toleranciaMin ? dif : null;
  }
  const noLlegaMin = turno && llegada == null && enCurso ? Math.max(0, min(ahora - turno.inicio)) : null;
  const noVino = !!turno && llegada == null && terminado && h.confirmado;

  // SALIDA: la marca de salida; si no hay, el último rato en Cowork.
  const ultimaMarca = marcas[marcas.length - 1] ?? null;
  const ultimoTrabajo = trabajo.length ? Math.max(...trabajo.map((s) => s.fin)) : null;
  const salidaAt = ultimaMarca?.fin ?? (enCurso ? null : ultimoTrabajo);
  const cierre = ultimaMarca?.cierre ?? null;
  let antesMin: number | null = null;
  let sigueMin: number | null = null;
  if (turno && salidaAt != null && !enCurso) {
    const dif = min(turno.fin - salidaAt);
    if (dif >= UMBRALES.antesAmbarMin) antesMin = dif;
  }
  if (turno && enCurso === false && salidaAt == null && llegada != null && ahora >= turno.fin) {
    sigueMin = min(ahora - turno.fin);
  }

  let nivelLlegada: Nivel = "ok";
  if (noVino) nivelLlegada = "rojo";
  else if (noLlegaMin != null && h.confirmado) nivelLlegada = noLlegaMin >= UMBRALES.tardeRojoMin ? "rojo" : noLlegaMin > h.toleranciaMin ? "ambar" : "ok";
  else if (tardeMin != null) nivelLlegada = tardeMin >= UMBRALES.tardeRojoMin ? "rojo" : "ambar";
  if (antesMin != null) nivelLlegada = peor(nivelLlegada, antesMin >= UMBRALES.antesRojoMin ? "rojo" : "ambar");

  // COMIDA: almuerzo + break juntos (el dueño: «son lo mismo»). Las de 0 min no cuentan.
  // Las de menos de un minuto (marcó y desmarcó) no cuentan.
  const comidas = pausas.filter((x) => (x.kind === "almuerzo" || x.kind === "break") && (x.fin == null || x.fin - x.inicio >= 60_000));
  const comidaMs = comidas.reduce((s, x) => s + ((x.fin ?? (terminado ? x.inicio : ahora)) - x.inicio), 0);
  const comidaMin = min(comidaMs);
  const abiertaComida = comidas.find((x) => x.fin == null && !terminado) ?? null;
  const comidaDeMas = Math.max(0, comidaMin - h.comidaMin);
  let nivelComida: Nivel = "ok";
  if (h.comidaMin === 0 && comidas.length) nivelComida = "ambar";
  else if (comidaDeMas > UMBRALES.comidaRojoMin) nivelComida = "rojo";
  else if (comidaDeMas > UMBRALES.comidaCortesiaMin) nivelComida = "ambar";

  // BAÑO: saldo del día (10 min), no por ida. Las idas de menos de 30 s no cuentan.
  const banos = pausas.filter((x) => x.kind === "bano" && (x.fin == null || x.fin - x.inicio >= 30_000));
  const banoMin = min(banos.reduce((s, x) => s + ((x.fin ?? (terminado ? x.inicio : ahora)) - x.inicio), 0));
  const abiertoBano = banos.find((x) => x.fin == null && !terminado) ?? null;
  const banoDeMas = Math.max(0, banoMin - h.banoMin);
  const nivelBano: Nivel = banoDeMas > UMBRALES.banoRojoMin ? "rojo" : banoDeMas > 0 ? "ambar" : "ok";

  // AVISOS de Argos: cuántos, cuántos ignoró (escalaron) y cuántos corrigió solo.
  const ignorados = avisos.filter((a) => a.escalado).length;
  const corregidos = avisos.filter((a) => a.cerrado && !a.escalado).length;
  const avisosPorTipo: Record<string, number> = {};
  for (const a of avisos) avisosPorTipo[a.tipo] = (avisosPorTipo[a.tipo] ?? 0) + 1;
  const abierto = !terminado ? avisos.find((a) => !a.cerrado) ?? null : null;
  let nivelAvisos: Nivel = "ok";
  if (avisos.length >= UMBRALES.avisosRojo || ignorados >= UMBRALES.ignoradosRojo) nivelAvisos = "rojo";
  else if (avisos.length >= UMBRALES.avisosAmbar || ignorados >= 1) nivelAvisos = "ambar";

  // CONEXIÓN: horas en Cowork, cuánto de eso trabajando y los cortes de internet.
  let activoMs = 0, conectadoMs = 0, cortesMs = 0, cortes = 0;
  for (const s of segs) {
    const dur = s.fin - s.inicio;
    if (SIN_CONEXION.has(s.estado)) { cortes++; cortesMs += dur; continue; }
    if (s.estado !== "pausa") conectadoMs += dur;
    if (s.estado === "activo" || s.estado === "meet") activoMs += dur;
  }
  const activoMin = min(activoMs), conectadoMin = min(conectadoMs), cortesMin = min(cortesMs);
  const pct = conectadoMs > 0 ? activoMs / conectadoMs : 1;
  let nivelConexion: Nivel = "ok";
  // Con menos de una hora conectado no se juzga el porcentaje (recién empieza).
  if (conectadoMin >= 60 && pct < UMBRALES.activoRojo) nivelConexion = "rojo";
  else if (conectadoMin >= 60 && pct < UMBRALES.activoAmbar) nivelConexion = "ambar";
  if (cortes >= UMBRALES.cortesAmbar || cortesMin >= UMBRALES.cortesMinAmbar) nivelConexion = peor(nivelConexion, "ambar");

  // MOTIVOS, del más grave al menos (la frase de Argos sale de aquí).
  const motivos: Motivo[] = [];
  if (noVino) motivos.push({ k: "noVino" });
  if (noLlegaMin != null && nivelLlegada !== "ok") motivos.push({ k: "noLlega", min: noLlegaMin });
  if (antesMin != null) motivos.push({ k: "seFue", min: antesMin });
  if (ignorados > 0) motivos.push({ k: "ignoro", n: ignorados });
  if (tardeMin != null) motivos.push({ k: "tarde", min: tardeMin });
  if (nivelConexion !== "ok" && conectadoMin >= 60 && pct < UMBRALES.activoAmbar) motivos.push({ k: "pocoActivo", pct: Math.round(pct * 100) });
  if (nivelComida !== "ok") motivos.push({ k: "comida", min: comidaDeMas });
  if (nivelBano !== "ok") motivos.push({ k: "bano", min: banoDeMas });
  if (nivelAvisos !== "ok" && ignorados === 0) motivos.push({ k: "avisos", n: avisos.length });
  if (cortes >= UMBRALES.cortesAmbar || cortesMin >= UMBRALES.cortesMinAmbar) motivos.push({ k: "cortes", n: cortes });
  if (sinMarca) motivos.push({ k: "sinMarca" });

  return {
    userId: p.userId,
    nombre: p.nombre,
    entrada: h.entrada ? h.entrada.slice(0, 5) : null,
    salida: h.salida ? h.salida.slice(0, 5) : null,
    turnoInicio: turno?.inicio ?? null,
    turnoFin: turno?.fin ?? null,
    enCurso,
    empiezaLuego,
    llegada,
    sinMarca,
    tardeMin,
    noLlegaMin,
    noVino,
    salidaAt,
    cierre,
    antesMin,
    sigueMin,
    nivelLlegada,
    comida: comidas.map((x) => ({ inicio: x.inicio, fin: x.fin })),
    comidaMin,
    comidaTope: h.comidaMin,
    comidaAhora: abiertaComida ? abiertaComida.inicio : null,
    comidaDeMas,
    nivelComida,
    banos: banos.length,
    banoMin,
    banoTope: h.banoMin,
    banoAhora: abiertoBano ? abiertoBano.inicio : null,
    nivelBano,
    avisos: avisos.length,
    ignorados,
    corregidos,
    avisosPorTipo,
    avisoAbierto: abierto?.tipo ?? null,
    nivelAvisos,
    activoMin,
    conectadoMin,
    cortes,
    cortesMin,
    nivelConexion,
    nivel: empiezaLuego ? "ok" : peor(nivelLlegada, nivelComida, nivelBano, nivelAvisos, nivelConexion),
    motivos,
  };
}

/** ¿Sale en la tabla? Quien tenía turno ese día o quien trabajó aunque no le tocara. */
export function apareceEnElDia(f: FilaTurno): boolean {
  return f.turnoInicio != null || f.llegada != null;
}

export type Seccion = "mirar" | "ojo" | "bien" | "luego";

export function seccionDe(f: FilaTurno): Seccion {
  if (f.empiezaLuego) return "luego";
  return f.nivel === "rojo" ? "mirar" : f.nivel === "ambar" ? "ojo" : "bien";
}

/** Orden «por atención»: lo grave primero; dentro, el más tarde / más avisos primero;
 *  los que van bien, por hora de llegada. */
export function ordenarPorAtencion(filas: FilaTurno[]): FilaTurno[] {
  const peso = (f: FilaTurno) =>
    (f.noVino ? 1000 : 0) + (f.antesMin ?? 0) + (f.noLlegaMin ?? 0) + f.ignorados * 60 + (f.tardeMin ?? 0) + f.avisos * 3 + f.comidaDeMas + f.banoMin;
  return [...filas].sort((a, b) => {
    const s = PESO[b.nivel] - PESO[a.nivel];
    if (s) return s;
    if (a.nivel === "ok") return (a.llegada ?? a.turnoInicio ?? Infinity) - (b.llegada ?? b.turnoInicio ?? Infinity);
    return peso(b) - peso(a);
  });
}

/** Turnos reales de ese día («08:00–16:00»), del más temprano al más tarde. */
export function turnosDelDia(filas: FilaTurno[]): string[] {
  const s = new Set<string>();
  for (const f of filas) if (f.entrada && f.salida) s.add(`${f.entrada}–${f.salida}`);
  return [...s].sort();
}

/** Los días de la semana (lunes a domingo) que contienen `dia`. */
export function semanaDe(dia: string): string[] {
  const [a, m, d] = dia.split("-").map(Number);
  const base = new Date(Date.UTC(a, m - 1, d));
  const dow = (base.getUTCDay() + 6) % 7; // lunes = 0
  return Array.from({ length: 7 }, (_, i) => new Date(Date.UTC(a, m - 1, d - dow + i)).toISOString().slice(0, 10));
}

export function sumarDias(dia: string, n: number): string {
  const [a, m, d] = dia.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10);
}
