import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  buildQaEmailHtml,
  buildQaEmailSubject,
  labelForOutcome,
  type QaEmailPayload,
} from "@/pages/agency-qa/qaEmailTemplate";

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
  /** Storage path inside qa-audio bucket. NULL for legacy rows that
   *  predate the audio-only intake (transcripts pegados a mano). */
  audio_path: string | null;
  /** Full Claude / IA analysis payload — every field is optional
   *  because legacy rows or partial analyses may not include the
   *  full schema. The detail view must guard against missing data. */
  claude_analysis: CallAnalysis;
  claude_score: number;
  created_at: string;
  /** auth.users.id of who uploaded this QA. NULL for legacy rows that
   *  predate the column. QA History falls back to evaluator_name match
   *  when uploaded_by is NULL. */
  uploaded_by?: string | null;
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

/** Trigger qa-transcribe (Groq Whisper) for an audio that ya está en
 *  qa-audio Storage. Pattern path-based: el browser sube el mp3 a
 *  Storage primero (transporte robusto, sin límite chico de body), y
 *  acá solo mandamos el path en JSON para que el edge baje el archivo
 *  con service role y se lo pase a Groq.
 *
 *  Antes mandábamos el File en multipart/form-data directo al edge.
 *  Para audios comprimidos de ~8MB el gateway cortaba la conexión sin
 *  respuesta clara → "Failed to fetch" en el browser. Pasar a path
 *  elimina ese cuello de botella. */
export const useTranscribeAudio = () =>
  useMutation({
    mutationFn: async (input: {
      audioPath: string;
      language?: string;
    }): Promise<{ text: string; duration: number | null }> => {
      const { data, error } = await supabase.functions.invoke("qa-transcribe", {
        body: { audio_path: input.audioPath, language: input.language ?? "es" },
      });
      if (error) {
        // FunctionsHttpError trae el body de la response como JSON; intentamos
        // sacar el `error` específico que devuelve el edge para que el toast
        // muestre algo útil ("Groq tardó más de 120s") en vez de un genérico.
        let detail: string | null = null;
        type WithCtx = { context?: { json?: () => Promise<unknown> } };
        const ctx = (error as unknown as WithCtx).context;
        if (ctx && typeof ctx.json === "function") {
          try {
            const body = (await ctx.json()) as { error?: string };
            if (body?.error) detail = body.error;
          } catch {
            // body no era JSON, dejamos detail null
          }
        }
        throw new Error(detail ?? error.message ?? "Error al transcribir.");
      }
      const payload = data as { text?: string; duration?: number | null; error?: string };
      if (payload?.error) throw new Error(payload.error);
      return {
        text: payload?.text ?? "",
        duration: payload?.duration ?? null,
      };
    },
  });

/** Trigger the qa-analyze edge function for an existing call_id.
 *  The function reads the row, calls the LLM (Gemini > Groq dispatcher)
 *  with the kash analysis prompt, parses + validates the JSON response,
 *  and writes it back to qa_calls.claude_analysis + claude_score.
 *
 *  Acepta `withFeedback` opcional: cuando es true, el edge function
 *  también lee la última row de qa_human_feedback para ese call y la
 *  inyecta en el prompt como [FEEDBACK DEL SUPERVISOR]. Sirve para
 *  re-analizar una QA ya analizada incorporando correcciones humanas
 *  (port del humanContext de kash). */
export interface AnalyzeQaCallInput {
  callId: string;
  withFeedback?: boolean;
}

