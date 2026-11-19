// RR. HH. JUZGA A ARGOS (Alvaro, 19/11/2026).
//
// Un caso por persona y día con todo lo que Argos marcó; RR. HH. decide
// «cometió», «no cometió» o «justificado», siempre con una frase. Aquí vive la
// lógica sin pantalla: los tipos que devuelve la base (argos_casos_del_dia,
// argos_caso, argos_reporte_rrhh) y cómo se convierte el resumen en chips.

import type { TranslationKey } from "@/lib/i18n";

export type Veredicto = "cometio" | "no_cometio" | "justificado";
export type Tono = "grave" | "aviso" | "suave";

export interface ResumenCaso {
  alertas?: Record<string, { n: number; min: number }>;
  graves?: { sin_actividad?: number; fuera_del_trabajo?: number };
  min_marcados?: number;
  fotos_malas?: number;
  reportes_n?: number;
  llamados_n?: number;
  videos_n?: number;
  videos_min?: number;
  no_entro?: { llamados?: number; reportado_at?: string } | null;
  actividad?: {
    medido_min?: number;
    sin_tocar_min?: number;
    bloqueada_min?: number;
    ajenas_min?: number;
    top_ajenas?: Array<{ nombre: string; min: number }>;
  };
  fotos?: string[];
}

export interface HistorialCaso {
  veredicto_antes: Veredicto | null;
  veredicto: Veredicto;
  frase: string;
  por: string | null;
  at: string;
}

export interface CasoArgos {
  id: string;
  user_id: string;
  nombre: string | null;
  avatar_url: string | null;
  puesto: string | null;
  equipo: string | null;
  dia: string;
  resumen: ResumenCaso;
  gravedad: 1 | 2 | 3;
  foto_path: string | null;
  veredicto: Veredicto | null;
  frase: string | null;
  juzgado_por: string | null;
  juzgado_at: string | null;
  en_curso: boolean;
  puede_juzgar: boolean;
  puede_corregir: boolean;
  historial: HistorialCaso[];
}

export interface FuncionesCasos {
  juzgar: boolean;
  obligado: boolean;
  corregir: boolean;
  reporte: boolean;
  jefe: boolean;
  dueno: boolean;
}

export interface DiaConCasos { dia: string; total: number; pendientes: number }

export interface FilaReporte {
  id: string;
  user_id: string;
  nombre: string | null;
  puesto: string | null;
  veredicto: Veredicto | null;
  frase: string | null;
  juez: string | null;
  gravedad: 1 | 2 | 3;
  que: string;
  foto_path: string | null;
  corregido: boolean;
}

export interface ReporteRrhh {
  dia: string;
  total: number;
  cometio: number;
  no_cometio: number;
  justificado: number;
  sin_revisar: number;
  casos: FilaReporte[];
}

/** ¿Ve la pestaña de revisión? Cualquiera de las funciones (o el dueño). */
export function veRevision(f: FuncionesCasos | null | undefined): boolean {
  return !!f && (f.dueno || f.juzgar || f.corregir || f.reporte || f.jefe);
}

export interface Chip {
  clave: string;
  etiqueta: TranslationKey;
  vars: Record<string, string | number>;
  tono: Tono;
}

const n = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : Number(v) || 0);

