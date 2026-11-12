// POR QUÉ ESTÁ BAJANDO LA NOTA, AHORA (Monitoreo en vivo · Alvaro, 11/11/2026).
//
// El «quién la baja» del Pulso nunca tuvo datos: solo miraba monitor_eventos
// (las faltas de la IA de cámara de los últimos 5 min), y esa tabla estuvo VACÍA
// hasta el 11/11 —la IA de cámara estaba apagada—, mientras Argos llevaba días
// abriendo 60–240 alertas por día en argos_alertas que el Pulso no leía. Tampoco
// leía «se salió de Cowork» (cowork_fuera).
//
// Ahora el estado en vivo de cada persona junta TRES fuentes:
//   · argos   → sus alertas vivas de Argos (argos_alertas sin cerrar);
//   · fuera   → si está fuera de Cowork en su turno (cowork_fuera sin cerrar);
//   · rondin  → las faltas frescas de la cámara y el latido (como antes).
// Cada fuente aporta MOTIVOS; el peor manda (el de menos puntos vivos).
//
// «Sin señal» NO cuenta: es un fallo del rastreo, no del empleado (Alvaro, 05/11:
// «no tiene nada que ver»). El aviso le sigue llegando igual; solo no pinta a la
// persona como «bajando la nota».
//
// Funciones puras: los guards las prueban sin red.

export type EstadoVivo =
  | "trabajando" | "presente" | "pausa"
  | "celular" | "distraido" | "no_mira" | "camara_apagada" | "se_fue"
  | "fuera_cowork" | "fuera_de_lugar" | "sin_pantalla" | "pausa_de_mas"
  | "ausente";

/** Puntos de la NOTA VIVA por estado (la nota de ese instante, 0–100). El
 *  promedio de los conectados es la nota viva del equipo; cuanto menos vale el
 *  estado de alguien, más la baja. null = no está trabajando ahora: no cuenta. */
export const PUNTOS_VIVOS: Record<EstadoVivo, number | null> = {
  trabajando: 100, presente: 70, pausa: 55,
  pausa_de_mas: 40,
  camara_apagada: 30, distraido: 30, no_mira: 30,
  sin_pantalla: 25,
  celular: 15, se_fue: 15, fuera_de_lugar: 15,
  fuera_cowork: 0,
  ausente: null,
};

/** Estados que son «cometiendo un error ahora»: bajan la nota y salen en
 *  «Quién está bajando ahora». */
export const ESTADOS_PROBLEMA: EstadoVivo[] = [
  "fuera_cowork", "celular", "fuera_de_lugar", "se_fue", "sin_pantalla",
  "camara_apagada", "distraido", "no_mira", "pausa_de_mas",
];
export function esProblema(e: EstadoVivo): boolean {
  return ESTADOS_PROBLEMA.includes(e);
}

export type FuenteMotivo = "argos" | "fuera" | "rondin";

export interface MotivoVivo {
  fuente: FuenteMotivo;
  estado: EstadoVivo;
  /** El tipo crudo de la fuente (tipo de la alerta, de la falta…). */
  tipo: string;
  /** ISO de cuándo empezó. */
  desde: string;
  /** Lo que vio Argos, en sus palabras (puede faltar). */
  detalle: string | null;
  /** 1–3 (3 = grave). */
  gravedad: number;
  alertaId?: string;
  fueraId?: string;
  capturaPath?: string | null;
  revisadoAt?: string | null;
  revisadoPor?: string | null;
}

/** El estado en vivo de una alerta de Argos. null = no cuenta («sin señal»). */
export function estadoDeAlerta(tipo: string): EstadoVivo | null {
  switch (tipo) {
    case "fuera_de_lugar": return "fuera_de_lugar";
    case "sin_pantalla": return "sin_pantalla";
    case "pausa_de_mas": return "pausa_de_mas";
    case "camara_apagada":
    case "camara_tapada": return "camara_apagada";
    case "se_fue": return "se_fue";
    case "celular": return "celular";
    case "distraido": return "distraido";
    case "no_mira":
    case "cara_incompleta": return "no_mira";
    default: return null; // sin_senal y lo que no se conozca
  }
}

/** El estado de una falta fresca de la cámara (monitor_eventos). */
export function estadoDeFalta(tipo: string): EstadoVivo | null {
  return (["celular", "distraido", "no_mira", "camara_apagada", "se_fue"] as const).find((e) => e === tipo) ?? null;
}

const puntos = (e: EstadoVivo) => PUNTOS_VIVOS[e] ?? 101;

/** Orden de motivos: el peor primero (menos puntos), luego el más grave y luego
 *  el que lleva más tiempo. Un motivo ya revisado va después de uno sin revisar
 *  del mismo peso: lo nuevo es lo que hay que mirar. */
export function compararMotivos(a: MotivoVivo, b: MotivoVivo): number {
  return (puntos(a.estado) - puntos(b.estado))
    || (b.gravedad - a.gravedad)
    || ((a.revisadoAt ? 1 : 0) - (b.revisadoAt ? 1 : 0))
    || (Date.parse(a.desde) - Date.parse(b.desde));
}

export function elPeor(motivos: MotivoVivo[]): MotivoVivo | null {
  if (motivos.length === 0) return null;
  return [...motivos].sort(compararMotivos)[0];
}

/** Estado en vivo de una persona: un problema manda sobre la pausa; la pausa
 *  sobre el latido; sin nada, ausente. */
export function decidirEstado(input: {
  motivos: MotivoVivo[];
  pausa: { started_at: string } | null;
  latido: { last_at: string; trabajando: boolean | null; presente: boolean | null; fresco: boolean } | null;
  ahoraISO: string;
}): { estado: EstadoVivo; desde: string } {
  const peor = elPeor(input.motivos);
  if (peor) return { estado: peor.estado, desde: peor.desde };
  if (input.pausa) return { estado: "pausa", desde: input.pausa.started_at };
  if (input.latido?.fresco) {
    const l = input.latido;
    return { estado: l.trabajando ? "trabajando" : l.presente ? "presente" : "se_fue", desde: l.last_at };
  }
  return { estado: "ausente", desde: input.latido?.last_at ?? input.ahoraISO };
}

/** El enlace de la vista en vivo para el motivo que la abre. */
export function enlaceEnVivo(userId: string, motivo: MotivoVivo | null): string {
  const base = `/hr/en-vivo/${userId}`;
  if (motivo?.alertaId) return `${base}?alerta=${motivo.alertaId}`;
  if (motivo?.fueraId) return `${base}?fuera=${motivo.fueraId}`;
  return base;
}

/** Minutos enteros desde `desdeISO` (mínimo 0). */
export function minutosDesde(desdeISO: string | null | undefined, ahora = Date.now()): number {
  if (!desdeISO) return 0;
  const t = Date.parse(desdeISO);
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.floor((ahora - t) / 60_000));
}
