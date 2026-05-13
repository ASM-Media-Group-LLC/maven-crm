import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { buildEmailHtml, buildEmailSubject } from "@/pages/chatter-evaluator/emailTemplate";
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
    // Vault items rara vez cambian — cachear agresivo así no re-fetchea
    // cada vez que abrís el vault. Las invalidations de upload/delete
    // sobreescriben esto cuando hace falta.
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
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

// Insert a new chatter profile. The `key` is the human-readable slug
// admins type into the "Clave interna" field — must be unique across
// the table. Mirrors adminAddNewModel from the original
// Roleplaychatters (index.html line 5090) but inserts into Postgres
// instead of Firebase.
export type ChatterProfileCreate = {
  key: string;
} & Partial<Omit<ChatterProfile, "id" | "created_at" | "updated_at">>;

export const useCreateChatterProfile = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ChatterProfileCreate): Promise<ChatterProfile> => {
      const cleanKey = input.key.trim().toLowerCase().replace(/\s+/g, "");
      if (!cleanKey) throw new Error("La clave interna es obligatoria");
      // Check uniqueness up-front — gives a friendlier error than the
      // raw Postgres "duplicate key violates unique constraint".
      const { data: existing } = await sb
        .from("chatter_profiles")
        .select("id")
        .eq("key", cleanKey)
        .maybeSingle();
      if (existing) throw new Error("Ya existe un perfil con esa clave");

      const row = {
        ...input,
        key: cleanKey,
        name: input.name?.trim() || cleanKey,
        prices: input.prices ?? {},
        extra_fields: input.extra_fields ?? {},
      };
      const { data, error } = await sb
        .from("chatter_profiles")
        .insert(row)
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

export const useDeleteChatterProfile = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await sb.from("chatter_profiles").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["chatter-profiles"] });
    },
  });
};

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

// Add a vault item by uploading a file from the user's device. The
// file gets pushed to our Supabase Storage (chatter-vault bucket); we
// only ever store URLs we control so deleting a model truly drops the
// content.
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

// Lightweight directory of Maven users (profiles + their role) for the
// "Maven Notifications" multi-select in Admin. Only fields we actually
// render in the picker; emails would require an admin edge function so
// we skip them here.
export interface MavenUserOption {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  role: "admin" | "manager" | "employee" | null;
}

export const useMavenUsers = () =>
  useQuery({
    queryKey: ["maven-users-for-chatter-notify"],
    queryFn: async (): Promise<MavenUserOption[]> => {
      const { data: profiles, error: pErr } = await sb
        .from("profiles")
        .select("id, full_name, avatar_url")
        .order("full_name", { ascending: true });
      if (pErr) throw pErr;
      const { data: roles, error: rErr } = await sb
        .from("user_roles")
        .select("user_id, role");
      if (rErr) throw rErr;
      const roleByUser = new Map<string, MavenUserOption["role"]>();
      for (const r of (roles ?? []) as { user_id: string; role: MavenUserOption["role"] }[]) {
        roleByUser.set(r.user_id, r.role);
      }
      return ((profiles ?? []) as { id: string; full_name: string | null; avatar_url: string | null }[]).map(
        (p) => ({
          ...p,
          role: roleByUser.get(p.id) ?? null,
        }),
      );
    },
  });

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

// Stats agregadas para los cajones + charts de la home (personas
// evaluadas, aprobados, reprobados, promedio, serie temporal últimos
// 30 días, distribución por perfil). Lee directamente de
// chatter_evaluations — el verdict ya viene normalizado a "apto" /
// "no_apto" desde el submit, así que no hay re-cálculo.
//
// Devolvemos counters separados por rango (week / month / total) para
// que los stat cards de la home puedan mostrar cualquiera de los tres
// con un toggle, sin dispararle al hook tres veces.
export interface RangeCounters {
  total: number;
  approved: number;
  rejected: number;
  /** Tasa de éxito = aprobados / total, en porcentaje entero.
   *  Ej: 1 evaluación aprobada de 1 total → 100. 0 aprobados de 1 → 0.
   *  Es la métrica que la home muestra como "Promedio de éxito" — antes
   *  era avg de score_pct, lo cual confundía: una sola evaluación
   *  reprobada con 30% de score mostraba "30%" en vez de "0% éxito". */
  successRatePct: number;
}

