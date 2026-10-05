// Un archivo del DRIVE en ONLYOFFICE: verlo sin bajarlo y sacarle una copia
// editable en la Oficina («Abrir con Documentos de Google», pero de Maven).
//
// Solo las reglas que no dependen de la red ni de la base, para poder
// probarlas sin levantar el servidor (drive.test.ts). Lo que va a la red está
// en index.ts.
//
// ⚠️ El frontend tiene una COPIA de FORMATOS_OFFICE y de POR_MIME en
// frontend/src/lib/drive/tipoDeArchivo.ts (el build del frontend no puede
// importar de supabase/). El test frontend/src/test/oficina/visorDrive.test.ts
// compara las dos: si el visor ofrece abrir algo que la edge rechaza, la
// persona espera y termina en un error.

export type Editor = "word" | "cell" | "slide";
export type Destino = "docx" | "xlsx" | "pptx";
export interface FormatoDeOffice { ext: string; editor: Editor; destino: Destino }

/** Lo que ONLYOFFICE abre, con qué editor, y en qué formato queda la copia
 *  editable de la Oficina (la base solo acepta docx, xlsx y pptx). */
export const FORMATOS_OFFICE: Record<string, { editor: Editor; destino: Destino }> = {
  doc: { editor: "word", destino: "docx" },
  docx: { editor: "word", destino: "docx" },
  docm: { editor: "word", destino: "docx" },
  dot: { editor: "word", destino: "docx" },
  dotx: { editor: "word", destino: "docx" },
  odt: { editor: "word", destino: "docx" },
  ott: { editor: "word", destino: "docx" },
  rtf: { editor: "word", destino: "docx" },
  // Un .txt se abre en Documentos como en Google: convertido a un documento
  // nuevo (ver codigoDePagina para que las tildes no se rompan).
  txt: { editor: "word", destino: "docx" },
  xls: { editor: "cell", destino: "xlsx" },
  xlsx: { editor: "cell", destino: "xlsx" },
  xlsm: { editor: "cell", destino: "xlsx" },
  xlt: { editor: "cell", destino: "xlsx" },
  xltx: { editor: "cell", destino: "xlsx" },
  ods: { editor: "cell", destino: "xlsx" },
  ots: { editor: "cell", destino: "xlsx" },
  csv: { editor: "cell", destino: "xlsx" },
  ppt: { editor: "slide", destino: "pptx" },
  pptx: { editor: "slide", destino: "pptx" },
  pptm: { editor: "slide", destino: "pptx" },
  pps: { editor: "slide", destino: "pptx" },
  ppsx: { editor: "slide", destino: "pptx" },
  pot: { editor: "slide", destino: "pptx" },
  potx: { editor: "slide", destino: "pptx" },
  odp: { editor: "slide", destino: "pptx" },
  otp: { editor: "slide", destino: "pptx" },
};

/** Lo que ONLYOFFICE edita y DEVUELVE en el mismo formato. Esto se abre EN SU
 *  LUGAR —el mismo archivo del Drive, en modo edición, guardando sobre él—,
 *  como el «modo de edición de Office» de Google. Lo demás (.doc, .xls, .ppt,
 *  .odt, .rtf, .csv, .txt…) ONLYOFFICE lo abre pero no lo guarda en su
 *  formato: se convierte a una copia en la Oficina, como Google convierte un
 *  .csv o un .txt en un archivo de Hojas o de Documentos. */
export const SE_EDITAN_EN_SU_LUGAR: readonly string[] = [
  "docx", "docm", "dotx", "xlsx", "xlsm", "xltx", "pptx", "pptm", "ppsx", "potx",
];

export type ComoSeAbre = "editar" | "convertir";

export function comoSeAbre(formato: Pick<FormatoDeOffice, "ext">): ComoSeAbre {
  return SE_EDITAN_EN_SU_LUGAR.includes(formato.ext) ? "editar" : "convertir";
}

/** Para un archivo SIN extensión conocida: el tipo que trae la ficha. */
export const POR_MIME: Record<string, string> = {
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.oasis.opendocument.text": "odt",
  "application/rtf": "rtf",
  "text/rtf": "rtf",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.oasis.opendocument.spreadsheet": "ods",
  "text/csv": "csv",
  "application/vnd.ms-powerpoint": "ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "application/vnd.oasis.opendocument.presentation": "odp",
};

