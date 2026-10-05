// Las reglas de la edge `drive` que no dependen de la red ni de la base:
// separadas para poder probarlas sin levantar el servidor.

/** Tope por archivo. Por partes de 32 MB, son 640 partes. */
export const MAX_ARCHIVO = 20 * 1024 * 1024 * 1024;
/** Cada parte es UN pedido HTTP, y tiene que entrar en la ventana del proxy:
 *  el Traefik de Dokploy (la puerta al NAS, 28/09) corta a los ~60 s. 32 MB a
 *  5 Mbps de subida son 51 s. Tiene que ser menor que MAX_POR_PEDIDO del NAS
 *  (95 MB). */
export const TAMANO_PARTE = 32 * 1024 * 1024;

export class HttpError extends Error {
  /** `datos`: lo que va además del mensaje en la respuesta (p. ej. `codigo`,
   *  para que la pantalla lo diga en el idioma de la persona). */
  constructor(message: string, public status = 400, public datos?: Record<string, unknown>) { super(message); }
}

/** Nombre de archivo sano: sin barras (serían carpetas), sin caracteres de
 *  control, y con largo razonable. Lo mismo exige la base. */
export function nombreValido(n: unknown): string {
  const s = typeof n === "string" ? n.trim() : "";
  if (!s || s.length > 255 || /[/\\\u0000-\u001f]/.test(s)) throw new HttpError("Nombre de archivo inválido");
  return s;
}

export function planDeSubida(size: number) {
  if (!Number.isFinite(size) || size <= 0) throw new HttpError("El archivo está vacío");
  if (size > MAX_ARCHIVO) throw new HttpError("El archivo pasa el tope de 20 GB");
  return size <= TAMANO_PARTE ? { partes: 0 } : { partes: Math.ceil(size / TAMANO_PARTE) };
}


// ── El índice diario ────────────────────────────────────────────────────────
// En el disco los archivos no tienen nombre ni carpeta (<agencia>/<id>): el
// árbol vive solo en la base. Sin copia de seguridad (decisión de Jhon), si se
// perdiera la base los archivos seguirían ahí pero nadie sabría cuál es cuál.
// El índice que la mini guarda cada noche en el mismo NAS es esa llave.

export interface FilaDeIndice {
  agencia_id: string;
  agencia: string;
  ruta: string;
  tipo: string;
  nombre: string;
  dueno: string;
  correo_dueno: string;
  tamano: number | null;
  sha256: string;
  estado: string;
  en_papelera: boolean;
  /** Dónde está en el disco: /Volumes/NASx/maven-drive/<esto>. */
  archivo_en_disco: string;
  creado: string;
  modificado: string;
  abierto_por_ultima_vez: string;
}

export interface ItemParaIndice {
  id: string;
  tenant_id: string;
  owner_id: string | null;
  parent_id: string | null;
  tipo: string;
  nombre: string;
  size: number | null;
  sha256: string | null;
  storage_key: string | null;
  estado: string;
  trashed_at: string | null;
  created_at: string;
  updated_at: string;
  last_opened_at: string | null;
}

/** Arma las filas del índice con la ruta legible de cada cosa
 *  («Contabilidad/2026/Balance.pdf»). Una madre que no está (no debería
 *  pasar) se marca como «(sin carpeta)» en vez de cortar la ruta en silencio;
 *  un ciclo (lo impide un trigger) no cuelga el armado. */
