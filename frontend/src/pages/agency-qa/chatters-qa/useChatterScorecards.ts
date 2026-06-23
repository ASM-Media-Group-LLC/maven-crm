import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

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

// Orden y nombres EXACTOS de las columnas del sheet (encabezado de Febrero).
// `hubstaff: true` → criterios que la Fase 2 (Hubstaff) auto-completará.
export const CRITERIA = [
  { key: "c1_puntualidad", label: "Puntualidad y Cumplimiento", short: "Puntualidad", hubstaff: true },
  { key: "c2_calidad_chats", label: "Calidad de chats", short: "Calidad" },
  { key: "c3_cumplimiento_meta", label: "Cumplimiento de Meta", short: "Meta" },
  { key: "c4_productividad_hubstaff", label: "Productividad Hubstaff", short: "Productividad", hubstaff: true },
  { key: "c5_actitud_disciplina", label: "Actitud y disciplina", short: "Actitud" },
  { key: "c6_gestion_estrategia", label: "Gestión y estrategia", short: "Gestión" },
  { key: "c7_scripts", label: "Scripts", short: "Scripts" },
  { key: "c8_camara_pantalla", label: "Cámara y Pantalla", short: "Cámara" },
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

// Agregar un chatter al mes (fila vacía, lista para puntuar).
export const useAddChatter = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ chatter_name, company, period }: { chatter_name: string; company: CompanyCode; period: string }) => {
      const { error } = await (supabase as any)
        .from("chatter_scorecards")
        .insert({ chatter_name: chatter_name.trim(), company, period, source: "manual" });
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

// "2026-02-01" → "Febrero 2026"
const MONTHS = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
export const periodLabel = (period: string) => {
  const [y, m] = period.split("-").map(Number);
  return `${MONTHS[(m ?? 1) - 1] ?? ""} ${y ?? ""}`.trim();
};
