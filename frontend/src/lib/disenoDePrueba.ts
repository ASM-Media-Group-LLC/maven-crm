// Un diseño de prueba que solo ve quien lo prende con su link (11/11/2026: Alvaro
// quiere mirar el Argos pulido en su teléfono, con fotos reales, sin que el equipo
// lo vea). `?diseno=pulido` lo prende en este navegador y `?diseno=normal` lo apaga;
// queda guardado en este navegador hasta que se apague.

const CLAVE = "maven:diseno-argos";
const PRENDIDO = "pulido";
const APAGADO = "normal";

/** Lee el `?diseno=` de la dirección, lo guarda y dice si el diseño de prueba está prendido. */
export function disenoPulidoPrendido(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const pedido = new URLSearchParams(window.location.search).get("diseno");
    if (pedido === PRENDIDO) window.localStorage.setItem(CLAVE, PRENDIDO);
    if (pedido === APAGADO) window.localStorage.removeItem(CLAVE);
    return window.localStorage.getItem(CLAVE) === PRENDIDO;
  } catch {
    return false;
  }
}
