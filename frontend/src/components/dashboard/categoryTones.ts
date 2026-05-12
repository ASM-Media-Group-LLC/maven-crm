// Paleta de tonos por categoría de creadora — Elite=oro, A+=violeta,
// etc. Se extrajo de PanelDeControl porque ahora también se usa en
// Dashboard v2 y cualquier popup que liste modelos por categoría.

export interface CategoryTone {
  bg: string;
  text: string;
  badge: string;
  ring: string;
  line: string;
  iconBg: string;
}

export const CATEGORY_TONES: Record<string, CategoryTone> = {
  Elite: {
    bg: "bg-gradient-to-r from-amber-500/20 to-amber-400/10",
    text: "text-amber-400",
    badge: "bg-amber-500/30 text-amber-200",
    ring: "ring-1 ring-amber-400/30",
    line: "bg-gradient-to-r from-amber-400/40 to-transparent",
    iconBg: "bg-amber-500/10 group-hover:bg-amber-500/20",
  },
  "A+": {
    bg: "bg-gradient-to-r from-violet-500/20 to-violet-400/10",
    text: "text-violet-300",
    badge: "bg-violet-500/30 text-violet-100",
    ring: "ring-1 ring-violet-400/30",
    line: "bg-gradient-to-r from-violet-400/40 to-transparent",
    iconBg: "bg-violet-500/10 group-hover:bg-violet-500/20",
  },
  A: {
    bg: "bg-gradient-to-r from-blue-500/20 to-blue-400/10",
    text: "text-blue-300",
    badge: "bg-blue-500/30 text-blue-100",
    ring: "ring-1 ring-blue-400/30",
    line: "bg-gradient-to-r from-blue-400/40 to-transparent",
    iconBg: "bg-blue-500/10 group-hover:bg-blue-500/20",
  },
  "B+": {
    bg: "bg-gradient-to-r from-emerald-500/20 to-emerald-400/10",
    text: "text-emerald-300",
    badge: "bg-emerald-500/30 text-emerald-100",
    ring: "ring-1 ring-emerald-400/30",
    line: "bg-gradient-to-r from-emerald-400/40 to-transparent",
    iconBg: "bg-emerald-500/10 group-hover:bg-emerald-500/20",
  },
  B: {
    bg: "bg-gradient-to-r from-teal-500/20 to-teal-400/10",
    text: "text-teal-300",
    badge: "bg-teal-500/30 text-teal-100",
    ring: "ring-1 ring-teal-400/30",
    line: "bg-gradient-to-r from-teal-400/40 to-transparent",
    iconBg: "bg-teal-500/10 group-hover:bg-teal-500/20",
  },
  "C+": {
    bg: "bg-gradient-to-r from-orange-500/20 to-orange-400/10",
    text: "text-orange-300",
    badge: "bg-orange-500/30 text-orange-100",
    ring: "ring-1 ring-orange-400/30",
    line: "bg-gradient-to-r from-orange-400/40 to-transparent",
    iconBg: "bg-orange-500/10 group-hover:bg-orange-500/20",
  },
  C: {
    bg: "bg-gradient-to-r from-rose-500/20 to-rose-400/10",
    text: "text-rose-300",
    badge: "bg-rose-500/30 text-rose-100",
    ring: "ring-1 ring-rose-400/30",
    line: "bg-gradient-to-r from-rose-400/40 to-transparent",
    iconBg: "bg-rose-500/10 group-hover:bg-rose-500/20",
  },
};

export const DEFAULT_TONE: CategoryTone = {
  bg: "bg-muted/40",
  text: "text-muted-foreground",
  badge: "bg-muted-foreground/20 text-muted-foreground",
  ring: "",
  line: "bg-border",
  iconBg: "bg-muted/40 group-hover:bg-muted",
};