export const useAnalyzeQaCall = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      input: AnalyzeQaCallInput | string,
    ): Promise<{ score: number; analysis: CallAnalysis }> => {
      // Backwards-compat: callers viejos siguen pasando un string callId.
      const normalized: AnalyzeQaCallInput =
        typeof input === "string" ? { callId: input } : input;
      const { data, error } = await supabase.functions.invoke("qa-analyze", {
        body: {
          call_id: normalized.callId,
          with_feedback: normalized.withFeedback === true,
        },
      });
      if (error) {
        // FunctionsHttpError trae la response cruda en error.context.
        // El SDK moderno expone .json() como async para parsear el body
        // — que es donde el edge function pone el campo `error` con el
        // mensaje útil. Sin esto el toast queda en el genérico
        // "Edge Function returned a non-2xx status code".
        let detail: string | null = null;
        type WithCtx = { context?: { json?: () => Promise<unknown> } };
        const ctx = (error as unknown as WithCtx).context;
        if (ctx && typeof ctx.json === "function") {
          try {
            const body = (await ctx.json()) as { error?: string };
            if (body?.error) detail = body.error;
          } catch {
            // body no era JSON parseable, dejamos detail null
          }
        }
        throw new Error(detail ?? error.message ?? "Error al analizar.");
      }
      if ((data as { error?: string })?.error) {
        throw new Error((data as { error: string }).error);
      }
      return {
        score: (data as { score: number }).score,
        analysis: (data as { analysis: CallAnalysis }).analysis,
      };
    },
    onSuccess: (_data, input) => {
      const callId = typeof input === "string" ? input : input.callId;
      qc.invalidateQueries({ queryKey: ["qa-call", callId] });
      qc.invalidateQueries({ queryKey: ["qa-calls"] });
      qc.invalidateQueries({ queryKey: ["qa-models-with-stats"] });
      qc.invalidateQueries({ queryKey: ["qa-analytics"] });
    },
  });
};

// ─── Human feedback (qa_human_feedback) ──────────────────────────────
// Cada row es un feedback discreto del supervisor sobre una QA: texto
// libre + score humano opcional. Mantenemos historial (no upsert), la
// UI muestra solo la más reciente. Para re-analizar con ese contexto,
// llamar useAnalyzeQaCall con { callId, withFeedback: true } — el edge
// function lee la row más reciente.

export interface QaHumanFeedback {
  id: string;
  call_id: string;
  evaluator_name: string;
  feedback_text: string;
  human_score: number | null;
  created_at: string;
}

/** Lee el feedback humano más reciente para un call_id. Devuelve null
 *  si la QA todavía no tiene feedback registrado. */
export const useQaHumanFeedback = (callId: string | null) =>
  useQuery({
    queryKey: ["qa-human-feedback", callId],
    enabled: !!callId,
    queryFn: async (): Promise<QaHumanFeedback | null> => {
      if (!callId) return null;
      const { data, error } = await sb
        .from("qa_human_feedback")
        .select("*")
        .eq("call_id", callId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as QaHumanFeedback | null;
    },
  });

export interface CreateQaHumanFeedbackInput {
  call_id: string;
  evaluator_name: string;
  feedback_text: string;
  human_score?: number | null;
}

/** Crea una nueva row de feedback humano. Cada llamada es un registro
 *  separado — el supervisor puede dejar varias entradas a lo largo del
 *  tiempo y el historial queda. La UI usualmente muestra solo la última. */
export const useCreateQaHumanFeedback = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateQaHumanFeedbackInput): Promise<QaHumanFeedback> => {
      const { data, error } = await sb
        .from("qa_human_feedback")
        .insert({
          call_id: input.call_id,
          evaluator_name: input.evaluator_name,
          feedback_text: input.feedback_text,
          human_score: input.human_score ?? null,
        })
        .select("*")
        .single();
      if (error) throw error;
      return data as QaHumanFeedback;
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ["qa-human-feedback", variables.call_id] });
    },
  });
};

// ─── Section feedback (qa_section_feedback) ──────────────────────────
// Thumbs 👍/👎 + nota + score sugerido por cada item del análisis IA
// (cada dimension, red_flag, key_moment). Constraint UNIQUE(call_id,
// section_type, section_index) garantiza un feedback por sección — al
// volver a votar, upsert lo reemplaza. Nada de historial acá: si una
// sección ya tenía thumbs, el último click la pisa.

export type QaSectionType = "dimension" | "red_flag" | "key_moment" | "improvement" | string;

export interface QaSectionFeedback {
  id: string;
  call_id: string;
  section_type: QaSectionType;
  section_index: number;
  section_label: string | null;
  thumbs: number; // 1 | -1
  note: string | null;
  suggested_score: number | null;
  evaluator_name: string | null;
  created_at: string;
  updated_at: string;
}