/** Lo que pasó, en chips ordenados de lo más grave a lo más suave. */
export function chipsDelCaso(r: ResumenCaso | null | undefined): Chip[] {
  if (!r) return [];
  const a = r.alertas ?? {};
  const act = r.actividad ?? {};
  const out: Chip[] = [];
  const alerta = (tipo: string, etiqueta: TranslationKey, tono: Tono) => {
    const x = a[tipo];
    if (x && (n(x.min) > 0 || n(x.n) > 0)) out.push({ clave: tipo, etiqueta, vars: { n: n(x.n), min: n(x.min) }, tono });
  };
  if (n(r.graves?.sin_actividad) > 0) out.push({ clave: "grave_sin_actividad", etiqueta: "hr.casos.chip.graveSinActividad", vars: { n: n(r.graves?.sin_actividad) }, tono: "grave" });
  if (n(r.graves?.fuera_del_trabajo) > 0) out.push({ clave: "grave_fuera", etiqueta: "hr.casos.chip.graveFuera", vars: { n: n(r.graves?.fuera_del_trabajo) }, tono: "grave" });
  if (r.no_entro) out.push({ clave: "no_entro", etiqueta: "hr.casos.chip.noEntro", vars: {}, tono: "grave" });
  alerta("celular", "hr.casos.chip.celular", "grave");
  alerta("fuera_de_lugar", "hr.casos.chip.fueraDeLugar", "grave");
  if (n(r.reportes_n) > 0) out.push({ clave: "reportes", etiqueta: "hr.casos.chip.reportado", vars: { n: n(r.reportes_n) }, tono: "grave" });
  if (n(act.ajenas_min) >= 5) {
    const top = act.top_ajenas?.[0]?.nombre?.trim();
    out.push(top
      ? { clave: "ajenas", etiqueta: "hr.casos.chip.ajenaCon", vars: { app: top, min: n(act.ajenas_min) }, tono: "aviso" }
      : { clave: "ajenas", etiqueta: "hr.casos.chip.ajenas", vars: { min: n(act.ajenas_min) }, tono: "aviso" });
  }
  if (n(act.sin_tocar_min) >= 10) out.push({ clave: "sin_tocar", etiqueta: "hr.casos.chip.sinTocar", vars: { min: n(act.sin_tocar_min) }, tono: "aviso" });
  alerta("distraido", "hr.casos.chip.distraido", "aviso");
  alerta("sin_pantalla", "hr.casos.chip.sinPantalla", "aviso");
  alerta("pausa_de_mas", "hr.casos.chip.pausaDeMas", "aviso");
  if (n(act.bloqueada_min) >= 10) out.push({ clave: "bloqueada", etiqueta: "hr.casos.chip.bloqueada", vars: { min: n(act.bloqueada_min) }, tono: "suave" });
  alerta("sin_senal", "hr.casos.chip.sinSenal", "suave");
  if (n(r.llamados_n) > 0) out.push({ clave: "llamados", etiqueta: "hr.casos.chip.llamados", vars: { n: n(r.llamados_n) }, tono: "suave" });
  if (n(r.videos_n) > 0) out.push({ clave: "videos", etiqueta: "hr.casos.chip.videos", vars: { n: n(r.videos_n) }, tono: "suave" });
  return out;
}

/** Las fotos del caso sin repetir, la principal primero. */
export function fotosDelCaso(c: Pick<CasoArgos, "foto_path" | "resumen">): string[] {
  const todas = [c.foto_path, ...(c.resumen?.fotos ?? [])].filter((p): p is string => !!p);
  return [...new Set(todas)];
}

/** Clases de color por veredicto (fondo suave + texto), nunca morado de fondo. */
export function tonoVeredicto(v: Veredicto | null): { caja: string; texto: string; punto: string } {
  switch (v) {
    case "cometio": return { caja: "border-destructive/30 bg-destructive/10", texto: "text-destructive", punto: "bg-destructive" };
    case "no_cometio": return { caja: "border-success/30 bg-success/10", texto: "text-success", punto: "bg-success" };
    case "justificado": return { caja: "border-warning/30 bg-warning/10", texto: "text-warning", punto: "bg-warning" };
    default: return { caja: "border-border/60 bg-foreground/[0.04]", texto: "text-muted-foreground", punto: "bg-muted-foreground/50" };
  }
}

export function tonoChip(t: Tono): string {
  if (t === "grave") return "border-destructive/25 bg-destructive/[0.08] text-destructive";
  if (t === "aviso") return "border-warning/25 bg-warning/[0.08] text-warning";
  return "border-border/60 bg-foreground/[0.04] text-muted-foreground";
}

export const ETIQUETA_VEREDICTO: Record<Veredicto, TranslationKey> = {
  cometio: "hr.casos.v.cometio",
  no_cometio: "hr.casos.v.noCometio",
  justificado: "hr.casos.v.justificado",
};

/** La frase es obligatoria: al menos 3 letras de verdad. */
export function fraseValida(frase: string): boolean {
  return frase.trim().length >= 3;
}

/** «2026-11-19» → Date local a mediodía (sin corrimiento por zona). */
export function fechaDeDia(dia: string): Date {
  const [y, m, d] = dia.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 12);
}

/** ¿El día `a` ya terminó respecto de `b` (los dos «YYYY-MM-DD»)? */
export function terminado(a: string, b: string): boolean {
  return a.localeCompare(b) === -1;
}

/** ¿Le quedan casos sin juzgar a ese día? */
export function conPendientes(x: { pendientes: number }): boolean {
  return x.pendientes !== 0;
}

/** Hoy en Bogotá como «YYYY-MM-DD». */
export function hoyBogota(ahora: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit" }).format(ahora);
}

/** Tipo de aviso de la campana → color de la tarjeta. */
export function tonoAviso(tipo: string): Veredicto | "info" | "atencion" {
  if (tipo === "argos_caso_cometio" || tipo === "argos_caso_equipo" || tipo === "argos_caso_grave"
    || tipo === "argos_grave" || tipo === "argos_grave_persona") return "cometio";
  if (tipo === "argos_caso_limpio") return "no_cometio";
  if (tipo === "argos_caso_justificado") return "justificado";
  if (tipo === "argos_casos_del_dia" || tipo === "argos_casos_atraso") return "atencion";
  return "info";
}
