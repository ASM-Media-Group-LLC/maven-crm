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
  // Franja ESTRUCTURADA (hora-pared Bogotá, "HH:MM"). El texto `franja` se
  // regenera en el guardado desde estas dos; es lo que verificará Promolog (F4).
  franja_start: string | null;
  franja_end: string | null;
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
          franja_start: d.franja_start || null,
          franja_end: d.franja_end || null,
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
  franja_start: "11:00",
  franja_end: "13:00",
  extra_type: "custom",
  extra_title: "",
  extra_desc: "",
  extra_items: [],
  refs: [],
});

// Día de inicio del ciclo estándar: JUEVES (la parrilla se manda todos los jueves —
// cambio pedido por Carolina/Jhon; antes era lunes). 0=dom … 6=sáb → jueves=4.
const CICLO_DOW = 4; // jueves

// Ciclo estándar siguiente: el próximo JUEVES en día Bogotá, y si hay una parrilla
// previa, el primer jueves DESPUÉS de que ese ciclo termina (así no se solapan). Es
// el DEFAULT del picker de "Nueva semana" — la manager puede elegir otro rango. El
// cron de F2, cuando exista, reutiliza este mismo cómputo (dispararlo un jueves).
// Robusto en la transición: aunque `prev` sea una parrilla vieja lunes-alineada, el
// default siempre cae en jueves (avanza de a 7 días desde el próximo jueves).
export function proximoCiclo(prev?: Pick<ContentGrid, "week_start"> | null): { start: string; end: string } {
  const hoyBogota = new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
  const now = new Date(hoyBogota + "T12:00:00Z");
  const dow = now.getUTCDay(); // 0=dom
  const delta = (CICLO_DOW - dow + 7) % 7; // días hasta el próximo jueves (0 si hoy es jueves)
  const inicio = new Date(now); inicio.setUTCDate(inicio.getUTCDate() + delta);
  if (prev?.week_start) {
    // Avanzar de a 7 días (sigue siendo jueves) hasta pasar el fin del ciclo previo.
    const prevEnd = new Date(prev.week_start + "T12:00:00Z"); prevEnd.setUTCDate(prevEnd.getUTCDate() + 7);
    while (inicio < prevEnd) inicio.setUTCDate(inicio.getUTCDate() + 7);
  }
  const end = new Date(inicio); end.setUTCDate(end.getUTCDate() + 7);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { start: iso(inicio), end: iso(end) };
}

// Nueva parrilla para el rango elegido en el calendario (borrador). La plantilla
// se mapea POR DÍA DE SEMANA (el copy de "Viernes de iniciar el día…" solo puede
// caer en un viernes); si el último día repite un día de semana ya usado (el
// lunes de cierre del ciclo estándar), recibe el día de CIERRE de la plantilla.
// Sin plantilla, días en blanco — nunca un tablero vacío.
export function useCreateWeek() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { start: string; end: string; from: { grid: ContentGrid; days: GridDay[] } | null }) => {
      const { start, end, from } = args;
      const startD = new Date(start + "T12:00:00Z");
      const endD = new Date(end + "T12:00:00Z");
      const nDias = Math.round((endD.getTime() - startD.getTime()) / 86400000) + 1;
      if (nDias < 2 || nDias > 10) throw new Error("Elige un rango de 2 a 10 días");

      const { data: userData } = await supabase.auth.getUser();
      const { data: g, error } = await (supabase as any)
        .from("content_grids")
        .insert({
          week_start: start, week_end: end, status: "borrador",
          title: from?.grid.title ?? "Parrilla de promoción",
          theme: from?.grid.theme ?? DEFAULT_THEME,
          created_by: userData?.user?.id ?? null,
        })
        .select("id, week_start")
        .single();
      if (error) throw error;

      // Mapeo de la plantilla: la APERTURA (día 1, dinámica de lanzamiento) va al
      // primer día del rango y el CIERRE (último día) al último — son posiciones
      // del ciclo, no días de semana. Los del medio se casan por día de semana.
      const tpl = from?.days ?? [];
      const apertura = tpl[0] ?? null;
      const cierre = tpl.length > 1 ? tpl[tpl.length - 1] : null;
      const porWeekday = new Map<number, GridDay>();
      for (const d of tpl.slice(1, Math.max(tpl.length - 1, 1))) {
        const w = new Date(d.date + "T12:00:00Z").getUTCDay();
        if (!porWeekday.has(w)) porWeekday.set(w, d);
      }

      const iso = (d: Date) => d.toISOString().slice(0, 10);
      const days = Array.from({ length: nDias }, (_, i) => {
        const date = new Date(startD); date.setUTCDate(date.getUTCDate() + i);
        const w = date.getUTCDay();
        const source = i === 0
          ? apertura
          : (i === nDias - 1 ? (cierre ?? porWeekday.get(w) ?? null) : porWeekday.get(w) ?? null);
        const base = source
          ? (({ id: _id, grid_id: _g, ...rest }) => rest)(source as GridDay & { grid_id?: string })
          : emptyDay(i + 1);
        return { ...base, grid_id: g.id, day_index: i + 1, date: iso(date) };
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

// Cambia el DÍA DE INICIO de una parrilla ya creada. Actualiza week_start/week_end
// conservando la cantidad de días; el trigger `parrilla_sync_week_dates` recalcula la
// fecha de cada columna → el contenido se queda en su day_index (NO se pierde), solo
// cambian las fechas/etiquetas de día. week_start es UNIQUE: si ya hay otra parrilla
// ese día, la BD tira 23505 y el llamador muestra el error amistoso.
export function useSetWeekStart() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { gridId: string; start: string; end: string }) => {
      const { error } = await (supabase as any)
        .from("content_grids")
        .update({ week_start: args.start, week_end: args.end, updated_at: new Date().toISOString() })
        .eq("id", args.gridId);
      if (error) throw error;
    },
    onSuccess: (_d, args) => {
      qc.invalidateQueries({ queryKey: ["content-grids"] });
      qc.invalidateQueries({ queryKey: ["content-grid-days", args.gridId] });
    },
  });
}

