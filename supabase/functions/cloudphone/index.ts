import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// cloudphone — proxy autenticado entre Maven y el microservicio `cloudphone-gateway`.
// El front llama acá con el JWT del usuario; esta función aplica el CONTROL DE ACCESO
// (admin ve/opera todos los teléfonos; el resto SOLO los que tiene asignados) y habla con el
// micro usando el SPIKE_TOKEN server-side. NUNCA expone la URL del micro ni el token al front.
//
// body.action: "list" | "start" | "stop" | "status" | "assign" | "users"
//   list   → { ok, isAdmin, phones:[{id,serial_name,folder_id,status,remark,usecase_name,assigned_to}] }
//   start  → { ok, url }            (URL geelark para el <iframe>)  — requiere acceso al profileId
//   stop   → { ok, ... }            — requiere acceso
//   status → { ... }  body.profileIds:[...]
//   assign → admin: body {profileId, userId|null, serial_name?, remark?}  (upsert)
//   users  → admin: { ok, users:[{id,full_name}] }  (para el dropdown de asignación)

const cors = {
  "Access-Control-Allow-Origin": Deno.env.get("CORS_ALLOW_ORIGIN") ?? "https://maven.asmtech.ai",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  Vary: "Origin",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });

const GW_URL = (Deno.env.get("CLOUDPHONE_URL") ?? "").replace(/\/$/, "");
const GW_TOKEN = Deno.env.get("CLOUDPHONE_SPIKE_TOKEN") ?? "";

async function gw(path: string, init: RequestInit = {}) {
  const res = await fetch(GW_URL + path, {
    ...init,
    headers: { "x-spike-token": GW_TOKEN, "Content-Type": "application/json", ...(init.headers || {}) },
  });
  const text = await res.text();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text.slice(0, 300) };
  }
  return { status: res.status, body: body as Record<string, unknown> };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    if (!GW_URL || !GW_TOKEN) return json({ ok: false, error: "gateway_not_configured" }, 500);

    const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!token) return json({ ok: false, error: "missing_auth" }, 401);

    const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: u, error: uErr } = await sb.auth.getUser(token);
    if (uErr || !u?.user) return json({ ok: false, error: "invalid_token" }, 401);
    const uid = u.user.id;

    // admin = tiene rol admin en user_roles (service_role saltea RLS).
    const { data: roleRows } = await sb.from("user_roles").select("role").eq("user_id", uid);
    const isAdmin = (roleRows ?? []).some((r: { role: string }) => r.role === "admin");

    const payload = await req.json().catch(() => ({}));
    const action: string = payload?.action ?? "";
    const profileId: string | undefined = payload?.profileId;
    const profileIds: string[] = Array.isArray(payload?.profileIds) ? payload.profileIds : [];

    const myAssignedIds = async (): Promise<Set<string>> => {
      const { data } = await sb
        .from("cloudphone_assignments")
        .select("profile_id")
        .eq("assigned_to", uid);
      return new Set((data ?? []).map((r: { profile_id: string }) => r.profile_id));
    };
    const canUse = async (pid: string): Promise<boolean> => {
      if (isAdmin) return true;
      return (await myAssignedIds()).has(pid);
    };

    if (action === "list") {
      const r = await gw("/phones?page=1&page_size=100");
      const items: Array<Record<string, unknown>> = (r.body?.data as { items?: [] })?.items ?? [];
      const { data: assigns } = await sb
        .from("cloudphone_assignments")
        .select("profile_id, assigned_to");
      const byId = new Map((assigns ?? []).map((a: { profile_id: string; assigned_to: string | null }) => [a.profile_id, a.assigned_to]));
      let phones = items.map((p) => ({ ...p, assigned_to: byId.get(String(p.id)) ?? null }));
      if (!isAdmin) phones = phones.filter((p) => p.assigned_to === uid);
      return json({ ok: true, isAdmin, phones });
    }

    if (action === "start") {
      if (!profileId || !(await canUse(profileId))) return json({ ok: false, error: "forbidden" }, 403);
      const r = await gw(`/phones/${encodeURIComponent(profileId)}/start`, { method: "POST" });
      return json(r.body, r.status);
    }
    if (action === "stop") {
      if (!profileId || !(await canUse(profileId))) return json({ ok: false, error: "forbidden" }, 403);
      const r = await gw(`/phones/${encodeURIComponent(profileId)}/stop`, { method: "POST" });
      return json(r.body, r.status);
    }
    if (action === "status") {
      if (!isAdmin) {
        const allowed = await myAssignedIds();
        for (const id of profileIds) if (!allowed.has(id)) return json({ ok: false, error: "forbidden" }, 403);
      }
      const r = await gw("/phones/status", { method: "POST", body: JSON.stringify({ ids: profileIds }) });
      return json(r.body, r.status);
    }

    // ---- admin only ----
    if (action === "assign") {
      if (!isAdmin) return json({ ok: false, error: "forbidden" }, 403);
      if (!profileId) return json({ ok: false, error: "missing_profileId" }, 400);
      const row = {
        profile_id: profileId,
        assigned_to: payload?.userId ?? null,
        assigned_by: uid,
        serial_name: payload?.serial_name ?? null,
        remark: payload?.remark ?? null,
        updated_at: new Date().toISOString(),
      };
      const { error } = await sb.from("cloudphone_assignments").upsert(row, { onConflict: "profile_id" });
      if (error) return json({ ok: false, error: error.message }, 500);
      return json({ ok: true });
    }
    if (action === "users") {
      if (!isAdmin) return json({ ok: false, error: "forbidden" }, 403);
      const { data } = await sb.from("profiles").select("id, full_name").order("full_name");
      return json({ ok: true, users: data ?? [] });
    }

    return json({ ok: false, error: "unknown_action" }, 400);
  } catch (e) {
    return json({ ok: false, error: String((e as Error)?.message ?? e) }, 500);
  }
});
