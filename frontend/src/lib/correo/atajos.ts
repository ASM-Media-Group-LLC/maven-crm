// Los atajos de teclado del correo. Por ahora uno: VOLVER A LA LISTA con «u» o
// Escape, como en Gmail, cuando el correo abierto ocupa toda la pantalla.

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