/** Lee TODOS los thumbs+notas del call (una sola query — la cantidad
 *  por call es chica, ~30 items max). El componente filtra por section
 *  type/index al renderizar. */
export const useQaSectionFeedback = (callId: string | null) =>
  useQuery({
    queryKey: ["qa-section-feedback", callId],
    enabled: !!callId,
    queryFn: async (): Promise<QaSectionFeedback[]> => {
      if (!callId) return [];
      const { data, error } = await sb
        .from("qa_section_feedback")
        .select("*")
        .eq("call_id", callId);
      if (error) throw error;
      return (data ?? []) as QaSectionFeedback[];
    },
  });

export interface UpsertQaSectionFeedbackInput {
  call_id: string;
  section_type: QaSectionType;
  section_index: number;
  section_label?: string | null;
  thumbs: number; // 1 | -1
  note?: string | null;
  suggested_score?: number | null;
  evaluator_name?: string | null;
}

/** Upsert (por call_id + section_type + section_index) de un feedback de
 *  sección. Postgres usa el UNIQUE constraint declarado en la migration
 *  para resolver el conflicto y replazar la row existente.
 *
 *  Importante: pasar `onConflict` con la lista exacta de columnas del
 *  UNIQUE — sin eso PostgREST no sabe cuál constraint usar y rechaza. */
export const useUpsertQaSectionFeedback = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpsertQaSectionFeedbackInput): Promise<QaSectionFeedback> => {
      const { data, error } = await sb
        .from("qa_section_feedback")
        .upsert(
          {
            call_id: input.call_id,
            section_type: input.section_type,
            section_index: input.section_index,
            section_label: input.section_label ?? null,
            thumbs: input.thumbs,
            note: input.note ?? null,
            suggested_score: input.suggested_score ?? null,
            evaluator_name: input.evaluator_name ?? null,
          },
          { onConflict: "call_id,section_type,section_index" },
        )
        .select("*")
        .single();
      if (error) throw error;
      return data as QaSectionFeedback;
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ["qa-section-feedback", variables.call_id] });
    },
  });
};

/** Helper opcional — borra un thumbs (cuando el usuario quiere
 *  "destildar" su voto). No es estrictamente necesario porque la UI
 *  igual puede ofrecer toggle entre 👍 y 👎, pero a veces queremos
 *  volver al estado "sin opinion". */
export const useDeleteQaSectionFeedback = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      call_id: string;
      section_type: QaSectionType;
      section_index: number;
    }): Promise<void> => {
      const { error } = await sb
        .from("qa_section_feedback")
        .delete()
        .eq("call_id", input.call_id)
        .eq("section_type", input.section_type)
        .eq("section_index", input.section_index);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ["qa-section-feedback", variables.call_id] });
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
  audio_path?: string | null;
}

export const useCreateQaCall = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateQaCallInput): Promise<QaCall & { audio_path: string | null }> => {
      // Capturamos el user_id actual para asociar la fila con quien la
      // sube. Esto es lo que usa "QA History" para listar "mis QAs".
      const { data: authData } = await supabase.auth.getUser();
      const uploaderId = authData?.user?.id ?? null;

      const { data, error } = await sb
        .from("qa_calls")
        .insert({
          closer_id: input.closer_id,
          model_id: input.model_id,
          call_date: input.call_date,
          evaluator_name: input.evaluator_name,
          transcript: input.transcript,
          audio_path: input.audio_path ?? null,
          claude_analysis: {},
          claude_score: 0,
          audio_metrics: null,
          uploaded_by: uploaderId,
        })
        .select("*")
        .single();
      if (error) throw error;
      return data as QaCall & { audio_path: string | null };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["qa-calls"] });
      qc.invalidateQueries({ queryKey: ["qa-models-with-stats"] });
      qc.invalidateQueries({ queryKey: ["qa-analytics"] });
    },
  });
};

/** Borra una qa_calls row. La RLS del DB sólo deja pasar la operación
 *  cuando el caller tiene rol admin (policy qa_calls_delete_admin), así
 *  que el cliente puede llamar esta mutation libremente — el server la
 *  rechaza con error si el rol no califica. La UI igualmente esconde el
 *  botón para roles no-admin para no mostrar opciones rotas. */
