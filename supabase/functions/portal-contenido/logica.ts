// portal-contenido — la lógica, sin red ni Deno.serve, para poder probarla con
// dobles (logica.test.ts). index.ts le pasa los puertos de verdad.
//
// LA CARPETA DE CONTENIDO DE LA CREADORA, desde su portal. Es una unidad del
// Drive de su agencia (20261006120000_portal_contenido.sql): los archivos van al
// NAS como cualquier otro del Drive, con el mismo permiso firmado.
//
// Ella no es de la agencia, así que no pasa por la RLS del Drive: todo esto corre
// con service_role, y SOLO después de comprobar:
//   · que la sesión es de una cuenta de creadora;
//   · que la ficha (creator_id) es suya (creadora_cuentas);
//   · que lo que toca es de SU carpeta (unidad_id = su carpeta, o la carpeta misma),
//     de su agencia y no está en la papelera.
// Borrar: solo lo que subió ella, y solo hasta 24 horas después (para arreglar
// un error). Pasado eso el archivo es de la agencia: se lo pide a su manager.
// Una carpeta, solo si es suya y está vacía.

import { extensionParaMiniatura, idsParaMiniaturas, venceMiniatura } from "../drive/logica.ts";

export const ACCIONES = [
  "raiz", "listar", "crear_carpeta", "renombrar", "borrar", "subir_iniciar", "subir_confirmar", "abrir", "miniaturas",
] as const;
export type Accion = typeof ACCIONES[number];

/** Lo que se puede borrar después de subirlo: 24 horas. */
export const HORAS_PARA_BORRAR = 24;

/** Partes más chicas que las del Drive (32 MB): la puerta al NAS corta cada
 *  pedido a los ~60 s, y desde un celular se sube a 2–5 Mbps. 8 MB a 2 Mbps son
 *  ~32 s. Más pedidos, pero cada uno entra y se reintenta solo si se corta. */
export const TAMANO_PARTE = 8 * 1024 * 1024;
/** Tope por archivo desde el portal: 1.280 partes firmadas en una respuesta. */
export const MAX_ARCHIVO = 10 * 1024 * 1024 * 1024;

export interface Ficha {
  creator_id: string;
  tenant_id: string;
  nombre: string;
}

export interface Item {
  id: string;
  tenant_id: string;
  parent_id: string | null;
  unidad_id: string | null;
  owner_id: string | null;
  tipo: "carpeta" | "archivo";
  nombre: string;
  mime: string | null;
  size: number | null;
  estado: "subiendo" | "listo";
  storage_key: string | null;
  created_at: string;
  updated_at: string;
  trashed_at: string | null;
}

/** Lo que ve ella de cada cosa (sin la ruta física del NAS). */
export interface ItemVisible {
  id: string;
  tipo: "carpeta" | "archivo";
  nombre: string;
  mime: string | null;
  size: number | null;
  estado: "subiendo" | "listo";
  created_at: string;
  updated_at: string;
  mio: boolean;
  se_puede_borrar: boolean;
}

export type Raices = { ok: boolean; libre?: number; total?: number }[];

export interface Puertos {
  /** La cuenta del token (y si es de creadora), o null si no es una sesión válida. */
  persona(token: string): Promise<{ id: string; esCreadora: boolean } | null>;
  // Con service_role, SOLO después de las comprobaciones:
  /** Su ficha en esa agencia (creadora_cuentas + creators), o null si no es suya. */
  fichaDe(userId: string, creatorId: string): Promise<Ficha | null>;
  /** La carpeta de esa creadora; la crea si no existe (la primera vez). */
  carpetaDe(ficha: Ficha): Promise<string>;
  item(id: string): Promise<Item | null>;
  /** Varios a la vez (las miniaturas de una página). */
  itemsPorId(ids: string[]): Promise<Item[]>;
  /** Lo de adentro de una carpeta, sin lo que está en la papelera. */
  hijos(carpetaId: string): Promise<Item[]>;
  tieneHijos(carpetaId: string): Promise<boolean>;
  insertar(fila: Omit<Item, "unidad_id" | "created_at" | "updated_at" | "trashed_at">): Promise<{ error: string | null }>;
  renombrar(id: string, nombre: string): Promise<{ error: string | null }>;
  borrarFila(id: string): Promise<void>;
  confirmar(id: string, size: number, sha256: string): Promise<void>;
  /** El espacio de la agencia (unidades): usado y tope (null = sin tope). */
  espacio(tenantId: string): Promise<{ usado: number; cupo: number | null }>;
  /** /salud del NAS, o null si no contesta. */
  saludNas(): Promise<Raices | null>;
  /** Un permiso firmado del NAS (la URL entera). Vence en `segundos`, salvo que
   *  `datos.e` ya diga cuándo (las miniaturas vencen en tramos fijos). */
  permiso(datos: Record<string, unknown>, segundos: number): Promise<string>;
  /** El recibo que firmó el NAS al terminar, o null si no es válido. */
  verificarRecibo(recibo: string): Promise<Record<string, unknown> | null>;
  /** Borrar en el NAS. true si se borró o no estaba. */
  borrarEnNas(storageKey: string): Promise<boolean>;
  uuid(): string;
  ahora(): number;
}

