import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type {
  ChatterProfile,
  ChatterVaultItem,
  ChatterCriterion,
  ChatterConfig,
  ChatterSession,
  ChatterMessage,
  ChatterEvaluation,
  CriterionResult,
  EvaluationVerdict,
} from "@/pages/chatter-evaluator/types";

// The chatter_* tables aren't in the generated Supabase types yet, so we use
// `as unknown` casts to bypass the strict typing. After regenerating types
// post-merge these casts can be removed.

const sb = supabase as unknown as {
  from: (table: string) => any;
};

export const useChatterProfiles = () =>
  useQuery({
    queryKey: ["chatter-profiles"],
    queryFn: async (): Promise<ChatterProfile[]> => {
      const { data, error } = await sb
        .from("chatter_profiles")
        .select("*")
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ChatterProfile[];
    },
  });

export const useChatterVaultCounts = () =>
  useQuery({
    queryKey: ["chatter-vault-counts"],
    queryFn: async (): Promise<Record<string, number>> => {
      const { data, error } = await sb
        .from("chatter_vault_items")
        .select("profile_id");
      if (error) throw error;
      const counts: Record<string, number> = {};
      for (const row of (data ?? []) as { profile_id: string }[]) {
        counts[row.profile_id] = (counts[row.profile_id] ?? 0) + 1;
      }
      return counts;
    },
  });

export const useChatterVaultByProfile = (profileId: string | null | undefined) =>
  useQuery({
    queryKey: ["chatter-vault", profileId],
    enabled: !!profileId,
    queryFn: async (): Promise<ChatterVaultItem[]> => {
      const { data, error } = await sb
        .from("chatter_vault_items")
        .select("*")
        .eq("profile_id", profileId)
        .order("position", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ChatterVaultItem[];
    },
  });

export const useChatterCriteria = () =>
  useQuery({
    queryKey: ["chatter-criteria"],
    queryFn: async (): Promise<ChatterCriterion[]> => {
      const { data, error } = await sb
        .from("chatter_criteria_defaults")
        .select("*")
        .eq("is_active", true)
        .order("position", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ChatterCriterion[];
    },
  });

export const useChatterConfig = () =>
  useQuery({
    queryKey: ["chatter-config"],
    queryFn: async (): Promise<ChatterConfig | null> => {
      const { data, error } = await sb
        .from("chatter_config")
        .select("*")
        .eq("id", 1)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as ChatterConfig | null;
    },
  });

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export type ChatterProfileUpdate = Partial<
  Omit<ChatterProfile, "id" | "key" | "created_at" | "updated_at">
>;

export const useUpdateChatterProfile = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: ChatterProfileUpdate;
    }): Promise<ChatterProfile> => {
      const { data, error } = await sb
        .from("chatter_profiles")
        .update(patch)
        .eq("id", id)
        .select("*")
        .single();
      if (error) throw error;
      return data as ChatterProfile;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["chatter-profiles"] });
    },
  });
};

// ---- Vault items mutations ------------------------------------------------

const VAULT_BUCKET = "chatter-vault";

const inferMediaType = (filename: string): "image" | "video" | "other" => {
  const lower = filename.toLowerCase();
  if (/\.(mp4|mov|webm|m4v|avi|mkv)$/.test(lower)) return "video";
  if (/\.(jpg|jpeg|png|gif|webp|avif|svg|bmp)$/.test(lower)) return "image";
  return "other";
};

const sanitizeFilename = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || `item-${Date.now()}`;

// Upload an avatar image for a profile to Storage and return its public URL.
// Uses _avatars/ prefix in the same chatter-vault bucket so we keep one bucket.
export const useUploadChatterAvatar = () =>
  useMutation({
    mutationFn: async ({
      profileKey,
      file,
    }: {
      profileKey: string;
      file: File;
    }): Promise<{ url: string; path: string }> => {
      if (!file.type.startsWith("image/")) {
        throw new Error("El archivo debe ser una imagen.");
      }
      const path = `_avatars/${profileKey}-${Date.now()}-${sanitizeFilename(file.name)}`;
      const { error: upErr } = await supabase.storage
        .from(VAULT_BUCKET)
        .upload(path, file, {
          upsert: false,
          contentType: file.type,
          cacheControl: "3600",
        });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from(VAULT_BUCKET).getPublicUrl(path);
      return { url: pub.publicUrl, path };
    },
  });

