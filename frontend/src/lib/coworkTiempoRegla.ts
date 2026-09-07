// La regla del reloj de Cowork, DEL LADO DEL FRONTEND.
//
// ⚠️ ES UNA COPIA de supabase/functions/_shared/cowork-tiempo.ts, y tiene que
// serlo: el Dockerfile del frontend construye con un contexto que EXCLUYE la
// carpeta supabase/ (.dockerignore), así que un import
// "../../../supabase/functions/..." compila en tu máquina y ROMPE el build de
// Dokploy. Pasó el 07/09/2026: seis PR mergeados y ninguno llegó a producción
// en tres horas hasta que se vio que el build fallaba por esto.
//
// El test `coworkTiempoEstado.test.ts` compara las dos implementaciones sobre
// la misma matriz de casos: si alguien cambia una y no la otra, falla.
// La lógica en sí está explicada en el archivo de la edge.

export type EstadoTiempo = "activo" | "pausa" | "sin_camara" | "sin_pantalla" | "fuera_de_camara";

export const ESTADOS_TIEMPO: readonly EstadoTiempo[] = ["activo", "pausa", "sin_camara", "sin_pantalla", "fuera_de_camara"];

export const UMBRAL_FUERA_DE_CAMARA_MS = 60_000;
export const INTERVALO_LATIDO_MS = 30_000;
export const LATIDO_VENCIDO_MS = 90_000;

export interface Latido {
  camOn: boolean;
  screenShareOn: boolean;
  faceState?: string | null;
  faceSince?: number | null;
  onBreak?: boolean;
}

export interface Veredicto {
  estado: EstadoTiempo;
  detalle: string | null;
}

export function estadoDeTiempo(l: Latido, ahora: number, umbralFueraMs = UMBRAL_FUERA_DE_CAMARA_MS): Veredicto {
  if (l.onBreak) return { estado: "pausa", detalle: null };
  if (!l.camOn) return { estado: "sin_camara", detalle: null };
  if (!l.screenShareOn) return { estado: "sin_pantalla", detalle: null };
  if (l.faceState === "no_face") {
    const desde = typeof l.faceSince === "number" && l.faceSince <= ahora ? l.faceSince : ahora;
    if (ahora - desde >= umbralFueraMs) return { estado: "fuera_de_camara", detalle: "no_face" };
  }
  return { estado: "activo", detalle: l.faceState ?? null };
}

export function cuentaComoTrabajo(estado: EstadoTiempo): boolean {
  return estado === "activo";
}
