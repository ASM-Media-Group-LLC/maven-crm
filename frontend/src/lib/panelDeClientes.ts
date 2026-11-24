import { escritorio } from "@/lib/escritorio";
import { destinoDeEstaPestana } from "@/lib/puerta";

// «CLIENTES» EN EL MENÚ (19/11/2026). El panel de la plataforma («Tus clientes») vive en
// el EDIFICIO: la sesión de rusin24@gmail.com es del navegador, no de la app de Kash.
//
//   · En una pestaña del edificio (la cuenta de la plataforma): es una ruta más, /plataforma.
//   · En Kash (solo el dueño lo ve): abre https://app.maven-ai.me/plataforma aparte —
//     en la app de computador, en el navegador del equipo; en el navegador, en otra
//     pestaña. Ahí la puerta pide el correo de la plataforma y entra al edificio.
//
// Guarda: test/plataforma/clientesEnElMenu.test.tsx.

export const RUTA_PANEL_CLIENTES = "/plataforma";
export const URL_PANEL_CLIENTES = "https://app.maven-ai.me/plataforma";

/** ¿El «Clientes» de esta pestaña lleva adentro (edificio) o afuera (Kash)? */
export function clientesEsInterno(): boolean {
  return destinoDeEstaPestana() === "edificio";
}

/** ¿Se muestra «Clientes» en el menú de Kash? Solo al dueño (tenant_owners), y solo con
 *  la respuesta en la mano: cargando o con error (null) no se muestra. */
export function veClientesEnKash(esDueno: boolean | null): boolean {
  return esDueno === true;
}

/** Abre el panel de la plataforma desde Kash: navegador del equipo (app) u otra pestaña. */
export async function abrirPanelDeClientes(): Promise<void> {
  const app = escritorio();
  if (app?.abrirEnNavegador) {
    try {
      if (await app.abrirEnNavegador(URL_PANEL_CLIENTES)) return;
    } catch { /* se intenta como en el navegador */ }
  }
  window.open(URL_PANEL_CLIENTES, "_blank", "noopener");
}