export const useAddVaultItem = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      profileId,
      profileKey,
      file,
    }: {
      profileId: string;
      profileKey: string;
      file: File;
    }): Promise<ChatterVaultItem> => {
      const path = `${profileKey}/${Date.now()}-${sanitizeFilename(file.name)}`;
      const upload = await supabase.storage.from(VAULT_BUCKET).upload(path, file, {
        upsert: false,
        contentType: file.type || undefined,
      });
      if (upload.error) throw upload.error;
      const { data: pub } = supabase.storage.from(VAULT_BUCKET).getPublicUrl(path);

      // Position: append at end
      const { data: maxRow } = await sb
        .from("chatter_vault_items")
        .select("position")
        .eq("profile_id", profileId)
        .order("position", { ascending: false })
        .limit(1)
        .maybeSingle();
      const nextPos = ((maxRow?.position as number | undefined) ?? 0) + 1;

      const row = {
        profile_id: profileId,
        name: file.name,
        url: pub.publicUrl,
        media_type: inferMediaType(file.name),
        position: nextPos,
      };
      const { data, error } = await sb
        .from("chatter_vault_items")
        .insert(row)
        .select("*")
        .single();
      if (error) throw error;
      return data as ChatterVaultItem;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["chatter-vault", vars.profileId] });
      qc.invalidateQueries({ queryKey: ["chatter-vault-counts"] });
    },
  });
};

export const useDeleteVaultItem = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      item,
    }: {
      item: ChatterVaultItem;
    }): Promise<void> => {
      // Best-effort: if URL points to our Storage bucket, also delete the
      // underlying object. Otherwise (URL on the legacy host), just remove
      // the DB row — we don't own the file.
      const m = item.url.match(/\/storage\/v1\/object\/public\/chatter-vault\/(.+)$/);
      if (m) {
        await supabase.storage.from(VAULT_BUCKET).remove([decodeURIComponent(m[1])]);
      }
      const { error } = await sb
        .from("chatter_vault_items")
        .delete()
        .eq("id", item.id);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["chatter-vault", vars.item.profile_id] });
      qc.invalidateQueries({ queryKey: ["chatter-vault-counts"] });
    },
  });
};

export const useReorderVaultItems = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      profileId,
      orderedIds,
    }: {
      profileId: string;
      orderedIds: string[];
    }): Promise<void> => {
      // Update each row's position. Could batch via RPC; for now sequential is fine
      // for the small N (~76) we have.
      for (let i = 0; i < orderedIds.length; i++) {
        const { error } = await sb
          .from("chatter_vault_items")
          .update({ position: i + 1 })
          .eq("id", orderedIds[i]);
        if (error) throw error;
      }
      // Touch the profile_id closure to silence unused warnings on simple builds
      void profileId;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["chatter-vault", vars.profileId] });
    },
  });
};

// ---- Criteria mutations --------------------------------------------------

export type CriterionInput = {
  label: string;
  label_en: string | null;
  weight?: number;
  position?: number;
  is_active?: boolean;
};

export const useUpsertCriterion = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id?: string;
      patch: CriterionInput;
    }): Promise<ChatterCriterion> => {
      if (id) {
        const { data, error } = await sb
          .from("chatter_criteria_defaults")
          .update(patch)
          .eq("id", id)
          .select("*")
          .single();
        if (error) throw error;
        return data as ChatterCriterion;
      }
      const { data, error } = await sb
        .from("chatter_criteria_defaults")
        .insert(patch)
        .select("*")
        .single();
      if (error) throw error;
      return data as ChatterCriterion;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chatter-criteria"] }),
  });
};

export const useDeleteCriterion = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await sb
        .from("chatter_criteria_defaults")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chatter-criteria"] }),
  });
};

