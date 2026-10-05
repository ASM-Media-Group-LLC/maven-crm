// Horarios de chatters. Reemplaza el Excel "Horarios Chatters KASH": un chatter,
// en un turno, dentro de un grupo de una agencia, atiende una lista de
// creadoras y descansa un día de la semana. Ver la migración chatter_horarios.

import type { Language } from "@/lib/i18n";

export type Agency = "plus" | "massive";
export type Shift = "am" | "pm" | "mad";

export const AGENCIAS: Array<{ id: Agency; label: string }> = [
  { id: "plus", label: "Plus" },
  { id: "massive", label: "Massive" },
];
export const agenciaDe = (a: Agency) => AGENCIAS.find((x) => x.id === a) ?? AGENCIAS[0];

export const TURNOS: Record<Shift, { label: string; horas: string; clase: string }> = {
  am: { label: "AM", horas: "08:00 – 16:00", clase: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30" },
  pm: { label: "PM", horas: "16:00 – 00:00", clase: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-500/30" },
  mad: { label: "MAD", horas: "00:00 – 08:00", clase: "bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-500/30" },
};

// 0 = lunes, como en la BD. El índice es el dato (weekday); el nombre es solo
// lo que se muestra, y por eso hay uno por idioma. Sin `lang` sale en español,
// que es lo que ya devolvían (y lo que fija test/chatters/horarios.fechas).
export const DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
export const DIAS_CORTOS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const DIAS_EN = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const DIAS_CORTOS_EN = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const diasDe = (lang: Language = "es") => (lang === "en" ? DIAS_EN : DIAS);
export const diasCortosDe = (lang: Language = "es") => (lang === "en" ? DIAS_CORTOS_EN : DIAS_CORTOS);

export interface Grupo {
  id: string;
  agency: Agency;
  name: string;
  lead_name: string | null;
  sort_order: number;
  active: boolean;
}

export interface Miembro {
  id: string;
  group_id: string;
  identity_id: string;
  shift: Shift;
  is_supernumerary: boolean;
  sheet_tag: number | null;
  valid_from: string;
  valid_to: string | null;
}

export interface GrupoCreadora {
  id: string;
  group_id: string;
  creator_id: string | null;
  creator_handle: string;
  ig: boolean;
  mad: boolean;
  sop: boolean;
  tag: string | null;
  valid_from: string;
  valid_to: string | null;
}

export interface Descanso {
  id: string;
  week_start: string; // lunes, YYYY-MM-DD
  agency: Agency;
  weekday: number;    // 0 = lunes
  shift: Shift;
  identity_id: string | null;      // null = nota del día ("Cierre de mes")
  covered_by_identity_id: string | null;
  note: string | null;
}

// ── Fechas (sin zona horaria: el horario es local del equipo) ────────────────

const pad = (n: number) => String(n).padStart(2, "0");
export const isoDe = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const fechaDe = (iso: string) => { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d); };

/** Lunes de la semana a la que pertenece la fecha. */
export function lunesDe(d: Date): string {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const wd = (x.getDay() + 6) % 7; // 0 = lunes
  x.setDate(x.getDate() - wd);
  return isoDe(x);
}
export function sumarDias(iso: string, n: number): string { const d = fechaDe(iso); d.setDate(d.getDate() + n); return isoDe(d); }
/** Índice 0-6 (lunes = 0) de una fecha. */
export const diaSemanaDe = (d: Date) => (d.getDay() + 6) % 7;

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const MESES_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function etiquetaSemana(weekStart: string, lang: Language = "es"): string {
  const a = fechaDe(weekStart), b = fechaDe(sumarDias(weekStart, 6));
  if (lang === "en") {
    const ma = MESES_EN[a.getMonth()], mb = MESES_EN[b.getMonth()];
    return ma === mb ? `${ma} ${a.getDate()} – ${b.getDate()}` : `${ma} ${a.getDate()} – ${mb} ${b.getDate()}`;
  }
  const ma = MESES[a.getMonth()], mb = MESES[b.getMonth()];
  return ma === mb ? `${a.getDate()} al ${b.getDate()} de ${mb}` : `${a.getDate()} ${ma} al ${b.getDate()} ${mb}`;
}
export function etiquetaDia(weekStart: string, weekday: number, lang: Language = "es"): string {
  const d = fechaDe(sumarDias(weekStart, weekday));
  return `${diasDe(lang)[weekday]} ${d.getDate()}`;
}

/** Perfil de la creadora en Maven (solo si está ligada a una creadora real). */
export const urlCreadora = (c: { creator_id: string | null }) => (c.creator_id ? `/creadores/${c.creator_id}` : null);
