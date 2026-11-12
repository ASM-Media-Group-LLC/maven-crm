// ARGOS MINUTO A MINUTO — LA CUENTA (Alvaro, 11/11/2026: «desde el clock in
// contabilizamos cada minuto»).
//
// Toma lo crudo de una persona (argos_jornada_cruda: su horario, los tramos del
// reloj de Cowork, sus pausas, sus salidas de Cowork, los pantallazos que Argos
// vio fuera de lugar y sus alertas de distracción) y arma su turno SEGUNDO A
// SEGUNDO, de la hora de entrada a la de salida de su horario:
//
//   · bien             = conectado, compartiendo pantalla, con la cara en cámara
//                        y sin que Argos lo viera en otra cosa.
//   · sin_camara / sin_pantalla / fuera_de_camara = lo que dice el reloj.
//   · distraido        = estaba «bien» pero Argos lo vio en otra cosa (pantallazo
//                        fuera de lugar no perdonado, o alerta de distracción,
//                        celular o no mira).
//   · pausa            = baño, break o almuerzo dentro del tiempo permitido
//                        (cowork_break_limits): no cuenta en contra.
//   · pausa_de_mas     = lo que pasó del tiempo permitido.
//   · fuera_cowork     = en su turno, fuera de Cowork (o sin conexión larga).
//   · no_entro         = de la hora de entrada hasta que entró.
//   · se_fue           = de su última señal hasta la hora de salida (solo si el
//                        turno ya terminó; si sigue en curso es fuera_cowork).
//   · pendiente        = lo que aún no pasa (hoy, turno en curso).
//
// Una FALLA es un corte de 1 minuto o más de un estado malo (sin cámara, sin
// pantalla, fuera de cámara, distraído, fuera de Cowork o pausa de más). Los
// cortes más cortos suman minutos pero no cuentan como falla. Una HORA es
// productiva si trabajó bien el 90 % o más de lo que se le podía pedir (la pausa
// permitida y lo que aún no pasa no cuentan). Funciones puras: las ata
// test/argos/argosJornada.test.ts.

export type EstadoMinuto =
  | "bien" | "sin_camara" | "sin_pantalla" | "fuera_de_camara" | "distraido"
  | "pausa" | "pausa_de_mas" | "fuera_cowork" | "no_entro" | "se_fue" | "pendiente";

/** Orden de la leyenda y de la barra (lo bueno primero, lo ausente al final). */
export const ESTADOS: EstadoMinuto[] = [
  "bien", "pausa", "sin_pantalla", "sin_camara", "fuera_de_camara", "distraido",
  "pausa_de_mas", "fuera_cowork", "no_entro", "se_fue", "pendiente",
];

/** Los estados que cuentan como falla si duran 1 minuto o más. */
export const ESTADOS_FALLA: ReadonlySet<EstadoMinuto> = new Set<EstadoMinuto>([
  "sin_camara", "sin_pantalla", "fuera_de_camara", "distraido", "fuera_cowork", "pausa_de_mas",
]);

export const UMBRAL_FALLA_SEG = 60;
export const HORA_PRODUCTIVA = 0.9;
/** Un hueco entre latidos de hasta 90 s no es una salida (el reloj late cada 30 s). */
export const PUENTE_SEG = 90;
/** Pantallazo fuera de lugar sin «hasta» o alerta abierta: cuenta 5 minutos. */
const DURACION_SENAL_MS = 5 * 60_000;
export const LIMITES_POR_DEFECTO: Record<string, number> = { bano: 600, break: 1800, almuerzo: 1800 };

const HORA_MS = 3_600_000;

/** ¿t cae en [a, b)? Con nombre a propósito: el freno de español confunde comparaciones sueltas con texto. */
export function enRango(t: number, a: number, b: number): boolean {
  return t >= a && t < b;
}

/** ¿Se cruzan [a1, b1) y [a2, b2)? */
function seCruzan(a1: number, b1: number, a2: number, b2: number): boolean {
  return a1 < b2 && a2 < b1;
}
const DIA_MS = 86_400_000;

