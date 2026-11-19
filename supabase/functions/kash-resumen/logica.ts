// El resumen de Kash para el panel del dueño (tanda 5, 19/11/2026): SOLO números.
// Ni nombres, ni correos, ni ids: la tarjeta de Kash en el edificio es «solo mirar».
// Lo arma armarResumen() con lo que index.ts cuenta (todo lecturas). Lo prueba
// kash-resumen/logica.test.ts (incluye la guarda de que no salga nada personal).

export interface Conteos {
  /** Personas del equipo (miembros de una agencia, sin papelera). */
  personas: number;
  /** En vivo en Cowork ahora (latido de los últimos 90 s). */
  enVivo: number;
  /** Segundos con pantalla hoy, por persona (solo los valores; los ids no salen de index.ts). */
  segundosPantallaHoy: number[];
  capturasCamara: number;
  capturasConCara: number;
  capturasPantalla: number;
  capturasDistraido: number;
  argosGastoHoyUsd: number | null;
  argosSaldoUsd: number | null;
  argosSaldoEstado: string | null;
  alertasAbiertas: number;
  alertasGraves: number;
}

/** Las únicas llaves que salen de Kash. La guarda del test lo comprueba. */
export const LLAVES_DEL_RESUMEN = [
  "personas",
  "en_vivo",
  "nota_argos_hoy",
  "nota_con_datos",
  "argos_gasto_hoy_usd",
  "argos_saldo_usd",
  "argos_saldo_estado",
  "alertas_abiertas",
  "alertas_graves",
  "necesita_de_ti",
  "calculado_at",
] as const;

export type Resumen = Record<(typeof LLAVES_DEL_RESUMEN)[number], number | string | null>;

const ESTADOS_SALDO = new Set(["bien", "pocos_dias", "se_acaba_hoy", "anotar", "sin_saldo", "sin_dato"]);
const n = (v: number) => (Number.isFinite(v) && v > 0 ? Math.round(v) : 0);
const usd = (v: number | null) => (v === null || !Number.isFinite(v) ? null : Math.round(v * 100) / 100);

/** La nota de Argos de hoy, del equipo: la misma fórmula que el edificio (45 pantalla
 *  sobre 8 h + 35 cámara con la cara + 20 de foco), con la pantalla promediada por
 *  persona y la cámara y el foco sobre las capturas del equipo (contar es barato; no
 *  se bajan las capturas). null si nadie tiene datos hoy. */
export function notaDelEquipo(c: Pick<Conteos, "segundosPantallaHoy" | "capturasCamara" | "capturasConCara" | "capturasPantalla" | "capturasDistraido">): { nota: number | null; conDatos: number } {
  const segs = c.segundosPantallaHoy.filter((s) => Number.isFinite(s) && s >= 0);
  const conDatos = segs.length;
  if (conDatos === 0 && c.capturasCamara === 0 && c.capturasPantalla === 0) return { nota: null, conDatos: 0 };
  const pantalla = conDatos > 0 ? segs.reduce((a, s) => a + Math.min(1, s / (8 * 3600)) * 45, 0) / conDatos : 0;
  const camara = c.capturasCamara > 0 ? (Math.min(c.capturasConCara, c.capturasCamara) / c.capturasCamara) * 35 : 0;
  const foco = c.capturasPantalla > 0 ? (1 - Math.min(c.capturasDistraido, c.capturasPantalla) / c.capturasPantalla) * 20 : 20;
  return { nota: Math.max(0, Math.min(100, Math.round(pantalla + camara + foco))), conDatos };
}

export function armarResumen(c: Conteos, ahora: Date): Resumen {
  const { nota, conDatos } = notaDelEquipo(c);
  return {
    personas: n(c.personas),
    en_vivo: n(c.enVivo),
    nota_argos_hoy: nota,
    nota_con_datos: conDatos,
    argos_gasto_hoy_usd: usd(c.argosGastoHoyUsd),
    argos_saldo_usd: usd(c.argosSaldoUsd),
    argos_saldo_estado: c.argosSaldoEstado && ESTADOS_SALDO.has(c.argosSaldoEstado) ? c.argosSaldoEstado : null,
    alertas_abiertas: n(c.alertasAbiertas),
    alertas_graves: n(c.alertasGraves),
    necesita_de_ti: n(c.alertasGraves),
    calculado_at: ahora.toISOString(),
  };
}

/** Inicio del día de hoy en Bogotá (UTC−5, sin horario de verano), en ISO. */
export function inicioDelDiaBogota(ahora: Date): string {
  const b = new Date(ahora.getTime() - 5 * 3600_000);
  return new Date(Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate(), 5, 0, 0)).toISOString();
}