// The original ten criteria from Roleplaychatters (index.html DEFAULT_CRITERIA,
// line 2132). Order matters — it's the order admins are used to seeing.
export const ORIGINAL_CRITERIA: { label: string; label_en: string }[] = [
  { label: "Detección de oportunidad de venta", label_en: "Detecting a sales opportunity" },
  { label: "Cierre o intento de venta",         label_en: "Closing or attempting a sale" },
  { label: "Conexión emocional real",           label_en: "Real emotional connection" },
  { label: "Personalización estratégica",        label_en: "Strategic personalization" },
  { label: "Lenguaje emocional y sugestivo",    label_en: "Emotional and suggestive language" },
  { label: "Coherencia del personaje",          label_en: "Character coherence" },
  { label: "Control del ritmo y escalada",      label_en: "Pace and escalation control" },
  { label: "Manejo de objeciones",              label_en: "Objection handling" },
  { label: "Ortografía y presentación",          label_en: "Spelling and presentation" },
  { label: "Tiempos de respuesta",              label_en: "Response times" },
];

export const useResetCriteria = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<void> => {
      // Wipe everything, then insert the originals in order. We don't try to
      // diff/match — admins who hit reset want their canonical list back.
      const { error: delErr } = await sb
        .from("chatter_criteria_defaults")
        .delete()
        .gte("position", 0);
      if (delErr) throw delErr;
      const rows = ORIGINAL_CRITERIA.map((c, i) => ({
        label: c.label,
        label_en: c.label_en,
        weight: 1,
        position: i + 1,
        is_active: true,
      }));
      const { error: insErr } = await sb.from("chatter_criteria_defaults").insert(rows);
      if (insErr) throw insErr;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chatter-criteria"] }),
  });
};

export const useReorderCriteria = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (orderedIds: string[]): Promise<void> => {
      for (let i = 0; i < orderedIds.length; i++) {
        const { error } = await sb
          .from("chatter_criteria_defaults")
          .update({ position: i + 1 })
          .eq("id", orderedIds[i]);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chatter-criteria"] }),
  });
};

// ---- Config mutations ----------------------------------------------------

export type ConfigUpdate = Partial<
  Omit<ChatterConfig, "id" | "updated_at">
>;

export const useUpdateChatterConfig = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: ConfigUpdate): Promise<ChatterConfig> => {
      const { data, error } = await sb
        .from("chatter_config")
        .update(patch)
        .eq("id", 1)
        .select("*")
        .single();
      if (error) throw error;
      return data as ChatterConfig;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chatter-config"] }),
  });
};

// ---- Sessions queries / mutations ---------------------------------------

const genSessionId = (): string => {
  // 8-char short ID for clean public URLs (e.g. /chatter/AB12CD34).
  // Math.random has enough entropy for our N (hundreds at most), but we
  // include a timestamp slice to further reduce collision risk.
  const t = Date.now().toString(36).slice(-3).toUpperCase();
  const r = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `${t}${r}`;
};

export const useChatterSessions = (status?: "active-only" | "all") =>
  useQuery({
    queryKey: ["chatter-sessions", status ?? "all"],
    queryFn: async (): Promise<ChatterSession[]> => {
      let q = sb
        .from("chatter_sessions")
        .select("*")
        .order("created_at", { ascending: false });
      if (status === "active-only") q = q.neq("status", "ended");
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as ChatterSession[];
    },
  });

export const useChatterSession = (sessionId: string | null | undefined) =>
  useQuery({
    queryKey: ["chatter-session", sessionId],
    enabled: !!sessionId,
    queryFn: async (): Promise<ChatterSession | null> => {
      const { data, error } = await sb
        .from("chatter_sessions")
        .select("*")
        .eq("id", sessionId)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as ChatterSession | null;
    },
  });

export type CreateSessionInput = {
  profileId: string;
  chatterName: string;
  durationMinutes?: number;
  examinerName?: string;
};