// ─── Lo crudo (argos_jornada_cruda) ─────────────────────────────────────────

export interface PersonaCruda {
  id: string;
  nombre: string | null;
  avatar_url?: string | null;
  avatar_seed?: string | null;
  objetivo: boolean;
  entrada: string | null;
  salida: string | null;
  exento: boolean;
  /** [estado, desde, hasta] del reloj de Cowork. */
  segmentos: [string, string, string][];
  /** [tipo (bano | break | almuerzo), desde, hasta | null]. */
  pausas: [string, string, string | null][];
  /** [desde, hasta | null] de cada salida de Cowork. */
  fuera: [string, string | null][];
  /** [desde, hasta] de cada pantallazo fuera de lugar no perdonado. */
  flojas: [string, string][];
  /** [tipo, desde, hasta | null] de las alertas de distracción. */
  alertas: [string, string, string | null][];
}

export interface JornadaCruda {
  ahora: string;
  equipo: string | null;
  limites: Record<string, number>;
  personas: PersonaCruda[];
}

// ─── El resultado ────────────────────────────────────────────────────────────

export type Segundos = Record<EstadoMinuto, number>;

export interface Tramo { estado: EstadoMinuto; desde: number; hasta: number }
export interface Falla { estado: EstadoMinuto; desde: number; hasta: number; seg: number }

export interface HoraJornada {
  desde: number;
  hasta: number;
  seg: Segundos;
  /** 0–1 de lo que se le podía pedir esa hora; null si toda fue pausa o aún no pasa. */
  pctBien: number | null;
  /** ≥ 90 %; null si no se puede evaluar (pausa entera o futura). */
  productiva: boolean | null;
  fallas: Falla[];
}

export interface Jornada {
  fecha: string;
  /** Inicio y fin del turno (ms). Sin horario: de la primera a la última señal. */
  inicio: number;
  fin: number;
  conHorario: boolean;
  /** Hoy, con el turno corriendo. */
  enCurso: boolean;
  /** No hubo ninguna señal suya en el turno. */
  sinSenal: boolean;
  tramos: Tramo[];
  seg: Segundos;
  fallas: Falla[];
  horas: HoraJornada[];
  entro: number | null;
  salio: number | null;
  /** Segundos conectado a Cowork sin contar pausas (bien + los problemas estando ahí). */
  conectadoSeg: number;
  /** Lo que se le podía pedir: el turno ya pasado menos la pausa permitida. */
  evaluableSeg: number;
  pctBien: number | null;
  /** «Una falla cada N minutos» (entre que entró y su última señal). */
  cadaMin: number | null;
  horasProductivas: number;
  horasEvaluadas: number;
  /** Segundos de pausa dentro del turno por tipo (bano, break, almuerzo), permitida + de más. */
  pausaPorTipo: Record<string, number>;
}

export const segundosVacios = (): Segundos =>
  Object.fromEntries(ESTADOS.map((e) => [e, 0])) as Segundos;

// ─── Hora de Bogotá (sin horario de verano: siempre −05:00) ─────────────────

export function sumarDias(fecha: string, delta: number): string {
  const [y, m, d] = fecha.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + delta)).toISOString().slice(0, 10);
}

/** ms de «YYYY-MM-DD» + «HH:MM[:SS]» en Bogotá. */
export function msEnBogota(fecha: string, hora: string): number {
  const hh = hora.length === 5 ? `${hora}:00` : hora.slice(0, 8);
  return Date.parse(`${fecha}T${hh}-05:00`);
}

/** El lunes (YYYY-MM-DD) de la semana de una fecha. */
export function lunesDe(fecha: string): string {
  const [y, m, d] = fecha.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = domingo
  return sumarDias(fecha, -((dow + 6) % 7));
}

/** La fecha de Bogotá (YYYY-MM-DD) de un instante. */
export function fechaBogota(ms: number): string {
  return new Date(ms - 5 * HORA_MS).toISOString().slice(0, 10);
}