export const useDeleteQaCall = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (callId: string): Promise<void> => {
      const { error } = await sb.from("qa_calls").delete().eq("id", callId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["qa-calls"] });
      qc.invalidateQueries({ queryKey: ["qa-call"] });
      qc.invalidateQueries({ queryKey: ["qa-models-with-stats"] });
      qc.invalidateQueries({ queryKey: ["qa-analytics"] });
    },
  });
};

export type ModelCategory = "A++" | "A+" | "A" | "B+" | "B" | "C+" | "C";

/** Upsert a closer by name. If a row with that exact (case-insensitive)
 *  name exists, return its id; otherwise insert a new active closer. */
export const useUpsertQaCloser = () =>
  useMutation({
    mutationFn: async (name: string): Promise<string> => {
      const trimmed = name.trim();
      if (!trimmed) throw new Error("Nombre del closer vacío.");
      const { data: existing, error: lookupErr } = await sb
        .from("qa_closers")
        .select("id")
        .ilike("name", trimmed)
        .maybeSingle();
      if (lookupErr) throw lookupErr;
      if (existing?.id) return existing.id as string;
      const { data: created, error: insertErr } = await sb
        .from("qa_closers")
        .insert({ name: trimmed, active: true })
        .select("id")
        .single();
      if (insertErr) throw insertErr;
      return created.id as string;
    },
  });

/** Upsert a model by name with optional metadata. If the model already
 *  exists, only fill metadata fields that were empty (don't overwrite
 *  good data with empty strings from the form). */
export interface UpsertQaModelInput {
  name: string;
  category?: ModelCategory | null;
  country?: string | null;
  ig_url?: string | null;
}

export const useUpsertQaModel = () =>
  useMutation({
    mutationFn: async (input: UpsertQaModelInput): Promise<string> => {
      const trimmed = input.name.trim();
      if (!trimmed) throw new Error("Nombre de la modelo vacío.");
      const { data: existing, error: lookupErr } = await sb
        .from("qa_models")
        .select("id, category, country, ig_url")
        .ilike("name", trimmed)
        .maybeSingle();
      if (lookupErr) throw lookupErr;

      if (existing?.id) {
        // Patch metadata gaps without overwriting existing values.
        const patch: Record<string, string> = {};
        if (!existing.category && input.category) patch.category = input.category;
        if (!existing.country && input.country) patch.country = input.country;
        if (!existing.ig_url && input.ig_url) patch.ig_url = input.ig_url;
        if (Object.keys(patch).length > 0) {
          const { error: updateErr } = await sb
            .from("qa_models")
            .update(patch)
            .eq("id", existing.id);
          if (updateErr) throw updateErr;
        }
        return existing.id as string;
      }

      const { data: created, error: insertErr } = await sb
        .from("qa_models")
        .insert({
          name: trimmed,
          category: input.category ?? null,
          country: input.country ?? null,
          ig_url: input.ig_url ?? null,
          active: true,
        })
        .select("id")
        .single();
      if (insertErr) throw insertErr;
      return created.id as string;
    },
  });

/** Lookup all CRM profiles. Used by Nueva QA para popular el closer
 *  dropdown — cualquier empleado de la empresa puede ser closer de
 *  una llamada (managers / supervisores también cubren a veces).
 *
 *  Confiamos en la policy "Authenticated users can view all profiles"
 *  (migration 20260226164549) — no necesitamos pasar por tenant_members.
 *  Cuando el sistema sea multi-tenant real con varios tenants vivos,
 *  esto se va a re-scope. Por ahora (un tenant: ASM Tech) está OK. */
export interface CrmUserProfile {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
}