// "Generar con IA": el edge parrilla-generate redacta los textos del borrador
// (idea/copy/acción extra) aprendiendo de las parrillas y feedback anteriores.
// La estructura (formato, franjas, tipos, referencias) no se toca.
export function useGenerateParrilla() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (gridId: string) => {
      const { data, error } = await supabase.functions.invoke("parrilla-generate", { body: { grid_id: gridId } });
      if (error) {
        let msg = (error as Error).message;
        try {
          const ctx = await (error as any).context?.json?.();
          if (ctx?.error) msg = ctx.error;
        } catch { /* cuerpo no-JSON: queda el mensaje genérico */ }
        throw new Error(msg);
      }
      if ((data as any)?.error) throw new Error((data as any).error);
      return data as { ok: boolean; dias: number; usos_restantes?: number };
    },
    onSuccess: (_d, gridId) => {
      qc.invalidateQueries({ queryKey: ["content-grids"] });
      qc.invalidateQueries({ queryKey: ["content-grid-days", gridId] });
    },
  });
}

// ── Excepciones por creadora (Ola 2 del compliance) ───────────────────────────
// Una creadora exenta (toda la semana o un día) NO será auditada por Promolog en
// F4: enferma, recién ingresada, sin Telegram, variación pactada con su manager.
export interface GridExemption {
  id: string;
  grid_id: string;
  creator_id: string;
  day_date: string | null; // null = toda la semana
  motivo: string;
  created_at: string;
}

export function useGridExemptions(gridId: string | null) {
  return useQuery({
    queryKey: ["content-grid-exemptions", gridId],
    enabled: !!gridId,
    queryFn: async (): Promise<GridExemption[]> => {
      const { data, error } = await (supabase as any)
        .from("content_grid_exemptions")
        .select("id, grid_id, creator_id, day_date, motivo, created_at")
        .eq("grid_id", gridId)
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as GridExemption[];
    },
  });
}

export function useAddExemption() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (e: { grid_id: string; creator_id: string; day_date: string | null; motivo: string }) => {
      const { data: userData } = await supabase.auth.getUser();
      const { data, error } = await (supabase as any)
        .from("content_grid_exemptions")
        .insert({ ...e, created_by: userData?.user?.id ?? null })
        .select("id");
      if (error) throw error;
      // RLS silenciosa: 0 filas sin error = sin permiso.
      if (!data?.length) throw new Error("Sin permiso para editar la parrilla");
    },
    onSuccess: (_r, e) => qc.invalidateQueries({ queryKey: ["content-grid-exemptions", e.grid_id] }),
  });
}

export function useRemoveExemption() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (e: { id: string; grid_id: string }) => {
      const { error } = await (supabase as any).from("content_grid_exemptions").delete().eq("id", e.id);
      if (error) throw error;
    },
    onSuccess: (_r, e) => qc.invalidateQueries({ queryKey: ["content-grid-exemptions", e.grid_id] }),
  });
}

// Creadoras activas para el selector de excepciones.
export function useActiveCreatorsLite() {
  return useQuery({
    queryKey: ["creators-lite-active"],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Array<{ id: string; name: string; artistic_name: string | null }>> => {
      const { data, error } = await supabase
        .from("creators")
        .select("id, name, artistic_name")
        .eq("status", "active")
        .order("name");
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; name: string; artistic_name: string | null }>;
    },
  });
}