/** El turno de ese día según su horario (los que cruzan la medianoche, hasta el día siguiente). */
export function ventanaDelTurno(fecha: string, entrada: string | null, salida: string | null): { inicio: number; fin: number } | null {
  if (!entrada || !salida) return null;
  const inicio = msEnBogota(fecha, entrada);
  let fin = msEnBogota(fecha, salida);
  if (!Number.isFinite(inicio) || !Number.isFinite(fin)) return null;
  if (fin <= inicio) fin += DIA_MS;
  return { inicio, fin };
}

// ─── La cuenta ───────────────────────────────────────────────────────────────

const CODIGO: Record<EstadoMinuto, number> = Object.fromEntries(ESTADOS.map((e, i) => [e, i + 1])) as Record<EstadoMinuto, number>;
const DE_CODIGO: EstadoMinuto[] = ["pendiente", ...ESTADOS]; // índice 0 = vacío (se resuelve antes de leerlo)

/** Cómo se lee cada estado del reloj de Cowork (igual que cowork_tiempo_diario). */
function estadoDelReloj(estado: string, exento: boolean): EstadoMinuto | "pausa_reloj" | null {
  switch (estado) {
    case "activo":
    case "meet":
    case "sin_conexion": // un corte corto de conexión cuenta como activo (como en la nota)
      return "bien";
    case "sin_camara":
    case "sin_pantalla":
    case "fuera_de_camara":
      return exento ? "bien" : estado;
    case "pausa":
      return "pausa_reloj";
    default: // sin_conexion_larga y lo desconocido: no es presencia
      return null;
  }
}

const ms = (iso: string | null | undefined): number | null => {
  if (!iso) return null;
  const v = Date.parse(iso);
  return Number.isFinite(v) ? v : null;
};

interface Pintor {
  arr: Uint8Array;
  idx: (t: number) => number;
  pintar: (desde: number, hasta: number, codigo: number, soloSobre?: number) => void;
}

function pintor(inicio: number, n: number): Pintor {
  const arr = new Uint8Array(n);
  const idx = (t: number) => Math.max(0, Math.min(n, Math.floor((t - inicio) / 1000)));
  const pintar = (desde: number, hasta: number, codigo: number, soloSobre?: number) => {
    const a = idx(desde);
    const b = Math.max(a, Math.min(n, Math.ceil((hasta - inicio) / 1000)));
    for (let i = a; i < b; i++) {
      if (soloSobre === undefined || arr[i] === soloSobre) arr[i] = codigo;
    }
  };
  return { arr, idx, pintar };
}

/** Une los huecos cortos entre dos señales (latidos perdidos), salvo que ahí empiece una salida de Cowork. */
function puentear(arr: Uint8Array, salidas: number[]): void {
  const empiezaSalida = new Set(salidas);
  let i = 0;
  const n = arr.length;
  while (i < n && arr[i] === 0) i++;
  while (i < n) {
    if (arr[i] !== 0) { i++; continue; }
    const a = i;
    while (i < n && arr[i] === 0) i++;
    if (i >= n) break; // hueco final: no hay señal después
    const largo = i - a;
    let hayInicioDeSalida = false;
    for (let k = a; k < i && !hayInicioDeSalida; k++) hayInicioDeSalida = empiezaSalida.has(k);
    if (largo <= PUENTE_SEG && !hayInicioDeSalida) arr.fill(arr[a - 1], a, i);
  }
}