export const useTenantProfiles = () =>
  useQuery({
    queryKey: ["tenant-profiles"],
    queryFn: async (): Promise<CrmUserProfile[]> => {
      const { data, error } = await sb
        .from("profiles")
        .select("id, full_name, avatar_url")
        .order("full_name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as CrmUserProfile[];
    },
  });

/** Trigger qa-fetch-ig-avatar to backfill qa_models.avatar_data_url from
 *  the model's ig_url. Idempotent — if the model already has an avatar,
 *  the function returns the cached one without re-scraping IG. */
export const useFetchIgAvatar = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (modelId: string): Promise<string | null> => {
      const { data, error } = await supabase.functions.invoke("qa-fetch-ig-avatar", {
        body: { model_id: modelId },
      });
      if (error) {
        const msg =
          (error as { context?: { body?: string } }).context?.body
            ? (() => {
                try {
                  return JSON.parse(
                    (error as { context: { body: string } }).context.body,
                  ).error ?? error.message;
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
      return (data as { avatar_data_url: string | null }).avatar_data_url;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["qa-models"] });
      qc.invalidateQueries({ queryKey: ["qa-models-with-stats"] });
      qc.invalidateQueries({ queryKey: ["qa-calls"] });
    },
  });
};

/** Resolve the current user's active tenant_id from tenant_members.
 *  We need it client-side to build Storage paths ("{tenant_id}/{call_id}.mp3")
 *  because the RLS policy on storage.objects scopes by path prefix. */
export const useCurrentTenantId = () =>
  useQuery({
    queryKey: ["current-tenant-id"],
    queryFn: async (): Promise<string | null> => {
      // current_tenant_id() es una function SQL pero no la podemos
      // llamar directo desde el client sin un wrapper RPC. Workaround:
      // pegamos en tenant_members con auth.uid() y devolvemos el primero.
      const { data: userRes, error: userErr } = await supabase.auth.getUser();
      if (userErr) throw userErr;
      const userId = userRes.user?.id;
      if (!userId) return null;
      const { data, error } = await sb
        .from("tenant_members")
        .select("tenant_id")
        .eq("user_id", userId)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data?.tenant_id as string) ?? null;
    },
  });

/** Upload an audio file to the qa-audio Storage bucket at the given
 *  path. The caller is expected to use "{tenant_id}/{call_id}.{ext}"
 *  format because that's what the RLS policy on storage.objects scopes
 *  by — but we don't enforce here, the policy will reject mismatches. */
export const useUploadQaAudio = () =>
  useMutation({
    mutationFn: async (input: { file: File; path: string }): Promise<string> => {
      const { error } = await supabase.storage
        .from("qa-audio")
        .upload(input.path, input.file, {
          contentType: input.file.type || "audio/mpeg",
          upsert: false,
        });
      if (error) throw error;
      return input.path;
    },
  });

/** Generate a short-lived signed URL for playback of an audio_path.
 *  Used in the call detail drawer. URLs expire after 1 hour. */
export const useQaAudioSignedUrl = (audioPath: string | null) =>
  useQuery({
    queryKey: ["qa-audio-signed-url", audioPath],
    enabled: !!audioPath,
    // Aprovechamos el TTL de 1h del signed URL — refrescamos cada
    // 50 min para mantenerlo siempre vigente sin ataque a Storage.
    staleTime: 50 * 60 * 1000,
    queryFn: async (): Promise<string | null> => {
      if (!audioPath) return null;
      const { data, error } = await supabase.storage
        .from("qa-audio")
        .createSignedUrl(audioPath, 60 * 60);
      if (error) throw error;
      return data?.signedUrl ?? null;
    },
  });

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

// ─── QA Config (notificaciones globales) ──────────────────────────────
// Singleton (id=1) por tenant. Mismo patrón que chatter_config — un
// solo row con apps_script_url + lista de emails externos + lista de
// profiles.id internos + toggles por evento. La edge function
// notification-automations lee esto y dispara cuando entran las
// condiciones (qa_calls insert / claude_analysis update / score < threshold).

export interface QaConfig {
  id: number;
  apps_script_url: string | null;
  notification_emails: string[];
  notify_user_ids: string[];
  notify_on_uploaded: boolean;
  notify_on_analyzed: boolean;
  notify_on_low_score: boolean;
  notify_on_failed: boolean;
  low_score_threshold: number;
  updated_at: string;
}

export const useQaConfig = () =>
  useQuery({
    queryKey: ["qa-config"],
    queryFn: async (): Promise<QaConfig | null> => {
      const { data, error } = await sb
        .from("qa_config")
        .select("*")
        .eq("id", 1)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as QaConfig | null;
    },
  });

