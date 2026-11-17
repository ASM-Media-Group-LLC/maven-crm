// LA APP DE COMPUTADOR (desktop/, Electron).
//
// Cuando Maven corre dentro de la app de Mac o Windows, su preload expone
// `window.mavenEscritorio` y pone la clase `en-escritorio` en <html>. En el
// navegador nada de esto existe y todo lo de acá devuelve null / no hace nada.
// El contrato vive en desktop/src/preload.js: si se cambia allá, se cambia acá.

export type TramoDeApp = {
  app: string;
  titulo: string;
  url: string | null;
  desde: string;
  hasta: string;
  segundos: number;
  inactivos: number;
};

export type MavenEscritorio = {
  esApp: true;
  plataforma: "mac" | "windows" | "linux";
  insignia: (n: number) => void;
  llamadaEntrante: (datos: { id: string; nombre: string; detalle?: string; foto?: string | null }) => Promise<"contestar" | "rechazar" | "cerrada">;
  terminarLlamadaEntrante: (id: string) => void;
  flotante: (si?: boolean) => Promise<boolean>;
  alCambiarFlotante: (cb: (flotando: boolean) => void) => () => void;
  inactividad: () => Promise<number | null>;
  alUsoDeApps: (cb: (lote: TramoDeApp[]) => void) => () => void;
  /** Un link maven:// pidió abrir esta ruta (versiones de la app desde el 17/11/2026). */
  alAbrirRuta?: (cb: (ruta: string) => void) => () => void;
};

/** La app de computador, o null en el navegador (o en una versión vieja de la app sin esa función). */
export function escritorio(): MavenEscritorio | null {
  if (typeof window === "undefined") return null;
  const e = (window as unknown as { mavenEscritorio?: Partial<MavenEscritorio> }).mavenEscritorio;
  return e && e.esApp ? (e as MavenEscritorio) : null;
}

/** Pasa los tramos de la app al formato de la tabla argos_uso_apps (descarta lo inválido). */
export function filasDeUso(lote: TramoDeApp[], plataforma: string | undefined) {
  const recorta = (s: unknown, n: number) => (typeof s === "string" ? s.slice(0, n) : "");
  return lote
    .filter((t) => t && typeof t.app === "string" && t.app.trim() && Number.isFinite(t.segundos) && t.segundos >= 1)
    .map((t) => ({
      app: recorta(t.app, 120).trim(),
      titulo: recorta(t.titulo, 300),
      url: typeof t.url === "string" && /^https?:\/\//.test(t.url) ? t.url.slice(0, 500) : null,
      desde: t.desde,
      hasta: t.hasta,
      segundos: Math.min(3600, Math.round(t.segundos)),
      segundos_inactivo: Math.max(0, Math.min(3600, Math.round(t.inactivos || 0), Math.round(t.segundos))),
      plataforma: plataforma === "mac" || plataforma === "windows" || plataforma === "linux" ? plataforma : null,
    }));
}