/** ONLYOFFICE no baja archivos de más de 100 MB (su `maxDownloadBytes` por
 *  defecto): pasado eso el editor se queda en un error que no explica nada. */
export const TOPE_VISTA = 100 * 1024 * 1024;
/** La copia pasa entera por la memoria de la edge (256 MB): un tope holgado. */
export const TOPE_COPIA = 50 * 1024 * 1024;

export function extensionDe(nombre: string): string {
  return nombre.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "";
}

/** El formato de Office de un archivo, o null si ONLYOFFICE no lo abre.
 *  Manda la EXTENSIÓN; el tipo de la ficha solo cuenta si la extensión no dice
 *  nada (lo mismo que el visor de adjuntos del correo: muchos archivos llegan
 *  anunciados como `application/octet-stream`). */
export function formatoDeOffice(nombre: string, mime: string | null): FormatoDeOffice | null {
  const ext = extensionDe(nombre);
  if (FORMATOS_OFFICE[ext]) return { ext, ...FORMATOS_OFFICE[ext] };
  const porMime = POR_MIME[(mime ?? "").toLowerCase().split(";")[0].trim()];
  if (porMime && FORMATOS_OFFICE[porMime]) return { ext: porMime, ...FORMATOS_OFFICE[porMime] };
  return null;
}

/** El nombre sin la extensión: «Balance 2026.xlsx» → «Balance 2026». Es el
 *  título del documento nuevo (la Oficina le agrega su propia extensión). */
export function nombreSinExtension(nombre: string): string {
  const sin = nombre.replace(/\.[a-z0-9]+$/i, "").trim();
  return sin || nombre.trim();
}

export interface ArchivoDelDrive {
  id: string;
  nombre: string;
  sha256: string | null;
  updated_at: string;
  /** Si el contenido de hoy es una versión vieja RESTAURADA («Administrar
   *  versiones»), cuándo se restauró (ver claveDeDrive). */
  restaurada_at?: string | null;
}

/** La `key` del documento para ONLYOFFICE.
 *
 *  ⚠️ ONLYOFFICE cachea por esta llave: si se repite con otro contenido,
 *  muestra el viejo. Un archivo del Drive no cambia de contenido (subir otra
 *  vez crea otra ficha), pero la llave lleva igual la huella —o, en lo
 *  importado de Google, que no la tiene, la fecha de modificación— para que un
 *  reemplazo futuro no herede la caché. Solo letras, números y `-`: es lo que
 *  ONLYOFFICE acepta, y el tope es de 128.
 *
 *  ⚠️ RESTAURAR una versión vieja (edge `drive`, restaurar_version) vuelve a
 *  poner su archivo, con su MISMA huella: la llave sería la misma que tuvo esa
 *  versión, que ONLYOFFICE ya usó (y guardó: abriría lo que quedó de aquella
 *  sesión, o diría que «la versión cambió»). Por eso, si el contenido de hoy
 *  es una restauración, la llave lleva además cuándo se restauró. Lo que nunca
 *  se restauró conserva la llave de siempre. */
export function claveDeDrive(a: ArchivoDelDrive): string {
  const ms = Date.parse(a.updated_at);
  const version = a.sha256 && /^[0-9a-f]{64}$/.test(a.sha256)
    ? a.sha256.slice(0, 20)
    : (Number.isFinite(ms) ? ms : 0).toString(36);
  const restaurada = a.restaurada_at ? Date.parse(a.restaurada_at) : NaN;
  const marca = Number.isFinite(restaurada) ? `-r${restaurada.toString(36)}` : "";
  return `drv-${a.id}-${version}${marca}`.replace(/[^0-9A-Za-z._=-]/g, "").slice(0, 128);
}

/** Cuándo se restauró el contenido de hoy, si es una versión vieja vuelta a
 *  poner: las filas de drive_versiones con el MISMO archivo que la ficha
 *  (de la más nueva a la más vieja). Un archivo aparece una vez por guardado;
 *  dos o más veces = se restauró, y la más nueva es la restauración. */
export function restauradaEl(filasConElMismoArchivo: { created_at: string }[]): string | null {
  return filasConElMismoArchivo.length >= 2 ? filasConElMismoArchivo[0].created_at : null;
}