export interface UpdateQaConfigInput {
  apps_script_url?: string | null;
  notification_emails?: string[];
  notify_user_ids?: string[];
  notify_on_uploaded?: boolean;
  notify_on_analyzed?: boolean;
  notify_on_low_score?: boolean;
  notify_on_failed?: boolean;
  low_score_threshold?: number;
}

export const useUpdateQaConfig = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateQaConfigInput): Promise<QaConfig> => {
      const { data, error } = await sb
        .from("qa_config")
        .update(input)
        .eq("id", 1)
        .select("*")
        .single();
      if (error) throw error;
      return data as QaConfig;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["qa-config"] });
    },
  });
};

// ─── QA Webhook (kash-style email vía Apps Script) ───────────────────
// Mismo pattern que useChatterEvaluator.fireWebhookInBackground:
// armamos el payload en el cliente (incluido el HTML del mail) y lo
// disparamos al apps_script_url configurado en qa_config. El AppScript
// se encarga de relayear a MailApp.sendEmail + escribir en Drive/Sheets.
//
// El payload lleva `type: "qa_call_analysis"` para que el mismo GAS pueda
// hacer dispatch entre tipos (chatter_evaluation vs qa_call_analysis) sin
// necesidad de un webhook separado.

interface FireInput {
  callId: string;
}

const fireQaWebhookInBackground = async ({ callId }: FireInput): Promise<void> => {
  const [{ data: cfg }, { data: row }] = await Promise.all([
    sb.from("qa_config").select("*").eq("id", 1).maybeSingle(),
    sb
      .from("qa_calls")
      .select(
        "*, model:qa_models(name, category, ig_url), closer:qa_closers(name)",
      )
      .eq("id", callId)
      .maybeSingle(),
  ]);

  const config = cfg as QaConfig | null;
  const call = row as (QaCall & {
    model: { name: string; category: string | null; ig_url: string | null } | null;
    closer: { name: string } | null;
  }) | null;

  if (!call) throw new Error("QA call no encontrada para webhook.");
  if (!config?.apps_script_url) {
    // No es error — el webhook simplemente no está wireado en este tenant.
    // El submit continúa sin mail.
    return;
  }

  const score = call.claude_score ?? call.claude_analysis?.overall_score ?? 0;

  // Toggle gating: si nadie pidió notificar este evento, no disparamos.
  // notify_on_analyzed cubre el caso "todos los análisis nuevos".
  // notify_on_low_score cubre solo cuando bajó del threshold.
  const shouldNotify =
    config.notify_on_analyzed === true ||
    (config.notify_on_low_score === true &&
      score < (config.low_score_threshold ?? 60));
  if (!shouldNotify) return;

  const a = call.claude_analysis ?? {};
  const outcome = (a.call_outcome as string | null) ?? null;
  const emailPayload: QaEmailPayload = {
    callId: call.id,
    createdAt: call.created_at,
    closerName: call.closer?.name ?? "(sin nombre)",
    modelName: call.model?.name ?? "(sin nombre)",
    modelCategory: call.model?.category ?? null,
    modelIgUrl: call.model?.ig_url ?? null,
    appUrl: typeof window !== "undefined" ? window.location.origin : "",
    callDate: call.call_date,
    evaluatorName: call.evaluator_name ?? "",
    overallScore: score,
    summary: a.summary ?? "",
    callOutcome: outcome,
    callOutcomeLabel: labelForOutcome(outcome),
    callOutcomeReason: a.call_outcome_reason ?? null,
    dimensions: (a.dimensions ?? []).map((d) => ({
      name: d.name,
      score: d.score,
      feedback: d.feedback,
    })),
    redFlags: (a.red_flags ?? []).map((f) => ({
      type: f.type,
      description: f.description,
      quote: f.quote,
    })),
    keyMoments: (a.key_moments ?? []).map((k) => ({
      kind: k.kind,
      quote: k.quote,
      why: k.why,
    })),
    improvements: a.improvements ?? [],
  };

  // Payload final = todos los datos crudos + email pre-renderizado +
  // type discriminator para el dispatch en GAS.
  const payload = {
    type: "qa_call_analysis" as const,
    ...emailPayload,
    emails: config.notification_emails ?? [],
    emailSubject: buildQaEmailSubject(emailPayload),
    emailHtml: buildQaEmailHtml(emailPayload),
  };

  // text/plain para evitar el preflight CORS — Apps Script rechaza
  // OPTIONS y querer hacer JSON dispara preflight. El GAS hace
  // JSON.parse(e.postData.contents) del lado server.
  const res = await fetch(config.apps_script_url, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload),
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`Apps Script devolvió HTTP ${res.status}`);
};