export interface Respuesta {
  status: number;
  body: Record<string, unknown>;
}
const r = (status: number, body: Record<string, unknown>): Respuesta => ({ status, body });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const esUuid = (x: unknown): x is string => typeof x === "string" && UUID.test(x);

// Los mismos vencimientos que la edge del Drive (_shared/drive-firma.ts VENCE).
export const VENCE_SUBIR = 12 * 3600;
export const VENCE_BAJAR = 6 * 3600;
export const VENCE_BORRAR = 300;

/** Un nombre de archivo o carpeta: 1–255, sin «/» ni «\», sin espacios al borde. */
export function nombreValido(x: unknown): string | null {
  if (typeof x !== "string") return null;
  const n = x.trim().replace(/[\u0000-\u001f\u007f]/g, "");
  if (!n || n.length > 255 || /[\\/]/.test(n) || n === "." || n === "..") return null;
  return n;
}

/** Las partes de una subida (como planDeSubida de la edge del Drive, con partes de 8 MB). */
export function partesDe(size: number): number {
  return size > TAMANO_PARTE ? Math.ceil(size / TAMANO_PARTE) : 0;
}

/** ¿Es de su carpeta? La carpeta misma, o algo de adentro (unidad_id), de su agencia y no en la papelera. */
export function esDeSuCarpeta(i: Item | null, carpeta: string, tenant: string): i is Item {
  return !!i && i.tenant_id === tenant && !i.trashed_at && (i.id === carpeta || i.unidad_id === carpeta);
}

export function sePuedeBorrar(i: Item, yo: string, carpeta: string, ahora: number): boolean {
  if (i.id === carpeta || i.owner_id !== yo) return false;
  if (i.tipo === "carpeta") return true; // vacía: se mira al borrar
  if (i.estado === "subiendo") return true; // una subida que quedó a medias
  return ahora - new Date(i.created_at).getTime() <= HORAS_PARA_BORRAR * 3600 * 1000;
}

function visible(i: Item, yo: string, carpeta: string, ahora: number): ItemVisible {
  return {
    id: i.id, tipo: i.tipo, nombre: i.nombre, mime: i.mime, size: i.size, estado: i.estado,
    created_at: i.created_at, updated_at: i.updated_at,
    mio: i.owner_id === yo, se_puede_borrar: sePuedeBorrar(i, yo, carpeta, ahora),
  };
}

/** ¿Hay lugar en algún disco? 5% libre siempre; por partes, el doble (se juntan al final). */
export function hayLugar(raices: Raices, size: number, porPartes: boolean): boolean {
  const hace = porPartes ? size * 2 : size;
  return raices.some((x) => x.ok && typeof x.libre === "number" && typeof x.total === "number" && x.libre - hace >= x.total * 0.05);
}