/** La configuración (sin firmar) para VER un archivo del Drive en ONLYOFFICE.
 *
 *  ⚠️ SOLO LECTURA, igual que un adjunto del correo: el archivo vive en el
 *  NAS y ONLYOFFICE no tiene dónde guardarlo. Sin `callbackUrl` y con
 *  `edit: false`: un botón de guardar que no guarda en ningún lado sería
 *  peor que no tenerlo. Para editar está la copia de la Oficina. */
export function configDeVista(args: {
  archivo: ArchivoDelDrive;
  formato: FormatoDeOffice;
  url: string;
  usuario: { id: string; nombre: string };
  idioma: "es" | "en";
  tema?: "dark" | "light";
}): Record<string, unknown> {
  const { archivo, formato, url, usuario, idioma, tema } = args;
  const uiTheme = tema === "dark" ? "theme-night" : tema === "light" ? "theme-white" : undefined;
  return {
    documentType: formato.editor,
    document: {
      key: claveDeDrive(archivo),
      title: archivo.nombre,
      fileType: formato.ext,
      // URL firmada del NAS: ONLYOFFICE la baja desde SU servidor, sin pasar
      // por la edge ni por el navegador.
      url,
      permissions: { edit: false, download: true, print: true },
    },
    editorConfig: {
      lang: idioma,
      mode: "view",
      user: { id: usuario.id, name: usuario.nombre },
      customization: {
        compactHeader: true,
        toolbarHideFileName: true,
        hideRightMenu: true,
        chat: false,
        comments: false,
        feedback: false,
        ...(uiTheme ? { uiTheme } : {}),
      },
    },
  };
}

// ── Editar EL MISMO archivo del Drive (modo de edición de Office) ──────────

/** La llave de una sesión de EDICIÓN. Sale del contenido guardado (la misma
 *  huella que la vista), así que:
 *   - quienes abren mientras nadie guardó caen en LA MISMA sesión de ONLYOFFICE
 *     (coedición, como en Google);
 *   - cuando la sesión termina y se guarda, cambia la huella y la próxima
 *     apertura es una sesión nueva con el archivo nuevo.
 *  Distinta de la de la vista (`-ed`): quien solo puede ver no entra a la
 *  sesión de quienes editan (su config no tiene a dónde avisar un guardado). */
export function claveDeEdicion(a: ArchivoDelDrive): string {
  return `${claveDeDrive(a)}-ed`.slice(0, 128);
}

/** La configuración (sin firmar) para EDITAR un archivo del Drive en su lugar.
 *
 *  ⚠️ `forcesave: false` a propósito. El guardado forzado (status 6) llega con
 *  la sesión ABIERTA; si se guardara ahí, cambiaría la huella y quien entrara
 *  después abriría OTRA sesión con otra llave: dos sesiones guardando sobre el
 *  mismo archivo y la última pisando a la otra. Se guarda una sola vez, cuando
 *  se va el último (status 2). Mientras tanto lo escrito vive en el servidor de
 *  ONLYOFFICE, que lo entrega aunque se cierre la pestaña. */
export function configDeEdicion(args: {
  archivo: ArchivoDelDrive;
  formato: FormatoDeOffice;
  url: string;
  callbackUrl: string;
  usuario: { id: string; nombre: string };
  idioma: "es" | "en";
  tema?: "dark" | "light";
  volverA?: string | null;
}): Record<string, unknown> {
  const { archivo, formato, url, callbackUrl, usuario, idioma, tema, volverA } = args;
  const uiTheme = tema === "dark" ? "theme-night" : tema === "light" ? "theme-white" : undefined;
  return {
    documentType: formato.editor,
    document: {
      key: claveDeEdicion(archivo),
      title: archivo.nombre,
      fileType: formato.ext,
      url,
      permissions: { edit: true, download: true, print: true, comment: true, review: true },
    },
    editorConfig: {
      lang: idioma,
      mode: "edit",
      callbackUrl,
      user: { id: usuario.id, name: usuario.nombre },
      customization: {
        autosave: true,
        forcesave: false,
        compactHeader: true,
        toolbarHideFileName: true,
        hideRightMenu: true,
        // El Messenger es el lugar para hablar (igual que en los documentos).
        chat: false,
        comments: true,
        feedback: false,
        features: { spellcheck: true },
        ...(volverA ? { goback: { text: idioma === "en" ? "Back to Drive" : "Volver al Drive", url: volverA, blank: false } } : {}),
        ...(uiTheme ? { uiTheme } : {}),
      },
    },
  };
}