/** Reparte una pausa entre lo permitido y lo de más. */
function pintarPausas(p: Pintor, filas: { tipo: string; desde: number; hasta: number }[], limites: Record<string, number>): Record<string, number> {
  const porTipo: Record<string, number> = {};
  let banoRestante = limites.bano ?? LIMITES_POR_DEFECTO.bano;
  for (const f of [...filas].sort((x, y) => x.desde - y.desde)) {
    const a = p.idx(f.desde);
    const b = p.idx(f.hasta);
    const largo = Math.max(0, b - a);
    if (largo === 0) continue;
    porTipo[f.tipo] = (porTipo[f.tipo] ?? 0) + largo;
    let permitido: number;
    if (f.tipo === "bano") {
      permitido = Math.min(largo, Math.max(0, banoRestante));
      banoRestante -= permitido;
    } else {
      permitido = Math.min(largo, limites[f.tipo] ?? LIMITES_POR_DEFECTO[f.tipo] ?? LIMITES_POR_DEFECTO.break);
    }
    p.arr.fill(CODIGO.pausa, a, a + permitido);
    p.arr.fill(CODIGO.pausa_de_mas, a + permitido, b);
  }
  return porTipo;
}

function contar(arr: Uint8Array, a: number, b: number): Segundos {
  const seg = segundosVacios();
  for (let i = a; i < b; i++) seg[DE_CODIGO[arr[i]]] += 1;
  return seg;
}

const sumaDe = (s: Segundos, estados: EstadoMinuto[]) => estados.reduce((acc, e) => acc + s[e], 0);
const CONECTADO: EstadoMinuto[] = ["bien", "sin_camara", "sin_pantalla", "fuera_de_camara", "distraido"];

/** La ventana sin horario: de la primera a la última señal de ese día de Bogotá. */
function ventanaSinHorario(p: PersonaCruda, fecha: string): { inicio: number; fin: number } | null {
  const dia0 = msEnBogota(fecha, "00:00:00");
  const dia1 = dia0 + DIA_MS;
  let lo = Infinity;
  let hi = -Infinity;
  const mirar = (d: number | null, h: number | null) => {
    if (d === null || h === null) return;
    const a = Math.max(d, dia0);
    const b = Math.min(h, dia1);
    if (b > a) { lo = Math.min(lo, a); hi = Math.max(hi, b); }
  };
  for (const [estado, d, h] of p.segmentos) if (estadoDelReloj(estado, p.exento)) mirar(ms(d), ms(h));
  for (const [, d, h] of p.pausas) mirar(ms(d), ms(h));
  return Number.isFinite(lo) ? { inicio: lo, fin: hi } : null;
}

function jornadaVacia(fecha: string, inicio: number, fin: number, conHorario: boolean, ahora: number): Jornada {
  return {
    fecha, inicio, fin, conHorario, enCurso: ahora < fin && ahora >= inicio, sinSenal: true,
    tramos: [], seg: segundosVacios(), fallas: [], horas: [], entro: null, salio: null,
    conectadoSeg: 0, evaluableSeg: 0, pctBien: null, cadaMin: null, horasProductivas: 0, horasEvaluadas: 0, pausaPorTipo: {},
  };
}

