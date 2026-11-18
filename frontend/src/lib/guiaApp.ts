// GUÍA PARA INSTALAR LA APP DE MAVEN (Alvaro, 18/11/2026).
//
// Desde el viernes 20/11 Cowork en el computador funciona solo en la app de
// Maven (lib/coworkSoloApp.ts). La página /app (pages/app/GuiaAppPage.tsx) lleva
// a cada persona paso a paso: descargar, instalar, entrar con su mismo correo,
// dar los permisos y listo. El aviso y el bloqueo de Cowork enlazan aquí:
// importa RUTA_GUIA_APP en vez de escribir la ruta a mano.

import { DESCARGA_MAC, DESCARGA_WINDOWS } from "@/lib/coworkSoloApp";

/** La ruta de la guía. */
export const RUTA_GUIA_APP = "/app";

export type SistemaGuia = "mac" | "windows";

/** Qué pestaña va primero: la del equipo de quien mira. Cualquier otra cosa
 *  (Windows, Linux, un celular) abre en Windows, que es lo que tiene casi todo el equipo. */
export function sistemaDeLaGuia(ua: string, tactil: boolean): SistemaGuia {
  return /Macintosh/i.test(ua) && !tactil ? "mac" : "windows";
}

/** ¿Está mirando la guía desde un celular o tableta? Ahí no hace falta la app. */
export function esCelularOTableta(ua: string, tactil: boolean): boolean {
  return tactil || /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
}

/** El instalador de cada sistema (bucket público `descargas`). */
export function archivoDeDescarga(sistema: SistemaGuia): string {
  return sistema === "mac" ? DESCARGA_MAC : DESCARGA_WINDOWS;
}

export function urlDeDescarga(sistema: SistemaGuia, base = import.meta.env.VITE_SUPABASE_URL as string | undefined): string {
  return `${base ?? ""}/storage/v1/object/public/descargas/${archivoDeDescarga(sistema)}`;
}

/** Descargar Y ver la guía a la vez (18/11/2026: a Daniel le salió el aviso azul
 *  de Windows y nadie le había dicho qué hacer). Los botones de descarga de
 *  adentro de Maven llevan aquí: la guía se abre y la descarga arranca sola. */
export const RUTA_DESCARGAR_CON_GUIA = `${RUTA_GUIA_APP}?descargar=1`;

/** Los cinco pasos, en orden. Las claves de texto salen de aquí (guiaApp.paso.<paso>.*). */
export const PASOS_GUIA_APP = ["descargar", "instalar", "entrar", "permisos", "listo"] as const;
export type PasoGuiaApp = (typeof PASOS_GUIA_APP)[number];