export type QueHacer =
  | { accion: "nada"; motivo: string }
  | { accion: "guardar"; url: string }
  | { accion: "rechazar"; motivo: string };

/** Qué hacer con un aviso de ONLYOFFICE sobre un archivo del Drive editado en
 *  su lugar. Solo el status 2 (se fue el último y hay cambios) guarda; el 6 (el
 *  forzado) no, por lo de la llave (ver configDeEdicion). El archivo editado
 *  se baja SOLO del servidor de ONLYOFFICE, y tiene que volver en el mismo
 *  formato: si no, se guardaría un .docx con nombre de .xlsx. */
export function queHacerConElAviso(
  cuerpo: { status?: unknown; url?: unknown; filetype?: unknown },
  ext: string,
  servidor: string,
): QueHacer {
  const estado = Number(cuerpo.status ?? 0);
  if (estado === 6) return { accion: "nada", motivo: "guardado forzado: se guarda al cerrar" };
  if (estado === 3 || estado === 7) return { accion: "nada", motivo: `ONLYOFFICE avisó un error al guardar (status ${estado})` };
  if (estado !== 2) return { accion: "nada", motivo: `status ${estado}` };
  const url = String(cuerpo.url ?? "");
  if (!url || !esDelServidor(url, servidor)) return { accion: "rechazar", motivo: "la url del archivo editado no es del servidor de Oficina" };
  const tipo = typeof cuerpo.filetype === "string" ? cuerpo.filetype.toLowerCase() : "";
  if (tipo && tipo !== ext) return { accion: "rechazar", motivo: `volvió como .${tipo} y el archivo es .${ext}` };
  return { accion: "guardar", url };
}

/** El tamaño de cada parte al guardar en el NAS. ⚠️ El mismo que TAMANO_PARTE
 *  de la edge `drive` (drive/logica.ts): el proxy de la puerta corta a los
 *  ~60 s, y el NAS no acepta más de 95 MB por pedido. */
export const TAMANO_PARTE_NAS = 32 * 1024 * 1024;

export interface VersionDelDrive {
  item_id: string;
  storage_key: string;
  size: number | null;
  sha256: string | null;
  saved_by: string | null;
  created_at: string;
}

/** Las filas de drive_versiones de un guardado. La PRIMERA vez que se edita un
 *  archivo, también entra el original (el que se subió o se importó), con su
 *  dueño y su fecha: así el historial empieza donde empezó el archivo y el
 *  blob viejo queda anotado (nunca se pisa ni se borra al guardar). */
export function filasDeVersion(args: {
  itemId: string;
  anterior: { storage_key: string; size: number | null; sha256: string | null; updated_at: string; owner_id: string | null };
  hayHistorial: boolean;
  nueva: { storage_key: string; size: number; sha256: string };
  quien: string | null;
  ahora: string;
}): VersionDelDrive[] {
  const { itemId, anterior, hayHistorial, nueva, quien, ahora } = args;
  const filas: VersionDelDrive[] = [];
  if (!hayHistorial) {
    filas.push({
      item_id: itemId, storage_key: anterior.storage_key, size: anterior.size, sha256: anterior.sha256,
      saved_by: anterior.owner_id, created_at: anterior.updated_at,
    });
  }
  filas.push({ item_id: itemId, storage_key: nueva.storage_key, size: nueva.size, sha256: nueva.sha256, saved_by: quien, created_at: ahora });
  return filas;
}

/** Un id de persona válido (lo que ONLYOFFICE devuelve en `users` es lo que
 *  le dimos: el uuid de Maven). */
export const esUuid = (s: unknown): s is string =>
  typeof s === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

// ── Texto: la codificación ──────────────────────────────────────────────────

/** La codificación de un .txt o un .csv, en el código que espera el conversor
 *  de ONLYOFFICE: 65001 UTF-8 · 1200 UTF-16 (LE) · 1201 UTF-16 BE · 1252
 *  Windows (Europa occidental). Sin esto, el Bloc de notas viejo y el «CSV»
 *  de Excel en Colombia (que guardan en Windows-1252) salían con «Ã±» en vez
 *  de «ñ». Se mira el principio del archivo: la marca (BOM) si la tiene; si
 *  no, si es UTF-8 válido (`stream`: una letra cortada al final de la muestra
 *  no cuenta como error). */
