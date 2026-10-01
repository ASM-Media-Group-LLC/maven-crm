import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { idioma, type Language } from "@/lib/i18n";

// QA de Chatters · Scorecard mensual (reemplaza el sheet "Medidor de chatters").
// Tabla `chatter_scorecards`: 8 criterios 0-5 → total /40 → %, por compañía CP/CM/CU.
// RLS = management (blu_is_management). Tabla nueva → casteamos (supabase as any),
// igual que el resto de hooks de sales-performance (los tipos generados no la incluyen).

export type CompanyCode = "CP" | "CM" | "CU";

export const COMPANIES: { code: CompanyCode; label: string }[] = [
  { code: "CP", label: "Kash Plus" },
  { code: "CM", label: "Kash Massive" },
  { code: "CU", label: "Unlok" },
];
export const companyLabel = (c: string) =>
  COMPANIES.find((x) => x.code === c)?.label ?? c;

// Orden y nombres EXACTOS de las columnas del sheet (encabezado de Febrero): el
// español de cada `labelKey` es ese encabezado (ver lib/i18n/agencyQa.ts).
// `hubstaff: true` → criterios que la Fase 2 (Hubstaff) auto-completará.
export const CRITERIA = [
  { key: "c1_puntualidad", labelKey: "agencyQa.criterion.c1", shortKey: "agencyQa.criterion.c1Short", hubstaff: true },
  { key: "c2_calidad_chats", labelKey: "agencyQa.criterion.c2", shortKey: "agencyQa.criterion.c2Short", hubstaff: false },
  { key: "c3_cumplimiento_meta", labelKey: "agencyQa.criterion.c3", shortKey: "agencyQa.criterion.c3Short", hubstaff: false },
  { key: "c4_productividad_hubstaff", labelKey: "agencyQa.criterion.c4", shortKey: "agencyQa.criterion.c4Short", hubstaff: true },
  { key: "c5_actitud_disciplina", labelKey: "agencyQa.criterion.c5", shortKey: "agencyQa.criterion.c5Short", hubstaff: false },
  { key: "c6_gestion_estrategia", labelKey: "agencyQa.criterion.c6", shortKey: "agencyQa.criterion.c6Short", hubstaff: false },
  { key: "c7_scripts", labelKey: "agencyQa.criterion.c7", shortKey: "agencyQa.criterion.c7Short", hubstaff: false },
  { key: "c8_camara_pantalla", labelKey: "agencyQa.criterion.c8", shortKey: "agencyQa.criterion.c8Short", hubstaff: false },
] as const;
export type CriterionKey = (typeof CRITERIA)[number]["key"];
export const MAX_TOTAL = 40;

export interface Scorecard {
  id: string;
  chatter_name: string;
  company: CompanyCode;
  period: string; // YYYY-MM-DD (primer día del mes)
  blu_employee_id: number | null;
  c1_puntualidad: number | null;
  c2_calidad_chats: number | null;
  c3_cumplimiento_meta: number | null;
  c4_productividad_hubstaff: number | null;
  c5_actitud_disciplina: number | null;
  c6_gestion_estrategia: number | null;
  c7_scripts: number | null;
  c8_camara_pantalla: number | null;
  total: number;
  note: string | null;
  source: string;
}

export const pct = (total: number) => Math.round((total / MAX_TOTAL) * 100);

// Color según la rúbrica del sheet: ≥80% verde, 70-79% ámbar, <70% rojo.
export const pctTone = (p: number): "good" | "warn" | "bad" =>
  p >= 80 ? "good" : p >= 70 ? "warn" : "bad";

// Lista de periodos (meses) que existen, más reciente primero.
export const useScorecardPeriods = () =>
  useQuery({
    queryKey: ["chatter-scorecards", "periods"],
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await (supabase as any)
        .from("chatter_scorecards")
        .select("period")
        .order("period", { ascending: false });
      if (error) throw error;
      return [...new Set((data ?? []).map((r: { period: string }) => r.period))];
    },
    staleTime: 60_000,
  });

