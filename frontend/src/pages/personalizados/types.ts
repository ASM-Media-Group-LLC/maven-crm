// Personalizados: pedidos de contenido personalizado que los fans compran por
// chat. Reemplaza el sheet "PERSONALIZADOS PLUS" (una fila por pedido, una
// pestaña por mes, estado a mano). Ver la migración personalizados_f1 para el
// porqué de cada campo.

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
export const ESTADOS: Array<{ id: Estado; label: string; corto: string; tono: string; lateral?: boolean }> = [
  { id: "solicitado",    label: "Solicitado",     corto: "Solicitado",  tono: "bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/30" },
  { id: "aprobado",      label: "Aprobado",       corto: "Aprobado",    tono: "bg-violet-500/15 text-violet-600 dark:text-violet-400 border-violet-500/30" },
  { id: "en_produccion", label: "En producción",  corto: "Producción",  tono: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30" },
  { id: "listo",         label: "Listo",          corto: "Listo",       tono: "bg-teal-500/15 text-teal-600 dark:text-teal-400 border-teal-500/30" },
  { id: "entregado",     label: "Entregado",      corto: "Entregado",   tono: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30" },
  { id: "denegado",      label: "Denegado",       corto: "Denegado",    tono: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30", lateral: true },
  { id: "reembolsado",   label: "Reembolsado",    corto: "Reembolso",   tono: "bg-zinc-500/15 text-zinc-600 dark:text-zinc-300 border-zinc-500/30", lateral: true },
];
export const estadoDe = (id: Estado) => ESTADOS.find((e) => e.id === id) ?? ESTADOS[0];

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

export const TIPOS: Array<{ id: TipoContenido; label: string; emoji: string }> = [
  { id: "foto", label: "Foto", emoji: "📷" },
  { id: "video", label: "Video", emoji: "🎬" },
  { id: "audio", label: "Audio", emoji: "🎧" },
  { id: "articulo", label: "Artículo", emoji: "📦" },
];
export const tipoDe = (id: TipoContenido | null) => TIPOS.find((t) => t.id === id);

export const CANALES: Array<{ id: CanalVenta; label: string; ayuda: string }> = [
  { id: "normal", label: "Normal", ayuda: "Venta en el chat, sin dinámica especial." },
  { id: "buster", label: "Hora Buster", ayuda: "Vendido durante una hora Buster (objetivo del equipo)." },
];

export const AGENCIAS: Array<{ id: Agency; label: string; tono: string }> = [
  { id: "plus", label: "Plus", tono: "bg-fuchsia-500/15 text-fuchsia-600 dark:text-fuchsia-400 border-fuchsia-500/30" },
  { id: "massive", label: "Massive", tono: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30" },
];
export const agenciaDe = (id: Agency) => AGENCIAS.find((a) => a.id === id) ?? AGENCIAS[0];

// Los "amarillos" del sheet, como banderas tipadas.
export const FLAGS: Array<{ id: string; label: string }> = [
  { id: "vendido_antes", label: "Se vendió antes de llegar a la agencia" },
  { id: "cambio_contenido", label: "Se cambió el contenido" },
  { id: "fan_conflictivo", label: "Fan conflictivo / inconforme" },
  { id: "pago_parcial", label: "Pago parcial (debe saldo)" },
  { id: "entregado_al_user", label: "Entregado directo al fan" },
  { id: "urgente", label: "Urgente" },
  { id: "revisar_monto", label: "Monto por revisar (venía imposible del sheet)" },
];
export const flagDe = (id: string) => FLAGS.find((f) => f.id === id)?.label ?? id;

export const usd = (n: number | null | undefined) =>
  n == null ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
