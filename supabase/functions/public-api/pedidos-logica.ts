// /contenido/pedidos — lo PURO (sin base): validación, estado y respuestas.
// Ver ./pedidos.ts. Alvaro, 18/11/2026: Backstage crea el pedido, la modelo
// sube en Maven por el link del pedido y Backstage solo mira el estado.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const TIPOS = ["foto", "video", "audio"] as const;

export type CuerpoDePedido =
  | {
    ok: true;
    referencia: string;
    creadora: { id: string } | { email: string };
    queGrabar: string;
    fechaLimite: string;
    tipo: (typeof TIPOS)[number] | null;
    duracion: string | null;
    fan: string | null;
  }
  | { ok: false; campo: string; problema: string };

const texto = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** Una fecha real (2026-02-30 no pasa). */
function fechaValida(f: string): boolean {
  if (!FECHA.test(f)) return false;
  const d = new Date(`${f}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === f;
}

/** El cuerpo de POST /contenido/pedidos. */
export function leerPedido(c: Record<string, unknown>): CuerpoDePedido {
  const referencia = texto(c.referencia);
  if (!referencia) return { ok: false, campo: "referencia", problema: "obligatorio: el número del pedido en tu plataforma" };
  if (referencia.length > 120) return { ok: false, campo: "referencia", problema: "máximo 120 caracteres" };

  const cr = texto(c.creadora);
  if (!cr) return { ok: false, campo: "creadora", problema: "obligatorio: el id de la modelo (de /creators) o su correo" };
  let creadora: { id: string } | { email: string };
  if (UUID.test(cr)) creadora = { id: cr.toLowerCase() };
  else if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cr) && cr.length <= 254) creadora = { email: cr.toLowerCase() };
  else return { ok: false, campo: "creadora", problema: "no es un id ni un correo" };

  const queGrabar = texto(c.que_grabar);
  if (!queGrabar) return { ok: false, campo: "que_grabar", problema: "obligatorio: qué tiene que grabar la modelo" };
  if (queGrabar.length > 4000) return { ok: false, campo: "que_grabar", problema: "máximo 4000 caracteres" };

  const fechaLimite = texto(c.fecha_limite);
  if (!fechaLimite) return { ok: false, campo: "fecha_limite", problema: "obligatorio: AAAA-MM-DD" };
  if (!fechaValida(fechaLimite)) return { ok: false, campo: "fecha_limite", problema: "debe ser una fecha AAAA-MM-DD" };

  let tipo: (typeof TIPOS)[number] | null = null;
  if (c.tipo !== undefined && c.tipo !== null) {
    const t = texto(c.tipo).toLowerCase();
    if (!(TIPOS as readonly string[]).includes(t)) return { ok: false, campo: "tipo", problema: "foto, video o audio" };
    tipo = t as (typeof TIPOS)[number];
  }
  const duracion = texto(c.duracion) || null;
  if (duracion && duracion.length > 120) return { ok: false, campo: "duracion", problema: "máximo 120 caracteres" };
  const fan = texto(c.fan) || null;
  if (fan && fan.length > 120) return { ok: false, campo: "fan", problema: "máximo 120 caracteres" };

  return { ok: true, referencia, creadora, queGrabar, fechaLimite, tipo, duracion, fan };
}

/** El nombre de la carpeta del pedido dentro de «Personalizados». */
export function carpetaDelPedido(referencia: string): string {
  const limpia = referencia.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "-").trim().slice(0, 100) || "sin-numero";
  return `Pedido ${limpia}`;
}

/** El link que se le manda a la modelo. */
export const linkDelPedido = (base: string, token: string) => `${base.replace(/\/+$/, "")}/aportar/${token}`;

/** Lo que ve Backstage:
 *  esperando  → todavía no subió nada
 *  subido     → ya hay al menos un archivo (aunque se siga procesando)
 *  no_puede   → la modelo dijo que no puede hacerlo
 *  cancelado  → el equipo de Maven lo canceló */
export type EstadoDePedido = "esperando" | "subido" | "no_puede" | "cancelado";
export function estadoDePedido(status: string, archivos: number): EstadoDePedido {
  if (status === "denegado" || status === "reembolsado") return "cancelado";
  if (status === "no_puede") return "no_puede";
  return archivos > 0 ? "subido" : "esperando";
}

/** «cambiados_desde» y «limite» de GET /contenido/pedidos. */
export type ConsultaDeLista =
  | { ok: true; desde: string | null; limite: number }
  | { ok: false; campo: string; problema: string };
export function leerConsultaDeLista(q: URLSearchParams): ConsultaDeLista {
  const d = q.get("cambiados_desde");
  let desde: string | null = null;
  if (d) {
    const t = new Date(d);
    if (Number.isNaN(t.getTime())) return { ok: false, campo: "cambiados_desde", problema: "debe ser una fecha ISO 8601" };
    desde = t.toISOString();
  }
  const l = q.get("limite");
  let limite = 50;
  if (l !== null) {
    const n = Number(l);
    if (!Number.isInteger(n) || n < 1 || n > 200) return { ok: false, campo: "limite", problema: "entero entre 1 y 200" };
    limite = n;
  }
  return { ok: true, desde, limite };
}

/** Las extensiones que el NAS sabe miniaturizar (fotos y videos). Copia corta de
 *  drive/logica.ts → EXTENSIONES_CON_MINIATURA: public-api no importa de otras
 *  funciones. */
const CON_MINIATURA = new Set(["jpg", "jpeg", "png", "gif", "webp", "heic", "heif", "tif", "tiff", "bmp", "mov", "mp4", "m4v"]);
const MINI_POR_MIME: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif", "image/webp": "webp", "image/heic": "heic",
  "image/heif": "heif", "video/quicktime": "mov", "video/mp4": "mp4", "video/x-m4v": "m4v",
};
export function extensionDeMiniatura(nombre: string, mime: string | null): string | null {
  const ext = nombre.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "";
  if (CON_MINIATURA.has(ext)) return ext;
  return MINI_POR_MIME[(mime ?? "").split(";")[0].trim().toLowerCase()] ?? null;
}

export interface ArchivoDelPedido {
  id: string;
  nombre: string;
  tipo: string | null;
  tamano: number | null;
  subido: string;
  /** Ya está en el Drive (NAS) y se puede ver. Mientras, «procesando». */
  listo: boolean;
  miniatura: string | null;
  ver: string | null;
  vence: string | null;
}

export interface FilaDePedido {
  request_id: string;
  referencia: string;
  creator_id: string;
  link_token: string;
  subido_at: string | null;
  actualizado: string;
  created_at: string;
}

export function respuestaDePedido(
  p: FilaDePedido,
  extra: {
    base: string;
    creadora: { id: string; nombre: string | null };
    status: string;
    queGrabar: string;
    fechaLimite: string | null;
    motivo: string | null;
    archivos: ArchivoDelPedido[];
  },
) {
  return {
    object: "pedido",
    id: p.request_id,
    referencia: p.referencia,
    estado: estadoDePedido(extra.status, extra.archivos.length),
    creadora: extra.creadora,
    que_grabar: extra.queGrabar,
    fecha_limite: extra.fechaLimite,
    link: linkDelPedido(extra.base, p.link_token),
    subido: p.subido_at,
    motivo_no_puede: extra.status === "no_puede" ? extra.motivo : null,
    archivos: extra.archivos,
    creado: p.created_at,
    actualizado: p.actualizado,
  };
}
