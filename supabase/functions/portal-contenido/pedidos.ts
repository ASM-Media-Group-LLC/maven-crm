// LOS PERSONALIZADOS DE LA CREADORA, desde su portal (fase 3; decisiones de Jhon,
// 06/10/2026). La base: 20261009100000_portal_pedidos.sql (portal_pedido()).
//
// Ella ve sus pedidos apenas el chatter los crea y desde acá: «Lo empiezo»,
// «Subir entrega» (a SU Drive, carpeta «Personalizados») y «No puedo hacerlo»
// (con motivo). Las reglas de qué se puede y cuándo las aplica la base; acá:
//   · qué ve de cada pedido (el fan, el precio, la descripción, las fechas y los
//     archivos; NO lo que pagó el fan en total, lo cobrado, las notas internas ni
//     quién lo vendió);
//   · su carpeta «Personalizados» (la busca o la crea);
//   · abrir las referencias que subió el equipo (bucket custom-requests).
//
// Corre DESPUÉS de las comprobaciones de logica.ts: la sesión es de creadora, la
// ficha es suya y `carpeta` es su carpeta.

export const ACCIONES_PEDIDOS = [
  "pedidos", "pedido_carpeta", "pedido_empezar", "pedido_no_puede", "pedido_entregar", "pedido_referencia",
] as const;
export type AccionPedido = typeof ACCIONES_PEDIDOS[number];

export const NOMBRE_CARPETA = "Personalizados";

/** Lo que trae la base de cada pedido (con service_role: se recorta acá). */
export interface FilaPedido {
  id: string;
  status: string;
  fan_handle: string;
  description: string;
  price_usd: number | null;
  content_type: string | null;
  duration_or_qty: string | null;
  requested_on: string | null;
  due_on: string | null;
  creadora_motivo: string | null;
  created_at: string;
  // Lo que NO viaja: se pide igual para poder probar que se recorta.
  fan_total_spent_usd?: number | null;
  paid_usd?: number | null;
  notes?: string | null;
  chatter_name?: string | null;
  custom_request_attachments?: FilaAdjunto[];
}

export interface FilaAdjunto {
  id: string;
  kind: "referencia" | "entrega";
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  drive_item_id: string | null;
  storage_path: string | null;
  created_at: string;
}

export interface ArchivoVisible {
  id: string;
  nombre: string;
  mime: string | null;
  size: number | null;
  /** Una entrega suya: el id del archivo en SU Drive (se abre con «abrir»). */
  drive_item_id?: string;
}

export interface PedidoVisible {
  id: string;
  estado: string;
  fan: string;
  descripcion: string;
  precio_usd: number | null;
  tipo: string | null;
  cantidad: string | null;
  pedido_el: string | null;
  para_el: string | null;
  motivo: string | null;
  creado: string;
  por_aprobar: boolean;
  se_puede_empezar: boolean;
  se_puede_entregar: boolean;
  se_puede_rechazar: boolean;
  referencias: ArchivoVisible[];
  entregas: ArchivoVisible[];
}

/** Las mismas reglas que portal_pedido(), para mostrar solo los botones que andan. */
export const SE_PUEDE = {
  empezar: (estado: string) => estado === "aprobado",
  entregar: (estado: string) => ["solicitado", "aprobado", "en_produccion", "listo"].includes(estado),
  rechazar: (estado: string) => ["solicitado", "aprobado", "en_produccion"].includes(estado),
};

/** Lo que ve ella de un pedido. Las entregas: solo las de su Drive (las que subió
 *  el equipo al bucket no son suyas). */
export function pedidoVisible(f: FilaPedido): PedidoVisible {
  const adj = f.custom_request_attachments ?? [];
  const archivo = (a: FilaAdjunto): ArchivoVisible => ({ id: a.id, nombre: a.file_name, mime: a.mime_type, size: a.size_bytes });
  return {
    id: f.id,
    estado: f.status,
    fan: f.fan_handle,
    descripcion: f.description,
    precio_usd: f.price_usd,
    tipo: f.content_type,
    cantidad: f.duration_or_qty,
    pedido_el: f.requested_on,
    para_el: f.due_on,
    motivo: f.creadora_motivo,
    creado: f.created_at,
    por_aprobar: f.status === "solicitado",
    se_puede_empezar: SE_PUEDE.empezar(f.status),
    se_puede_entregar: SE_PUEDE.entregar(f.status),
    se_puede_rechazar: SE_PUEDE.rechazar(f.status),
    referencias: adj.filter((a) => a.kind === "referencia" && a.storage_path).map(archivo),
    entregas: adj
      .filter((a) => a.kind === "entrega" && a.drive_item_id)
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map((a) => ({ ...archivo(a), drive_item_id: a.drive_item_id! })),
  };
}

/** Lo que falta hacer primero (por aprobar y en marcha, el que vence antes
 *  arriba) y después lo cerrado, lo más nuevo arriba. */
const ABIERTOS = new Set(["solicitado", "aprobado", "en_produccion"]);
export function ordenarPedidos(ps: PedidoVisible[]): PedidoVisible[] {
  const clave = (p: PedidoVisible) => p.para_el ?? "9999-12-31";
  return [
    ...ps.filter((p) => ABIERTOS.has(p.estado)).sort((a, b) => clave(a).localeCompare(clave(b)) || a.creado.localeCompare(b.creado)),
    ...ps.filter((p) => !ABIERTOS.has(p.estado)).sort((a, b) => b.creado.localeCompare(a.creado)),
  ];
}

/** El error de portal_pedido() como lo dice la pantalla (código, no frase: la
 *  pantalla lo traduce). */
export function statusDelError(error: string): number {
  if (error === "no_existe" || error === "no_es_tuyo") return 404;
  if (error === "falta_motivo" || error === "archivo_invalido" || error === "accion_desconocida") return 400;
  return 409; // por_aprobar, no_se_puede: el pedido no está en un estado que lo permita
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const esUuid = (x: unknown): x is string => typeof x === "string" && UUID.test(x);

/** El motivo de «No puedo hacerlo»: obligatorio, 5–1000 caracteres. */
export function motivoValido(x: unknown): string | null {
  if (typeof x !== "string") return null;
  const m = x.trim();
  return m.length >= 5 && m.length <= 1000 ? m : null;
}
