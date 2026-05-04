import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Types for the qa_* tables (Agency QA area). Kept inline since the
// generated Supabase types haven't been regenerated post-migration.

export type CallOutcome = "cerro" | "no_cerro" | "en_espera" | string | null;

export interface QaModel {
  id: string;
  name: string;
  category: string | null;
  country: string | null;
  ig_url: string | null;
  avatar_data_url: string | null;
  active: boolean;
  created_at: string;
}

export interface QaCloser {
  id: string;
  name: string;
  active: boolean;
  created_at: string;
}

// ─── Analysis JSON shape (mirrors kash app/api/analyze/prompt.ts) ──────
export interface AnalysisDimension {
  name: string;
  score: number; // 0–10 in kash
  feedback: string;
}

export interface AnalysisRedFlag {
  type: string;
  description: string;
  quote: string;
}

export interface AnalysisKeyMoment {
  kind: "positivo" | "negativo";
  quote: string;
  why: string;
}

export interface AnalysisModelObjection {
  topic: string;
  description: string;
  quote: string;
}

export interface AnalysisModelSignals {
  interest_level: "alto" | "medio" | "bajo" | "ambiguo";
  interest_reason: string;
  complicity_level: "alto" | "medio" | "bajo";
  complicity_reason: string;
  objections: AnalysisModelObjection[];
  summary_of_model: string;
}

export interface AnalysisCallFacts {
  ubicacion: string | null;
  motivo_principal: string;
  observaciones_clave: string[];
}

export interface CallAnalysis {
  overall_score?: number;
  summary?: string;
  call_facts?: AnalysisCallFacts;
  call_outcome?: CallOutcome;
  call_outcome_reason?: string;
  closer_speaker_label?: "Hablante 1" | "Hablante 2" | null;
  model_signals?: AnalysisModelSignals;
  dimensions?: AnalysisDimension[];
  red_flags?: AnalysisRedFlag[];
  key_moments?: AnalysisKeyMoment[];
  improvements?: string[];
}

export interface QaCall {
  id: string;
  model_id: string | null;
  closer_id: string | null;
  call_date: string;
  evaluator_name: string;
  transcript: string;
  audio_metrics: unknown | null;
  /** Full Claude / IA analysis payload — every field is optional
   *  because legacy rows or partial analyses may not include the
   *  full schema. The detail view must guard against missing data. */
  claude_analysis: CallAnalysis;
  claude_score: number;
  created_at: string;
}

/** Row shape returned by the joined list query — calls + flattened
 *  model + closer fields for table rendering. */
export interface QaCallRow extends QaCall {
  model: { name: string; avatar_data_url: string | null } | null;
  closer: { name: string } | null;
}

const sb = supabase as unknown as { from: (table: string) => any };

interface ListParams {
  closerId?: string;
  modelId?: string;
  outcome?: CallOutcome;
  search?: string;
  limit?: number;
}

export const useQaCalls = (params: ListParams = {}) => {
  const { closerId, modelId, outcome, search, limit = 200 } = params;
  return useQuery({
    queryKey: ["qa-calls", { closerId, modelId, outcome, search, limit }],
    queryFn: async (): Promise<QaCallRow[]> => {
      // Embedded selects: PostgREST resolves these via the foreign-key
      // relationships set up in the migration. The aliases (model:,
      // closer:) keep the field names short on the client.
      let q = sb
        .from("qa_calls")
        .select(
          "*, model:qa_models(name, avatar_data_url), closer:qa_closers(name)",
        )
        .order("created_at", { ascending: false })
        .limit(limit);
      if (closerId) q = q.eq("closer_id", closerId);
      if (modelId) q = q.eq("model_id", modelId);
      if (outcome) q = q.eq("claude_analysis->>call_outcome", outcome);
      if (search?.trim()) {
        const term = `%${search.trim()}%`;
        q = q.ilike("evaluator_name", term);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as QaCallRow[];
    },
  });
};

/** Single call + joined model + closer for the detail drawer. */
export const useQaCall = (id: string | null) =>
  useQuery({
    queryKey: ["qa-call", id],
    enabled: !!id,
    queryFn: async (): Promise<QaCallRow | null> => {
      if (!id) return null;
      const { data, error } = await sb
        .from("qa_calls")
        .select(
          "*, model:qa_models(name, avatar_data_url), closer:qa_closers(name)",
        )
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as QaCallRow | null;
    },
  });

export const useQaModels = () =>
  useQuery({
    queryKey: ["qa-models"],
    queryFn: async (): Promise<QaModel[]> => {
      const { data, error } = await sb
        .from("qa_models")
        .select("*")
        .eq("active", true)
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as QaModel[];
    },
  });

export const useQaClosers = () =>
  useQuery({
    queryKey: ["qa-closers"],
    queryFn: async (): Promise<QaCloser[]> => {
      const { data, error } = await sb
        .from("qa_closers")
        .select("*")
        .eq("active", true)
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as QaCloser[];
    },
  });

// Utility shared by the table + future call-detail page.
export const scoreColor = (score: number | null): string => {
  if (score == null) return "rgb(148 163 184)";
  if (score >= 80) return "rgb(22 163 74)";
  if (score >= 60) return "rgb(202 138 4)";
  if (score >= 40) return "rgb(234 88 12)";
  return "rgb(220 38 38)";
};

export const OUTCOME_META: Record<
  Exclude<CallOutcome, null | string>,
  { label: string; bg: string; icon: string }
> = {
  cerro:     { label: "Exitoso",   bg: "rgb(22 163 74)",  icon: "✓" },
  no_cerro:  { label: "Rechazado", bg: "rgb(220 38 38)",  icon: "✗" },
  en_espera: { label: "En espera", bg: "rgb(202 138 4)",  icon: "⏳" },
};