export function armarIndice(
  items: ItemParaIndice[],
  agencias: Map<string, string>,
  nombres: Map<string, string>,
  correos: Map<string, string>,
): FilaDeIndice[] {
  const porId = new Map(items.map((i) => [i.id, i]));
  const rutas = new Map<string, string>();
  const rutaDe = (i: ItemParaIndice): string => {
    const hecha = rutas.get(i.id);
    if (hecha !== undefined) return hecha;
    const partes: string[] = [];
    const vistos = new Set<string>();
    let actual: ItemParaIndice | undefined = i;
    while (actual && !vistos.has(actual.id) && partes.length < 60) {
      vistos.add(actual.id);
      partes.unshift(actual.nombre);
      if (!actual.parent_id) break;
      const madre = porId.get(actual.parent_id);
      if (!madre) { partes.unshift("(sin carpeta)"); break; }
      actual = madre;
    }
    const r = partes.join("/");
    rutas.set(i.id, r);
    return r;
  };
  return items
    .map((i) => ({
      agencia_id: i.tenant_id,
      agencia: agencias.get(i.tenant_id) ?? "",
      ruta: rutaDe(i),
      tipo: i.tipo,
      nombre: i.nombre,
      dueno: (i.owner_id && nombres.get(i.owner_id)) || "",
      correo_dueno: (i.owner_id && correos.get(i.owner_id)) || "",
      tamano: i.size,
      sha256: i.sha256 ?? "",
      estado: i.estado,
      en_papelera: !!i.trashed_at,
      archivo_en_disco: i.storage_key ?? "",
      creado: i.created_at,
      modificado: i.updated_at,
      abierto_por_ultima_vez: i.last_opened_at ?? "",
    }))
    .sort((a, b) => a.agencia_id.localeCompare(b.agencia_id) || a.ruta.localeCompare(b.ruta, "es"));
}

// ── Cupo y lugar ────────────────────────────────────────────────────────────

const GB = 1024 * 1024 * 1024;
export const legible = (b: number) =>
  b >= GB ? `${(b / GB).toFixed(b >= 10 * GB ? 0 : 1)} GB` : `${Math.max(1, Math.round(b / (1024 * 1024)))} MB`;

/** ¿Le alcanza el cupo? Cuenta la papelera y lo que se está subiendo (ya
 *  ocupan o reservaron su lugar en el NAS). */
export function chequearCupo(usado: number, cupo: number, size: number) {
  if (usado + size > cupo) {
    throw new HttpError(
      `No te alcanza el espacio: usas ${legible(usado)} de ${legible(cupo)} y este archivo pesa ${legible(size)}. ` +
        "Vacía la papelera o pídele a un admin más espacio.",
      413,
    );
  }
}

/** Lo mismo que exige el NAS (MARGEN_LIBRE de infra/nas-drive/server.mjs): el
 *  archivo tiene que entrar en ALGÚN disco dejando 5% libre. Por partes, dos
 *  veces el archivo (partes + archivo final conviven al juntarlas). */
/** El espacio común de la agencia (lo de adentro de una unidad compartida).
 *  cupo null = sin tope. */
export function chequearEspacioDeLaAgencia(usado: number, cupo: number | null, size: number) {
  if (cupo === null) return;
  if (usado + size > cupo) {
    throw new HttpError(
      `Las unidades compartidas de tu agencia no tienen espacio: usan ${legible(usado)} de ${legible(cupo)} y este archivo pesa ${legible(size)}. ` +
        "Vacía la papelera o pídele a un admin más espacio.",
      413,
    );
  }
}

export function hayLugarEnElNas(raices: { ok: boolean; libre?: number; total?: number }[], size: number, porPartes: boolean) {
  const necesita = porPartes ? size * 2 : size;
  return raices.some((r) => r.ok && typeof r.libre === "number" && typeof r.total === "number" && r.libre - necesita >= r.total * 0.05);
}

// ── Importar el archivo de Google (lo pide la MINI, con permiso firmado) ────
// Lo bajado de Google Drive al NAS entra al Drive de Maven SIN copiarse: la
// mini crea un enlace duro de cada archivo en <agencia>/google/<id> (el mismo
// disco, cero bytes de más) y manda acá las fichas en lotes. Sin dueño
// (decisión de Jhon, 01/10): es el archivo de la empresa, no cuenta en el cupo
// de nadie y lo administran los editores con los que se comparte.

export const TOPE_LOTE = 2000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** Un archivo del archivo puede pasar los 20 GB de una subida (videos crudos). */
const MAX_IMPORTADO = 5 * 1024 ** 4;

export interface FilaImportada {
  id: string;
  tenant_id: string;
  owner_id: null;
  parent_id: string | null;
  tipo: "carpeta" | "archivo";
  nombre: string;
  mime: string | null;
  size: number | null;
  storage_key: string | null;
  estado: "listo";
  created_at: string;
  /** La última modificación en Google (rclone la deja como fecha del archivo).
   *  El trigger la respeta solo al insertar desde la edge. */
  updated_at: string;
}
export interface CompartidoImportado { item_id: string; user_id: string; rol: "lector" | "editor" }

