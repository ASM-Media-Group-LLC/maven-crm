// Cómo se muestra cada archivo en el visor del Drive.
//
// LA REGLA, la misma que el visor de adjuntos del correo: manda la EXTENSIÓN y
// el tipo de la ficha (`mime`) solo cuenta si la extensión no dice nada. Lo
// importado de Google y muchas subidas llegan como `application/octet-stream`,
// y confiar en el tipo declarado dejaría sin vista justo a esos.

import type { TranslationKey } from "@/lib/i18n";

export type TipoDeVista = "imagen" | "video" | "audio" | "pdf" | "office" | "texto" | "ninguno";
export type DestinoDeOficina = "docx" | "xlsx" | "pptx";
type Editor = "word" | "cell" | "slide";

/** ⚠️ COPIA de FORMATOS_OFFICE de supabase/functions/oficina-doc/drive.ts (el
 *  build del frontend no puede importar de supabase/). El test
 *  test/oficina/visorDrive.test.tsx exige que sean iguales: si aquí sobra algo,
 *  el visor lo manda a ONLYOFFICE y la edge lo rechaza. */
export const FORMATOS_OFFICE: Record<string, { editor: Editor; destino: DestinoDeOficina }> = {
  doc: { editor: "word", destino: "docx" },
  docx: { editor: "word", destino: "docx" },
  docm: { editor: "word", destino: "docx" },
  dot: { editor: "word", destino: "docx" },
  dotx: { editor: "word", destino: "docx" },
  odt: { editor: "word", destino: "docx" },
  ott: { editor: "word", destino: "docx" },
  rtf: { editor: "word", destino: "docx" },
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

/** ⚠️ COPIA de SE_EDITAN_EN_SU_LUGAR de la misma edge (el mismo test las
 *  compara). Lo que ONLYOFFICE edita y devuelve en el MISMO formato: se abre el
 *  archivo del Drive en modo edición y se guarda sobre él, como el «modo de
 *  edición de Office» de Google. Lo demás de Office se convierte a una copia. */
export const SE_EDITAN_EN_SU_LUGAR: readonly string[] = [
  "docx", "docm", "dotx", "xlsx", "xlsm", "xltx", "pptx", "pptm", "ppsx", "potx",
];

/** ⚠️ COPIA de POR_MIME de la misma edge. */
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

/** El mismo tope que la edge (TOPE_VISTA): ONLYOFFICE no baja archivos de más
 *  de 100 MB, y es mejor decirlo antes que dejar el editor en un error mudo. */
export const TOPE_OFFICE = 100 * 1024 * 1024;
/** De un texto se muestra el principio: un log de 2 GB no entra en un <pre>. */
export const TOPE_TEXTO = 1024 * 1024;

const IMAGEN = ["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg", "avif", "heic", "heif", "ico"];
const VIDEO = ["mp4", "m4v", "mov", "webm", "ogv"];
const AUDIO = ["mp3", "m4a", "aac", "wav", "ogg", "oga", "opus", "flac", "weba"];
/** Texto y código. ⚠️ El HTML y el XML se muestran como TEXTO (escapado por
 *  React dentro de un <pre>), nunca como página. */
const TEXTO = [
  "txt", "md", "markdown", "json", "log", "xml", "yml", "yaml", "ini", "conf", "cfg", "toml", "tsv",
  "sql", "js", "mjs", "cjs", "ts", "tsx", "jsx", "css", "scss", "html", "htm", "py", "rb", "go", "java",
  "c", "h", "cpp", "cs", "php", "sh", "srt", "vtt",
];

export function extensionDe(nombre: string): string {
  return nombre.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "";
}

const mimeBase = (mime: string | null | undefined) => (mime ?? "").toLowerCase().split(";")[0].trim();

/** El formato de Office (extensión real que recibe ONLYOFFICE), o null. */
export function formatoDeOffice(nombre: string, mime: string | null | undefined): string | null {
  const ext = extensionDe(nombre);
  if (FORMATOS_OFFICE[ext]) return ext;
  const porMime = POR_MIME[mimeBase(mime)];
  return porMime && FORMATOS_OFFICE[porMime] ? porMime : null;
}

/** Por la extensión; si no es ninguna conocida, por el tipo de la ficha. */
function tipoPorFormato(nombre: string, mime: string | null | undefined): Exclude<TipoDeVista, "ninguno"> | null {
  const ext = extensionDe(nombre);
  if (ext === "pdf") return "pdf";
  if (IMAGEN.includes(ext)) return "imagen";
  if (VIDEO.includes(ext)) return "video";
  if (AUDIO.includes(ext)) return "audio";
  // El texto ANTES que Office: un .txt se abre en Documentos (convertido),
  // pero en el visor se lee como texto, que es lo que es.
  if (TEXTO.includes(ext)) return "texto";
  if (FORMATOS_OFFICE[ext]) return "office";
  const m = mimeBase(mime);
  if (m === "application/pdf") return "pdf";
  if (POR_MIME[m]) return "office";
  if (m.startsWith("image/")) return "imagen";
  if (m.startsWith("video/")) return "video";
  if (m.startsWith("audio/")) return "audio";
  if (m.startsWith("text/") || m === "application/json" || m === "application/xml") return "texto";
  return null;
}

export interface VistaDeArchivo {
  tipo: TipoDeVista;
  /** Por qué no se puede ver (solo si `tipo` es "ninguno"). */
  motivo?: "formato" | "grande";
  /** Un SVG se dibuja SOLO con <img> desde una data: URL (ver
   *  useSvgComoImagen): un SVG puede traer scripts, que en un <img> no corren. */
  esSvg?: boolean;
}

export function vistaDeArchivo(a: { nombre: string; mime: string | null; size: number | null }): VistaDeArchivo {
  const tipo = tipoPorFormato(a.nombre, a.mime);
  if (!tipo) return { tipo: "ninguno", motivo: "formato" };
  if (tipo === "office" && (a.size ?? 0) > TOPE_OFFICE) return { tipo: "ninguno", motivo: "grande" };
  if (tipo === "imagen") {
    const esSvg = extensionDe(a.nombre) === "svg" || mimeBase(a.mime) === "image/svg+xml";
    return esSvg ? { tipo, esSvg } : { tipo };
  }
  return { tipo };
}

/** Cómo se abre en la Oficina: "editar" = EL MISMO archivo del Drive, en modo
 *  edición; "convertir" = una copia editable (.doc, .xls, .csv, .txt…); null =
 *  no es de Office. */
export function comoSeAbreEnLaOficina(a: { nombre: string; mime: string | null }): "editar" | "convertir" | null {
  const ext = formatoDeOffice(a.nombre, a.mime);
  if (!ext) return null;
  return SE_EDITAN_EN_SU_LUGAR.includes(ext) ? "editar" : "convertir";
}

/** A qué sección de la Oficina va la copia editable («Editar en Documentos de
 *  Maven»), o null si el archivo no es de Office. */
export function destinoEnLaOficina(a: { nombre: string; mime: string | null }): DestinoDeOficina | null {
  const ext = formatoDeOffice(a.nombre, a.mime);
  return ext ? FORMATOS_OFFICE[ext].destino : null;
}

/** El principio de un archivo de texto, como texto. Prueba UTF-8 y, si no lo
 *  es, Windows-1252 (lo que guarda el Bloc de notas viejo): sin esto una «ñ»
 *  sale como «�». `stream: true` deja pasar una letra cortada al final, que es
 *  lo normal cuando se lee solo el primer mega. */
export function decodificarTexto(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes, { stream: true });
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

/** Un «texto» con bytes nulos es un binario con otra extensión: mostrarlo
 *  sería una pantalla de basura. */
export function pareceBinario(bytes: Uint8Array): boolean {
  const n = Math.min(bytes.length, 8192);
  for (let i = 0; i < n; i++) if (bytes[i] === 0) return true;
  return false;
}

// ── «Tipo» en el panel de Detalles ──────────────────────────────────────────

const DE_MICROSOFT = [
  "doc", "docx", "docm", "dot", "dotx", "xls", "xlsx", "xlsm", "xlt", "xltx",
  "ppt", "pptx", "pptm", "pps", "ppsx", "pot", "potx",
];
const COMPRIMIDOS = ["zip", "rar", "7z", "tar", "gz", "tgz"];

/** Qué es una ficha, para la fila «Tipo» de los Detalles (como Google:
 *  «Carpeta», «Microsoft Excel», «PDF», «Imagen»…). Devuelve la clave del
 *  diccionario y la extensión, para que la página lo diga en su idioma. */
export function tipoDeFicha(
  a: { tipo: "carpeta" | "archivo"; nombre: string; mime: string | null },
  esUnidad = false,
): { clave: TranslationKey; ext: string } {
  const ext = extensionDe(a.nombre);
  if (a.tipo === "carpeta") return { clave: esUnidad ? "drive.tipo.unidad" : "drive.tipo.carpeta", ext };
  const office = formatoDeOffice(a.nombre, a.mime);
  if (office && !TEXTO.includes(ext)) {
    const { editor } = FORMATOS_OFFICE[office];
    if (DE_MICROSOFT.includes(office)) {
      return { clave: editor === "word" ? "drive.tipo.word" : editor === "cell" ? "drive.tipo.excel" : "drive.tipo.powerpoint", ext };
    }
    if (office === "csv") return { clave: "drive.tipo.csv", ext };
    return { clave: editor === "word" ? "drive.tipo.documento" : editor === "cell" ? "drive.tipo.hoja" : "drive.tipo.presentacion", ext };
  }
  const vista = tipoPorFormato(a.nombre, a.mime);
  if (vista === "pdf") return { clave: "drive.tipo.pdf", ext };
  if (vista === "imagen") return { clave: "drive.tipo.imagen", ext };
  if (vista === "video") return { clave: "drive.tipo.video", ext };
  if (vista === "audio") return { clave: "drive.tipo.audio", ext };
  if (vista === "texto") return { clave: "drive.tipo.texto", ext };
  if (COMPRIMIDOS.includes(ext) || /zip|rar|7z|tar|gzip/.test(mimeBase(a.mime))) return { clave: "drive.tipo.comprimido", ext };
  return { clave: ext ? "drive.tipo.otro" : "drive.tipo.archivo", ext };
}

// ── El tipo por los primeros bytes (Jhon, 06/10: «el visor no me deja
// previsualizar») ────────────────────────────────────────────────────────────
// 13.593 archivos importados de Google no tienen extensión en el nombre y
// llegaron como application/octet-stream: grabaciones de Meet y de pantalla
// («EXPLICACIÓN DE HUBSTAFF», todo «ENTREGA DE CARGO»). Por el nombre y el
// tipo de la ficha no se sabe qué son; por los primeros bytes, sí.

const GENERICOS = new Set(["", "application/octet-stream", "binary/octet-stream", "application/x-binary", "application/unknown"]);

/** ¿Hay que mirar adentro para saber qué es? Solo cuando ni el nombre ni la
 *  ficha lo dicen (sin una extensión conocida y con un tipo genérico). */
export function hayQueMirarAdentro(a: { nombre: string; mime: string | null; size: number | null }): boolean {
  const v = vistaDeArchivo(a);
  return v.tipo === "ninguno" && v.motivo === "formato" && GENERICOS.has(mimeBase(a.mime));
}

const ascii = (b: Uint8Array, desde: number, largo: number) =>
  String.fromCharCode(...Array.from(b.subarray(desde, desde + largo)));

/** El tipo real por la firma de los primeros bytes (con 16 alcanza; se leen
 *  64). null si no se reconoce: un .zip puede ser un Word o un Excel y desde
 *  aquí no se sabe cuál. */
export function tipoPorFirma(b: Uint8Array): { mime: string; ext: string } | null {
  if (b.length < 4) return null;
  // ISO BMFF (mp4, mov, heic, m4a, avif): «ftyp» en el byte 4 y la marca después.
  if (b.length >= 12 && ascii(b, 4, 4) === "ftyp") {
    const marca = ascii(b, 8, 4);
    if (marca === "qt  ") return { mime: "video/quicktime", ext: "mov" };
    if (["heic", "heix", "heim", "heis", "hevc", "hevx", "mif1", "msf1"].includes(marca)) return { mime: "image/heic", ext: "heic" };
    if (marca === "avif" || marca === "avis") return { mime: "image/avif", ext: "avif" };
    if (marca === "M4A " || marca === "M4B ") return { mime: "audio/mp4", ext: "m4a" };
    return { mime: "video/mp4", ext: "mp4" };
  }
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { mime: "image/jpeg", ext: "jpg" };
  if (b[0] === 0x89 && ascii(b, 1, 3) === "PNG") return { mime: "image/png", ext: "png" };
  if (ascii(b, 0, 4) === "GIF8") return { mime: "image/gif", ext: "gif" };
  if (ascii(b, 0, 4) === "%PDF") return { mime: "application/pdf", ext: "pdf" };
  if (b.length >= 12 && ascii(b, 0, 4) === "RIFF") {
    const tipo = ascii(b, 8, 4);
    if (tipo === "WEBP") return { mime: "image/webp", ext: "webp" };
    if (tipo === "WAVE") return { mime: "audio/wav", ext: "wav" };
    return null;
  }
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return { mime: "video/webm", ext: "webm" };
  if (ascii(b, 0, 4) === "OggS") return { mime: "audio/ogg", ext: "ogg" };
  if (ascii(b, 0, 3) === "ID3" || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0)) return { mime: "audio/mpeg", ext: "mp3" };
  return null;
}

/** La vista con lo que dijo la firma: como si el nombre trajera la extensión. */
export function vistaConFirma(
  a: { nombre: string; mime: string | null; size: number | null },
  firma: { mime: string; ext: string } | null,
): VistaDeArchivo {
  return firma ? vistaDeArchivo({ nombre: `${a.nombre}.${firma.ext}`, mime: firma.mime, size: a.size }) : vistaDeArchivo(a);
}
