// Parrilla de contenido — data layer.
//
// La parrilla vive como DATOS TIPADOS (content_grids + content_grid_days) y de cada
// guardado se derivan las TAREAS ESPERADAS (content_grid_tasks) que Promolog usará
// para verificar cumplimiento (F4). Ver migración 20260827160000.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface GridTheme {
  foto: string;
  video: string;
  telegram: string;
  urgencia: string;
  base: string;
  tinta: string;
}

export const DEFAULT_THEME: GridTheme = {
  foto: "#b08d2f",
  video: "#d6336c",
  telegram: "#7048e8",
  urgencia: "#e8590c",
  base: "#faf6ef",
  tinta: "#1a1a1a",
};

export type ExtraType = "dinamica_lanzamiento" | "reel" | "tg_3pub" | "tg_audio" | "dinamica_cierre" | "custom";

export interface ExtraItem {
  momento?: "mañana" | "tarde" | "noche" | "";
  label: string;
  copy: string;
}

export interface DayRef {
  url: string;
  nicho?: string;
  formato?: string;
}

export interface GridDay {
  id?: string;
  grid_id: string;
  day_index: number;
  date: string; // YYYY-MM-DD
  format_badge: "flyer_foto" | "video_corto";
  idea: string;
  copy_sugerido: string;
  franja: string;
  extra_type: ExtraType;
  extra_title: string;
  extra_desc: string;
  extra_items: ExtraItem[];
  refs: DayRef[];
}

export interface ContentGrid {
  id: string;
  week_start: string;
  week_end: string;
  title: string;
  status: "borrador" | "lista" | "enviada";
  theme: GridTheme;
  feedback: string | null;
  pdf_url: string | null;
  sent_at: string | null;
  // Para detectar ediciones concurrentes al guardar (parrilla_save_grid).
  updated_at: string;
}

export const EXTRA_TYPE_META: Record<ExtraType, { label: string; colorKey: keyof GridTheme }> = {
  dinamica_lanzamiento: { label: "Dinámica de urgencia · Lanzamiento", colorKey: "urgencia" },
  reel: { label: "Reel del día", colorKey: "video" },
  tg_3pub: { label: "3 publicaciones del día", colorKey: "telegram" },
  tg_audio: { label: "Audios de buenos días", colorKey: "telegram" },
  dinamica_cierre: { label: "Dinámica de urgencia · Cierre", colorKey: "urgencia" },
  custom: { label: "Acción extra", colorKey: "foto" },
};

const WEEKDAYS = ["DOMINGO", "LUNES", "MARTES", "MIÉRCOLES", "JUEVES", "VIERNES", "SÁBADO"];
export const weekdayLabel = (iso: string) => WEEKDAYS[new Date(iso + "T12:00:00Z").getUTCDay()];

// Las tareas esperadas se derivan en SQL (parrilla_derive_tasks, fuente ÚNICA —
// la invocan parrilla_save_grid y el cron de F2). Acá ya no hay copia espejo.

export function useGridList() {
  return useQuery({
    queryKey: ["content-grids"],
    queryFn: async (): Promise<ContentGrid[]> => {
      const { data, error } = await (supabase as any)
        .from("content_grids")
        .select("id, week_start, week_end, title, status, theme, feedback, pdf_url, sent_at, updated_at")
        .order("week_start", { ascending: false })
        .limit(30);
      if (error) throw error;
      return (data ?? []).map((g: any) => ({ ...g, theme: { ...DEFAULT_THEME, ...(g.theme ?? {}) } }));
    },
  });
}

export function useGridDays(gridId: string | null) {
  return useQuery({
    queryKey: ["content-grid-days", gridId],
    enabled: !!gridId,
    queryFn: async (): Promise<GridDay[]> => {
      const { data, error } = await (supabase as any)
        .from("content_grid_days")
        .select("*")
        .eq("grid_id", gridId)
        .order("day_index");
      if (error) throw error;
      return (data ?? []).map((d: any) => ({
        ...d,
        extra_items: Array.isArray(d.extra_items) ? d.extra_items : [],
        refs: Array.isArray(d.refs) ? d.refs : [],
      }));
    },
  });
}

