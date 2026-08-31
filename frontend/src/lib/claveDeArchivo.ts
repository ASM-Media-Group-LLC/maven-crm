// Convertir el nombre de un archivo en una clave que Supabase Storage acepte.
//
// ── EL BUG QUE ESTO ARREGLA (31/08/2026) ────────────────────────────────────
//
// Adjuntar una imagen o un video en el Messenger fallaba con
// "Invalid key: <uuid>/<timestamp>-Captura de pantalla ... p. m..png".
//
// Storage valida la clave contra una lista corta de caracteres permitidos
// (letras y números ASCII, `_ / ! - . * ' ( ) espacio & $ @ = ; : + , ?`).
// Cualquier otra cosa la rechaza entera. Y el nombre del archivo se estaba
// metiendo CRUDO en la clave.
//
// LO QUE LO HACÍA TAN DESCONCERTANTE: el nombre parece inofensivo. macOS nombra
// las capturas con un ESPACIO ANGOSTO SIN SALTO (U+202F) antes de "p. m." — y
// también antes de "PM" en inglés. No se ve. Se confirmó en la propia consola:
// la URL de la petición mostraba `%E2%80%AF`, que es ese carácter.
//
// Y no era solo eso: `\w` en JavaScript es SOLO ASCII, así que **cualquier
// tilde o eñe también rompe la subida**. `Diseño final.png`, `Análisis.pdf`…
// En un equipo que trabaja en español eso no es un caso raro.
//
// Por eso pegar con Ctrl+V sí funcionaba: el archivo del portapapeles se llama
// `image.png`, un nombre limpio.
//
// ⚠️ Esto NO cambia el nombre que ve la persona. Solo la clave interna con la
// que se guarda el archivo; el nombre original se sigue mostrando en el chat.

/** Largo máximo de la parte del nombre (sin contar la extensión). La clave
 *  completa lleva además carpeta y marca de tiempo. */
const MAX_BASE = 80;

/** Quita tildes y deja solo lo que Storage acepta sin dudas.
 *
 *  Se apunta a un conjunto MÁS ANGOSTO que el que Storage permite: aunque
 *  admite espacios y paréntesis, una clave con espacios obliga a codificarla
 *  en cada URL y es justo donde se cuelan los caracteres invisibles. */
function limpiar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")   // saca las tildes: "diseño" -> "diseno"
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")    // todo lo demás (incluido U+202F) -> "-"
    .replace(/-{2,}/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "");
}

/**
 * Devuelve un nombre apto para usar dentro de una clave de Storage.
 *
 * Conserva la extensión: truncar a ciegas podía dejar un `.mov` sin extensión,
 * y ahí se pierde el tipo de contenido y la vista previa.
 */
export function claveSeguraParaArchivo(nombre: string | null | undefined): string {
  const original = (nombre ?? "").trim();
  if (!original) return "archivo";

  const punto = original.lastIndexOf(".");
  // Un punto al principio no es una extensión (".gitignore"), y uno muy al
  // final tampoco ayuda.
  const tieneExt = punto > 0 && punto < original.length - 1;
  const baseCruda = tieneExt ? original.slice(0, punto) : original;
  const extCruda = tieneExt ? original.slice(punto + 1) : "";

  const base = limpiar(baseCruda).slice(0, MAX_BASE) || "archivo";
  const ext = limpiar(extCruda).slice(0, 10);

  return ext ? `${base}.${ext}` : base;
}
