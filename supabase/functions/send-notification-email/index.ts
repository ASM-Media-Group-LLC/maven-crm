// send-notification-email — el relé de correos transaccionales de Maven
// (Resend, desde noreply@mail.maven-ai.me).
//
// Quién puede qué y por qué: ver logica.ts. En corto:
//   · Servidor (service_role o X-Cron-Token): { to, subject, html, tag?,
//     also_include_user_ids? }, como siempre. qa-analyze, ticket-notify y
//     email_notify_enqueue (pg_net).
//   · Navegador (JWT de una persona): solo { plantilla, id }. El reporte se lee
//     con la RLS de la persona, el correo se arma aquí y se manda solo a cuentas
//     de su agencia (y a los dominios de NOTIFICATION_ALLOWED_DOMAINS), con tope
//     por minuto, sin devolver direcciones.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsFor } from "../_shared/cors.ts";
import {
  type DatosEvaluacion,
  type DatosQaChatter,
  type DatosQaCloser,
  type LectorComoPersona,
  manejar,
  type Puertos,
} from "./logica.ts";

const corsHeaders = (req: Request) =>
  corsFor(req, {
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  });

const json = (req: Request, status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });

const env = (n: string) => Deno.env.get(n);
const sinSesion = { auth: { persistSession: false, autoRefreshToken: false } };

/** Lanza si la lectura falló (un 500 es mejor que un correo a medias). */
function leido<T>(r: { data: T; error: { message: string } | null }, que: string): T {
  if (r.error) throw new Error(`no se pudo leer ${que}: ${r.error.message}`);
  return r.data;
}

/** Una relación embebida de PostgREST (a uno) llega como objeto; sin tipos
 *  generados, el cliente la tipa como arreglo. */
const uno = <T>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);

// deno-lint-ignore no-explicit-any
function lectorComoPersona(db: SupabaseClient<any, any, any>): LectorComoPersona {
  return {
    async evaluacionChatter(id): Promise<DatosEvaluacion | null> {
      const ev = leido(
        await db.from("chatter_evaluations")
          .select("id, created_at, examiner_name, verdict, score_pct, feedback, criteria_results, session_id")
          .eq("id", id).maybeSingle(),
        "la evaluación",
      );
      if (!ev) return null;
      const [ses, mensajes, cfg] = await Promise.all([
        db.from("chatter_sessions").select("id, chatter_name, profile_id").eq("id", ev.session_id).maybeSingle(),
        db.from("chatter_messages").select("id", { count: "exact", head: true }).eq("session_id", ev.session_id),
        db.from("chatter_config").select("notification_emails").eq("id", 1).maybeSingle(),
      ]);
      const sesion = leido(ses, "la sesión");
      if (!sesion) return null;
      const perfil = sesion.profile_id
        ? leido(await db.from("chatter_profiles").select("name").eq("id", sesion.profile_id).maybeSingle(), "el perfil")
        : null;
      if (mensajes.error) throw new Error(`no se pudieron contar los mensajes: ${mensajes.error.message}`);
      return {
        evaluacion: ev,
        sesion,
        perfil,
        mensajes: mensajes.count ?? 0,
        config: leido(cfg, "la configuración del evaluador"),
      };
    },
    async qaCloser(id): Promise<DatosQaCloser | null> {
      const call = leido(
        await db.from("qa_calls")
          .select(
            "id, created_at, call_date, evaluator_name, call_type, service_sold, claude_score, claude_analysis, uploaded_by, model:qa_models(name, category, ig_url), closer:profiles!closer_id(name:full_name)",
          )
          .eq("id", id).maybeSingle(),
        "la llamada",
      );
      if (!call) return null;
      const config = leido(
        await db.from("qa_config")
          .select("notification_emails, notify_on_analyzed, notify_on_low_score, low_score_threshold")
          .eq("id", 1).maybeSingle(),
        "la configuración de QA",
      );
      const { model, closer, ...resto } = call;
      return { call: resto, model: uno(model), closer: uno(closer), config };
    },
    async qaChatter(id): Promise<DatosQaChatter | null> {
      const report = leido(
        await db.from("chatter_qa_reports")
          .select("id, chatter_name, company, period, evaluator_name, veredicto, report, evaluated_models, sampling, created_by")
          .eq("id", id).maybeSingle(),
        "el reporte",
      );
      if (!report) return null;
      const config = leido(
        await db.from("chatter_qa_config").select("notification_emails, notify_user_ids").eq("id", 1).maybeSingle(),
        "la configuración del QA de chatters",
      );
      return { report, config };
    },
  };
}

function puertosReales(): Puertos {
  const url = env("SUPABASE_URL")!;
  const anon = env("SUPABASE_ANON_KEY")!;
  const admin = createClient(url, env("SUPABASE_SERVICE_ROLE_KEY")!, sinSesion);
  return {
    env,
    persona: async (token) => {
      const { data: { user }, error } = await createClient(url, anon, sinSesion).auth.getUser(token);
      return error || !user?.id ? null : { id: user.id };
    },
    comoPersona: (token) =>
      lectorComoPersona(createClient(url, anon, { ...sinSesion, global: { headers: { Authorization: `Bearer ${token}` } } })),
    destinatariosDeAgencia: async (quien, userIds, correos) => {
      const { data, error } = await admin.rpc("correo_destinatarios_de_agencia", {
        p_quien: quien,
        p_user_ids: userIds,
        p_correos: correos,
      });
      if (error) throw new Error(`no se pudieron elegir los destinatarios: ${error.message}`);
      return (data ?? []) as { user_id: string; email: string }[];
    },
    turno: async (quien, plantilla, ref) => {
      const { data, error } = await admin.rpc("correo_navegador_turno", { p_user: quien, p_plantilla: plantilla, p_ref: ref });
      if (error) throw new Error(`no se pudo anotar el envío: ${error.message}`);
      return data === true;
    },
    correoDeUsuario: async (userId) => {
      const { data } = await admin.auth.admin.getUserById(userId);
      return data?.user?.email ?? null;
    },
    enviar: async (e) => {
      const resp = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${env("RESEND_API_KEY")}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: e.from,
          to: e.to,
          subject: e.subject,
          html: e.html,
          tags: e.tag ? [{ name: "type", value: e.tag }] : undefined,
        }),
      });
      if (!resp.ok) return { ok: false, status: resp.status, id: null, detalle: await resp.text().catch(() => "") };
      const data = await resp.json().catch(() => ({})) as { id?: string };
      return { ok: true, status: resp.status, id: data?.id ?? null, detalle: "" };
    },
    log: (...a) => console.warn(...a),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(req) });
  try {
    const body = await req.json().catch(() => null);
    const res = await manejar(
      { authorization: req.headers.get("Authorization"), cronToken: req.headers.get("X-Cron-Token") },
      body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : null,
      puertosReales(),
    );
    return json(req, res.status, res.body);
  } catch (err) {
    console.error("[send-notification-email] Internal error:", err);
    return json(req, 500, { error: "Internal server error" });
  }
});