/** La ruta en el NAS de un archivo importado. La agencia va en el camino. */
export const claveImportada = (tenant: string, id: string) => `${tenant}/google/${id}`;

/** Valida un lote de la mini y lo deja listo para insertar. Todo o nada: una
 *  fila mala rechaza el lote entero (la mini lo reintenta corregido). */
export function validarLote(tenant: string, items: unknown, compartidos: unknown): { filas: FilaImportada[]; shares: CompartidoImportado[] } {
  if (!UUID.test(tenant)) throw new HttpError("Agencia inválida");
  const its = Array.isArray(items) ? items : [];
  const comps = Array.isArray(compartidos) ? compartidos : [];
  if (!its.length && !comps.length) throw new HttpError("Lote vacío");
  if (its.length > TOPE_LOTE || comps.length > TOPE_LOTE) throw new HttpError(`Hasta ${TOPE_LOTE} filas por lote`);
  const ahora = new Date().toISOString();
  const vistos = new Set<string>();
  const filas = its.map((x, n): FilaImportada => {
    const o = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
    const id = String(o.id ?? "");
    if (!UUID.test(id)) throw new HttpError(`Fila ${n}: id inválido`);
    if (vistos.has(id)) throw new HttpError(`Fila ${n}: id repetido en el lote`);
    vistos.add(id);
    const parent = o.parent_id == null ? null : String(o.parent_id);
    if (parent !== null && (!UUID.test(parent) || parent === id)) throw new HttpError(`Fila ${n}: carpeta madre inválida`);
    const tipo = o.tipo;
    if (tipo !== "carpeta" && tipo !== "archivo") throw new HttpError(`Fila ${n}: tipo inválido`);
    let nombre: string;
    try { nombre = nombreValido(o.nombre); } catch { throw new HttpError(`Fila ${n}: nombre inválido`); }
    const fecha = typeof o.created_at === "string" && !Number.isNaN(Date.parse(o.created_at)) ? new Date(o.created_at).toISOString() : ahora;
    if (tipo === "carpeta") {
      if (o.storage_key != null || o.size != null) throw new HttpError(`Fila ${n}: una carpeta no tiene archivo`);
      return { id, tenant_id: tenant, owner_id: null, parent_id: parent, tipo, nombre, mime: null, size: null, storage_key: null, estado: "listo", created_at: fecha, updated_at: fecha };
    }
    const size = Number(o.size);
    if (!Number.isSafeInteger(size) || size < 0 || size > MAX_IMPORTADO) throw new HttpError(`Fila ${n}: tamaño inválido`);
    // ⚠️ La ruta la fija la regla, no la mini: así un lote no puede apuntar una
    // ficha al archivo de otra agencia (ni a una subida normal de alguien).
    if (o.storage_key !== claveImportada(tenant, id)) throw new HttpError(`Fila ${n}: la ruta en el NAS no es la de un archivo importado`);
    const mime = typeof o.mime === "string" && o.mime.length > 0 && o.mime.length < 200 ? o.mime : "application/octet-stream";
    return { id, tenant_id: tenant, owner_id: null, parent_id: parent, tipo, nombre, mime, size, storage_key: claveImportada(tenant, id), estado: "listo", created_at: fecha, updated_at: fecha };
  });
  const shares = comps.map((x, n): CompartidoImportado => {
    const o = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
    const item = String(o.item_id ?? ""), user = String(o.user_id ?? "");
    if (!UUID.test(item) || !UUID.test(user)) throw new HttpError(`Compartido ${n}: ids inválidos`);
    if (o.rol !== "lector" && o.rol !== "editor") throw new HttpError(`Compartido ${n}: rol inválido`);
    return { item_id: item, user_id: user, rol: o.rol };
  });
  return { filas, shares };
}

/** Las carpetas madre que el lote nombra y no trae: tienen que existir ya. */
export function madresQueFaltanEnElLote(filas: FilaImportada[]): string[] {
  const carpetasDelLote = new Set(filas.filter((f) => f.tipo === "carpeta").map((f) => f.id));
  return [...new Set(filas.map((f) => f.parent_id).filter((p): p is string => !!p && !carpetasDelLote.has(p)))];
}

export interface UnidadImportada { item_id: string; tipo: "empresa" | "personal"; persona: string | null }

