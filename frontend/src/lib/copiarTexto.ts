// Copiar un texto al portapapeles aunque el navegador no deje usar la API moderna.
//
// navigator.clipboard.writeText falla en marcos sin permiso de portapapeles (el
// panel de navegador de la app de escritorio, algunos iframes, http sin TLS). Ahí
// el botón decía «no se pudo copiar» y la llave recién creada —que se muestra una
// sola vez— había que copiarla a mano (Alvaro, 11/11/2026). El respaldo es el de
// siempre: un textarea fuera de pantalla, seleccionado, y execCommand("copy"), que
// sigue funcionando dentro del clic del usuario.

/** true si el texto quedó en el portapapeles. Llamar dentro del clic. */
export async function copiarTexto(texto: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(texto);
      return true;
    }
  } catch {
    // Sigue con el respaldo.
  }
  return copiarConSeleccion(texto);
}

function copiarConSeleccion(texto: string): boolean {
  if (typeof document === "undefined" || !document.body) return false;
  const area = document.createElement("textarea");
  area.value = texto;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.top = "0";
  area.style.left = "-9999px";
  area.style.opacity = "0";
  const activo = document.activeElement as HTMLElement | null;
  document.body.appendChild(area);
  area.focus();
  area.select();
  area.setSelectionRange(0, texto.length);
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  document.body.removeChild(area);
  activo?.focus?.();
  return ok;
}