export const useCreateChatterSession = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateSessionInput): Promise<ChatterSession> => {
      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr) throw userErr;
      if (!userData.user) throw new Error("No autenticado");

      const id = genSessionId();
      const row = {
        id,
        examiner_user_id: userData.user.id,
        examiner_name: input.examinerName ?? null,
        profile_id: input.profileId,
        chatter_name: input.chatterName,
        status: "waiting" as const,
        duration_minutes: input.durationMinutes ?? 60,
      };
      const { data, error } = await sb
        .from("chatter_sessions")
        .insert(row)
        .select("*")
        .single();
      if (error) throw error;
      return data as ChatterSession;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chatter-sessions"] }),
  });
};

export const useRenameChatterSession = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, chatterName }: { id: string; chatterName: string }): Promise<void> => {
      const trimmed = chatterName.trim();
      if (!trimmed) throw new Error("El nombre no puede estar vacío");
      const { error } = await sb
        .from("chatter_sessions")
        .update({ chatter_name: trimmed })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chatter-sessions"] }),
  });
};

export const useExtendChatterSession = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, addMinutes }: { id: string; addMinutes: number }): Promise<void> => {
      if (!Number.isFinite(addMinutes) || addMinutes <= 0) {
        throw new Error("Minutos inválidos");
      }
      // Read current duration first — Postgres can't do `field = field + n`
      // through PostgREST without a stored function, and we already have a
      // session row in cache, but a fresh read keeps this safe under races.
      const { data: row, error: readErr } = await sb
        .from("chatter_sessions")
        .select("duration_minutes")
        .eq("id", id)
        .single();
      if (readErr) throw readErr;
      const next = (row?.duration_minutes ?? 0) + Math.floor(addMinutes);
      const { error } = await sb
        .from("chatter_sessions")
        .update({ duration_minutes: next })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chatter-sessions"] }),
  });
};

export const useEndChatterSession = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await sb
        .from("chatter_sessions")
        .update({ status: "ended", ended_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chatter-sessions"] }),
  });
};

// ---- Messages (used by chat panel; realtime wiring is Phase 4) ----------

export const useChatterMessages = (sessionId: string | null | undefined) =>
  useQuery({
    queryKey: ["chatter-messages", sessionId],
    enabled: !!sessionId,
    queryFn: async (): Promise<ChatterMessage[]> => {
      const { data, error } = await sb
        .from("chatter_messages")
        .select("*")
        .eq("session_id", sessionId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ChatterMessage[];
    },
  });

export type SendMessageInput = {
  sessionId: string;
  role: "fan" | "chatter" | "system";
  msgType?: "message" | "tip" | "purchase" | "notice";
  content?: string | null;
  price?: number | null;
  images?: string[];
  fromExaminer?: boolean;
};

export const useSendChatterMessage = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SendMessageInput): Promise<ChatterMessage> => {
      const row = {
        session_id: input.sessionId,
        role: input.role,
        msg_type: input.msgType ?? "message",
        content: input.content ?? null,
        price: input.price ?? null,
        images: input.images ?? [],
        from_examiner: input.fromExaminer ?? false,
      };
      const { data, error } = await sb
        .from("chatter_messages")
        .insert(row)
        .select("*")
        .single();
      if (error) throw error;
      return data as ChatterMessage;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["chatter-messages", vars.sessionId] });
    },
  });
};

// ---- Evaluations ---------------------------------------------------------

export type SubmitEvaluationInput = {
  sessionId: string;
  examinerName: string;
  verdict: EvaluationVerdict;
  feedback: string;
  criteriaResults: CriterionResult[];
  scorePct: number;
};

