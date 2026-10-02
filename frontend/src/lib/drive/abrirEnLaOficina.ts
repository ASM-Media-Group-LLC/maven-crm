// «Abrir un archivo» de la Oficina (Jhon, 02/10): como Archivo › Abrir (⌘O)
// de Google Hojas de cálculo. Se elige un archivo del Drive —o se sube uno
// desde la computadora— y se abre en la Oficina para editarlo.
//
// Abrir es como en Google: un Word, Excel o PowerPoint se edita EN SU LUGAR —el
// mismo archivo del Drive, guardando sobre él (`editar_drive` de la edge
// oficina-doc)—, y lo que ONLYOFFICE no devuelve en su formato (.doc, .xls,
// .odt, .csv, .txt…) se convierte a una copia editable (`desde_drive`), como
// Google convierte un .csv o un .txt en un archivo de Hojas o Documentos.
//
// Solo las reglas, sin React, para poder probarlas sin dibujar el diálogo
// (components/oficina/DialogoAbrirArchivo.tsx).

import {
  comoSeAbreEnLaOficina, destinoEnLaOficina, FORMATOS_OFFICE, TOPE_OFFICE, type DestinoDeOficina,
} from "./tipoDeArchivo";

/** ⚠️ COPIA de TOPE_COPIA de supabase/functions/oficina-doc/drive.ts: la copia
 *  pasa entera por la memoria de la edge. El test
 *  test/oficina/abrirArchivo.test.tsx exige que sean iguales; si aquí fuera más
 *  grande, la persona subiría el archivo entero para terminar en un error. */
export const TOPE_COPIA = 50 * 1024 * 1024;

/** Lo máximo que se abre según CÓMO se abre: en su lugar, lo que ONLYOFFICE
 *  baja (TOPE_OFFICE, 100 MB); como copia, lo que entra en la memoria de la
 *  edge (TOPE_COPIA, 50 MB). */
export function topeParaAbrir(a: { nombre: string; mime: string | null }): number {
  return comoSeAbreEnLaOficina(a) === "editar" ? TOPE_OFFICE : TOPE_COPIA;
}

/** Desde cuántas letras se busca en TODO el Drive (drive_buscar). Con menos,
 *  el índice trigram no sirve y una letra encuentra medio Drive: se filtra lo
 *  que se está viendo. */
export const BUSQUEDA_MINIMA = 3;

/** Las extensiones que abre una sección de la Oficina (null = cualquiera),
 *  con la suya primero: «.xlsx, .xls, .xlsm…» y no «.xls, .xlsx…». */
export function extensionesDe(destino: DestinoDeOficina | null): string[] {
  return Object.entries(FORMATOS_OFFICE)
    .filter(([, f]) => destino === null || f.destino === destino)
    .sort(([a, fa], [b, fb]) => Number(b === fb.destino) - Number(a === fa.destino))
    .map(([ext]) => ext);
}

/** Para el `accept` del selector de archivos: «.xlsx,.xls,…». Lleva todas las
 *  de Oficina y no solo las de la sección: un Word subido desde Hojas de
 *  cálculo se abre igual, en Documentos. */
export function aceptaElSelector(): string {
  return extensionesDe(null).map((e) => `.${e}`).join(",");
}

/** ¿La Oficina lo abre? Con `destino`, solo si va a ESA sección. */
export function seAbreEn(a: { nombre: string; mime: string | null }, destino: DestinoDeOficina | null): boolean {
  const d = destinoEnLaOficina(a);
  return !!d && (destino === null || d === destino);
}

/** Sin mayúsculas ni tildes: «balance» encuentra «Balance Señal.xlsx» y
 *  «senal» también. */
export function normalizar(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

interface ItemParaAbrir {
  tipo: "carpeta" | "archivo";
  nombre: string;
  mime: string | null;
  estado: "subiendo" | "listo";
}

/** Lo que muestra el diálogo de una vista del Drive: las carpetas (para poder
 *  entrar) y los archivos que la Oficina abre —los de la sección, o los de
 *  cualquier sección con `todos`—. Con `q`, solo lo que lo tenga en el nombre.
 *  Una subida a medias no se ofrece: todavía no hay archivo que copiar. */
export function paraAbrir<T extends ItemParaAbrir>(
  items: T[],
  { destino, todos, q }: { destino: DestinoDeOficina; todos: boolean; q: string },
): T[] {
  const busca = normalizar(q);
  return items.filter((i) => {
    if (busca && !normalizar(i.nombre).includes(busca)) return false;
    if (i.tipo === "carpeta") return true;
    if (i.estado !== "listo") return false;
    return seAbreEn(i, todos ? null : destino);
  });
}

export type ProblemaDeSubida = "formato" | "vacio" | "grande" | "espacio";

/** Lo que se puede saber ANTES de subir, para no hacer esperar a la persona
 *  una subida entera que termina en error. El espacio solo se mira si se sabe
 *  el cupo (la edge lo vuelve a revisar de todos modos). */
export function problemaParaSubir(
  f: { name: string; type: string; size: number },
  uso?: { usado: number; cupo: number } | null,
): ProblemaDeSubida | null {
  const a = { nombre: f.name, mime: f.type || null };
  if (!destinoEnLaOficina(a)) return "formato";
  if (f.size === 0) return "vacio";
  if (f.size > topeParaAbrir(a)) return "grande";
  if (uso && uso.cupo > 0 && uso.usado + f.size > uso.cupo) return "espacio";
  return null;
}

/** ⌘O en el Mac, Ctrl+O en lo demás: como en Google. Con Shift o Alt es otro
 *  atajo (del navegador o del sistema) y no se toca. */
export function esAtajoDeAbrir(e: Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey">): boolean {
  return (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "o";
}

/** Cómo se escribe el atajo en este equipo. */
export function atajoDeAbrir(): string {
  const plataforma = typeof navigator === "undefined" ? "" : navigator.userAgent;
  return /Mac|iPhone|iPad/.test(plataforma) ? "⌘O" : "Ctrl+O";
}
