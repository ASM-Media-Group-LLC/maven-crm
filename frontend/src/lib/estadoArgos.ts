// ESTADO (Alvaro, 18/11/2026: «todo lo que reporte Argos de cada persona, ahí
// va llegando, uno por uno»). Lógica pura de la lista: qué es cada cosa, cómo
// se juntan las repetidas (la IA y los parpadeos de internet llegan de a
// decenas) y cómo entran las faltas y llegadas tarde del horario.

/** Lo que devuelve argos_estado_hoy(). */
export type ClaseEvento = "corte" | "llamado" | "fuera" | "ia";

export interface FotoEstado {
  path: string;
  nasPath: string | null;
  enNas: boolean;
}

export interface EventoArgos {
  userId: string;
  creado: string;
  clase: ClaseEvento;
  tipo: string;
  detalle: string | null;
  duracionS: number | null;
  volvio: boolean | null;
  escalado: boolean | null;
  llamados: number | null;
  reportado: boolean | null;
  porCorte: boolean | null;
  estado: string | null;
  foto: FotoEstado | null;
}

/** Cómo se filtra y se pinta en la pantalla. */
export type Categoria = "llamado" | "corte" | "luz" | "fuera" | "ia" | "falta" | "tarde";
export const CATEGORIAS: Categoria[] = ["llamado", "corte", "luz", "fuera", "ia", "falta", "tarde"];

/** Desde cuántos segundos sin conexión ya no es un parpadeo: es «sin luz o internet». */
export const LARGO_SIN_CONEXION_S = 120;
/** Las repetidas de la misma persona se juntan si caen dentro de esta ventana. */
export const VENTANA_GRUPO_MS = 60 * 60_000;
/** Solo estas se juntan; un llamado, una salida o una falta van siempre sueltos. */
const SE_JUNTAN = new Set<Categoria>(["ia", "corte"]);

export function categoriaDe(e: Pick<EventoArgos, "clase" | "tipo" | "duracionS" | "porCorte">): Categoria {
  if (e.clase === "llamado") return "llamado";
  if (e.clase === "ia") return "ia";
  if (e.clase === "fuera") return e.porCorte ? "luz" : "fuera";
  if (e.tipo === "no_volvio") return "luz";
  if ((e.duracionS ?? 0) >= LARGO_SIN_CONEXION_S) return "luz";
  return "corte";
}

export interface ItemEstado {
  clave: string;
  userId: string;
  /** El más reciente del grupo (o el único). */
  cuando: string;
  /** El más viejo del grupo (igual a `cuando` si es uno solo). */
  desde: string;
  categoria: Categoria;
  tipo: string;
  eventos: EventoArgos[];
  /** Para faltas y llegadas tarde: la hora de entrada (ya formateada) y los minutos. */
  entrada?: string | null;
  tardeMin?: number | null;
}

const ms = (iso: string) => Date.parse(iso);

/** Junta en un solo renglón las repetidas de la misma persona y el mismo tipo
 *  (IA y parpadeos) que caen en la misma hora. Entra y sale del más nuevo al
 *  más viejo. */
export function agruparEventos(eventos: EventoArgos[]): ItemEstado[] {
  const orden = [...eventos].sort((a, b) => ms(b.creado) - ms(a.creado));
  const abiertos = new Map<string, ItemEstado>();
  const out: ItemEstado[] = [];
  for (const e of orden) {
    const categoria = categoriaDe(e);
    const k = `${e.userId}|${categoria}|${e.tipo}`;
    const g = SE_JUNTAN.has(categoria) ? abiertos.get(k) : undefined;
    if (g && ms(g.cuando) - ms(e.creado) <= VENTANA_GRUPO_MS) {
      g.eventos.push(e);
      g.desde = e.creado;
      continue;
    }
    const nuevo: ItemEstado = {
      clave: `${k}|${e.creado}`,
      userId: e.userId,
      cuando: e.creado,
      desde: e.creado,
      categoria,
      tipo: e.tipo,
      eventos: [e],
    };
    out.push(nuevo);
    if (SE_JUNTAN.has(categoria)) abiertos.set(k, nuevo);
  }
  return out;
}