/** El turno de una persona en un día, segundo a segundo. */
export function calcularJornada(p: PersonaCruda, fecha: string, limites: Record<string, number>, ahora: number): Jornada {
  const conHorario = !!(p.entrada && p.salida);
  const ventana = ventanaDelTurno(fecha, p.entrada, p.salida) ?? ventanaSinHorario(p, fecha);
  if (!ventana) {
    const d0 = msEnBogota(fecha, "00:00:00");
    return jornadaVacia(fecha, d0, d0, false, ahora);
  }
  const { inicio, fin } = ventana;
  const n = Math.max(0, Math.ceil((fin - inicio) / 1000));
  const pt = pintor(inicio, n);
  const corte = pt.idx(Math.min(fin, ahora));

  // 1. Lo que dice el reloj de Cowork.
  const pausasDelReloj: { desde: number; hasta: number }[] = [];
  for (const [estado, d, h] of p.segmentos) {
    const desde = ms(d);
    const hasta = ms(h);
    if (desde === null || hasta === null) continue;
    const e = estadoDelReloj(estado, p.exento);
    if (e === "pausa_reloj") pausasDelReloj.push({ desde, hasta });
    else if (e) pt.pintar(desde, hasta, CODIGO[e]);
  }

  // 2. Los huecos cortos entre latidos no son salidas.
  const salidas = p.fuera.map(([d]) => ms(d)).filter((x): x is number => x !== null).map(pt.idx);
  puentear(pt.arr, salidas);

  // 3. Las pausas (las de cowork_breaks y, si el reloj marcó pausa sin fila, esa como break).
  const filas = p.pausas
    .map(([tipo, d, h]) => ({ tipo, desde: ms(d), hasta: ms(h) ?? ahora }))
    .filter((f): f is { tipo: string; desde: number; hasta: number } => f.desde !== null);
  for (const r of pausasDelReloj) {
    const tapada = filas.some((f) => seCruzan(f.desde, f.hasta, r.desde, r.hasta));
    if (!tapada) filas.push({ tipo: "break", desde: r.desde, hasta: r.hasta });
  }
  const pausaPorTipo = pintarPausas(pt, filas, limites);

  // 4. Argos lo vio en otra cosa: solo baja lo que estaba «bien».
  for (const [d, h] of p.flojas) {
    const desde = ms(d);
    if (desde === null) continue;
    pt.pintar(desde, ms(h) ?? desde + DURACION_SENAL_MS, CODIGO.distraido, CODIGO.bien);
  }
  for (const [, d, h] of p.alertas) {
    const desde = ms(d);
    if (desde === null) continue;
    pt.pintar(desde, ms(h) ?? Math.min(ahora, desde + DURACION_SENAL_MS), CODIGO.distraido, CODIGO.bien);
  }

  // 5. Lo que aún no pasa, y los huecos: antes de entrar, después de irse o en medio.
  pt.arr.fill(CODIGO.pendiente, corte, n);
  let primero = -1;
  let ultimo = -1;
  for (let i = 0; i < corte; i++) {
    if (pt.arr[i] !== 0) { if (primero === -1) primero = i; ultimo = i; }
  }
  if (primero === -1) {
    if (!conHorario) return jornadaVacia(fecha, inicio, fin, false, ahora);
    pt.arr.fill(CODIGO.no_entro, 0, corte);
  } else {
    const terminado = ahora >= fin;
    for (let i = 0; i < corte; i++) {
      if (pt.arr[i] !== 0) continue;
      if (i < primero) pt.arr[i] = CODIGO.no_entro;
      else if (i > ultimo && terminado) pt.arr[i] = CODIGO.se_fue;
      else pt.arr[i] = CODIGO.fuera_cowork;
    }
  }

  // 6. Tramos y fallas.
  const tramos: Tramo[] = [];
  for (let i = 0; i < n;) {
    const c = pt.arr[i];
    let j = i + 1;
    while (j < n && pt.arr[j] === c) j++;
    tramos.push({ estado: DE_CODIGO[c], desde: inicio + i * 1000, hasta: Math.min(fin, inicio + j * 1000) });
    i = j;
  }
  const fallas: Falla[] = tramos
    .filter((t) => ESTADOS_FALLA.has(t.estado) && (t.hasta - t.desde) / 1000 >= UMBRAL_FALLA_SEG)
    .map((t) => ({ ...t, seg: Math.round((t.hasta - t.desde) / 1000) }));

  // 7. Hora por hora (Bogotá va en horas enteras respecto de UTC).
  const horas: HoraJornada[] = [];
  for (let h = Math.floor(inicio / HORA_MS) * HORA_MS; h < fin; h += HORA_MS) {
    const desde = Math.max(inicio, h);
    const hasta = Math.min(fin, h + HORA_MS);
    const seg = contar(pt.arr, pt.idx(desde), pt.idx(hasta));
    const base = (hasta - desde) / 1000 - seg.pausa - seg.pendiente;
    const pctBien = base >= 60 ? seg.bien / base : null;
    horas.push({
      desde, hasta, seg, pctBien,
      productiva: pctBien === null ? null : pctBien >= HORA_PRODUCTIVA,
      fallas: fallas.filter((f) => enRango(f.desde, desde, hasta)),
    });
  }

  const seg = contar(pt.arr, 0, n);
  const evaluableSeg = n - seg.pausa - seg.pendiente;
  const sinSenal = primero === -1;
  const presenteSeg = sinSenal ? 0 : ultimo - primero + 1;
  return {
    fecha, inicio, fin, conHorario,
    enCurso: ahora < fin && ahora >= inicio,
    sinSenal,
    tramos, seg, fallas, horas,
    entro: sinSenal ? null : inicio + primero * 1000,
    salio: sinSenal ? null : inicio + (ultimo + 1) * 1000,
    conectadoSeg: sumaDe(seg, CONECTADO),
    evaluableSeg,
    pctBien: evaluableSeg >= 60 ? seg.bien / evaluableSeg : null,
    cadaMin: fallas.length ? Math.max(1, Math.round(presenteSeg / 60 / fallas.length)) : null,
    horasProductivas: horas.filter((h) => h.productiva === true).length,
    horasEvaluadas: horas.filter((h) => h.productiva !== null).length,
    pausaPorTipo,
  };
}