/** Las unidades que trae un lote de la mini: qué carpeta es una unidad
 *  compartida ('empresa') o la «Mi unidad» de Google de alguien ('personal').
 *  Que la carpeta sea sin dueño y de la agencia, y la persona también, lo
 *  revisan la edge y el trigger de drive_unidades. */
export function validarUnidades(unidades: unknown): UnidadImportada[] {
  const us = Array.isArray(unidades) ? unidades : [];
  if (us.length > TOPE_LOTE) throw new HttpError(`Máximo ${TOPE_LOTE} unidades por lote`);
  const vistas = new Set<string>();
  return us.map((x, n): UnidadImportada => {
    const o = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
    const item = String(o.item_id ?? "");
    if (!UUID.test(item)) throw new HttpError(`Unidad ${n}: id inválido`);
    if (vistas.has(item)) throw new HttpError(`Unidad ${n}: repetida`);
    vistas.add(item);
    if (o.tipo !== "empresa" && o.tipo !== "personal") throw new HttpError(`Unidad ${n}: tipo inválido`);
    const persona = o.persona == null ? null : String(o.persona);
    if (persona !== null && !UUID.test(persona)) throw new HttpError(`Unidad ${n}: persona inválida`);
    if (o.tipo === "empresa" && persona !== null) throw new HttpError(`Unidad ${n}: una unidad compartida no es de una persona`);
    return { item_id: item, tipo: o.tipo, persona };
  });
}

// ── Bajar varios en un .zip (acción bajar_varios) ───────────────────────────
// María Villegas, 02/10: como Google, elegir varios archivos y carpetas y bajar
// UN .zip. La edge arma la lista (qué entra lo decide la RLS de la persona) y
// el NAS (infra/nas-drive/zip.mjs) arma el .zip mientras baja.

/** Los mismos topes que el NAS (MAX_ENTRADAS_ZIP y MAX_BYTES_ZIP de
 *  infra/nas-drive/server.mjs): si la edge firmara más, el NAS lo rechazaría
 *  con un error que la persona no ve. */
export const TOPE_ZIP_ENTRADAS = 5000;
export const TOPE_ZIP_BYTES = 50 * 1024 ** 3;
/** El permiso viaja en el cuerpo de un formulario; el NAS acepta hasta 4 MB
 *  (MAX_PERMISO_ZIP). */
export const TOPE_ZIP_PERMISO = 4 * 1024 * 1024;
/** Más hondo que esto no baja (lo mismo que drive_mi_rol). */
export const PROFUNDIDAD_ZIP = 50;

export interface FichaZip {
  id: string;
  parent_id: string | null;
  tipo: "carpeta" | "archivo";
  nombre: string;
  size: number | null;
  storage_key: string | null;
  estado: string;
  trashed_at: string | null;
}
/** Una entrada del permiso: un archivo ({ k, n }) o una carpeta ({ n: "…/" }). */
export interface EntradaZip { k?: string; n: string }

const demasiados = () =>
  new HttpError(`Son más de ${TOPE_ZIP_ENTRADAS} archivos y carpetas para un solo .zip. Elige menos o baja las carpetas por separado.`, 413, {
    codigo: "zip_demasiados", tope: TOPE_ZIP_ENTRADAS,
  });
const muyGrande = () =>
  new HttpError(`Lo elegido pasa los ${legible(TOPE_ZIP_BYTES)} que puede tener un .zip. Elige menos o baja las carpetas por separado.`, 413, {
    codigo: "zip_muy_grande", tope: TOPE_ZIP_BYTES,
  });
const nadaListo = () =>
  new HttpError("No hay nada listo para bajar en lo que elegiste", 404, { codigo: "zip_vacio" });

/** Los ids elegidos: uuids, sin repetir, al menos uno y con tope. */
export function idsParaZip(ids: unknown): string[] {
  if (!Array.isArray(ids) || ids.length === 0) throw nadaListo();
  const unicos = [...new Set(ids.map(String))];
  if (unicos.some((id) => !UUID.test(id))) throw new HttpError("Hay un id inválido", 400);
  if (unicos.length > TOPE_ZIP_ENTRADAS) throw demasiados();
  return unicos;
}

/** Cuenta lo que va entrando y frena apenas se pasa: así una carpeta importada
 *  con 40 mil archivos no se lee entera para después decir que no. */
