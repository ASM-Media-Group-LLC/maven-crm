// AUSENCIAS Y ASISTENCIA (20/11/2026): la lógica que se puede probar sin red.
//
// La regla de verdad vive en la base (20261120150000_ausencias.sql): días
// hábiles (ausencias_dias_habiles), saldo (ausencias_saldo), aviso mínimo
// (ausencia_solicitar) y día libre (dia_libre). Aquí va el MISMO cálculo para que
// el formulario avise antes de enviar; si difieren, manda el servidor.
import type { TranslationKey } from "@/lib/i18n";

export type TipoAusencia = "vacaciones" | "permiso" | "incapacidad" | "dia_libre";
export type EstadoAusencia = "pendiente_jefe" | "pendiente_rrhh" | "aprobada" | "rechazada" | "cancelada";
export type EstadoAsistencia = "presente" | "tarde" | "falto" | "sin_entrada" | "pendiente" | "descanso" | "festivo" | "ausente";
export type EnVivo = "conectado" | "en_pausa" | "desconectado";
export type Alcance = "all" | "subordinates" | "self";

export const TIPOS: TipoAusencia[] = ["vacaciones", "permiso", "incapacidad", "dia_libre"];

export const ETIQUETA_TIPO: Record<TipoAusencia, TranslationKey> = {
  vacaciones: "aus.tipo.vacaciones",
  permiso: "aus.tipo.permiso",
  incapacidad: "aus.tipo.incapacidad",
  dia_libre: "aus.tipo.dia_libre",
};
export const ETIQUETA_ESTADO: Record<EstadoAusencia, TranslationKey> = {
  pendiente_jefe: "aus.estado.pendiente_jefe",
  pendiente_rrhh: "aus.estado.pendiente_rrhh",
  aprobada: "aus.estado.aprobada",
  rechazada: "aus.estado.rechazada",
  cancelada: "aus.estado.cancelada",
};
export const ETIQUETA_VIVO: Record<EnVivo, TranslationKey> = {
  conectado: "aus.asis.vivo.conectado",
  en_pausa: "aus.asis.vivo.en_pausa",
  desconectado: "aus.asis.vivo.desconectado",
};

export interface Politica {
  vacaciones_dias_anio: number;
  aviso_vacaciones_dias: number;
  aviso_permiso_dias: number;
  aviso_dia_libre_dias: number;
}

// ─── Fechas (YYYY-MM-DD, sin zona: el día de Bogotá) ─────────────────────────