export async function manejar(token: string, body: Record<string, unknown>, p: Puertos): Promise<Respuesta> {
  if (!token) return r(401, { error: "sin_sesion" });
  const yo = await p.persona(token);
  if (!yo) return r(401, { error: "sin_sesion" });
  if (!yo.esCreadora) return r(403, { error: "solo_creadoras" });

  const accion = body.accion as Accion;
  if (!ACCIONES.includes(accion)) return r(400, { error: "accion_desconocida" });
  if (!esUuid(body.creator_id)) return r(400, { error: "creator_id_invalido" });
  const ficha = await p.fichaDe(yo.id, body.creator_id);
  if (!ficha) return r(403, { error: "no_es_tu_ficha" });
  const carpeta = await p.carpetaDe(ficha);
  const ahora = p.ahora();

  // Una carpeta de las suyas (por defecto, la de arriba).
  const carpetaPedida = async (campo: string): Promise<Item | null> => {
    const id = body[campo] == null || body[campo] === "" ? carpeta : body[campo];
    if (!esUuid(id)) return null;
    const i = await p.item(id);
    return esDeSuCarpeta(i, carpeta, ficha.tenant_id) && i.tipo === "carpeta" ? i : null;
  };
  const suyo = async (campo: string): Promise<Item | null> => {
    if (!esUuid(body[campo])) return null;
    const i = await p.item(body[campo] as string);
    return esDeSuCarpeta(i, carpeta, ficha.tenant_id) ? i : null;
  };

  if (accion === "raiz") return r(200, { raiz: carpeta });

  if (accion === "listar") {
    const c = await carpetaPedida("carpeta");
    if (!c) return r(404, { error: "no_existe" });
    // El camino desde la de arriba (para las migas).
    const ruta: { id: string; nombre: string }[] = [];
    let actual: Item | null = c;
    for (let n = 0; actual && n < 50; n++) {
      ruta.unshift({ id: actual.id, nombre: actual.id === carpeta ? "" : actual.nombre });
      if (actual.id === carpeta || !actual.parent_id) break;
      actual = await p.item(actual.parent_id);
      if (!esDeSuCarpeta(actual, carpeta, ficha.tenant_id)) break;
    }
    // Lo que está subiendo solo se ve si lo sube ella (lo de otra subida no está listo).
    const items = (await p.hijos(c.id))
      .filter((i) => i.estado === "listo" || i.owner_id === yo.id)
      .map((i) => visible(i, yo.id, carpeta, ahora));
    return r(200, { carpeta: c.id, raiz: carpeta, ruta, items });
  }

  if (accion === "crear_carpeta") {
    const c = await carpetaPedida("carpeta");
    if (!c) return r(404, { error: "no_existe" });
    const nombre = nombreValido(body.nombre);
    if (!nombre) return r(400, { error: "nombre_invalido" });
    const id = p.uuid();
    const res = await p.insertar({
      id, tenant_id: ficha.tenant_id, owner_id: yo.id, parent_id: c.id, tipo: "carpeta", nombre,
      mime: null, size: null, estado: "listo", storage_key: null,
    });
    if (res.error) return r(400, { error: "no_se_creo" });
    return r(200, { id });
  }

  if (accion === "renombrar") {
    const i = await suyo("id");
    if (!i || i.id === carpeta) return r(404, { error: "no_existe" });
    const nombre = nombreValido(body.nombre);
    if (!nombre) return r(400, { error: "nombre_invalido" });
    const res = await p.renombrar(i.id, nombre);
    if (res.error) return r(400, { error: "no_se_renombro" });
    return r(200, { ok: true });
  }

  if (accion === "borrar") {
    const i = await suyo("id");
    if (!i || i.id === carpeta) return r(404, { error: "no_existe" });
    if (!sePuedeBorrar(i, yo.id, carpeta, ahora)) return r(403, { error: "ya_no_se_borra" });
    if (i.tipo === "carpeta") {
      if (await p.tieneHijos(i.id)) return r(409, { error: "carpeta_con_cosas" });
      await p.borrarFila(i.id);
      return r(200, { ok: true });
    }
    // ⚠️ PRIMERO el NAS, después la ficha (como la edge del Drive): al revés, si
    // el NAS no contesta queda un archivo que nadie ve ocupando lugar.
    if (i.storage_key && !(await p.borrarEnNas(i.storage_key))) return r(502, { error: "nas_no_borro" });
    await p.borrarFila(i.id);
    return r(200, { ok: true });
  }

  if (accion === "subir_iniciar") {
    const c = await carpetaPedida("carpeta");
    if (!c) return r(404, { error: "no_existe" });
    const nombre = nombreValido(body.nombre);
    if (!nombre) return r(400, { error: "nombre_invalido" });
    const size = Number(body.size);
    if (!Number.isInteger(size) || size <= 0) return r(400, { error: "tamano_invalido" });
    if (size > MAX_ARCHIVO) return r(413, { error: "demasiado_grande" });
    const { usado, cupo } = await p.espacio(ficha.tenant_id);
    if (cupo != null && usado + size > cupo) return r(507, { error: "sin_espacio_en_la_agencia" });
    const raices = await p.saludNas();
    if (!raices) return r(503, { error: "nas_no_responde" });
    const partes = partesDe(size);
    if (!hayLugar(raices, size, partes > 0)) return r(507, { error: "nas_sin_lugar" });

    const id = p.uuid();
    // ⚠️ La agencia va en la RUTA física del NAS, como en el Drive.
    const storageKey = `${ficha.tenant_id}/${id}`;
    const mime = typeof body.mime === "string" && body.mime.length > 0 && body.mime.length < 200 ? body.mime : "application/octet-stream";
    const res = await p.insertar({
      id, tenant_id: ficha.tenant_id, owner_id: yo.id, parent_id: c.id, tipo: "archivo", nombre, mime,
      size, estado: "subiendo", storage_key: storageKey,
    });
    if (res.error) return r(400, { error: "no_se_creo" });
    if (partes === 0) return r(200, { id, url: await p.permiso({ op: "put", k: storageKey, max: size }, VENCE_SUBIR) });
    const up = p.uuid();
    const urls: string[] = [];
    for (let n = 0; n < partes; n++) {
      // `total`: la primera parte elige disco para el archivo entero.
      urls.push(await p.permiso({ op: "parte", k: storageKey, up, i: n, max: TAMANO_PARTE, total: size }, VENCE_SUBIR));
    }
    return r(200, {
      id, tamano_parte: TAMANO_PARTE, partes: urls,
      completar: await p.permiso({ op: "completar", k: storageKey, up, n: partes, max: size }, VENCE_SUBIR),
    });
  }

  if (accion === "subir_confirmar") {
    const i = await suyo("id");
    if (!i || i.tipo !== "archivo" || i.owner_id !== yo.id || i.estado !== "subiendo") return r(404, { error: "sin_subida" });
    // El recibo lo firma el NAS al terminar de escribir: prueba que el archivo
    // LLEGÓ, con su tamaño y su huella.
    const rec = await p.verificarRecibo(String(body.recibo ?? ""));
    if (!rec || rec.op !== "recibo" || rec.k !== i.storage_key) return r(400, { error: "recibo_invalido" });
    const size = Number(rec.size);
    if (!Number.isFinite(size) || size > Number(i.size)) return r(400, { error: "tamano_no_coincide" });
    await p.confirmar(i.id, size, String(rec.sha256));
    return r(200, { ok: true, size });
  }

  if (accion === "abrir") {
    const i = await suyo("id");
    if (!i || i.tipo !== "archivo" || !i.storage_key) return r(404, { error: "no_existe" });
    if (i.estado !== "listo") return r(409, { error: "todavia_subiendo" });
    const url = await p.permiso(
      { op: "get", k: i.storage_key, ct: i.mime ?? "application/octet-stream", n: i.nombre, dl: !!body.descargar },
      VENCE_BAJAR,
    );
    return r(200, { url });
  }

  // miniaturas
  let ids: string[];
  try {
    ids = idsParaMiniaturas(body.ids);
  } catch {
    return r(400, { error: "ids_invalidos" });
  }
  const e = venceMiniatura(ahora);
  const urls: Record<string, string> = {};
  for (const i of ids.length ? await p.itemsPorId(ids) : []) {
    if (!esDeSuCarpeta(i, carpeta, ficha.tenant_id) || i.tipo !== "archivo" || i.estado !== "listo" || !i.storage_key) continue;
    const x = extensionParaMiniatura(i.nombre, i.mime);
    if (x) urls[i.id] = await p.permiso({ op: "mini", k: i.storage_key, x, e }, 0);
  }
  return r(200, { urls });
}
