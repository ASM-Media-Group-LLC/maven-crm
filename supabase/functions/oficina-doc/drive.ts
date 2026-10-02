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
}

/** La `key` del documento para ONLYOFFICE.
 *
 *  ⚠️ ONLYOFFICE cachea por esta llave: si se repite con otro contenido,
 *  muestra el viejo. Un archivo del Drive no cambia de contenido (subir otra
 *  vez crea otra ficha), pero la llave lleva igual la huella —o, en lo
 *  importado de Google, que no la tiene, la fecha de modificación— para que un
 *  reemplazo futuro no herede la caché. Solo letras, números y `-`: es lo que
 *  ONLYOFFICE acepta, y el tope es de 128. */
export function claveDeDrive(a: ArchivoDelDrive): string {
  const ms = Date.parse(a.updated_at);
  const version = a.sha256 && /^[0-9a-f]{64}$/.test(a.sha256)
    ? a.sha256.slice(0, 20)
    : (Number.isFinite(ms) ? ms : 0).toString(36);
  return `drv-${a.id}-${version}`.replace(/[^0-9A-Za-z._=-]/g, "").slice(0, 128);
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
}): Record<string, unknown> {
  const { archivo, formato, url, delimitador } = args;
  return {
    async: false,
    filetype: formato.ext,
    outputtype: formato.destino,
    // La misma llave devuelve el mismo resultado (ONLYOFFICE lo guarda un
    // rato): pedirlo dos veces seguidas no convierte dos veces.
    key: `${claveDeDrive(archivo)}-${formato.destino}`.slice(0, 128),
    title: `${nombreSinExtension(archivo.nombre)}.${formato.destino}`,
    url,
    // Un CSV no dice ni su codificación ni su separador: hay que darlos.
    ...(formato.ext === "csv" ? { codePage: 65001, delimiter: delimitador ?? 4 } : {}),
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