/** Dispara el webhook de notificación de QA. Pensado para correr
 *  fire-and-forget desde el submit de Nueva QA — el examiner no debe
 *  esperar a que termine el GAS (10-30s para generar Doc + Sheet + mail).
 *  Cualquier error lo expone como toast.warning, NO bloquea el flujo. */
export const useFireQaWebhook = () =>
  useMutation({
    mutationFn: (input: FireInput) => fireQaWebhookInBackground(input),
  });

// ─── QA Chat (Clari) ────────────────────────────────────────────────────
// kash equivalent: app/qa/chat/page.tsx + components/ClariChatPanel.tsx +
// lib/clari-chat.ts + db tables qa_chat_sessions / qa_chat_messages.
//
// This slice ships the UI + persistence only. The AI dispatch (Clari's
// streaming response with cached context) lives in edge function
// qa-chat-clari and lands in the next slice when GROQ_API_KEY is wired.
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
 *  No AI dispatch yet — the assistant turn lands when the qa-chat-clari
 *  edge function is wired. */
export const useSendQaChatMessage = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      session_id: string;
      content: string;
    }): Promise<{ user: QaChatMessage; assistant: QaChatMessage | null; assistantError?: string }> => {
      // 1. Insertamos el mensaje del user PRIMERO. Si la edge function
      // qa-chat-clari falla después (rate limit, LLM error), el user
      // message ya quedó persistido y la UI muestra "Clari pendiente"
      // como antes — el supervisor puede reintentar pidiendo otra cosa
      // o esperando a que pase el rate limit.
      const { data: userMsg, error: userErr } = await sb
        .from("qa_chat_messages")
        .insert({
          session_id: input.session_id,
          role: "user",
          content: input.content,
        })
        .select("*")
        .single();
      if (userErr) throw userErr;

      // 2. Disparamos qa-chat-clari. La edge function genera la respuesta
      // del assistant, la inserta en qa_chat_messages, y bumpea
      // session.updated_at — frontend solo invalida la query.
      let assistant: QaChatMessage | null = null;
      let assistantError: string | undefined;
      try {
        const { data: invokeData, error: invokeErr } = await supabase.functions.invoke(
          "qa-chat-clari",
          { body: { session_id: input.session_id } },
        );
        if (invokeErr) {
          // Mismo patrón que useAnalyzeQaCall: extraer error específico
          // del body de la respuesta del edge.
          let detail: string | null = null;
          type WithCtx = { context?: { json?: () => Promise<unknown> } };
          const ctx = (invokeErr as unknown as WithCtx).context;
          if (ctx && typeof ctx.json === "function") {
            try {
              const body = (await ctx.json()) as { error?: string };
              if (body?.error) detail = body.error;
            } catch {
              // body no era JSON
            }
          }
          assistantError = detail ?? invokeErr.message ?? "Clari no respondió.";
        } else if ((invokeData as { error?: string })?.error) {
          assistantError = (invokeData as { error: string }).error;
        } else {
          assistant =
            (invokeData as { message?: QaChatMessage })?.message ?? null;
        }
      } catch (err) {
        assistantError = (err as Error).message ?? "Clari no respondió.";
      }

      return { user: userMsg as QaChatMessage, assistant, assistantError };
    },
    onSuccess: (_data, variables) => {
      // Invalidamos messages para que la UI repinte con el assistant
      // recién insertado por la edge function.
      qc.invalidateQueries({ queryKey: ["qa-chat-messages", variables.session_id] });
      qc.invalidateQueries({ queryKey: ["qa-chat-sessions"] });
    },
  });
};