export function aFecha(s: string): Date {
  const [y, m, d] = s.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
export function deFecha(d: Date): string {
  return d.toISOString().slice(0, 10);
}
export function sumarDias(s: string, n: number): string {
  const d = aFecha(s);
  d.setUTCDate(d.getUTCDate() + n);
  return deFecha(d);
}
export function diferenciaDias(a: string, b: string): number {
  return Math.round((aFecha(b).getTime() - aFecha(a).getTime()) / 86_400_000);
}
export function diaDeSemana(s: string): number {
  return aFecha(s).getUTCDay();
}
/** Hoy en Bogotá (UTC-5, sin horario de verano). */
export function hoyBogota(ahora: number = Date.now()): string {
  return new Date(ahora - 5 * 3_600_000).toISOString().slice(0, 10);
}
/** Lunes de la semana de esa fecha. */
export function lunesDe(s: string): string {
  const dow = diaDeSemana(s);
  return sumarDias(s, dow === 0 ? -6 : 1 - dow);
}
export function rangoDias(desde: string, hasta: string): string[] {
  const out: string[] = [];
  for (let d = desde; d <= hasta; d = sumarDias(d, 1)) out.push(d);
  return out;
}
export function primeroDelMes(s: string): string {
  return `${s.slice(0, 7)}-01`;
}
export function ultimoDelMes(s: string): string {
  const d = aFecha(primeroDelMes(s));
  d.setUTCMonth(d.getUTCMonth() + 1);
  d.setUTCDate(0);
  return deFecha(d);
}

/** ¿Se cruzan dos rangos de días (incluidos los extremos)? */
export function seSolapan(a: { desde: string; hasta: string }, b: { desde: string; hasta: string }): boolean {
  return a.desde <= b.hasta && b.desde <= a.hasta;
}

/**
 * Días hábiles de una ausencia: los días en que la persona trabaja (según su
 * horario: `trabaja[dow]`), sin festivos. Sin ningún día de trabajo, de lunes a
 * viernes (como ausencias_dias_habiles). Parcial = medio día.
 */
export function diasHabiles(
  desde: string, hasta: string, trabaja: boolean[], festivos: ReadonlySet<string>, parcial = false,
): number {
  if (!desde || !hasta || hasta < desde) return 0;
  if (parcial) return 0.5;
  const semana = trabaja.some(Boolean) ? trabaja : [false, true, true, true, true, true, false];
  return rangoDias(desde, hasta).filter((d) => semana[diaDeSemana(d)] && !festivos.has(d)).length;
}

/** Días de vacaciones acumulados desde el ingreso (como ausencias_saldo). */
export function vacacionesAcumuladas(fechaIngreso: string, hoy: string, diasPorAnio: number): number {
  const dias = Math.max(0, diferenciaDias(fechaIngreso, hoy));
  return Math.round(((diasPorAnio * dias) / 365) * 100) / 100;
}

/** Anticipación que pide un tipo (la incapacidad, ninguna). */
export function avisoMinimo(tipo: TipoAusencia, p: Politica): number {
  switch (tipo) {
    case "vacaciones": return p.aviso_vacaciones_dias;
    case "permiso": return p.aviso_permiso_dias;
    case "dia_libre": return p.aviso_dia_libre_dias;
    default: return 0;
  }
}
/** Primer día que se puede pedir ese tipo. */
export function primerDiaPermitido(tipo: TipoAusencia, p: Politica, hoy: string): string {
  return sumarDias(hoy, avisoMinimo(tipo, p));
}

export type ErrorSolicitud = "fechas" | "aviso" | "saldo" | "adjunto" | null;
export function validarSolicitud(s: {
  tipo: TipoAusencia; desde: string; hasta: string; parcial: boolean; horaDesde?: string; horaHasta?: string;
  tieneAdjunto: boolean; dias: number; saldoLibre: number | null; politica: Politica; hoy: string;
}): ErrorSolicitud {
  if (!s.desde || !s.hasta || s.hasta < s.desde) return "fechas";
  if (s.parcial && (s.desde !== s.hasta || !s.horaDesde || !s.horaHasta || s.horaHasta <= s.horaDesde || s.tipo === "vacaciones")) return "fechas";
  if (s.tipo !== "incapacidad" && s.desde < primerDiaPermitido(s.tipo, s.politica, s.hoy)) return "aviso";
  if (s.tipo === "incapacidad" && !s.tieneAdjunto) return "adjunto";
  if (s.tipo === "vacaciones" && s.saldoLibre != null && s.dias > s.saldoLibre) return "saldo";
  return null;
}

// ─── Asistencia ──────────────────────────────────────────────────────────────

export interface FilaAsistencia {
  user_id: string;
  nombre: string | null;
  avatar_url: string | null;
  avatar_seed: string | null;
  equipo: string | null;
  dia: string;
  turno_inicio: string | null;
  turno_fin: string | null;
  estado: EstadoAsistencia;
  entrada_at: string | null;
  tarde_min: number | null;
  trabajado_min: number | null;
  turno_min: number | null;
  ausencia_id: string | null;
  ausencia_tipo: TipoAusencia | null;
  ausencia_estado: EstadoAusencia | null;
  ausencia_pagada: boolean | null;
  ausencia_parcial: boolean | null;
  festivo: string | null;
  en_vivo: EnVivo | null;
}

export interface ResumenDia { presentes: number; tarde: number; faltaron: number; fuera: number; total: number }

/** El resumen del día para el Inicio y la pestaña Hoy. */
export function resumirDia(filas: FilaAsistencia[]): ResumenDia {
  const r: ResumenDia = { presentes: 0, tarde: 0, faltaron: 0, fuera: 0, total: filas.length };
  for (const f of filas) {
    if (f.estado === "presente") r.presentes++;
    else if (f.estado === "tarde") { r.presentes++; r.tarde++; }
    else if (f.estado === "falto" || f.estado === "sin_entrada") r.faltaron++;
    else if (f.estado === "ausente") r.fuera++;
  }
  return r;
}

/** Quién está fuera cada día (cobertura del mes): solo ausencias aprobadas. */
export function fueraPorDia(filas: FilaAsistencia[]): Map<string, FilaAsistencia[]> {
  const m = new Map<string, FilaAsistencia[]>();
  for (const f of filas) {
    if (f.estado !== "ausente") continue;
    const k = f.dia.slice(0, 10);
    m.set(k, [...(m.get(k) ?? []), f]);
  }
  return m;
}

export const ETIQUETA_ASIS: Record<EstadoAsistencia, TranslationKey> = {
  presente: "aus.asis.presente",
  tarde: "aus.asis.tarde",
  falto: "aus.asis.falto",
  sin_entrada: "aus.asis.sin_entrada",
  pendiente: "aus.asis.pendiente",
  descanso: "aus.asis.descanso",
  festivo: "aus.asis.festivo",
  ausente: "aus.asis.ausente",
};

/** Color por rol del sistema (nunca morado de fondo). */
export function tonoAsistencia(e: EstadoAsistencia): string {
  switch (e) {
    case "presente": return "bg-success/15 text-foreground";
    case "tarde": return "bg-warning/20 text-foreground";
    case "falto": return "bg-destructive/15 text-foreground";
    case "sin_entrada": return "bg-destructive/10 text-foreground";
    case "ausente": return "bg-foreground/[0.08] text-foreground";
    case "festivo": return "bg-foreground/[0.06] text-muted-foreground";
    default: return "bg-foreground/[0.04] text-muted-foreground";
  }
}

export function minutosAHoras(min: number | null | undefined): string {
  const m = Math.max(0, Math.round(min ?? 0));
  return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}`;
}

/** Hora de Bogotá HH:MM de un timestamp. */
export function horaBogota(iso: string | null): string {
  if (!iso) return "";
  return new Date(Date.parse(iso) - 5 * 3_600_000).toISOString().slice(11, 16);
}
