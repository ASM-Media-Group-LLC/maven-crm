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

// ── Tareas esperadas: derivación (espejo conceptual del compliance F4) ─────────
// De cada día tipado salen las tareas máquina-legibles. Las de tipo 'custom' NO
// generan tarea automática (pueden ser internas, p.ej. contenido para chatters).
function deriveTasks(gridId: string, days: GridDay[]) {
  const tasks: Array<{
    grid_id: string; day_date: string; network: string; task_type: string;
    qty: number; franja: string | null; verificable: boolean; detalle: string | null;
  }> = [];
  for (const d of days) {
    // Publicación diaria de IG (arriba del tablero: flyer/foto o video corto).
    tasks.push({
      grid_id: gridId, day_date: d.date, network: "instagram",
      task_type: d.format_badge === "video_corto" ? "reel" : "publicacion",
      qty: 1, franja: d.franja || null, verificable: true,
      detalle: d.idea ? d.idea.slice(0, 200) : null,
    });
    switch (d.extra_type) {
      case "reel":
        tasks.push({ grid_id: gridId, day_date: d.date, network: "instagram", task_type: "reel", qty: 1, franja: null, verificable: true, detalle: "Reel del día (referencias en la parrilla)" });
        break;
      case "tg_3pub":
        tasks.push({ grid_id: gridId, day_date: d.date, network: "telegram", task_type: "tg_publicacion", qty: Math.max(d.extra_items.length, 3), franja: null, verificable: true, detalle: d.extra_title || "Publicaciones del día en Telegram" });
        break;
      case "tg_audio":
        tasks.push({ grid_id: gridId, day_date: d.date, network: "telegram", task_type: "tg_audio", qty: 1, franja: null, verificable: true, detalle: "Audio de buenos días (15-30s)" });
        break;
      case "dinamica_lanzamiento":
      case "dinamica_cierre":
        tasks.push({ grid_id: gridId, day_date: d.date, network: "x", task_type: "urgencia", qty: 1, franja: null, verificable: true, detalle: d.extra_title || null });
        tasks.push({ grid_id: gridId, day_date: d.date, network: "telegram", task_type: "urgencia", qty: 1, franja: null, verificable: true, detalle: d.extra_title || null });
        break;
      default:
        break; // custom → sin tarea automática (puede ser interna)
    }
  }
  return tasks;
}

export function useGridList() {
  return useQuery({
    queryKey: ["content-grids"],
    queryFn: async (): Promise<ContentGrid[]> => {
      const { data, error } = await (supabase as any)
        .from("content_grids")
        .select("id, week_start, week_end, title, status, theme, feedback, pdf_url, sent_at")
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
    mutationFn: async (args: { grid: Partial<ContentGrid> & { id: string }; days: GridDay[] }) => {
      const { grid, days } = args;
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData?.user?.id ?? null;

      const { error: gErr } = await (supabase as any)
        .from("content_grids")
        .update({
          title: grid.title, status: grid.status, theme: grid.theme,
          feedback: grid.feedback ?? null,
          ...(grid.feedback ? { feedback_by: uid, feedback_at: new Date().toISOString() } : {}),
          updated_at: new Date().toISOString(), updated_by: uid,
        })
        .eq("id", grid.id);
      if (gErr) throw gErr;

      // Días: upsert por (grid_id, day_index).
      const { error: dErr } = await (supabase as any)
        .from("content_grid_days")
        .upsert(days.map((d) => ({ ...d, grid_id: grid.id })), { onConflict: "grid_id,day_index" });
      if (dErr) throw dErr;

      // Tareas esperadas: regenerar (fuente = los días tipados recién guardados).
      const { error: delErr } = await (supabase as any).from("content_grid_tasks").delete().eq("grid_id", grid.id);
      if (delErr) throw delErr;
      const tasks = deriveTasks(grid.id, days);
      if (tasks.length) {
        const { error: tErr } = await (supabase as any).from("content_grid_tasks").insert(tasks);
        if (tErr) throw tErr;
      }
    },
    onSuccess: (_r, args) => {
      qc.invalidateQueries({ queryKey: ["content-grids"] });
      qc.invalidateQueries({ queryKey: ["content-grid-days", args.grid.id] });
    },
  });
}

// Nueva semana: duplica la parrilla más reciente corrida al próximo lunes (borrador).
export function useCreateNextWeek() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (from: { grid: ContentGrid; days: GridDay[] } | null) => {
      const now = new Date();
      // Próximo lunes (hoy si es lunes) en fecha local del navegador.
      const dow = now.getDay(); // 0=dom
      const delta = dow === 1 ? 0 : (8 - dow) % 7;
      const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + delta);
      const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const weekStart = iso(monday);
      const end = new Date(monday); end.setDate(end.getDate() + 6);

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

      if (from?.days?.length) {
        const days = from.days.map((d, i) => {
          const date = new Date(monday); date.setDate(date.getDate() + i);
          const { id: _id, ...rest } = d;
          return { ...rest, grid_id: g.id, day_index: i + 1, date: iso(date) };
        });
        const { error: dErr } = await (supabase as any).from("content_grid_days").insert(days);
        if (dErr) throw dErr;
      }
      return g.id as string;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["content-grids"] }),
  });
}
