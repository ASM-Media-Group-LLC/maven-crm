// /contenido/subidas — lo PURO (sin base): rutas, validación y respuestas.
// Ver ./contenido.ts. Alvaro, 17/11/2026: Backstage sube los personalizados y
// quedan en Maven «como si los hubieran subido acá» (un espejo): en la carpeta
// de la modelo, dentro de «Personalizados», en la carpeta del día.

export type RutaDeContenido =
  | { ok: true; accion: "crear" | "listo" | "ver" | "pedido_crear" | "pedido_lista" | "pedido_ver"; id: string | null }
  | { ok: false; estado: 404 | 405; permitidos?: string[] };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** POST /contenido/subidas · POST /contenido/subidas/:id/listo · GET /contenido/subidas/:id
 *  POST /contenido/pedidos · GET /contenido/pedidos · GET /contenido/pedidos/:id (18/11/2026) */
export function rutaDeContenido(metodo: string, ruta: string[]): RutaDeContenido {
  if (ruta[0] === "pedidos") {
    if (ruta.length === 1) {
      if (metodo === "POST") return { ok: true, accion: "pedido_crear", id: null };
      if (metodo === "GET") return { ok: true, accion: "pedido_lista", id: null };
      return { ok: false, estado: 405, permitidos: ["GET", "POST"] };
    }
    if (ruta.length === 2 && UUID.test(ruta[1] ?? "")) {
      return metodo === "GET" ? { ok: true, accion: "pedido_ver", id: ruta[1].toLowerCase() } : { ok: false, estado: 405, permitidos: ["GET"] };
    }
    return { ok: false, estado: 404 };
  }
  if (ruta[0] !== "subidas") return { ok: false, estado: 404 };
  if (ruta.length === 1) return metodo === "POST" ? { ok: true, accion: "crear", id: null } : { ok: false, estado: 405, permitidos: ["POST"] };
  if (!UUID.test(ruta[1] ?? "")) return { ok: false, estado: 404 };
  if (ruta.length === 2) return metodo === "GET" ? { ok: true, accion: "ver", id: ruta[1] } : { ok: false, estado: 405, permitidos: ["GET"] };
  if (ruta.length === 3 && ruta[2] === "listo") {
    return metodo === "POST" ? { ok: true, accion: "listo", id: ruta[1] } : { ok: false, estado: 405, permitidos: ["POST"] };
  }
  return { ok: false, estado: 404 };
}

/** 50 GB: el mismo tope del link de la modelo. */
export const TAMANO_MAXIMO = 50 * 1024 * 1024 * 1024;
export const CARPETA_PERSONALIZADOS = "Personalizados";

/** La carpeta del día en Bogotá («2026-11-18»), igual que drive-aporte/logica.ts
 *  (copia a propósito: public-api no importa de otras funciones). */
export function nombreDelDia(ahora: Date = new Date()): string {
  return ahora.toLocaleDateString("sv-SE", { timeZone: "America/Bogota" });
}

export type PedidoDeSubida =
  | { ok: true; creadora: { id: string } | { email: string }; nombre: string; tamano: number | null; mime: string | null }
  | { ok: false; campo: string; problema: string };

/** El cuerpo de POST /contenido/subidas. «creadora»: el id de /creators o su correo. */
export function leerPedidoDeSubida(c: Record<string, unknown>): PedidoDeSubida {
  const cr = typeof c.creadora === "string" ? c.creadora.trim() : "";
  if (!cr) return { ok: false, campo: "creadora", problema: "obligatorio: el id de la modelo (de /creators) o su correo" };
  let creadora: { id: string } | { email: string };
  if (UUID.test(cr)) creadora = { id: cr.toLowerCase() };
  else if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cr) && cr.length <= 254) creadora = { email: cr.toLowerCase() };
  else return { ok: false, campo: "creadora", problema: "no es un id ni un correo" };

  const nombreCrudo = typeof c.nombre_archivo === "string" ? c.nombre_archivo.trim() : "";
  if (!nombreCrudo) return { ok: false, campo: "nombre_archivo", problema: "obligatorio" };
  if (nombreCrudo.length > 300) return { ok: false, campo: "nombre_archivo", problema: "máximo 300 caracteres" };

  let tamano: number | null = null;
  if (c.tamano !== undefined && c.tamano !== null) {
    if (typeof c.tamano !== "number" || !Number.isInteger(c.tamano) || c.tamano <= 0) {
      return { ok: false, campo: "tamano", problema: "debe ser un entero de bytes mayor que 0" };
    }
    if (c.tamano > TAMANO_MAXIMO) return { ok: false, campo: "tamano", problema: "máximo 50 GB por archivo" };
    tamano = c.tamano;
  }
  const mime = typeof c.tipo === "string" && /^[\w.+-]+\/[\w.+-]+$/.test(c.tipo) ? c.tipo : null;
  return { ok: true, creadora, nombre: nombreCrudo, tamano, mime };
}

/** Clave segura para el storage (sin acentos ni caracteres raros). */
export function claveSegura(nombre: string): string {
  const base = (nombre || "archivo")
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/[^\w.\- ]+/g, "").trim().slice(0, 120) || "archivo";
  return base.replace(/\s+/g, "_");
}

/** Dónde queda el archivo en el balde mientras llega. Sin el token del link de
 *  la modelo: ese token abre toda su carpeta y no sale de Maven. */
export const rutaEnElBalde = (subidaId: string, nombre: string) => `api/${subidaId}/${claveSegura(nombre)}`;

/** El estado que ve Backstage: esperando_archivo → procesando → listo (o error). */
export type EstadoPublico = "esperando_archivo" | "procesando" | "listo" | "error";
export function estadoPublico(fila: { estado: string }, aporte: { en_nas: boolean; estado: string } | null): EstadoPublico {
  if (fila.estado === "error") return "error";
  if (fila.estado === "esperando_archivo") return "esperando_archivo";
  if (aporte?.en_nas) return "listo";
  if (aporte && /error|fall/i.test(aporte.estado)) return "error";
  return "procesando";
}

export interface FilaDeSubida {
  id: string; creator_id: string; nombre_archivo: string; size: number | null; estado: string;
  error: string | null; created_at: string; confirmado_at: string | null; carpeta: string | null;
}

export function respuestaDeSubida(f: FilaDeSubida, creadora: { id: string; nombre: string | null }, estado: EstadoPublico, driveItemId: string | null) {
  return {
    object: "subida",
    id: f.id,
    estado,
    creadora,
    nombre_archivo: f.nombre_archivo,
    tamano: f.size,
    carpeta: f.carpeta,
    drive_item_id: driveItemId,
    error: estado === "error" ? f.error : null,
    creado: f.created_at,
    confirmado: f.confirmado_at,
  };
}
