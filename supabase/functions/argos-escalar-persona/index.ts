// Si una persona fue avisada por Argos y NO se corrigió en 5 min, se escala:
//   • Chatter → Chatter Supervisor
//   • Cualquier otro rol → HR (HHRR) + admin + dueño
// (Alvaro, 09/11). Corre por cron cada 2 min. Idempotente: cada nudge se
// escala una sola vez (escalado_at). SILENCIOSO con admins (no se mide).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_TOKEN = Deno.env.get("CRON_INTERNAL_TOKEN") ?? "";
const APP_URL = (Deno.env.get("APP_URL") ?? "https://app.maven-ai.me").replace(/\/+$/, "");

const admin = createClient(SUPABASE_URL, SERVICE_KEY);

interface Nudge { id: string; user_id: string; tipo: string; mensaje: string; avisado_at: string; }

async function destinatarios(userUid: string): Promise<string[]> {
  // ¿Es chatter? Si sí, Chatter Supervisor. Si no, HR + admin + dueño.
  const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", userUid);
  const rs = ((roles ?? []) as Array<{ role: string }>).map((r) => r.role.toLowerCase());
  const esChatter = rs.some((r) => r === "chatter");

  const nombreRolesDestino = esChatter
    ? ["chatter supervisor"]
    : ["hhrr", "admin"]; // HR y admins

  const { data: dest } = await admin.from("user_roles").select("user_id, role")
    .in("role", esChatter ? ["Chatter Supervisor"] : ["HHRR", "admin"]);
  const ids = new Set<string>(((dest ?? []) as Array<{ user_id: string }>).map((d) => d.user_id));

  // + Dueño siempre (si no es chatter — si lo es, también, por respaldo).
  const { data: duenos } = await admin.from("tenant_owners").select("user_id");
  for (const d of (duenos ?? []) as Array<{ user_id: string }>) ids.add(d.user_id);

  // Nunca al propio avisado.
  ids.delete(userUid);
  void nombreRolesDestino;
  return [...ids];
}

async function enviarPush(ids: string[], title: string, body: string, nudgeId: string) {
  if (ids.length === 0) return;
  try {
    await fetch(`${SUPABASE_URL}/functions/v1/web-push`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Cron-Token": CRON_TOKEN,
        "Authorization": `Bearer ${SERVICE_KEY}`,
      },
      body: JSON.stringify({
        action: "notify",
        kind: "argos_persona_ignora",
        ids,
        title,
        body,
        url: `${APP_URL}/hr/monitor-ia?t=ahora`,
        tag: `argos_persona_${nudgeId}`,
        prioridad: "urgente",
      }),
    });
  } catch (e) {
    console.warn("escalar-persona: push falló", (e as Error)?.message);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204 });
  if (req.method !== "POST") return new Response("method", { status: 405 });
  if (!CRON_TOKEN || req.headers.get("X-Cron-Token") !== CRON_TOKEN) {
    return new Response(JSON.stringify({ ok: false, error: "auth" }), { status: 401, headers: { "Content-Type": "application/json" } });
  }

  // Nudges avisados hace > 5 min, SIN cerrar y SIN escalar.
  const hace5 = new Date(Date.now() - 5 * 60_000).toISOString();
  const { data } = await admin.from("argos_nudges")
    .select("id, user_id, tipo, mensaje, avisado_at")
    .is("cerrado_at", null).is("escalado_at", null)
    .lte("avisado_at", hace5)
    .order("avisado_at", { ascending: true })
    .limit(50);
  const lista = (data ?? []) as Nudge[];
  let escalados = 0;

  for (const n of lista) {
    const { data: perf } = await admin.from("profiles").select("full_name").eq("id", n.user_id).maybeSingle();
    const nombre = (perf as { full_name: string | null } | null)?.full_name?.trim() || "Alguien";
    const ids = await destinatarios(n.user_id);
    const body = `${nombre} ignoró el aviso: ${n.mensaje}`;
    await enviarPush(ids, "⚠️ No corrigió el aviso", body, n.id);
    await admin.from("argos_nudges").update({ escalado_at: new Date().toISOString() }).eq("id", n.id);
    escalados++;
  }

  return new Response(JSON.stringify({ ok: true, revisados: lista.length, escalados }), {
    status: 200, headers: { "Content-Type": "application/json" },
  });
});