// ─── Lo que se dice del día ─────────────────────────────────────────────────

export const minutos = (seg: number) => Math.round(seg / 60);

export type Banda = "bueno" | "regular" | "flojo";
export function bandaDelDia(j: Jornada): Banda | null {
  if (j.pctBien === null) return null;
  if (j.pctBien >= HORA_PRODUCTIVA) return "bueno";
  if (j.pctBien >= 0.6) return "regular";
  return "flojo";
}

/** Una razón del veredicto: un estado malo con sus minutos y cuántas veces pasó. */
export interface Razon { estado: EstadoMinuto; min: number; veces: number }

/** POR QUÉ, en minutos: lo que le quitó tiempo de trabajo, de lo más grande a lo más chico. */
export function razonesDelDia(j: Jornada): Razon[] {
  const malos: EstadoMinuto[] = ["se_fue", "no_entro", "fuera_cowork", "sin_pantalla", "sin_camara", "fuera_de_camara", "distraido", "pausa_de_mas"];
  return malos
    .map((estado) => ({
      estado,
      min: minutos(j.seg[estado]),
      veces: j.tramos.filter((t) => t.estado === estado && (t.hasta - t.desde) / 1000 >= UMBRAL_FALLA_SEG).length,
    }))
    .filter((r) => r.min > 0)
    .sort((a, b) => b.min - a.min);
}

// ─── Semana y equipo ─────────────────────────────────────────────────────────

/** Las 7 jornadas de lunes a domingo (las de días que aún no llegan, vacías). */
export function semanaDe(p: PersonaCruda, lunes: string, limites: Record<string, number>, ahora: number): Jornada[] {
  return Array.from({ length: 7 }, (_, i) => calcularJornada(p, sumarDias(lunes, i), limites, ahora));
}

export interface PromedioEquipo {
  personas: number;
  pctBien: number | null;
  seg: Segundos;
  conectadoSeg: number;
  fallas: number;
}

/** El promedio de quienes SÍ entraron ese día (no se promedia a quien no vino). */
export function promedioDelEquipo(jornadas: Jornada[]): PromedioEquipo | null {
  const vinieron = jornadas.filter((j) => !j.sinSenal);
  if (vinieron.length === 0) return null;
  const n = vinieron.length;
  const seg = segundosVacios();
  for (const j of vinieron) for (const e of ESTADOS) seg[e] += j.seg[e] / n;
  const conPct = vinieron.filter((j) => j.pctBien !== null);
  return {
    personas: n,
    pctBien: conPct.length ? conPct.reduce((a, j) => a + (j.pctBien as number), 0) / conPct.length : null,
    seg,
    conectadoSeg: vinieron.reduce((a, j) => a + j.conectadoSeg, 0) / n,
    fallas: vinieron.reduce((a, j) => a + j.fallas.length, 0) / n,
  };
}

/** El tramo que cubre un instante (para tocar la barra). */
export function tramoEn(j: Jornada, t: number): Tramo | null {
  return j.tramos.find((x) => enRango(t, x.desde, x.hasta)) ?? null;
}
