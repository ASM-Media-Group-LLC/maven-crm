import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getPublicBaseUrl } from "@/lib/getPublicUrl";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getTranslation, idioma, traducir, type Language, type TranslationKey } from "@/lib/i18n";
import { companyLabel, periodLabel, type CompanyCode } from "./useChatterScorecards";
import { buildChatterQaEmailSubject, buildChatterQaEmailHtml, type ChatterQaEmailPayload } from "./chatterQaEmailTemplate";

// QA cualitativo de chatters (QA-B): reporte estructurado que reemplaza el correo del supervisor.
// Tabla chatter_qa_reports. Tabla nueva → (supabase as any), igual que el resto de hooks BLU.

// `value` es lo que se guarda en chatter_qa_reports.veredicto (no se traduce); la
// etiqueta sale del diccionario. El correo del QA la pide en español ("es").
export const VEREDICTOS = [
  { value: "excelente", labelKey: "agencyQa.verdict.excellent", tone: "good" },
  { value: "bueno", labelKey: "agencyQa.verdict.good", tone: "good" },
  { value: "requiere_mejora", labelKey: "agencyQa.verdict.needsWork", tone: "warn" },
  { value: "critico", labelKey: "agencyQa.verdict.critical", tone: "bad" },
] as const satisfies ReadonlyArray<{ value: string; labelKey: TranslationKey; tone: string }>;
export type Veredicto = (typeof VEREDICTOS)[number]["value"];
export const veredictoLabel = (v?: string | null, lang: Language = idioma()) => {
  const hit = VEREDICTOS.find((x) => x.value === v);
  return hit ? getTranslation(hit.labelKey, lang) : "—";
};
export const veredictoTone = (v?: string | null) => VEREDICTOS.find((x) => x.value === v)?.tone ?? "warn";

export interface EvaluatedModel { model_id: number; model_name: string }
export interface MejoraItem { categoria: string; detalle: string }
export interface ModelObs { model_id?: number; model_name?: string; observaciones?: string[]; ejemplos?: { quote: string; por_que: string; fan?: string }[] }
export interface VentaMasivaItem { copy?: string; metricas?: string; por_que?: string }
export interface VentaMasivaStats { count: number; sent: number; viewed: number; purchased: number; earnings: number }
export interface VentaMasiva { resumen?: string; mejores?: VentaMasivaItem[]; peores?: VentaMasivaItem[]; patrones?: string[]; recomendaciones?: string[]; stats?: VentaMasivaStats }
export interface QaReportBody {
  intro?: string;
  resumen?: string;
  aspectos_positivos?: string[];
  aspectos_mejora?: MejoraItem[];
  observaciones_por_modelo?: ModelObs[];
  venta_masiva?: VentaMasiva;
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
  email_sent_at: string | null;
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
    // Mientras haya algún reporte 'processing' (borrador IA en curso), refrescamos solos cada 4s
    // → la UI pasa de "Analizando…" a listo/falló sin que el usuario recargue ni dependa del request.
    refetchInterval: (query) => ((query.state.data as ChatterQaReport[] | undefined)?.some((r) => r.status === "processing") ? 4000 : false),
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
    // Poll mientras este reporte esté 'processing' → la pantalla "Analizando…" se actualiza sola al terminar.
    refetchInterval: (query) => ((query.state.data as ChatterQaReport | null | undefined)?.status === "processing" ? 4000 : false),
  });

// ── Roster de chatters de BLU → para elegir a quién se evalúa.
// FUENTE DE VERDAD = el ROL "Chatter" de BLU (agency:roles:list + agency:employees:list vía blu-mp),
// NO el is_chatter de employee-reports (ese marcaba también a los "Supervisor Chatters" como John
// Idrobo). blu_employee_id (= employee.id = sentByManager.id en los mensajes) ata sus conversaciones;
// assignedCreators = los modelos a los que está asignado (para autosugerir al crear el QA).
export interface BluChatter { blu_employee_id: number; name: string; group_name: string | null; email?: string | null; assignedCreators: number[] }

async function bluMp(action: string): Promise<any> {
  const { data, error } = await supabase.functions.invoke("blu-mp", { body: { action } });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(String(data.error));
  return data?.data; // blu-mp devuelve { ok, data: <mensaje WS> }
}