// Tones para badges (status / source / outcome) cuando agrupamos por
// algo que no es categoría — leadgen, scouter, cerro, en_espera, etc.
export const BADGE_TONES: Record<string, CategoryTone> = {
  leadgen: {
    bg: "bg-gradient-to-r from-indigo-500/20 to-indigo-400/10",
    text: "text-indigo-300",
    badge: "bg-indigo-500/30 text-indigo-100",
    ring: "ring-1 ring-indigo-400/30",
    line: "bg-gradient-to-r from-indigo-400/40 to-transparent",
    iconBg: "bg-indigo-500/10 group-hover:bg-indigo-500/20",
  },
  scouter: {
    bg: "bg-gradient-to-r from-pink-500/20 to-pink-400/10",
    text: "text-pink-300",
    badge: "bg-pink-500/30 text-pink-100",
    ring: "ring-1 ring-pink-400/30",
    line: "bg-gradient-to-r from-pink-400/40 to-transparent",
    iconBg: "bg-pink-500/10 group-hover:bg-pink-500/20",
  },
  Nuevo: {
    bg: "bg-gradient-to-r from-blue-500/20 to-blue-400/10",
    text: "text-blue-300",
    badge: "bg-blue-500/30 text-blue-100",
    ring: "ring-1 ring-blue-400/30",
    line: "bg-gradient-to-r from-blue-400/40 to-transparent",
    iconBg: "bg-blue-500/10 group-hover:bg-blue-500/20",
  },
  Asignada: {
    bg: "bg-gradient-to-r from-violet-500/20 to-violet-400/10",
    text: "text-violet-300",
    badge: "bg-violet-500/30 text-violet-100",
    ring: "ring-1 ring-violet-400/30",
    line: "bg-gradient-to-r from-violet-400/40 to-transparent",
    iconBg: "bg-violet-500/10 group-hover:bg-violet-500/20",
  },
  Confirmada: {
    bg: "bg-gradient-to-r from-emerald-500/20 to-emerald-400/10",
    text: "text-emerald-300",
    badge: "bg-emerald-500/30 text-emerald-100",
    ring: "ring-1 ring-emerald-400/30",
    line: "bg-gradient-to-r from-emerald-400/40 to-transparent",
    iconBg: "bg-emerald-500/10 group-hover:bg-emerald-500/20",
  },
  Completada: {
    bg: "bg-gradient-to-r from-teal-500/20 to-teal-400/10",
    text: "text-teal-300",
    badge: "bg-teal-500/30 text-teal-100",
    ring: "ring-1 ring-teal-400/30",
    line: "bg-gradient-to-r from-teal-400/40 to-transparent",
    iconBg: "bg-teal-500/10 group-hover:bg-teal-500/20",
  },
  "No interesada": {
    bg: "bg-gradient-to-r from-rose-500/20 to-rose-400/10",
    text: "text-rose-300",
    badge: "bg-rose-500/30 text-rose-100",
    ring: "ring-1 ring-rose-400/30",
    line: "bg-gradient-to-r from-rose-400/40 to-transparent",
    iconBg: "bg-rose-500/10 group-hover:bg-rose-500/20",
  },
  cerro: {
    bg: "bg-gradient-to-r from-emerald-500/20 to-emerald-400/10",
    text: "text-emerald-300",
    badge: "bg-emerald-500/30 text-emerald-100",
    ring: "ring-1 ring-emerald-400/30",
    line: "bg-gradient-to-r from-emerald-400/40 to-transparent",
    iconBg: "bg-emerald-500/10 group-hover:bg-emerald-500/20",
  },
  en_espera: {
    bg: "bg-gradient-to-r from-amber-500/20 to-amber-400/10",
    text: "text-amber-300",
    badge: "bg-amber-500/30 text-amber-100",
    ring: "ring-1 ring-amber-400/30",
    line: "bg-gradient-to-r from-amber-400/40 to-transparent",
    iconBg: "bg-amber-500/10 group-hover:bg-amber-500/20",
  },
  no_cerro: {
    bg: "bg-gradient-to-r from-rose-500/20 to-rose-400/10",
    text: "text-rose-300",
    badge: "bg-rose-500/30 text-rose-100",
    ring: "ring-1 ring-rose-400/30",
    line: "bg-gradient-to-r from-rose-400/40 to-transparent",
    iconBg: "bg-rose-500/10 group-hover:bg-rose-500/20",
  },
  alta: {
    bg: "bg-gradient-to-r from-emerald-500/20 to-emerald-400/10",
    text: "text-emerald-300",
    badge: "bg-emerald-500/30 text-emerald-100",
    ring: "ring-1 ring-emerald-400/30",
    line: "bg-gradient-to-r from-emerald-400/40 to-transparent",
    iconBg: "bg-emerald-500/10 group-hover:bg-emerald-500/20",
  },
  baja: {
    bg: "bg-gradient-to-r from-rose-500/20 to-rose-400/10",
    text: "text-rose-300",
    badge: "bg-rose-500/30 text-rose-100",
    ring: "ring-1 ring-rose-400/30",
    line: "bg-gradient-to-r from-rose-400/40 to-transparent",
    iconBg: "bg-rose-500/10 group-hover:bg-rose-500/20",
  },
};

export const categoryTone = (cat: string): CategoryTone =>
  CATEGORY_TONES[cat] ?? BADGE_TONES[cat] ?? DEFAULT_TONE;