export function codigoDePagina(muestra: Uint8Array): number {
  if (muestra.length >= 3 && muestra[0] === 0xef && muestra[1] === 0xbb && muestra[2] === 0xbf) return 65001;
  if (muestra.length >= 2 && muestra[0] === 0xff && muestra[1] === 0xfe) return 1200;
  if (muestra.length >= 2 && muestra[0] === 0xfe && muestra[1] === 0xff) return 1201;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(muestra, { stream: true });
    return 65001;
  } catch {
    return 1252;
  }
}

/** La muestra como texto, con su codificación (para adivinar el separador). */
export function textoDeMuestra(muestra: Uint8Array, codigo: number): string {
  const etiqueta = codigo === 1200 ? "utf-16le" : codigo === 1201 ? "utf-16be" : codigo === 1252 ? "windows-1252" : "utf-8";
  return new TextDecoder(etiqueta).decode(muestra);
}

/** Separador de un CSV, en el código que espera el conversor de ONLYOFFICE
 *  (1 tabulador · 2 punto y coma · 3 dos puntos · 4 coma · 5 espacio). Se mira
 *  la primera línea: en Colombia Excel guarda con punto y coma, y convertir
 *  con coma deja cada fila entera en la columna A. Las comillas no cuentan
 *  («"Bogotá, D.C."» es un solo campo). */
export function adivinarDelimitador(muestra: string): number {
  const primera = (muestra.split(/\r?\n/)[0] ?? "").replace(/"[^"]*"/g, "");
  const cuenta = (c: string) => primera.split(c).length - 1;
  const candidatos: [number, number][] = [[1, cuenta("\t")], [2, cuenta(";")], [4, cuenta(",")]];
  const [codigo, veces] = candidatos.reduce((mejor, c) => (c[1] > mejor[1] ? c : mejor), [4, 0]);
  return veces > 0 ? codigo : 4;
}

/** El pedido al conversor de ONLYOFFICE (sin firmar): de un formato viejo
 *  (.doc, .odt, .xls, .csv, .ppt…) al de la Oficina. */
export function pedidoDeConversion(args: {
  archivo: ArchivoDelDrive;
  formato: FormatoDeOffice;
  url: string;
  delimitador?: number;
  /** La codificación de un .csv o un .txt (codigoDePagina). */
  codePage?: number;
}): Record<string, unknown> {
  const { archivo, formato, url, delimitador, codePage } = args;
  return {
    async: false,
    filetype: formato.ext,
    outputtype: formato.destino,
    // La misma llave devuelve el mismo resultado (ONLYOFFICE lo guarda un
    // rato): pedirlo dos veces seguidas no convierte dos veces.
    key: `${claveDeDrive(archivo)}-${formato.destino}`.slice(0, 128),
    title: `${nombreSinExtension(archivo.nombre)}.${formato.destino}`,
    url,
    // Un CSV no dice ni su codificación ni su separador, y un .txt no dice su
    // codificación: hay que darlos.
    ...(formato.ext === "csv" ? { codePage: codePage ?? 65001, delimiter: delimitador ?? 4 } : {}),
    ...(formato.ext === "txt" ? { codePage: codePage ?? 65001 } : {}),
  };
}

/** Qué significa cada código de error del conversor, para la persona. */
export function errorDeConversion(codigo: number): string {
  switch (codigo) {
    case -2: return "La conversión tardó demasiado. Prueba de nuevo en un rato.";
    case -4: return "El servidor de Oficina no pudo bajar el archivo del Drive.";
    case -5: return "El archivo tiene contraseña: quítasela y vuelve a subirlo.";
    case -8: return "La firma del pedido no es válida (revisa ONLYOFFICE_JWT_SECRET).";
    case -10: return "El archivo es demasiado grande para convertirlo.";
    default: return `No se pudo convertir el archivo (código ${codigo}).`;
  }
}

/** El resultado de la conversión se baja SOLO del mismo servidor de
 *  ONLYOFFICE al que se le pidió: es una URL que llega en una respuesta, y la
 *  edge no tiene por qué ir a buscar nada a otro lado. */
export function esDelServidor(url: string, servidor: string): boolean {
  try {
    return new URL(url).hostname === new URL(servidor).hostname;
  } catch {
    return false;
  }
}