// Último mes con notas REALES (algún total > 0) → para abrir ahí por defecto en vez de un mes
// recién clonado/vacío (todos en 0). Si ninguno tiene notas, devuelve null (cae al más reciente).
export const useLatestScoredPeriod = () =>
  useQuery({
    queryKey: ["chatter-scorecards", "latest-scored"],
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await (supabase as any)
        .from("chatter_scorecards")
        .select("period")
        .gt("total", 0)
        .order("period", { ascending: false })
        .limit(1);
      if (error) throw error;
      return ((data?.[0]?.period as string | undefined) ?? null);
    },
    staleTime: 60_000,
  });

// Filas de un periodo (un mes).
export const useScorecards = (period: string | null) =>
  useQuery({
    queryKey: ["chatter-scorecards", "rows", period],
    queryFn: async (): Promise<Scorecard[]> => {
      const { data, error } = await (supabase as any)
        .from("chatter_scorecards")
        .select("*")
        .eq("period", period)
        .order("company", { ascending: true })
        .order("chatter_name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Scorecard[];
    },
    enabled: !!period,
  });

// Editar una celda (un criterio) de una fila existente.
export const useUpdateScorecardCell = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, field, value }: { id: string; field: CriterionKey | "note"; value: number | string | null }) => {
      const { error } = await (supabase as any)
        .from("chatter_scorecards")
        .update({ [field]: value })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chatter-scorecards"] }),
  });
};

// Roster de chatters de BLU (chatter_performance) para el SELECTOR del scorecard. Trae
// blu_employee_id + name (dedup), así toda fila nueva queda VINCULADA al chatter (su usuario
// la ve en "datos propios"). Evita el bug histórico de nombres tipeados que no matchean.
export const useChatterRoster = () =>
  useQuery({
    queryKey: ["chatter-roster"],
    queryFn: async (): Promise<{ blu_employee_id: number; name: string }[]> => {
      const { data, error } = await (supabase as any)
        .from("chatter_performance")
        .select("blu_employee_id, name")
        .eq("is_chatter", true)
        .not("blu_employee_id", "is", null)
        .order("name", { ascending: true });
      if (error) throw error;
      const seen = new Set<number>();
      const out: { blu_employee_id: number; name: string }[] = [];
      for (const r of (data ?? []) as { blu_employee_id: number; name: string }[]) {
        if (r.blu_employee_id != null && !seen.has(r.blu_employee_id)) {
          seen.add(r.blu_employee_id);
          out.push({ blu_employee_id: r.blu_employee_id, name: r.name || `#${r.blu_employee_id}` });
        }
      }
      return out;
    },
    staleTime: 5 * 60 * 1000,
  });

// Agregar un chatter al mes (fila vacía, lista para puntuar). blu_employee_id lo trae el
// selector → la fila queda vinculada al chatter (clave para "datos propios" del rol Chatter).
export const useAddChatter = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ chatter_name, company, period, blu_employee_id }: { chatter_name: string; company: CompanyCode; period: string; blu_employee_id?: number | null }) => {
      const { error } = await (supabase as any)
        .from("chatter_scorecards")
        .insert({ chatter_name: chatter_name.trim(), company, period, source: "manual", blu_employee_id: blu_employee_id ?? null });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chatter-scorecards"] }),
  });
};

export const useDeleteScorecard = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("chatter_scorecards").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chatter-scorecards"] }),
  });
};

// "2026-02-01" → "Febrero 2026" / "February 2026".
//
// El idioma va explícito: la pantalla pasa el suyo (`language` de useLanguage) y el
// correo del QA de chatters pasa "es" (lo lee el chatter, no quien apretó el botón).
// Sin idioma usa el de la interfaz en ese momento: lo usan también pantallas de RRHH
// (HRPersonCard, HrAttendanceAuto) que todavía no lo pasan.
const MONTHS: Record<Language, string[]> = {
  es: ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"],
  en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
};
export const periodLabel = (period: string, lang: Language = idioma()) => {
  const [y, m] = period.split("-").map(Number);
  return `${MONTHS[lang][(m ?? 1) - 1] ?? ""} ${y ?? ""}`.trim();
};