export function useSaveGrid() {
  const qc = useQueryClient();
  return useMutation({
    // Guardado transaccional: grid + días + regeneración de tareas en una sola RPC.
    // expectedUpdatedAt detecta ediciones concurrentes (error 'conflict: …').
    mutationFn: async (args: {
      grid: Partial<ContentGrid> & { id: string };
      days: GridDay[];
      expectedUpdatedAt: string | null;
    }) => {
      const { grid, days, expectedUpdatedAt } = args;
      const { data, error } = await (supabase as any).rpc("parrilla_save_grid", {
        p_grid_id: grid.id,
        p_expected_updated_at: expectedUpdatedAt,
        p_title: grid.title ?? null,
        p_status: grid.status ?? null,
        p_theme: grid.theme ?? null,
        p_feedback: grid.feedback ?? "",
        p_days: days.map((d) => ({
          day_index: d.day_index,
          date: d.date,
          format_badge: d.format_badge,
          idea: d.idea,
          copy_sugerido: d.copy_sugerido,
          franja: d.franja,
          extra_type: d.extra_type,
          extra_title: d.extra_title,
          extra_desc: d.extra_desc,
          extra_items: d.extra_items,
          refs: d.refs,
        })),
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_r, args) => {
      qc.invalidateQueries({ queryKey: ["content-grids"] });
      qc.invalidateQueries({ queryKey: ["content-grid-days", args.grid.id] });
    },
  });
}

// Día en blanco para estrenar una parrilla sin plantilla previa.
const emptyDay = (dayIndex: number): Omit<GridDay, "grid_id" | "date"> => ({
  day_index: dayIndex,
  format_badge: "flyer_foto",
  idea: "",
  copy_sugerido: "",
  franja: "11:00 - 13:00",
  extra_type: "custom",
  extra_title: "",
  extra_desc: "",
  extra_items: [],
  refs: [],
});

// Nueva semana: duplica la parrilla más reciente corrida al próximo lunes (borrador).
// Sin plantilla (estreno del módulo) siembra 8 días en blanco — nunca un tablero vacío.
export function useCreateNextWeek() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (from: { grid: ContentGrid; days: GridDay[] } | null) => {
      // Próximo lunes (hoy si es lunes) en día-pared Bogotá, para coincidir con
      // la semana que generará el cron de F2 (week_start es unique).
      const hoyBogota = new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
      const now = new Date(hoyBogota + "T12:00:00Z");
      const dow = now.getUTCDay(); // 0=dom
      const delta = dow === 1 ? 0 : (8 - dow) % 7;
      const monday = new Date(now); monday.setUTCDate(monday.getUTCDate() + delta);
      const iso = (d: Date) => d.toISOString().slice(0, 10);
      const weekStart = iso(monday);
      // 8 días: el último cae en lunes+7 — week_end debe coincidir con él.
      const end = new Date(monday); end.setUTCDate(end.getUTCDate() + 7);

      const { data: userData } = await supabase.auth.getUser();
      const { data: g, error } = await (supabase as any)
        .from("content_grids")
        .insert({
          week_start: weekStart, week_end: iso(end), status: "borrador",
          title: from?.grid.title ?? "Parrilla de promoción",
          theme: from?.grid.theme ?? DEFAULT_THEME,
          created_by: userData?.user?.id ?? null,
        })
        .select("id, week_start")
        .single();
      if (error) throw error;

      const template = from?.days?.length
        ? from.days
        : Array.from({ length: 8 }, (_, i) => emptyDay(i + 1) as GridDay);
      const days = template.map((d, i) => {
        const date = new Date(monday); date.setUTCDate(date.getUTCDate() + i);
        const { id: _id, grid_id: _g, ...rest } = d as GridDay & { grid_id?: string };
        return { ...rest, grid_id: g.id, day_index: i + 1, date: iso(date) };
      });
      const { error: dErr } = await (supabase as any).from("content_grid_days").insert(days);
      if (dErr) throw dErr;

      // Deriva las tareas esperadas de la semana nueva (misma fuente SQL del save).
      const { error: tErr } = await (supabase as any).rpc("parrilla_derive_tasks", { p_grid_id: g.id });
      if (tErr) throw tErr;
      return g.id as string;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["content-grids"] }),
  });
}
