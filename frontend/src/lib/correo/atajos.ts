// Los atajos de teclado del correo, los de Gmail:
//  - VOLVER A LA LISTA con «u» o Escape, cuando el correo abierto ocupa toda la
//    pantalla.
//  - DESHACER la última acción con «z» (archivar, mover, eliminar…), mientras
//    su aviso sigue a la vista.

interface TeclaPulsada {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  defaultPrevented: boolean;
  target: EventTarget | null;
}

/** ¿Se está escribiendo? Ahí «u» es una letra, no un atajo. */
function escribiendo(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el.closest !== "function") return false;
  return !!el.closest("input, textarea, select, [contenteditable=''], [contenteditable='true']");
}

/** ¿Hay algo flotando encima (un diálogo, un menú, el visor)? Escape es SUYO:
 *  cerrar el compositor con Escape no puede, además, cerrar el correo. */
function hayAlgoEncima(doc: Document): boolean {
  return !!doc.querySelector("[role='dialog'], [role='alertdialog'], [role='menu'], [role='listbox']");
}

/** ¿Esta tecla es «volver a la lista»? */
export function esAtajoDeVolver(e: TeclaPulsada, doc: Document): boolean {
  if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return false;
  if (e.key !== "u" && e.key !== "U" && e.key !== "Escape") return false;
  if (escribiendo(e.target)) return false;
  return !hayAlgoEncima(doc);
}

/** ¿Esta tecla es «deshacer» (la «z» de Gmail)?
 *
 *  ⚠️ Escribiendo, la z es una letra: en el buscador, en el compositor o en el
 *  buscador de «Mover a» no puede devolver correos a ningún lado. Con Ctrl/⌘
 *  tampoco: Ctrl+Z es el deshacer del TEXTO, del navegador, y no se le roba. Ni
 *  con un diálogo o un menú encima (la z es suya). */
export function esAtajoDeDeshacer(e: TeclaPulsada, doc: Document): boolean {
  if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return false;
  if (e.key !== "z") return false;
  if (escribiendo(e.target)) return false;
  return !hayAlgoEncima(doc);
}
