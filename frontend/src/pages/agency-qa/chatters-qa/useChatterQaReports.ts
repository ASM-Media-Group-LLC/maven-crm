import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { CompanyCode } from "./useChatterScorecards";

// QA cualitativo de chatters (QA-B): reporte estructurado que reemplaza el correo del supervisor.
// Tabla chatter_qa_reports. Tabla nueva → (supabase as any), igual que el resto de hooks BLU.

export const VEREDICTOS = [
  { value: "excelente", label: "Excelente", tone: "good" },
  { value: "bueno", label: "Bueno", tone: "good" },
  { value: "requiere_mejora", label: "Requiere Mejora", tone: "warn" },
  { value: "critico", label: "Crítico", tone: "bad" },
] as const;
export type Veredicto = (typeof VEREDICTOS)[number]["value"];
export const veredictoLabel = (v?: string | null) => VEREDICTOS.find((x) => x.value === v)?.label ?? "—";
export const veredictoTone = (v?: string | null) => VEREDICTOS.find((x) => x.value === v)?.tone ?? "warn";

export interface EvaluatedModel { model_id: number; model_name: string }
export interface MejoraItem { categoria: string; detalle: string }
export interface ModelObs { model_id?: number; model_name?: string; observaciones?: string[]; ejemplos?: { quote: string; por_que: string; fan?: string }[] }
export interface QaReportBody {
  intro?: string;
  resumen?: string;
  aspectos_positivos?: string[];
  aspectos_mejora?: MejoraItem[];
  observaciones_por_modelo?: ModelObs[];
  recomendaciones?: string[];
  conclusion?: string;
  hallazgo_principal?: string;
}
export interface ChatterQaReport {
  id: string;
  chatter_name: string;
  company: CompanyCode;
  period: string;
  blu_employee_id: number | null;
  evaluated_models: EvaluatedModel[];
  report: QaReportBody;
  veredicto: Veredicto | null;
  sampling: Record<string, unknown>;
  evaluator_name: string;
  source: string;          // ai_draft | manual | ai_edited
  status: string;          // processing | ready | failed
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export const useQaReportPeriods = () =>
  useQuery({
    queryKey: ["chatter-qa", "periods"],
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await (supabase as any)
        .from("chatter_qa_reports").select("period").order("period", { ascending: false });
      if (error) throw error;
      return [...new Set((data ?? []).map((r: { period: string }) => r.period))];
    },
    staleTime: 60_000,
  });

export const useQaReports = (period: string | null) =>
  useQuery({
    queryKey: ["chatter-qa", "list", period],
    queryFn: async (): Promise<ChatterQaReport[]> => {
      let q = (supabase as any).from("chatter_qa_reports").select("*").order("created_at", { ascending: false });
      if (period) q = q.eq("period", period);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as ChatterQaReport[];
    },
  });

export const useQaReport = (id: string | null) =>
  useQuery({
    queryKey: ["chatter-qa", "one", id],
    queryFn: async (): Promise<ChatterQaReport | null> => {
      const { data, error } = await (supabase as any).from("chatter_qa_reports").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return (data ?? null) as ChatterQaReport | null;
    },
    enabled: !!id,
  });

// Crea un reporte. Manual → status 'ready' (lo escribe el supervisor); ai_draft → 'processing' (lo llena la edge).
export const useCreateQaReport = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      chatter_name: string; company: CompanyCode; period: string;
      evaluated_models?: EvaluatedModel[]; source?: "manual" | "ai_draft"; evaluator_name?: string;
    }): Promise<ChatterQaReport> => {
      const source = input.source ?? "manual";
      const { data: { user } } = await supabase.auth.getUser();
      const row = {
        chatter_name: input.chatter_name.trim(),
        company: input.company,
        period: input.period,
        evaluated_models: input.evaluated_models ?? [],
        source,
        status: source === "manual" ? "ready" : "processing",
        evaluator_name: input.evaluator_name ?? (source === "manual" ? "Supervisor" : "Claude AI"),
        created_by: user?.id ?? null,
      };
      const { data, error } = await (supabase as any)
        .from("chatter_qa_reports").insert(row).select().single();
      if (error) throw error;
      return data as ChatterQaReport;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chatter-qa"] }),
  });
};

export const useUpdateQaReport = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<ChatterQaReport> }) => {
      const { error } = await (supabase as any).from("chatter_qa_reports").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chatter-qa"] }),
  });
};

export const useDeleteQaReport = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("chatter_qa_reports").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chatter-qa"] }),
  });
};

// Dispara el borrador IA (edge chatter-qa-analyze) — Slice 4. Acá ya queda el hook listo.
export const useGenerateQaDraft = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, withFeedback }: { id: string; withFeedback?: boolean }) => {
      await (supabase as any).from("chatter_qa_reports").update({ status: "processing", error_message: null }).eq("id", id);
      const { data, error } = await supabase.functions.invoke("chatter-qa-analyze", {
        body: { report_id: id, with_feedback: !!withFeedback },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(String(data.error));
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chatter-qa"] }),
  });
};
