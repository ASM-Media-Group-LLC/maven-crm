// EL CARTEL DE «VERSIÓN NUEVA», EN EL CENTRO (Alvaro, 18/11/2026: «que cada
// cambio que se vaya a producción salga el botón en el medio para que lo
// actualicen»). Antes Maven se recargaba sola en silencio y, si no podía, dejaba
// un avisito abajo que nadie veía ni entendía.
//
// pwa.ts lo abre cuando hay versión nueva y la persona no está en una llamada;
// components/CartelVersionNueva.tsx lo pinta. Es un estado mínimo, sin React,
// para que pwa.ts (que carga aparte) y el componente se hablen.

type Oyente = (abierto: boolean) => void;

let actualizar: (() => Promise<boolean> | void) | null = null;
const oyentes = new Set<Oyente>();

/** Hay versión nueva: abre el cartel con lo que hace el botón «Actualizar». */
export function abrirCartelVersionNueva(fn: () => Promise<boolean> | void): void {
  actualizar = fn;
  oyentes.forEach((o) => o(true));
}

export function cartelVersionNuevaAbierto(): boolean {
  return actualizar !== null;
}

/** El botón: pasa a la versión nueva. Devuelve false si no pudo (entró a una llamada). */
export async function actualizarDesdeElCartel(): Promise<boolean> {
  if (!actualizar) return false;
  try {
    return (await actualizar()) !== false;
  } catch {
    window.location.reload();
    return true;
  }
}

export function alCambiarCartelVersionNueva(fn: Oyente): () => void {
  oyentes.add(fn);
  return () => { oyentes.delete(fn); };
}

// EL DUEÑO, AL INSTANTE (Alvaro, 18/11/2026: «en mi cuenta, a los 30 segundos de
// cambiar algo, quiero el update puesto de una vez para probarlo»). pwa.ts deja
// aquí cómo buscar versión nueva ya; el cartel, con la cuenta del dueño, lo
// llama cada 30 s y, si hay versión nueva, actualiza solo (sin llamada).
let buscarYa: (() => void) | null = null;

export function registrarBuscarVersionYa(fn: () => void): void {
  buscarYa = fn;
}

export function buscarVersionYa(): void {
  buscarYa?.();
}