export const useSubmitEvaluation = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SubmitEvaluationInput): Promise<{
      evaluation: ChatterEvaluation;
      webhookOk: boolean;
      webhookError?: string;
    }> => {
      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr) throw userErr;
      if (!userData.user) throw new Error("No autenticado");

      // 1) Insert evaluation row
      const row = {
        session_id: input.sessionId,
        examiner_user_id: userData.user.id,
        examiner_name: input.examinerName,
        verdict: input.verdict,
        feedback: input.feedback || null,
        criteria_results: input.criteriaResults,
        score_pct: input.scorePct,
        sent_to_apps_script: false,
      };
      const { data: evalData, error: evalErr } = await sb
        .from("chatter_evaluations")
        .insert(row)
        .select("*")
        .single();
      if (evalErr) throw evalErr;
      const evaluation = evalData as ChatterEvaluation;

      // 2) Mark session as ended
      await sb
        .from("chatter_sessions")
        .update({ status: "ended", ended_at: new Date().toISOString() })
        .eq("id", input.sessionId);

      // 3) Best-effort POST to the Apps Script webhook (Maven-branded
      //    script — see scripts/apps-script/maven-chatter-evaluator.gs in
      //    the repo for the deployable code). text/plain skips the CORS
      //    preflight; Apps Script reads the body via e.postData.contents.
      let webhookOk = false;
      let webhookError: string | undefined;
      try {
        const [{ data: cfg }, { data: ses }, { data: msgs }] = await Promise.all([
          sb.from("chatter_config").select("*").eq("id", 1).maybeSingle(),
          sb.from("chatter_sessions").select("*").eq("id", input.sessionId).maybeSingle(),
          sb
            .from("chatter_messages")
            .select("*")
            .eq("session_id", input.sessionId)
            .order("created_at", { ascending: true }),
        ]);
        const session = ses as ChatterSession | null;
        const config = cfg as ChatterConfig | null;
        const messages = (msgs ?? []) as ChatterMessage[];
        if (!session) throw new Error("session disappeared mid-submit");

        if (!config?.apps_script_url) {
          webhookError = "apps_script_url is not configured (Admin → Config)";
        } else {
          const { data: prof } = await sb
            .from("chatter_profiles")
            .select("*")
            .eq("id", session.profile_id)
            .maybeSingle();
          const profile = (prof as ChatterProfile | null) ?? null;

          const payload = {
            // Identifiers
            evaluationId: evaluation.id,
            sessionId: session.id,
            createdAt: evaluation.created_at,
            // Subjects
            chatterName: session.chatter_name,
            modelName: profile?.name ?? session.profile_id,
            examinerName: evaluation.examiner_name ?? "(unnamed)",
            // Result
            verdict: evaluation.verdict,                       // "apto" | "no_apto"
            verdictLabel: evaluation.verdict === "apto" ? "APTO" : "NO APTO",
            scorePct: evaluation.score_pct ?? 0,
            badge:
              (evaluation.score_pct ?? 0) >= 80 ? "APROBADO" :
              (evaluation.score_pct ?? 0) >= 50 ? "A CRITERIO" : "NO APTO",
            criteria: evaluation.criteria_results.map((c) => ({
              label: c.label,
              status: c.status,                                // "pass" | "partial" | "fail"
              statusLabel:
                c.status === "pass" ? "Cumple" :
                c.status === "partial" ? "Parcial" : "No cumple",
            })),
            feedback: evaluation.feedback ?? "",
            // Chat history (for Drive doc creation)
            chatHistory: messages.map((m) => ({
              role: m.role,
              type: m.msg_type,
              content: m.content,
              price: m.price,
              timestamp: m.created_at,
              from:
                m.role === "fan" ? (config?.fan_name ?? "JavixBuster") :
                m.role === "chatter" ? session.chatter_name : "system",
            })),
            // Distribution
            emails: config?.notification_emails ?? [],
          };

          const res = await fetch(config.apps_script_url, {
            method: "POST",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify(payload),
            redirect: "follow",
          });
          if (!res.ok) {
            webhookError = `webhook HTTP ${res.status}`;
          } else {
            webhookOk = true;
            await sb
              .from("chatter_evaluations")
              .update({
                sent_to_apps_script: true,
                sent_at: new Date().toISOString(),
              })
              .eq("id", evaluation.id);
          }
        }
      } catch (e) {
        webhookError = (e as Error).message;
      }

      return { evaluation, webhookOk, webhookError };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["chatter-sessions"] });
      qc.invalidateQueries({ queryKey: ["chatter-evaluations"] });
    },
  });
};

