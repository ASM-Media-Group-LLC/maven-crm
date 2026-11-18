// COWORK SOLO EN LA APP DE COMPUTADOR (Alvaro, 17/11/2026: Argos a USD 15).
//
// Para que Argos sepa gratis qué app y qué página tiene cada persona al frente,
// el equipo tiene que trabajar en la app de Maven para computador. Decidido:
// esta semana, aviso en el navegador del computador; desde el lunes 24/11
// (monitor_config.cowork_solo_app_desde, se puede mover sin subir código)
// Cowork en el navegador de un computador manda a la app. Celular: nada cambia.

export type EstadoSoloApp = "nada" | "aviso" | "bloqueo";

/** ¿Es el navegador de un computador (Mac o Windows), no la app ni un celular/tableta? */
export function esNavegadorDeComputador(p: { ua: string; tactil: boolean; enApp: boolean }): boolean {
  if (p.enApp || p.tactil) return false;
  if (/Android|iPhone|iPad|iPod|Mobile/i.test(p.ua)) return false;
  return /Macintosh|Windows/i.test(p.ua);
}

/** Qué mostrar en Cowork. Sin fecha (o si no se pudo leer) no se bloquea nunca. */
export function estadoSoloApp(p: { ua: string; tactil: boolean; enApp: boolean; desde: Date | null; ahora: Date }): EstadoSoloApp {
  if (!p.desde || Number.isNaN(p.desde.getTime())) return "nada";
  if (!esNavegadorDeComputador(p)) return "nada";
  return p.ahora >= p.desde ? "bloqueo" : "aviso";
}

export const DESCARGA_MAC = "Maven-Mac.dmg";
export const DESCARGA_WINDOWS = "Maven-Windows.exe";
export const descargaParaEsteEquipo = (ua: string) => (/Macintosh/i.test(ua) ? DESCARGA_MAC : DESCARGA_WINDOWS);