export const useBluChatters = () =>
  useQuery({
    queryKey: ["chatter-qa", "blu-chatters"],
    queryFn: async (): Promise<BluChatter[]> => {
      // 1) Ruta autoritativa: empleados cuyo `roles` incluye el id del rol "Chatter".
      try {
        const [rolesMsg, empMsg] = await Promise.all([bluMp("roles"), bluMp("employees")]);
        const roles = (rolesMsg?.roles ?? []) as Array<{ id: number; name: string }>;
        const employees = (empMsg?.employees ?? []) as any[];
        // "Chatter" exacto (NO "Supervisor Chatters", NO "Coordinador", etc.).
        const chatterRole = roles.find((r) => String(r?.name ?? "").trim().toLowerCase() === "chatter");
        if (chatterRole && employees.length) {
          const rid = Number(chatterRole.id);
          const out: BluChatter[] = [];
          for (const e of employees) {
            const roleIds = [
              ...(Array.isArray(e?.roles) ? e.roles.map(Number) : []),
              ...(e?.roleId != null ? [Number(e.roleId)] : []),
            ];
            if (!roleIds.includes(rid)) continue;
            if (String(e?.status).toLowerCase() === "inactive") continue; // chatters dados de baja fuera
            const id = Number(e?.id);
            if (!Number.isFinite(id)) continue;
            out.push({
              blu_employee_id: id,
              name: e?.fullName || e?.name || e?.email || `#${id}`,
              group_name: e?.group ?? null,
              email: e?.email ?? null,
              assignedCreators: Array.isArray(e?.assignedCreators) ? e.assignedCreators.map(Number).filter((n: number) => Number.isFinite(n)) : [],
            });
          }
          if (out.length) return out.sort((a, b) => a.name.localeCompare(b.name));
        }
      } catch { /* si la ruta de roles falla, caemos al roster cacheado */ }

      // 2) Fallback: roster cacheado (is_chatter de employee-reports). Menos preciso (incluye
      // supervisores) pero asegura que el picker nunca quede vacío si BLU no responde.
      const { data, error } = await (supabase as any)
        .from("chatter_performance")
        .select("blu_employee_id, name, group_name, snapshot_to")
        .eq("is_chatter", true)
        .order("snapshot_to", { ascending: false });
      if (error) throw error;
      const seen = new Set<number>();
      const out: BluChatter[] = [];
      for (const r of (data ?? []) as any[]) {
        if (r.blu_employee_id == null || seen.has(r.blu_employee_id)) continue;
        seen.add(r.blu_employee_id);
        out.push({ blu_employee_id: r.blu_employee_id, name: r.name, group_name: r.group_name, email: null, assignedCreators: [] });
      }
      return out.sort((a, b) => String(a.name).localeCompare(String(b.name)));
    },
    staleTime: 5 * 60_000,
  });

// Crea un reporte. Manual → status 'ready' (lo escribe el supervisor); ai_draft → 'processing' (lo llena la edge).
export const useCreateQaReport = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      chatter_name: string; company: CompanyCode; period: string; blu_employee_id?: number | null;
      evaluated_models?: EvaluatedModel[]; source?: "manual" | "ai_draft"; evaluator_name?: string;
    }): Promise<ChatterQaReport> => {
      const source = input.source ?? "manual";
      const { data: { user } } = await supabase.auth.getUser();
      const row = {
        chatter_name: input.chatter_name.trim(),
        company: input.company,
        period: input.period,
        blu_employee_id: input.blu_employee_id ?? null,
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
      try {
        const { data, error } = await supabase.functions.invoke("chatter-qa-analyze", { body: { report_id: id, with_feedback: !!withFeedback } });
        if (error) throw new Error(error.message);
        // Si data.error (p.ej. no_chats), el edge YA dejó status='failed'+error_message → lo reporta el watcher.
        return data;
      } catch (e) {
        // Falla dura (edge no respondió/timeout) → no dejar el reporte colgado en 'processing'.
        // En español a propósito: error_message queda en la base y lo lee cualquiera
        // que abra el reporte, en el idioma que sea (igual que los que escribe la edge).
        await (supabase as any).from("chatter_qa_reports").update({ status: "failed", error_message: "No se pudo completar el análisis: " + (e as Error).message }).eq("id", id);
        throw e;
      }
    },
    // onSettled (no onSuccess): invalidamos siempre — los toasts de resultado los da useQaProcessingWatcher
    // (verde/rojo), que funciona aunque el usuario haya navegado a otra parte de Chatters QA.
    onSettled: () => qc.invalidateQueries({ queryKey: ["chatter-qa"] }),
  });
};

