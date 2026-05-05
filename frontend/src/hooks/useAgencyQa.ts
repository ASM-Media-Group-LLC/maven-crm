import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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

/** Trigger the qa-analyze edge function for an existing call_id.
 *  The function reads the row, calls Groq with the kash analysis prompt,
 *  parses + validates the JSON response, and writes it back to
 *  qa_calls.claude_analysis + claude_score. Requires GROQ_API_KEY
 *  configured in Supabase Edge Function secrets. */
export const useAnalyzeQaCall = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (callId: string): Promise<{ score: number; analysis: CallAnalysis }> => {
      const { data, error } = await supabase.functions.invoke("qa-analyze", {
        body: { call_id: callId },
      });
      if (error) {
        // Edge function 4xx/5xx come back wrapped in error.context.body
        // or as plain message — surface the most useful one.
        const msg =
          (error as { context?: { body?: string } }).context?.body
            ? (() => {
                try {
                  const parsed = JSON.parse(
                    (error as { context: { body: string } }).context.body,
                  );
                  return parsed.error ?? error.message;
                } catch {
                  return error.message;
                }
              })()
            : error.message;
        throw new Error(msg);
      }
      if ((data as { error?: string })?.error) {
        throw new Error((data as { error: string }).error);
      }
      return {
        score: (data as { score: number }).score,
        analysis: (data as { analysis: CallAnalysis }).analysis,
      };
    },
    onSuccess: (_data, callId) => {
      qc.invalidateQueries({ queryKey: ["qa-call", callId] });
      qc.invalidateQueries({ queryKey: ["qa-calls"] });
      qc.invalidateQueries({ queryKey: ["qa-models-with-stats"] });
      qc.invalidateQueries({ queryKey: ["qa-analytics"] });
    },
  });
};

/** Create a new qa_call row from the Nueva QA form. claude_analysis
 * starts as `{}` and claude_score as 0. The AI dispatch happens after
 * insert via useAnalyzeQaCall (qa-analyze edge function). */
export interface CreateQaCallInput {
  closer_id: string;
  model_id: string;
  call_date: string;        // ISO yyyy-mm-dd
  evaluator_name: string;
  transcript: string;
}

export const useCreateQaCall = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateQaCallInput): Promise<QaCall> => {
      const { data, error } = await sb
        .from("qa_calls")
        .insert({
          closer_id: input.closer_id,
          model_id: input.model_id,
          call_date: input.call_date,
          evaluator_name: input.evaluator_name,
          transcript: input.transcript,
          claude_analysis: {},
          claude_score: 0,
          audio_metrics: null,
        })
        .select("*")
        .single();
      if (error) throw error;
      return data as QaCall;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["qa-calls"] });
      qc.invalidateQueries({ queryKey: ["qa-models-with-stats"] });
      qc.invalidateQueries({ queryKey: ["qa-analytics"] });
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

/** Models + aggregated stats (calls count, avg score, last call) for
 *  the Models subtab. Aggregation is client-side off two parallel
 *  queries so it stays simple while call volume is small (<2k). When
 *  it grows past that threshold, swap the second query for an RPC or
 *  materialised view. */
export interface QaModelWithStats extends QaModel {
  total_calls: number;
  avg_score: number;
  last_call_date: string | null;
  last_call: {
    id: string;
    closer_name: string | null;
    outcome: CallOutcome;
    score: number;
  } | null;
}

