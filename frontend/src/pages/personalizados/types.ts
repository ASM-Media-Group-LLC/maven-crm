// Personalizados: pedidos de contenido personalizado que los fans compran por
// chat. Reemplaza el sheet "PERSONALIZADOS PLUS" (una fila por pedido, una
// pestaña por mes, estado a mano). Ver la migración personalizados_f1 para el
// porqué de cada campo.
//
// Los textos que se ven (estado, tipo, canal, banderas, el reloj del plazo) son
// CLAVES del diccionario (lib/i18n/ventas.ts); el `id` de cada uno es el valor
// que se guarda en la base y no se traduce nunca.
import type { TranslationKey } from "@/lib/i18n";

export type Agency = "plus" | "massive";
export type Estado =
  | "solicitado" | "aprobado" | "en_produccion" | "listo" | "entregado"
  | "denegado" | "reembolsado";
export type TipoContenido = "foto" | "video" | "audio" | "articulo";
export type CanalVenta = "normal" | "buster";

export interface Pedido {
  id: string;
  agency: Agency;
  creator_id: string | null;
  creator_name: string;
  chatter_id: string | null;
  chatter_name: string | null;
  fan_handle: string;
  requested_on: string;      // date
  due_on: string | null;     // date
  status: Estado;
  content_type: TipoContenido | null;
  sale_channel: CanalVenta | null;
  description: string;
  duration_or_qty: string | null;
  fan_total_spent_usd: number | null;
  price_usd: number | null;
  paid_usd: number | null;
  flags: string[];
  notes: string | null;
  denied_reason: string | null;
  approved_by: string | null;
  approved_at: string | null;
  delivered_at: string | null;
  source: string;
  source_ref: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface PedidoEvento {
  id: string;
  request_id: string;
  actor_id: string | null;
  from_status: Estado | null;
  to_status: Estado;
  note: string | null;
  created_at: string;
}

export interface PedidoAdjunto {
  id: string;
  request_id: string;
  storage_path: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  kind: "referencia" | "entrega";
  created_by: string | null;
  created_at: string;
}

// El ciclo de vida, en el orden del tablero. Los dos últimos son salidas
// laterales (no columnas de trabajo): se listan pero no se "avanza" hacia ellos.
export const ESTADOS: Array<{ id: Estado; label: TranslationKey; corto: TranslationKey; tono: string; lateral?: boolean }> = [
  { id: "solicitado",    label: "custom.status.solicitado",    corto: "custom.status.solicitado",          tono: "bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/30" },
  { id: "aprobado",      label: "custom.status.aprobado",      corto: "custom.status.aprobado",            tono: "bg-violet-500/15 text-violet-600 dark:text-violet-400 border-violet-500/30" },
  { id: "en_produccion", label: "custom.status.en_produccion", corto: "custom.status.en_produccion.short", tono: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30" },
  { id: "listo",         label: "custom.status.listo",         corto: "custom.status.listo",               tono: "bg-teal-500/15 text-teal-600 dark:text-teal-400 border-teal-500/30" },
  { id: "entregado",     label: "custom.status.entregado",     corto: "custom.status.entregado",           tono: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30" },
  { id: "denegado",      label: "custom.status.denegado",      corto: "custom.status.denegado",            tono: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30", lateral: true },
  { id: "reembolsado",   label: "custom.status.reembolsado",   corto: "custom.status.reembolsado.short",   tono: "bg-zinc-500/15 text-zinc-600 dark:text-zinc-300 border-zinc-500/30", lateral: true },
];
export const estadoDe = (id: Estado) => ESTADOS.find((e) => e.id === id) ?? ESTADOS[0];

// El color del estado, abierto en piezas: `tono` sirve para el badge, pero el
// header de la ficha, los puntos del recorrido y la línea del historial
// necesitan el mismo color en otras formas. Las clases van ESCRITAS COMPLETAS
// a propósito: Tailwind no ve las que se arman con template strings.
export const ACENTO: Record<Estado, { hero: string; punto: string; texto: string; tinte: string }> = {
  solicitado:    { hero: "from-sky-500/25",     punto: "bg-sky-500",     texto: "text-sky-500",     tinte: "bg-sky-500/10" },
  aprobado:      { hero: "from-violet-500/25",  punto: "bg-violet-500",  texto: "text-violet-500",  tinte: "bg-violet-500/10" },
  en_produccion: { hero: "from-amber-500/25",   punto: "bg-amber-500",   texto: "text-amber-500",   tinte: "bg-amber-500/10" },
  listo:         { hero: "from-teal-500/25",    punto: "bg-teal-500",    texto: "text-teal-500",    tinte: "bg-teal-500/10" },
  entregado:     { hero: "from-emerald-500/25", punto: "bg-emerald-500", texto: "text-emerald-500", tinte: "bg-emerald-500/10" },
  denegado:      { hero: "from-red-500/25",     punto: "bg-red-500",     texto: "text-red-500",     tinte: "bg-red-500/10" },
  reembolsado:   { hero: "from-zinc-500/25",    punto: "bg-zinc-500",    texto: "text-zinc-400",    tinte: "bg-zinc-500/10" },
};
export const acentoDe = (id: Estado) => ACENTO[id] ?? ACENTO.solicitado;

/** El camino normal del pedido, sin las salidas laterales: es lo que dibuja el
 *  recorrido de la ficha (dónde está y cuánto le falta). */
export const CAMINO: Estado[] = ["solicitado", "aprobado", "en_produccion", "listo", "entregado"];

/** A qué estados se puede pasar desde cada uno (lo que ofrecen los botones).
 *  Aprobar/denegar además lo exige la BD (trigger): solo supervisor+. */
export const SIGUIENTES: Record<Estado, Estado[]> = {
  solicitado:    ["aprobado", "denegado"],
  aprobado:      ["en_produccion", "denegado"],
  en_produccion: ["listo", "denegado"],
  listo:         ["entregado"],
  entregado:     ["reembolsado"],
  denegado:      ["solicitado"],
  reembolsado:   [],
};
export const SOLO_SUPERVISOR: Estado[] = ["aprobado", "denegado"];

// ─── Reloj del pedido ───────────────────────────────────────────────────────
// Regla del negocio (Jhon, 03/09/2026): un personalizado no puede tardar más
// de 12 DÍAS desde que el fan lo pidió. A los 7 avisa en ámbar (todavía hay
// tiempo, pero ya hay que empujarlo) y a los 12 queda VENCIDO en rojo. Si el
// pedido tiene fecha de entrega propia y ya pasó, cuenta como vencido aunque
// tenga menos días. Los pedidos cerrados no alertan nunca: ya no hay nada que
// hacer con ellos.
export const DIAS_ATENCION = 7;
export const DIAS_VENCIDO = 12;
export const CERRADOS: Estado[] = ["entregado", "denegado", "reembolsado"];
export const estaCerrado = (e: Estado) => CERRADOS.includes(e);

export interface Alerta {
  nivel: "atencion" | "vencido";
  dias: number;
  /** El rótulo del badge: `t(a.texto, { dias: a.dias })`. */
  texto: TranslationKey;
  /** Clases del badge. */
  tono: string;
  /** Color plano, para el punto y el borde de la fila/tarjeta. */
  punto: string;
  borde: string;
}

/** Días enteros transcurridos entre una fecha `YYYY-MM-DD` y hoy. Se ancla al
 *  mediodía porque las fechas del pedido son días sin hora: a medianoche, un
 *  `new Date("2026-09-01")` (UTC) contra la hora local se corría un día. */
export function diasDesde(dia: string, hoy: Date = new Date()): number {
  const d = new Date(`${dia.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return 0;
  const ref = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate(), 12, 0, 0);
  return Math.floor((ref.getTime() - d.getTime()) / 86_400_000);
}

export function alertaDe(
  p: Pick<Pedido, "status" | "requested_on" | "due_on">,
  hoy: Date = new Date(),
): Alerta | null {
  if (estaCerrado(p.status)) return null;
  const dias = diasDesde(p.requested_on, hoy);
  const entregaPasada = !!p.due_on && diasDesde(p.due_on, hoy) > 0;
  if (dias >= DIAS_VENCIDO || entregaPasada) {
    return {
      nivel: "vencido",
      dias,
      texto: "custom.alert.overdue",
      tono: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30",
      punto: "bg-red-500",
      borde: "border-l-red-500",
    };
  }
  if (dias >= DIAS_ATENCION) {
    return {
      nivel: "atencion",
      dias,
      texto: "custom.alert.attention",
      tono: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
      punto: "bg-amber-500",
      borde: "border-l-amber-500",
    };
  }
  return null;
}

export const TIPOS: Array<{ id: TipoContenido; label: TranslationKey; emoji: string }> = [
  { id: "foto", label: "custom.type.foto", emoji: "📷" },
  { id: "video", label: "custom.type.video", emoji: "🎬" },
  { id: "audio", label: "custom.type.audio", emoji: "🎧" },
  { id: "articulo", label: "custom.type.articulo", emoji: "📦" },
];
export const tipoDe = (id: TipoContenido | null) => TIPOS.find((t) => t.id === id);

export const CANALES: Array<{ id: CanalVenta; label: TranslationKey; ayuda: TranslationKey }> = [
  { id: "normal", label: "custom.channel.normal", ayuda: "custom.channel.normal.help" },
  { id: "buster", label: "custom.channel.buster", ayuda: "custom.channel.buster.help" },
];

export const AGENCIAS: Array<{ id: Agency; label: string; tono: string }> = [
  { id: "plus", label: "Plus", tono: "bg-fuchsia-500/15 text-fuchsia-600 dark:text-fuchsia-400 border-fuchsia-500/30" },
  { id: "massive", label: "Massive", tono: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30" },
];
export const agenciaDe = (id: Agency) => AGENCIAS.find((a) => a.id === id) ?? AGENCIAS[0];

// Los "amarillos" del sheet, como banderas tipadas.
export const FLAGS: Array<{ id: string; label: TranslationKey }> = [
  { id: "vendido_antes", label: "custom.flag.vendido_antes" },
  { id: "cambio_contenido", label: "custom.flag.cambio_contenido" },
  { id: "fan_conflictivo", label: "custom.flag.fan_conflictivo" },
  { id: "pago_parcial", label: "custom.flag.pago_parcial" },
  { id: "entregado_al_user", label: "custom.flag.entregado_al_user" },
  { id: "urgente", label: "custom.flag.urgente" },
  { id: "revisar_monto", label: "custom.flag.revisar_monto" },
];
/** La clave de una bandera; `null` si es una que no está en el catálogo (se
 *  muestra su id tal cual). */
export const flagDe = (id: string): TranslationKey | null => FLAGS.find((f) => f.id === id)?.label ?? null;

// Techos de realidad para la plata. Vienen del histórico: un personalizado sale
// $150 de mediana y el más caro real fue $3.600, pero en el sheet aparecieron
// celdas de "$5.500.000" que hacían que el tablero dijera "En juego $5.5M".
// Por encima del techo el formulario avisa y marca el pedido con FLAG_MONTO.
export const TECHO_PRECIO = 20_000;
export const TECHO_GASTO_FAN = 500_000;
export const FLAG_MONTO = "revisar_monto";
export const montoSospechoso = (n: number | null | undefined, techo: number) => n != null && n > techo;

export const usd = (n: number | null | undefined) =>
  n == null ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