// Watcher: detecta la transición processing→ready/failed de cualquier reporte y avisa con toast
// (verde si OK, rojo si error; + warnings de modelos sin chats / fuera del cap). Montar UNA vez
// en un componente que viva mientras el usuario esté en Chatters QA (ChattersQaSection).
export function useQaProcessingWatcher() {
  const { data: reports = [] } = useQaReports(null);
  const prev = useRef<Map<string, string> | null>(null);
  useEffect(() => {
    const cur = new Map(reports.map((r) => [r.id, r.status]));
    if (prev.current) {
      for (const r of reports) {
        if (prev.current.get(r.id) === "processing" && r.status !== "processing") {
          if (r.status === "ready") {
            const s = (r.sampling ?? {}) as any;
            const skipped = (s.models_skipped ?? []) as string[];
            const empties = (s.empty_models ?? []) as string[];
            toast.success(traducir("agencyQa.watch.ready", { name: r.chatter_name }));
            if (skipped.length) toast.warning(traducir("agencyQa.watch.skipped", { name: r.chatter_name, models: skipped.join(", ") }), { duration: 8000 });
            if (empties.length) toast.warning(traducir("agencyQa.watch.empty", { name: r.chatter_name, models: empties.join(", ") }), { duration: 7000 });
          } else if (r.status === "failed") {
            // error_message lo escribe la edge (o useGenerateQaDraft) en la base: es dato.
            toast.error(r.error_message || traducir("agencyQa.watch.failed", { name: r.chatter_name }), { duration: 8000 });
          }
        }
      }
    }
    prev.current = cur;
  }, [reports]);
}

// ── Config de notificaciones (singleton id=1) ──
export interface ChatterQaConfig {
  id: number;
  notification_emails: string[];
  notify_user_ids: string[];
  notify_on_analyzed: boolean;
  notify_on_low_score: boolean;
  notify_on_failed: boolean;
  updated_at: string;
}
export const useChatterQaConfig = () =>
  useQuery({
    queryKey: ["chatter-qa", "config"],
    queryFn: async (): Promise<ChatterQaConfig | null> => {
      const { data, error } = await (supabase as any).from("chatter_qa_config").select("*").eq("id", 1).maybeSingle();
      if (error) throw error;
      return (data ?? null) as ChatterQaConfig | null;
    },
  });
export const useUpdateChatterQaConfig = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<ChatterQaConfig>) => {
      const { error } = await (supabase as any).from("chatter_qa_config").update(patch).eq("id", 1);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chatter-qa", "config"] }),
  });
};

// ── Enviar / reenviar el reporte por email (client-side). Manual = manda siempre que haya
// destinatarios; arma el HTML con el template, llama a send-notification-email, marca email_sent_at.
const buildPayload = (row: ChatterQaReport): ChatterQaEmailPayload => ({
  chatterName: row.chatter_name,
  companyLabel: `${companyLabel(row.company)} (${row.company})`,
  // El correo sale en español siempre: lo lee el chatter, no quien apretó "Enviar".
  periodLabel: periodLabel(row.period, "es"),
  evaluatorName: row.evaluator_name,
  veredictoLabel: veredictoLabel(row.veredicto, "es"),
  tone: veredictoTone(row.veredicto) as "good" | "warn" | "bad",
  report: (row.report ?? {}) as ChatterQaEmailPayload["report"],
  evaluatedModels: row.evaluated_models ?? [],
  fanIndex: ((row.sampling as any)?.fan_index ?? {}) as ChatterQaEmailPayload["fanIndex"],
  appUrl: getPublicBaseUrl(),
});
export const useSendChatterQaEmail = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: ChatterQaReport) => {
      const { data: cfg } = await (supabase as any).from("chatter_qa_config")
        .select("notification_emails, notify_user_ids").eq("id", 1).maybeSingle();
      const to: string[] = cfg?.notification_emails ?? [];
      const alsoIds: string[] = [...(cfg?.notify_user_ids ?? [])];
      if (row.created_by && !alsoIds.includes(row.created_by)) alsoIds.push(row.created_by);
      if (to.length === 0 && alsoIds.length === 0)
        throw new Error(traducir("agencyQa.email.noRecipients"));
      const p = buildPayload(row);
      const { data, error } = await supabase.functions.invoke("send-notification-email", {
        body: { to, subject: buildChatterQaEmailSubject(p), html: buildChatterQaEmailHtml(p), tag: "chatter-qa", also_include_user_ids: alsoIds.length ? alsoIds : undefined },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(String(data.error));
      await (supabase as any).from("chatter_qa_reports").update({ email_sent_at: new Date().toISOString() }).eq("id", row.id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chatter-qa"] }),
  });
};