/** «HH:MM» (o «HH:MM:SS») de hoy en Bogotá (UTC-5, sin horario de verano) → ISO. */
export function isoDeHoraBogota(dia: string, hora: string): string | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(hora ?? "");
  if (!m) return null;
  return new Date(`${dia}T${m[1].padStart(2, "0")}:${m[2]}:00-05:00`).toISOString();
}

export interface PersonaHorario {
  userId: string;
  /** Hora de entrada cruda «HH:MM[:SS]». */
  entradaCruda: string | null;
  /** La misma, ya para mostrar («8:00 AM»). */
  entrada: string | null;
  llegoAt: string | null;
  tardeMin: number | null;
  /** Estado de Presencia; «no_ha_entrado» = en su turno y sin entrar. */
  estado: string;
}

/** Faltas (debía entrar y no ha entrado) y llegadas tarde de hoy, como renglones. */
export function faltasYTardes(personas: PersonaHorario[], dia: string, ahoraMs: number): ItemEstado[] {
  const out: ItemEstado[] = [];
  for (const p of personas) {
    if (p.llegoAt && p.tardeMin != null) {
      out.push({ clave: `${p.userId}|tarde`, userId: p.userId, cuando: p.llegoAt, desde: p.llegoAt, categoria: "tarde", tipo: "tarde", eventos: [], entrada: p.entrada, tardeMin: p.tardeMin });
    } else if (!p.llegoAt && p.estado === "no_ha_entrado" && p.entradaCruda) {
      const iso = isoDeHoraBogota(dia, p.entradaCruda);
      if (iso && ms(iso) <= ahoraMs) {
        out.push({ clave: `${p.userId}|falta`, userId: p.userId, cuando: iso, desde: iso, categoria: "falta", tipo: "falta", eventos: [], entrada: p.entrada });
      }
    }
  }
  return out;
}

/** Todo junto, del más nuevo al más viejo. */
export function armarEstado(eventos: EventoArgos[], horario: ItemEstado[]): ItemEstado[] {
  return [...agruparEventos(eventos), ...horario].sort((a, b) => ms(b.cuando) - ms(a.cuando));
}

export function contarPorCategoria(items: ItemEstado[]): Record<Categoria, number> {
  const c = Object.fromEntries(CATEGORIAS.map((k) => [k, 0])) as Record<Categoria, number>;
  for (const i of items) c[i.categoria] += 1;
  return c;
}

/** Las fotos de un renglón (sin repetir), de la más nueva a la más vieja. */
export function fotosDe(item: ItemEstado): Array<FotoEstado & { cuando: string }> {
  const vistos = new Set<string>();
  const out: Array<FotoEstado & { cuando: string }> = [];
  for (const e of item.eventos) {
    if (!e.foto) continue;
    const k = e.foto.enNas && e.foto.nasPath ? e.foto.nasPath : e.foto.path;
    if (vistos.has(k)) continue;
    vistos.add(k);
    out.push({ ...e.foto, cuando: e.creado });
  }
  return out;
}

export const claveDeFoto = (f: FotoEstado): string => (f.enNas && f.nasPath ? f.nasPath : f.path);

export function normalizarEvento(r: Record<string, unknown>): EventoArgos {
  const path = (r.captura_path as string | null) ?? null;
  return {
    userId: String(r.user_id),
    creado: String(r.creado),
    clase: r.clase as ClaseEvento,
    tipo: String(r.tipo ?? ""),
    detalle: (r.detalle as string | null) ?? null,
    duracionS: r.duracion_s == null ? null : Number(r.duracion_s),
    volvio: (r.volvio as boolean | null) ?? null,
    escalado: (r.escalado as boolean | null) ?? null,
    llamados: r.llamados == null ? null : Number(r.llamados),
    reportado: (r.reportado as boolean | null) ?? null,
    porCorte: (r.por_corte as boolean | null) ?? null,
    estado: (r.estado as string | null) ?? null,
    foto: path ? { path, nasPath: (r.captura_nas_path as string | null) ?? null, enNas: r.captura_en_nas === true } : null,
  };
}
