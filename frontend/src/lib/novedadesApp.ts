// QUÉ CAMBIÓ EN LA APP (Alvaro, 18/11/2026: «cuando regreses te dice siempre qué
// fue lo que cambió, lo que se mejoró, lo que se reparó»).
//
// Cada versión de la app que sale agrega aquí su entrada (fecha + claves de
// texto en lib/i18n/pwa.ts). Al volver a abrir Maven con una versión distinta a
// la última que vio la persona, sale la tarjeta con lo que cambió desde la
// última vez que la cerró. La primera vez solo se anota la versión.

import type { TranslationKey } from "@/lib/i18n";

export interface Novedad {
  /** Cuándo salió (ISO). */
  fecha: string;
  nuevo: TranslationKey[];
  mejoro: TranslationKey[];
  reparado: TranslationKey[];
}

export const NOVEDADES: Novedad[] = [
  {
    fecha: "2026-11-18T12:00:00-05:00",
    nuevo: ["pwa.novedades.n1.medidor", "pwa.novedades.n1.actualizar", "pwa.novedades.n1.tarjeta"],
    mejoro: ["pwa.novedades.n1.videoPausa"],
    reparado: ["pwa.novedades.n1.permisoMac"],
  },
];

/** Un aviso a la vez (Alvaro, 18/11: nada encimado): mientras la tarjeta de
 *  novedades está abierta, la franja de versión nueva espera. */
let tarjetaAbierta = false;
const oyentes = new Set<(abierta: boolean) => void>();
export function marcarTarjetaAbierta(abierta: boolean) {
  tarjetaAbierta = abierta;
  oyentes.forEach((f) => f(abierta));
}
export function alCambiarTarjeta(f: (abierta: boolean) => void): () => void {
  oyentes.add(f);
  f(tarjetaAbierta);
  return () => { oyentes.delete(f); };
}

export const CLAVE_VERSION = "maven.app.versionVista";
export const CLAVE_VISTAS_HASTA = "maven.app.novedadesHasta";

/** La versión de la app, del user agent («MavenEscritorio/2.1.x»). */
export function versionDeLaApp(ua: string): string | null {
  return /MavenEscritorio\/([\w.-]+)/.exec(ua)?.[1] ?? null;
}

/** Qué mostrar al abrir: las novedades desde la última vez, si cambió la versión. */
export function novedadesParaMostrar(p: {
  version: string | null; vista: string | null; vistasHasta: string | null; lista?: Novedad[];
}): Novedad[] {
  if (!p.version || !p.vista || p.vista === p.version) return [];
  const desde = p.vistasHasta ? new Date(p.vistasHasta).getTime() : 0;
  return (p.lista ?? NOVEDADES).filter((n) => new Date(n.fecha).getTime() > desde)
    .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
}
