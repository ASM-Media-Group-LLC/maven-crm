// Minutos de gracia de Argos (Alvaro, 16/11/2026).
//
// Cada turno trae 15 min sin pantalla y 15 min sin cámara de gracia. Lo que pasa
// de ahí no se paga: «el contador sigue… le dice cuántos minutos se conectó y
// cuántos le va a pagar». La cuenta la hace la base (argos_gracia_calculo, en
// supabase/migrations/20261116192437_argos_minutos_de_gracia.sql); aquí solo se
// lee y se dice en palabras. RR. HH. puede devolver minutos (argos_dar_gracia).

/** Lo que devuelven mi_gracia_hoy y argos_gracia_de (en segundos, la gracia en minutos). */
export interface GraciaTurno {
  turno?: string | null;
  aplica?: boolean | null;
  inicio: string | null;
  fin: string | null;
  conectado_seg: number | null;
  trabajo_seg: number | null;
  pausa_seg: number | null;
  sin_pantalla_seg: number | null;
  sin_camara_seg: number | null;
  gracia_pantalla_min: number | null;
  gracia_camara_min: number | null;
  extra_pantalla_min: number | null;
  extra_camara_min: number | null;
  descuento_seg: number | null;
  a_pagar_seg: number | null;
  ensayo: boolean | null;
}

/** Cómo va una de las dos gracias (pantalla o cámara). */
export interface UsoGracia {
  /** Minutos usados (sin pantalla o sin cámara), redondeados. */
  usados: number;
  /** Minutos de gracia del turno (15 + lo que devolvió RR. HH.). */
  gracia: number;
  /** Lo que le queda de gracia. */
  queda: number;
  /** Lo que ya pasó de la gracia: eso no se paga. */
  exceso: number;
  agotada: boolean;
}

export function minDeSeg(seg: number | null | undefined): number {
  const n = Number(seg);
  return Number.isFinite(n) && n > 0 ? Math.round(n / 60) : 0;
}

export function usoGracia(usadosSeg: number | null | undefined, graciaMin: number | null | undefined): UsoGracia {
  const usados = minDeSeg(usadosSeg);
  const gracia = Math.max(0, Math.round(Number(graciaMin) || 0));
  return {
    usados,
    gracia,
    queda: Math.max(0, gracia - usados),
    exceso: Math.max(0, usados - gracia),
    agotada: usados >= gracia,
  };
}

/** El resumen del turno, en minutos, listo para pintar. */
export interface ResumenGracia {
  conectado: number;
  pausa: number;
  aPagar: number;
  descuento: number;
  pantalla: UsoGracia;
  camara: UsoGracia;
  ensayo: boolean;
  /** Minutos que devolvió RR. HH. en este turno (pantalla + cámara). */
  devueltos: number;
}

export function resumenGracia(g: GraciaTurno): ResumenGracia {
  return {
    conectado: minDeSeg(g.conectado_seg),
    pausa: minDeSeg(g.pausa_seg),
    aPagar: minDeSeg(g.a_pagar_seg),
    descuento: minDeSeg(g.descuento_seg),
    pantalla: usoGracia(g.sin_pantalla_seg, g.gracia_pantalla_min),
    camara: usoGracia(g.sin_camara_seg, g.gracia_camara_min),
    ensayo: g.ensayo === true,
    devueltos: Math.max(0, Number(g.extra_pantalla_min) || 0) + Math.max(0, Number(g.extra_camara_min) || 0),
  };
}

/** «7 h 05 min», «45 min», «0 min». */
export function formatoMinutos(min: number): string {
  const m = Math.max(0, Math.round(Number(min) || 0));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r === 0 ? `${h} h` : `${h} h ${String(r).padStart(2, "0")} min`;
}

/** Tono del contador: bien, se le está acabando (≤ 5 min), o ya se descuenta. */
export type TonoGracia = "bien" | "poca" | "descuento";

export function tonoGracia(r: ResumenGracia): TonoGracia {
  if (r.descuento > 0 || r.pantalla.exceso > 0 || r.camara.exceso > 0) return "descuento";
  if (Math.min(r.pantalla.queda, r.camara.queda) <= 5) return "poca";
  return "bien";
}

/** Validación del formulario de RR. HH. (la base vuelve a validar). */
export function validarDevolucion(pantalla: number, camara: number, motivo: string): "minutos" | "motivo" | null {
  const p = Math.round(Number(pantalla) || 0);
  const c = Math.round(Number(camara) || 0);
  if (p < 0 || c < 0 || p > 480 || c > 480 || p + c === 0) return "minutos";
  if (motivo.trim().length < 3) return "motivo";
  return null;
}