export const useQaModelsWithStats = () =>
  useQuery({
    queryKey: ["qa-models-with-stats"],
    queryFn: async (): Promise<QaModelWithStats[]> => {
      const [{ data: models, error: mErr }, { data: calls, error: cErr }] =
        await Promise.all([
          sb
            .from("qa_models")
            .select("*")
            .eq("active", true)
            .order("name", { ascending: true }),
          sb
            .from("qa_calls")
            .select(
              "id, model_id, claude_score, claude_analysis, call_date, closer:qa_closers(name)",
            )
            .order("call_date", { ascending: false })
            .limit(2000),
        ]);
      if (mErr) throw mErr;
      if (cErr) throw cErr;

      const byModel = new Map<string, any[]>();
      for (const c of (calls ?? []) as any[]) {
        if (!c.model_id) continue;
        const arr = byModel.get(c.model_id) ?? [];
        arr.push(c);
        byModel.set(c.model_id, arr);
      }

      return ((models ?? []) as QaModel[]).map((m) => {
        const list = byModel.get(m.id) ?? [];
        const total = list.length;
        const avg =
          total > 0
            ? Math.round(list.reduce((a, c) => a + (c.claude_score ?? 0), 0) / total)
            : 0;
        const last = list[0] ?? null;
        return {
          ...m,
          total_calls: total,
          avg_score: avg,
          last_call_date: last?.call_date ?? null,
          last_call: last
            ? {
                id: last.id,
                closer_name: last.closer?.name ?? null,
                outcome: last.claude_analysis?.call_outcome ?? null,
                score: last.claude_score ?? 0,
              }
            : null,
        };
      });
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

// ─── Analytics aggregates ──────────────────────────────────────────────
export type QaWindow = "7d" | "30d" | "90d" | "all";

export interface QaAnalytics {
  window: QaWindow;
  total_calls: number;
  cerro: number;
  no_cerro: number;
  en_espera: number;
  unscored: number;
  close_rate: number;        // cerro / total_calls
  avg_score: number;         // mean of claude_score across all rows in window
  active_models: number;     // unique model_ids with >=1 call in window
  active_closers: number;    // unique closer_ids with >=1 call in window
  closer_leaderboard: Array<{
    closer_id: string;
    closer_name: string;
    calls: number;
    avg_score: number;
    cerro: number;
    close_rate: number;
  }>;
  top_models: Array<{
    model_id: string;
    model_name: string;
    calls: number;
    avg_score: number;
  }>;
  /** Weekly volume series for the last 12 weeks (ISO week start →
   *  count). Older periods (90d, all) still bucket by week to keep
   *  the chart shape stable. */
  weekly_volume: Array<{ week_start: string; count: number; avg_score: number }>;
}

const windowSinceIso = (w: QaWindow): string | null => {
  if (w === "all") return null;
  const days = w === "7d" ? 7 : w === "30d" ? 30 : 90;
  return new Date(Date.now() - days * 86400_000).toISOString();
};

export const useQaAnalytics = (window: QaWindow = "30d") =>
  useQuery({
    queryKey: ["qa-analytics", window],
    queryFn: async (): Promise<QaAnalytics> => {
      const since = windowSinceIso(window);

      // Single fat query — call rows + joined closer/model names.
      // Capped at 5k rows; beyond that the dashboard should move to
      // an RPC. With current scale we're nowhere near.
      let q = sb
        .from("qa_calls")
        .select(
          "id, model_id, closer_id, claude_score, claude_analysis, call_date, created_at, model:qa_models(name), closer:qa_closers(name)",
        )
        .order("call_date", { ascending: false })
        .limit(5000);
      if (since) q = q.gte("created_at", since);
      const { data, error } = await q;
      if (error) throw error;

      const rows = (data ?? []) as any[];
      const total = rows.length;

      let cerro = 0;
      let no_cerro = 0;
      let en_espera = 0;
      let unscored = 0;
      let scoreSum = 0;

      const byCloser = new Map<
        string,
        { name: string; calls: number; scoreSum: number; cerro: number }
      >();
      const byModel = new Map<
        string,
        { name: string; calls: number; scoreSum: number }
      >();
      const byWeek = new Map<string, { count: number; scoreSum: number }>();

      const weekStartIso = (iso: string): string => {
        // call_date is YYYY-MM-DD (date type, no time). Normalise to
        // Monday of that ISO week for stable bucketing.
        const d = new Date(`${iso}T00:00:00Z`);
        const day = d.getUTCDay() || 7; // 1..7 with Mon=1
        if (day !== 1) d.setUTCDate(d.getUTCDate() - (day - 1));
        return d.toISOString().slice(0, 10);
      };

      for (const r of rows) {
        scoreSum += r.claude_score ?? 0;
        const outcome = r.claude_analysis?.call_outcome;
        if (outcome === "cerro") cerro++;
        else if (outcome === "no_cerro") no_cerro++;
        else if (outcome === "en_espera") en_espera++;
        else unscored++;

        if (r.closer_id) {
          const name = r.closer?.name ?? "—";
          const c = byCloser.get(r.closer_id) ?? { name, calls: 0, scoreSum: 0, cerro: 0 };
          c.calls++;
          c.scoreSum += r.claude_score ?? 0;
          if (outcome === "cerro") c.cerro++;
          byCloser.set(r.closer_id, c);
        }

        if (r.model_id) {
          const name = r.model?.name ?? "—";
          const m = byModel.get(r.model_id) ?? { name, calls: 0, scoreSum: 0 };
          m.calls++;
          m.scoreSum += r.claude_score ?? 0;
          byModel.set(r.model_id, m);
        }

        const wk = weekStartIso(r.call_date);
        const w = byWeek.get(wk) ?? { count: 0, scoreSum: 0 };
        w.count++;
        w.scoreSum += r.claude_score ?? 0;
        byWeek.set(wk, w);
      }

      const closer_leaderboard = Array.from(byCloser.entries())
        .map(([id, v]) => ({
          closer_id: id,
          closer_name: v.name,
          calls: v.calls,
          avg_score: v.calls > 0 ? Math.round(v.scoreSum / v.calls) : 0,
          cerro: v.cerro,
          close_rate: v.calls > 0 ? v.cerro / v.calls : 0,
        }))
        .sort((a, b) => b.avg_score - a.avg_score)
        .slice(0, 10);

      const top_models = Array.from(byModel.entries())
        .map(([id, v]) => ({
          model_id: id,
          model_name: v.name,
          calls: v.calls,
          avg_score: v.calls > 0 ? Math.round(v.scoreSum / v.calls) : 0,
        }))
        .sort((a, b) => b.calls - a.calls)
        .slice(0, 10);

      const weekly_volume = Array.from(byWeek.entries())
        .map(([week_start, v]) => ({
          week_start,
          count: v.count,
          avg_score: v.count > 0 ? Math.round(v.scoreSum / v.count) : 0,
        }))
        .sort((a, b) => a.week_start.localeCompare(b.week_start))
        .slice(-12);

      return {
        window,
        total_calls: total,
        cerro,
        no_cerro,
        en_espera,
        unscored,
        close_rate: total > 0 ? cerro / total : 0,
        avg_score: total > 0 ? Math.round(scoreSum / total) : 0,
        active_models: byModel.size,
        active_closers: byCloser.size,
        closer_leaderboard,
        top_models,
        weekly_volume,
      };
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

// ─── QA Chat (Mike) ────────────────────────────────────────────────────
// kash equivalent: app/qa/chat/page.tsx + components/MikeChatPanel.tsx +
// lib/mike-chat.ts + db tables qa_chat_sessions / qa_chat_messages.
//
// This slice ships the UI + persistence only. The AI dispatch (Mike's
// streaming response with cached context) lives in edge function
// qa-chat-mike and lands in the next slice when GROQ_API_KEY is wired.
// Until then, sending a message persists the user turn but the
// assistant response stays at "pendiente".

export type QaChatScope = "closer" | "all";

export interface QaChatSession {
  id: string;
  user_id: string;
  scope_type: QaChatScope;
  scope_closer_id: string | null;
  title: string | null;
  created_at: string;
  updated_at: string;
}

export interface QaChatSessionRow extends QaChatSession {
  closer: { name: string } | null;
}

export interface QaChatMessage {
  id: string;
  session_id: string;
  role: "user" | "assistant";
  content: string;
  tokens_in: number | null;
  tokens_out: number | null;
  cached_tokens: number | null;
  created_at: string;
}

export const useQaChatSessions = () =>
  useQuery({
    queryKey: ["qa-chat-sessions"],
    queryFn: async (): Promise<QaChatSessionRow[]> => {
      const { data, error } = await sb
        .from("qa_chat_sessions")
        .select("*, closer:qa_closers(name)")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as QaChatSessionRow[];
    },
  });

export const useQaChatMessages = (sessionId: string | null) =>
  useQuery({
    queryKey: ["qa-chat-messages", sessionId],
    enabled: !!sessionId,
    queryFn: async (): Promise<QaChatMessage[]> => {
      if (!sessionId) return [];
      const { data, error } = await sb
        .from("qa_chat_messages")
        .select("*")
        .eq("session_id", sessionId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as QaChatMessage[];
    },
  });

export interface CreateQaChatSessionInput {
  scope_type: QaChatScope;
  scope_closer_id: string | null;
}

export const useCreateQaChatSession = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateQaChatSessionInput): Promise<QaChatSession> => {
      const { data: userRes, error: userErr } = await supabase.auth.getUser();
      if (userErr) throw userErr;
      const userId = userRes.user?.id;
      if (!userId) throw new Error("No hay sesión activa.");
      // tenant_id se autocompleta vía DEFAULT current_tenant_id() en la
      // tabla. user_id sí lo seteamos explícito porque la RLS pide
      // user_id = auth.uid() en el WITH CHECK.
      const { data, error } = await sb
        .from("qa_chat_sessions")
        .insert({
          user_id: userId,
          scope_type: input.scope_type,
          scope_closer_id: input.scope_closer_id,
          title: null,
        })
        .select("*")
        .single();
      if (error) throw error;
      return data as QaChatSession;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["qa-chat-sessions"] });
    },
  });
};

export const useDeleteQaChatSession = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await sb.from("qa_chat_sessions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["qa-chat-sessions"] });
    },
  });
};

/** Persist a user message to qa_chat_messages. Returns the row.
 *  No AI dispatch yet — the assistant turn lands when the qa-chat-mike
 *  edge function is wired. */
export const useSendQaChatMessage = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      session_id: string;
      content: string;
    }): Promise<QaChatMessage> => {
      const { data, error } = await sb
        .from("qa_chat_messages")
        .insert({
          session_id: input.session_id,
          role: "user",
          content: input.content,
        })
        .select("*")
        .single();
      if (error) throw error;
      // Bump updated_at on the parent session so the sidebar reorders.
      await sb
        .from("qa_chat_sessions")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", input.session_id);
      return data as QaChatMessage;
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ["qa-chat-messages", variables.session_id] });
      qc.invalidateQueries({ queryKey: ["qa-chat-sessions"] });
    },
  });
};