export class CuentaDelZip {
  entradas = 0;
  bytes = 0;
  sumar(f: Pick<FichaZip, "tipo" | "size">) {
    this.entradas++;
    if (f.tipo === "archivo") this.bytes += Number(f.size ?? 0);
    if (this.entradas > TOPE_ZIP_ENTRADAS) throw demasiados();
    if (this.bytes > TOPE_ZIP_BYTES) throw muyGrande();
  }
}

/** Lo que entra: no lo de la papelera, no lo que se está subiendo, y un
 *  archivo solo si tiene dónde estar en el NAS. */
export const entraEnElZip = (f: FichaZip) =>
  !f.trashed_at && f.estado === "listo" && (f.tipo === "carpeta" || !!f.storage_key);

/** Un nombre que se puede descomprimir en Windows, Mac y Linux: sin
 *  `<>:"|?*` ni caracteres de control, sin puntos ni espacios al final (Windows
 *  los borra) y nunca «.» o «..». La base ya prohíbe las barras. */
export function nombreParaElZip(nombre: string): string {
  let s = nombre.normalize("NFC").replace(/[<>:"|?*\\/\u0000-\u001f\u007f]/g, "_").replace(/[. ]+$/, "").trim();
  if (!s || s === "." || s === "..") s = "_";
  return s.slice(0, 200);
}

/** «Foto.jpg» → «Foto (2).jpg»; «Carpeta» → «Carpeta (2)». */
function conNumero(nombre: string, n: number, carpeta: boolean): string {
  const punto = carpeta ? -1 : nombre.lastIndexOf(".");
  return punto > 0 ? `${nombre.slice(0, punto)} (${n})${nombre.slice(punto)}` : `${nombre} (${n})`;
}

/** Carpetas primero y después por nombre, como en la pantalla. */
const enOrden = (a: FichaZip, b: FichaZip) =>
  a.tipo !== b.tipo ? (a.tipo === "carpeta" ? -1 : 1) : a.nombre.localeCompare(b.nombre, "es", { numeric: true });

/**
 * La lista del .zip: cada archivo con su ruta adentro («Contabilidad/2026/
 * Balance.pdf») y cada carpeta como «…/» (para que una vacía también llegue).
 * Dos cosas con el mismo nombre en la misma carpeta —o que solo cambian en
 * mayúsculas: en el Mac y en Windows son el mismo archivo— se vuelven
 * «nombre (2).ext». `hijos`: lo de adentro de cada carpeta (ya leído con la
 * RLS de la persona).
 */
export function armarListaDelZip(elegidos: FichaZip[], hijos: Map<string, FichaZip[]>): { l: EntradaZip[]; archivos: number; bytes: number } {
  const l: EntradaZip[] = [];
  let archivos = 0;
  let bytes = 0;
  const visitadas = new Set<string>();
  const agregar = (fichas: FichaZip[], base: string, nivel: number) => {
    const usados = new Set<string>();
    for (const f of fichas) {
      if (!entraEnElZip(f)) continue;
      const carpeta = f.tipo === "carpeta";
      if (carpeta && (visitadas.has(f.id) || nivel > PROFUNDIDAD_ZIP)) continue;
      const limpio = nombreParaElZip(f.nombre);
      let nombre = limpio;
      for (let n = 2; usados.has(nombre.toLocaleLowerCase("es")); n++) nombre = conNumero(limpio, n, carpeta);
      usados.add(nombre.toLocaleLowerCase("es"));
      const ruta = `${base}${nombre}`;
      if (carpeta) {
        visitadas.add(f.id);
        l.push({ n: `${ruta}/` });
        agregar([...(hijos.get(f.id) ?? [])].sort(enOrden), `${ruta}/`, nivel + 1);
      } else {
        l.push({ k: f.storage_key!, n: ruta });
        archivos++;
        bytes += Number(f.size ?? 0);
      }
    }
  };
  agregar(elegidos, "", 0);
  if (l.length > TOPE_ZIP_ENTRADAS) throw demasiados();
  if (bytes > TOPE_ZIP_BYTES) throw muyGrande();
  if (!l.length) throw nadaListo();
  return { l, archivos, bytes };
}

// ── Miniaturas (acción miniaturas) ──────────────────────────────────────────
// Jhon, 02/10: vistas en cuadrícula y galería con miniaturas. Las hace el NAS
// (infra/nas-drive/miniaturas.mjs: sips para imágenes, Quick Look para videos,
// PDF y Office); aquí se decide a cuáles se les pide y se firma el permiso.

/** Cuántas por pedido: una página de la cuadrícula cuesta UNA llamada. */
export const TOPE_MINIATURAS = 200;

/** ⚠️ Copiadas en frontend/src/lib/drive/miniaturas.ts (el build del frontend no
 *  importa de supabase/); test/oficina/miniaturasDrive.test.tsx exige que sean
 *  iguales. Las imágenes van por sips; lo demás, por Quick Look. Sin SVG: ese
 *  se dibuja aparte y nunca pasa por una herramienta. */
export const EXTENSIONES_CON_MINIATURA = [
  "jpg", "jpeg", "png", "gif", "webp", "heic", "heif", "tif", "tiff", "bmp",
  "mov", "mp4", "m4v",
  "pdf",
  "doc", "docx", "xls", "xlsx", "ppt", "pptx", "key", "pages", "numbers",
] as const;
/** Lo importado de Google llega muchas veces sin extensión útil: el tipo de la
 *  ficha dice cuál usar. */
export const MINIATURA_POR_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
  "image/tiff": "tiff",
  "image/bmp": "bmp",
  "video/quicktime": "mov",
  "video/mp4": "mp4",
  "video/x-m4v": "m4v",
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.ms-powerpoint": "ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
};
const CON_MINIATURA = new Set<string>(EXTENSIONES_CON_MINIATURA);

/** La extensión con la que el NAS hace la miniatura, o null si no tiene. Manda
 *  la extensión del nombre; el tipo de la ficha, solo si la extensión no dice. */
export function extensionParaMiniatura(nombre: string, mime: string | null): string | null {
  const ext = nombre.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "";
  if (CON_MINIATURA.has(ext)) return ext;
  const porTipo = MINIATURA_POR_MIME[(mime ?? "").split(";")[0].trim().toLowerCase()];
  return porTipo ?? null;
}

/** ⚠️ Igual que LADO_VISTA en infra/nas-drive/miniaturas.mjs: el NAS solo
 *  acepta la miniatura (480) y este lado. */
export const LADO_VISTA = 2048;

/** Las fotos del iPhone (HEIC) que Chrome no dibuja (Jhon, 06/10: «el visor no
 *  me deja previsualizar»). Para MIRARLAS, el NAS las convierte a JPG; para
 *  descargarlas, va el archivo original. Devuelve la extensión con la que el
 *  NAS hace la conversión, o null si el navegador ya la dibuja sola. */
export function extensionParaVerComoJpg(nombre: string, mime: string | null): string | null {
  const x = extensionParaMiniatura(nombre, mime);
  return x === "heic" || x === "heif" ? x : null;
}

export function idsParaMiniaturas(ids: unknown): string[] {
  if (!Array.isArray(ids)) throw new HttpError("Faltan los ids");
  const unicos = [...new Set(ids.map(String))];
  if (unicos.length > TOPE_MINIATURAS) throw new HttpError(`Hasta ${TOPE_MINIATURAS} miniaturas por pedido`);
  if (unicos.some((id) => !UUID.test(id))) throw new HttpError("Hay un id inválido");
  return unicos;
}

/** Vencimiento en tramos de 6 h (vale entre 6 y 12 h): así la URL de una
 *  miniatura no cambia en cada pedido y el navegador la reusa de su caché. */
export const TRAMO_MINIATURA = 6 * 3600;
export const venceMiniatura = (ahoraMs = Date.now()) => (Math.floor(ahoraMs / 1000 / TRAMO_MINIATURA) + 2) * TRAMO_MINIATURA;

/** «Maven-2026-10-02.zip», como el «drive-download-…» de Google. Si se baja UNA
 *  sola carpeta, el .zip lleva su nombre. La fecha es la de Bogotá. */
export function nombreDelZip(elegidos: FichaZip[], ahora = new Date()): string {
  const fecha = ahora.toLocaleDateString("sv-SE", { timeZone: "America/Bogota" });
  const visibles = elegidos.filter(entraEnElZip);
  const base = visibles.length === 1 && visibles[0].tipo === "carpeta" ? nombreParaElZip(visibles[0].nombre).slice(0, 150) : "Maven";
  return `${base}-${fecha}.zip`;
}