export type StatsRange = "week" | "month" | "all";

export interface ChatterEvaluationStats extends RangeCounters {
  /** Counters por rango — el componente elige cuál renderizar según
   *  el toggle activo. `all` siempre coincide con los counters
   *  top-level (que se mantienen para retrocompatibilidad). */
  byRange: Record<StatsRange, RangeCounters>;
  /** Serie diaria últimos 30 días, label DD/MM, listo para Recharts. */
  daily: Array<{ date: string; apto: number; noApto: number }>;
  /** Serie mensual últimos 12 meses, label "MMM YY" (ej: "ene 26").
   *  El bucket es por mes calendario local. */
  monthly: Array<{ month: string; apto: number; noApto: number }>;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const fmtDayLabel = (d: Date): string =>
  `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;

// Key estable para bucketear por mes calendario local: "YYYY-MM".
const monthKeyOf = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
// Label legible para el chart: "ene 26", "feb 26"... el año va en YY
// para no comer ancho cuando hay 12 buckets pegados.
const monthLabelOf = (d: Date): string => {
  const month = d.toLocaleString("es-ES", { month: "short" }).replace(".", "");
  return `${month} ${String(d.getFullYear()).slice(-2)}`;
};

// "Esta semana" = lunes 00:00 local hasta ahora. La elección del lunes
// como inicio de semana es la convención local (es_AR/es_CO etc); si
// algún día se internacionaliza, mover esto a Intl.Locale.weekInfo.
const startOfWeek = (now: Date): Date => {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  const dow = d.getDay(); // 0=dom, 1=lun ... 6=sáb
  const diff = dow === 0 ? -6 : 1 - dow;
  d.setDate(d.getDate() + diff);
  return d;
};

// "Este mes" = día 1 del mes en curso a las 00:00 local.
const startOfMonth = (now: Date): Date => {
  const d = new Date(now.getFullYear(), now.getMonth(), 1);
  return d;
};

export const useChatterEvaluationStats = () =>
  useQuery({
    queryKey: ["chatter-evaluation-stats"],
    queryFn: async (): Promise<ChatterEvaluationStats> => {
      // Join inverso: cada evaluación trae su sesión y, vía la sesión,
      // Solo necesitamos verdict + fecha — los charts agregan por
      // tiempo, no por perfil. score_pct se podría sacar también pero
      // lo dejamos por si vuelve a usarse en otra métrica más adelante.
      const { data, error } = await sb
        .from("chatter_evaluations")
        .select("verdict, score_pct, created_at");
      if (error) throw error;
      type Row = {
        verdict: "apto" | "no_apto";
        score_pct: number | null;
        created_at: string;
      };
      const rows = (data ?? []) as Row[];

      // Buckets para los 3 rangos. Por cada eval acumulamos en los que
      // correspondan — una eval puede estar simultáneamente en week,
      // month y all (semana en curso ⊆ mes en curso ⊆ todo).
      const now = new Date();
      const weekStart = startOfWeek(now).getTime();
      const monthStart = startOfMonth(now).getTime();

      type Acc = { approved: number; rejected: number; total: number };
      const blank = (): Acc => ({ approved: 0, rejected: 0, total: 0 });
      const accs: Record<StatsRange, Acc> = {
        week: blank(),
        month: blank(),
        all: blank(),
      };
      const tally = (acc: Acc, r: Row) => {
        acc.total++;
        if (r.verdict === "apto") acc.approved++;
        else if (r.verdict === "no_apto") acc.rejected++;
      };

      // 30 buckets diarios — incluye hoy. Los inicializamos primero
      // para que días sin evaluaciones aparezcan con 0 (evita huecos
      // raros en el bar chart).
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const dailyMap = new Map<string, { apto: number; noApto: number }>();
      const dailyOrder: string[] = [];
      for (let i = 29; i >= 0; i--) {
        const d = new Date(today.getTime() - i * DAY_MS);
        const key = fmtDayLabel(d);
        dailyMap.set(key, { apto: 0, noApto: 0 });
        dailyOrder.push(key);
      }

      // 12 buckets mensuales — incluye el mes actual. Pre-poblados con
      // 0 para que meses sin evaluaciones aparezcan vacíos en el chart
      // en lugar de saltearse y comprimir el eje X.
      const monthlyMap = new Map<string, { label: string; apto: number; noApto: number }>();
      const monthlyOrder: string[] = [];
      for (let i = 11; i >= 0; i--) {
        const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
        const key = monthKeyOf(d);
        monthlyMap.set(key, { label: monthLabelOf(d), apto: 0, noApto: 0 });
        monthlyOrder.push(key);
      }
      const monthlyCutoff = new Date(
        today.getFullYear(),
        today.getMonth() - 11,
        1,
      ).getTime();

      const cutoff = today.getTime() - 30 * DAY_MS;

      for (const r of rows) {
        const ts = new Date(r.created_at).getTime();
        const dt = new Date(ts);
        tally(accs.all, r);
        if (ts >= monthStart) tally(accs.month, r);
        if (ts >= weekStart) tally(accs.week, r);

        // Daily — solo dentro de la ventana de 30 días.
        if (ts >= cutoff) {
          const key = fmtDayLabel(dt);
          const slot = dailyMap.get(key);
          if (slot) {
            if (r.verdict === "apto") slot.apto++;
            else slot.noApto++;
          }
        }

        // Monthly — solo dentro de los 12 meses pre-poblados.
        if (ts >= monthlyCutoff) {
          const slot = monthlyMap.get(monthKeyOf(dt));
          if (slot) {
            if (r.verdict === "apto") slot.apto++;
            else slot.noApto++;
          }
        }
      }

      const daily = dailyOrder.map((date) => ({
        date,
        apto: dailyMap.get(date)!.apto,
        noApto: dailyMap.get(date)!.noApto,
      }));

      const monthly = monthlyOrder.map((key) => {
        const m = monthlyMap.get(key)!;
        return { month: m.label, apto: m.apto, noApto: m.noApto };
      });

      const finalize = (a: Acc): RangeCounters => ({
        total: a.total,
        approved: a.approved,
        rejected: a.rejected,
        successRatePct:
          a.total > 0 ? Math.round((a.approved / a.total) * 100) : 0,
      });
      const byRange: Record<StatsRange, RangeCounters> = {
        week: finalize(accs.week),
        month: finalize(accs.month),
        all: finalize(accs.all),
      };

      return {
        ...byRange.all,
        byRange,
        daily,
        monthly,
      };
    },
  });

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
  // Si se omite, la sesión se asigna al user actual (comportamiento legacy).
  // Si se pasa, la sesión se asigna a ese user — debe tener permiso
  // Chatters → Evaluator (validado en el RLS del INSERT).
  examinerUserId?: string;
};

export const useCreateChatterSession = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateSessionInput): Promise<ChatterSession> => {
      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr) throw userErr;
      if (!userData.user) throw new Error("No autenticado");

      const id = genSessionId();
      const examinerUserId = input.examinerUserId ?? userData.user.id;
      const examinerName = input.examinerName ?? null;
      const durationMinutes = input.durationMinutes ?? 60;
      const row = {
        id,
        examiner_user_id: examinerUserId,
        examiner_name: examinerName,
        profile_id: input.profileId,
        chatter_name: input.chatterName,
        status: "waiting" as const,
        duration_minutes: durationMinutes,
        // Audit: quién originó la sesión (puede diferir del examiner cuando
        // se asignó a otro evaluator). Distinto de examiner_user_id solo en
        // ese caso.
        created_by: userData.user.id,
      };
      // Importante: NO usamos `.select("*").single()` aquí porque el RLS
      // de SELECT solo deja al examiner asignado leer la sesión. Cuando
      // el creador la asigna a OTRO user, el SELECT post-INSERT devuelve
      // 0 filas y rompe el flujo. Armamos el ChatterSession localmente
      // con los defaults (created_at se llena server-side pero el
      // SuccessView solo usa id/chatter_name/duration_minutes).
      const { error } = await sb.from("chatter_sessions").insert(row);
      if (error) throw error;
      const session: ChatterSession = {
        id,
        examiner_user_id: examinerUserId,
        examiner_name: examinerName,
        profile_id: input.profileId,
        chatter_name: input.chatterName,
        status: "waiting",
        duration_minutes: durationMinutes,
        started_at: null,
        ended_at: null,
        expires_at: null,
        active_device_id: null,
        active_device_claimed_at: null,
        typing_chatter: false,
        typing_fan: false,
        typing_chatter_at: null,
        typing_fan_at: null,
        read_by_chatter_at: null,
        read_by_examiner_at: null,
        created_at: new Date().toISOString(),
      };
      return session;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chatter-sessions"] }),
  });
};

// Lista de users que tienen permiso "Chatters → Evaluator", para poblar el
// selector de "Asignar a" del NewSessionDialog. Devuelve user_id + nombre
// + avatar (resuelto vía profiles). El RLS de INSERT también lo valida
// del lado server, así que esto es solo para UX.
export interface ChatterEvaluatorOption {
  user_id: string;
  full_name: string;
  avatar_url: string | null;
}

export const useChatterEvaluators = () =>
  useQuery({
    queryKey: ["chatter-evaluators"],
    queryFn: async (): Promise<ChatterEvaluatorOption[]> => {
      // Usa la RPC list_chatter_evaluators (SECURITY DEFINER) en vez de
      // queries directos. Razón: el RLS de user_roles bloquea a
      // non-admins de ver filas distintas a las suyas; sin la RPC, un
      // Chatter Supervisor (non-admin) solo se veía a sí mismo en el
      // select. La función server-side bypasea RLS y aplica la lógica
      // de permisos en su query interno.
      const { data, error } = await supabase.rpc(
        "list_chatter_evaluators" as never,
      );
      if (error) throw error;
      return ((data ?? []) as Array<{
        user_id: string;
        full_name: string | null;
        avatar_url: string | null;
      }>).map((row) => ({
        user_id: row.user_id,
        full_name: row.full_name || "Sin nombre",
        avatar_url: row.avatar_url ?? null,
      }));
    },
    staleTime: 5 * 60_000,
  });

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

// Auto-end client-side: cuando el cliente detecta que la sesión expiró
// (now >= started_at + duration_minutes), hace UPDATE status='ended'
// inmediato. Es la 3ra capa de defensa — el pg_cron y el edge function
// también lo hacen, pero esto da feedback instantáneo en la UI sin
// esperar al próximo tick del cron (lag hasta 60s).
//
// Idempotente: el UPDATE solo afecta filas con status='active'. Si otro
// cliente (o el cron) ya la marcó ended, este UPDATE no hace nada.
export const useAutoEndExpiredChatterSession = (
  session: ChatterSession | null | undefined,
) => {
  useEffect(() => {
    if (!session) return;
    if (session.status !== "active") return;
    if (!session.started_at) return;

    const startedMs = new Date(session.started_at).getTime();
    const expiresMs = startedMs + (session.duration_minutes || 0) * 60_000;
    const remainingMs = expiresMs - Date.now();

    // Si ya expiró, dispara update inmediato.
    if (remainingMs <= 0) {
      void sb
        .from("chatter_sessions")
        .update({ status: "ended", ended_at: new Date().toISOString() })
        .eq("id", session.id)
        .eq("status", "active");
      return;
    }

    // Programa el update para el momento exacto de expiración. Si el user
    // recarga o cambia de sesión antes, el cleanup cancela el timer.
    const timer = setTimeout(() => {
      void sb
        .from("chatter_sessions")
        .update({ status: "ended", ended_at: new Date().toISOString() })
        .eq("id", session.id)
        .eq("status", "active");
    }, remainingMs);
    return () => clearTimeout(timer);
  }, [session?.id, session?.status, session?.started_at, session?.duration_minutes]);
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

// Mark a priced chatter message as purchased AND drop a system 'purchase'
// notification into the same session. Mirrors window.doPurchase in the
// original (index.html line 3579): flip the flag, then post a notice so
// the chatter (and the examiner's own log) sees the confirmation.
export const usePurchaseChatterMessage = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      sessionId,
      messageId,
      price,
      examinerName,
    }: {
      sessionId: string;
      messageId: string;
      price: number;
      examinerName?: string;
    }): Promise<void> => {
      const { error: updErr } = await sb
        .from("chatter_messages")
        .update({ purchased: true })
        .eq("id", messageId);
      if (updErr) throw updErr;
      const fanName = examinerName || "JavixBuster";
      const { error: insErr } = await sb.from("chatter_messages").insert({
        session_id: sessionId,
        role: "system",
        msg_type: "purchase",
        content: `${fanName} compró tu contenido`,
        price,
        from_examiner: true,
      });
      if (insErr) throw insErr;
    },
    onSuccess: (_, vars) =>
      qc.invalidateQueries({ queryKey: ["chatter-messages", vars.sessionId] }),
  });
};

// Examiner-side message delete. Mirrors the original deleteMessage with
// deletedBy='fan' (index.html line 3690): a hard delete that removes the
// bubble from BOTH views. The chatter side does its own soft delete via
// the public edge function (action='delete-message').
export const useDeleteExaminerMessage = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ sessionId, messageId }: { sessionId: string; messageId: string }): Promise<void> => {
      const { error } = await sb
        .from("chatter_messages")
        .update({ deleted: "full" })
        .eq("id", messageId);
      if (error) throw error;
    },
    onSuccess: (_, vars) =>
      qc.invalidateQueries({ queryKey: ["chatter-messages", vars.sessionId] }),
  });
};

/** Examiner-side message edit. Pushes the OLD content + edited_at into
 *  content_history (newest-first), then writes the new content and
 *  bumps edited_at. The chatter sees a small "(editado)" tag below
 *  the bubble; the examiner can additionally open a history dialog. */
export const useEditExaminerMessage = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      sessionId,
      messageId,
      newContent,
    }: {
      sessionId: string;
      messageId: string;
      newContent: string;
    }): Promise<void> => {
      const { data: row, error: readErr } = await sb
        .from("chatter_messages")
        .select("content, edited_at, content_history")
        .eq("id", messageId)
        .maybeSingle();
      if (readErr) throw readErr;
      const current = row as
        | {
            content: string | null;
            edited_at: string | null;
            content_history: Array<{ content: string | null; edited_at: string | null }> | null;
          }
        | null;
      if (!current) throw new Error("mensaje no encontrado");
      const history = Array.isArray(current.content_history)
        ? current.content_history
        : [];
      const nextHistory = [
        { content: current.content, edited_at: current.edited_at },
        ...history,
      ];
      const { error: updErr } = await sb
        .from("chatter_messages")
        .update({
          content: newContent,
          edited_at: new Date().toISOString(),
          content_history: nextHistory,
        })
        .eq("id", messageId);
      if (updErr) throw updErr;
    },
    onSuccess: (_, vars) =>
      qc.invalidateQueries({ queryKey: ["chatter-messages", vars.sessionId] }),
  });
};

export const useDeleteChatterSession = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      // ON DELETE CASCADE on chatter_messages / chatter_evaluations means
      // a single delete on chatter_sessions wipes the whole session.
      const { error } = await sb
        .from("chatter_sessions")
        .delete()
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

// Última evaluación de una sesión cerrada — la pesca el detail page del
// History. Devuelve null si la sesión no tiene evaluación todavía.
export const useChatterSessionEvaluation = (
  sessionId: string | null | undefined,
) =>
  useQuery({
    queryKey: ["chatter-session-evaluation", sessionId],
    enabled: !!sessionId,
    queryFn: async (): Promise<ChatterEvaluation | null> => {
      const { data, error } = await sb
        .from("chatter_evaluations")
        .select("*")
        .eq("session_id", sessionId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as ChatterEvaluation | null;
    },
  });

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

/** Toggle de reacción con emoji sobre un mensaje. Si el usuario actual
 *  ya dejó esa reacción → la quita. Si no la había dejado → la agrega.
 *  Las reacciones viven en la columna jsonb chatter_messages.reactions
 *  (array de MessageReaction). El realtime sub a chatter_messages que
 *  ya está montado refresca la UI cuando otra persona reacciona.
 *
 *  La columna requiere la migración 20260506000000_chatter_message_reactions
 *  — si todavía no se aplicó, el UPDATE falla silenciosamente y la UI
 *  muestra un toast con el error. */
export const useToggleMessageReaction = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      messageId: string;
      sessionId: string;
      emoji: string;
      userId: string;
      userName: string;
    }): Promise<void> => {
      // Leemos la fila para tener el array actual y razonar en el client.
      // (Una alternativa con menos roundtrips sería un RPC en Postgres,
      // pero queremos mantener el cambio sin migración de funciones.)
      const { data: row, error: readErr } = await sb
        .from("chatter_messages")
        .select("reactions")
        .eq("id", input.messageId)
        .maybeSingle();
      if (readErr) throw readErr;
      const current: Array<{
        user_id: string;
        user_name: string;
        emoji: string;
        created_at: string;
      }> = Array.isArray((row as { reactions?: unknown } | null)?.reactions)
        ? ((row as { reactions: unknown }).reactions as Array<{
            user_id: string;
            user_name: string;
            emoji: string;
            created_at: string;
          }>)
        : [];

      const idx = current.findIndex(
        (r) => r.user_id === input.userId && r.emoji === input.emoji,
      );
      let next: typeof current;
      if (idx >= 0) {
        // Toggle off
        next = current.filter((_, i) => i !== idx);
      } else {
        next = [
          ...current,
          {
            user_id: input.userId,
            user_name: input.userName,
            emoji: input.emoji,
            created_at: new Date().toISOString(),
          },
        ];
      }
      const { error: updErr } = await sb
        .from("chatter_messages")
        .update({ reactions: next })
        .eq("id", input.messageId);
      if (updErr) throw updErr;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["chatter-messages", vars.sessionId] });
    },
  });
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

// Email del reporte vía Resend (sender = Maven CRM <noreply@mail.maven-ai.me>).
// Antes lo mandaba un Apps Script que también generaba Drive doc + Sheet,
// pero migramos a Resend para que el remitente sea de Maven y no la cuenta
// personal del owner del GAS. La columna `apps_script_url` ya no se usa.
// Fire-and-forget: la mutación principal resuelve apenas guardamos en DB,
// el correo viaja en background y se anuncia con un toast cuando termina.
const fireWebhookInBackground = async (
  evaluation: ChatterEvaluation,
  sessionId: string,
): Promise<void> => {
  try {
    const [{ data: cfg }, { data: ses }, { data: msgs }] = await Promise.all([
      sb.from("chatter_config").select("*").eq("id", 1).maybeSingle(),
      sb.from("chatter_sessions").select("*").eq("id", sessionId).maybeSingle(),
      sb
        .from("chatter_messages")
        .select("*")
        .eq("session_id", sessionId)
        .order("created_at", { ascending: true }),
    ]);
    const session = ses as ChatterSession | null;
    const config = cfg as ChatterConfig | null;
    const messages = (msgs ?? []) as ChatterMessage[];
    if (!session) throw new Error("session disappeared mid-submit");

    const { data: prof } = await sb
      .from("chatter_profiles")
      .select("*")
      .eq("id", session.profile_id)
      .maybeSingle();
    const profile = (prof as ChatterProfile | null) ?? null;

    const corePayload = {
      evaluationId: evaluation.id,
      sessionId: session.id,
      createdAt: evaluation.created_at,
      chatterName: session.chatter_name,
      modelName: profile?.name ?? session.profile_id,
      examinerName: evaluation.examiner_name ?? "(unnamed)",
      appUrl: typeof window !== "undefined" ? window.location.origin : "",
      verdict: evaluation.verdict as "apto" | "no_apto",
      verdictLabel: evaluation.verdict === "apto" ? "APTO" : "NO APTO",
      scorePct: evaluation.score_pct ?? 0,
      badge:
        (evaluation.score_pct ?? 0) >= 80 ? "APROBADO" :
        (evaluation.score_pct ?? 0) >= 50 ? "A CRITERIO" : "NO APTO",
      criteria: evaluation.criteria_results.map((c) => ({
        label: c.label,
        status: c.status,
        statusLabel:
          c.status === "pass" ? "Cumple" :
          c.status === "partial" ? "Parcial" : "No cumple",
      })),
      feedback: evaluation.feedback ?? "",
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
    };

    // El HTML + subject del correo se arman client-side: cualquier ajuste
    // visual viaja con el deploy normal de Maven, sin tocar nada server-side.
    const recipients = config?.notification_emails ?? [];
    if (recipients.length === 0) {
      toast.warning("Reporte sin destinatarios", {
        description: "Configurá emails en Admin → Notificaciones.",
      });
      return;
    }
    const emailSubject = buildEmailSubject(corePayload);
    const emailHtml = buildEmailHtml(corePayload);

    const { error: mailError } = await supabase.functions.invoke(
      "send-notification-email",
      {
        body: { to: recipients, subject: emailSubject, html: emailHtml, tag: "chatter" },
      },
    );
    if (mailError) {
      toast.warning("Email no enviado", {
        description:
          (mailError as Error).message ??
          "Falló send-notification-email — la evaluación quedó guardada.",
      });
      return;
    }
    await sb
      .from("chatter_evaluations")
      .update({
        sent_to_apps_script: true,
        sent_at: new Date().toISOString(),
      })
      .eq("id", evaluation.id);
    toast.success("Reporte enviado", {
      description: `Email a ${recipients.length} destinatario(s) vía Maven.`,
    });
  } catch (e) {
    toast.warning("Reporte: webhook falló", {
      description: (e as Error).message,
    });
  }
};

export const useSubmitEvaluation = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SubmitEvaluationInput): Promise<{
      evaluation: ChatterEvaluation;
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

      // 3) Internal Maven notifications. Best-effort: if the insert
      //    fails we don't want to block the submit — RLS lets any
      //    authenticated user create notifications, so this should
      //    rarely error.
      try {
        const { data: cfgRow } = await sb
          .from("chatter_config")
          .select("notify_user_ids")
          .eq("id", 1)
          .maybeSingle();
        const userIds = (cfgRow?.notify_user_ids ?? []) as string[];
        if (userIds.length > 0) {
          const verdictLabel = input.verdict === "apto" ? "APTO" : "NO APTO";
          const rows = userIds.map((uid) => ({
            user_id: uid,
            type: "chatter_evaluation",
            title: `Evaluación: ${verdictLabel} — ${input.examinerName} (${input.scorePct}%)`,
            message: input.feedback?.slice(0, 200) || `Sesión ${input.sessionId} cerrada.`,
            reference_id: evaluation.id,
            reference_type: "chatter_evaluation",
            module_origin: "chatter-evaluator",
            priority: input.verdict === "no_apto" ? "high" : "medium",
            deep_link_url: `/chatter-evaluator/workspace?session=${input.sessionId}`,
            required_permission_module: "ChatterEvaluator",
          }));
          await sb.from("notifications").insert(rows);
        }
      } catch {
        /* swallow — toast handles webhook outcome separately */
      }

      // 4) Fire the email in the background. The mutation resolves NOW
      //    so the dialog can close and the examiner moves on; the toast
      //    inside fireWebhookInBackground announces the result whenever
      //    Resend returns (typically 1-3s later).
      void fireWebhookInBackground(evaluation, input.sessionId);

      return { evaluation };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["chatter-sessions"] });
      qc.invalidateQueries({ queryKey: ["chatter-evaluations"] });
    },
  });
};

/** Re-disparar el correo de una sesión ya cerrada — usado por el botón
 *  "Reenviar email" en el History. Levanta la última evaluación de la
 *  sesión y vuelve a llamar a `fireWebhookInBackground`, que respeta
 *  los `notification_emails` configurados (si la lista está vacía,
 *  igual no manda nada). */
export const useResendChatterEmail = () =>
  useMutation({
    mutationFn: async (sessionId: string): Promise<void> => {
      const { data, error } = await sb
        .from("chatter_evaluations")
        .select("*")
        .eq("session_id", sessionId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("No hay evaluación para esta sesión");
      await fireWebhookInBackground(data as ChatterEvaluation, sessionId);
    },
  });

