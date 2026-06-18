import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// cloudphone — proxy autenticado entre Maven y el microservicio `cloudphone-gateway`.
// El front llama acá con el JWT del usuario; esta función aplica el CONTROL DE ACCESO
// (admin ve/opera todos; el resto SOLO los asignados) y habla con el micro con el SPIKE_TOKEN
// server-side. NUNCA expone la URL del micro ni el token al front.
//
// body.action:
//   list      → { ok, isAdmin, phones:[{...,assigned_to,session}] }   (+ reconcilia el log)
//   start     → { ok, url, secondsLeft }                              (registra sesión en el micro + log)
//   stop      → cierra sesión (log) + apaga
//   heartbeat → mantiene viva la sesión (Maven lo manda cada ~60s con el iframe abierto)
//   extend    → resetea el reloj de la sesión
//   status    → estado de teléfonos
//   assign    → (admin) asignar teléfono a usuario
//   users     → (admin) usuarios para el dropdown
//   usage     → (admin) reporte de minutos por persona (últimos 30 días)
//
// CONTROL DE TIEMPO: el reaper vive en el MICRO (in-memory, sin cron en Supabase). Esta función solo
// escribe el LOG de uso (al abrir/cerrar) y reconcilia en `list` las sesiones que el reaper cerró.

const cors = {
  "Access-Control-Allow-Origin": Deno.env.get("CORS_ALLOW_ORIGIN") ?? "https://maven.asmtech.ai",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  Vary: "Origin",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });

const GW_URL = (Deno.env.get("CLOUDPHONE_URL") ?? "").replace(/\/$/, "");
const GW_TOKEN = Deno.env.get("CLOUDPHONE_SPIKE_TOKEN") ?? "";
const SESSION_CAP_MS = 20 * 60 * 1000; // fallback para reconciliar duración de sesiones cerradas por reaper

// Timeout del lado edge: si el micro no responde a tiempo (p.ej. reiniciando), cortamos rápido y
// devolvemos un error claro, en vez de colgar hasta el límite de Supabase (~10s) y tirar 500 genérico.
const GW_TIMEOUT_MS = 8000;
async function gw(path: string, init: RequestInit = {}) {
  const res = await fetch(GW_URL + path, {
    ...init,
    signal: AbortSignal.timeout(GW_TIMEOUT_MS),
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

// deno-lint-ignore no-explicit-any
async function reconcileLog(sb: any, activeIds: Set<string>, ended: any[]) {
  const { data: open } = await sb
    .from("cloudphone_sessions")
    .select("id, profile_id, started_at")
    .is("ended_at", null);
  if (!open?.length) return;
  const endedMap = new Map<string, { endedAt?: string; reason?: string }>();
  for (const e of ended || []) endedMap.set(e.profileId, { endedAt: e.endedAt, reason: e.reason });
  for (const row of open) {
    if (activeIds.has(row.profile_id)) continue; // sigue corriendo
    const ev = endedMap.get(row.profile_id);
    const endedAt = ev?.endedAt || new Date(new Date(row.started_at).getTime() + SESSION_CAP_MS).toISOString();
    const reason = ev?.reason || "timeout";
    await sb.from("cloudphone_sessions").update({ ended_at: endedAt, end_reason: reason }).eq("id", row.id);
  }
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

    const { data: roleRows } = await sb.from("user_roles").select("role").eq("user_id", uid);
    const isAdmin = (roleRows ?? []).some((r: { role: string }) => r.role === "admin");
    // data_scope='all' en Telefonos (o admin) ⇒ ve y opera TODOS los dispositivos,
    // no solo los asignados. Antes el gate era binario admin-o-asignado e ignoraba
    // role_permissions.data_scope (por eso un "Team Leader" con scope 'all' solo
    // veía sus asignados). canSeeAll NO habilita asignar gente (eso sigue admin-only).
    const { data: globalScope } = await sb.rpc("has_telefonos_global_scope", { _user_id: uid });
    const canSeeAll = isAdmin || globalScope === true;

    const payload = await req.json().catch(() => ({}));
    const action: string = payload?.action ?? "";
    const profileId: string | undefined = payload?.profileId;
    const profileIds: string[] = Array.isArray(payload?.profileIds) ? payload.profileIds : [];

    const myAssignedIds = async (): Promise<Set<string>> => {
      const { data } = await sb.from("cloudphone_assignments").select("profile_id").eq("assigned_to", uid);
      return new Set((data ?? []).map((r: { profile_id: string }) => r.profile_id));
    };
    const canUse = async (pid: string): Promise<boolean> => {
      if (canSeeAll) return true;
      return (await myAssignedIds()).has(pid);
    };

    if (action === "list") {
      let r: { status: number; body: Record<string, unknown> };
      try {
        r = await gw("/phones?page=1&page_size=100");
      } catch (_e) {
        // El gateway no respondió a tiempo (micro reiniciando/lento). Error CLARO con 200 para que el
        // front muestre un mensaje amable (lee res.error), en vez del genérico "non-2xx" tras el cuelgue.
        return json({
          ok: false,
          error: "El gateway de teléfonos no respondió (puede estar reiniciando). Reintentá en un momento.",
          gateway_timeout: true,
        });
      }
      const items: Array<Record<string, unknown>> = (r.body?.data as { items?: [] })?.items ?? [];
      const { data: assigns } = await sb.from("cloudphone_assignments").select("profile_id, assigned_to");
      // varios asignados por teléfono → mapa profile_id -> [user_id]
      const byPhone = new Map<string, string[]>();
      for (const a of (assigns ?? []) as Array<{ profile_id: string; assigned_to: string | null }>) {
        if (!a.assigned_to) continue;
        const arr = byPhone.get(a.profile_id) ?? [];
        arr.push(a.assigned_to);
        byPhone.set(a.profile_id, arr);
      }
      // sesiones vivas desde el micro (autoritativo). Si el micro es viejo (sin /sessions), gotSessions=false.
      // deno-lint-ignore no-explicit-any
      let active: any[] = [];
      // deno-lint-ignore no-explicit-any
      let ended: any[] = [];
      let gotSessions = false;
      try {
        const s = await gw("/sessions");
        if (s.status === 200 && Array.isArray((s.body as { active?: [] })?.active)) {
          active = (s.body as { active: [] }).active;
          ended = Array.isArray((s.body as { ended?: [] })?.ended) ? (s.body as { ended: [] }).ended : [];
          gotSessions = true;
        }
      } catch { /* micro viejo: sin reconcile */ }
      const activeIds = new Set(active.map((a) => a.profileId));
      // enriquecer cada sesión con el NOMBRE de quien la tiene (para mostrar "En uso por X").
      const sessUserIds = [...new Set(active.map((a) => a.userId).filter(Boolean))];
      const sessNames = new Map<string, string | null>();
      if (sessUserIds.length) {
        const { data: sp } = await sb.from("profiles").select("id, full_name").in("id", sessUserIds);
        for (const pr of (sp ?? []) as Array<{ id: string; full_name: string | null }>) sessNames.set(pr.id, pr.full_name);
      }
      const activeByProfile = new Map(
        active.map((a) => [a.profileId, { ...a, user_name: sessNames.get(a.userId) ?? null }]),
      );
      if (gotSessions) {
        try {
          await reconcileLog(sb, activeIds, ended);
        } catch { /* no romper el list por el log */ }
      }
      let phones = items.map((p) => ({
        ...p,
        assigned_to: byPhone.get(String(p.id)) ?? [],
        session: activeByProfile.get(String(p.id)) ?? null,
      }));
      if (!canSeeAll) phones = phones.filter((p) => (p.assigned_to as string[]).includes(uid));
      return json({ ok: true, isAdmin, canSeeAll, phones });
    }

    if (action === "start") {
      if (!profileId || !(await canUse(profileId))) return json({ ok: false, error: "forbidden" }, 403);
      const r = await gw(`/phones/${encodeURIComponent(profileId)}/start`, {
        method: "POST",
        body: JSON.stringify({ userId: uid }),
      });
      // LOCK: el micro rechaza si OTRO usuario lo tiene activo. Resolvemos el nombre y devolvemos
      // 200 con {ok:false, inUse} para que el front muestre el aviso (no se gastan minutos).
      if (r.body?.inUse) {
        let inUseBy: string | null = null;
        const other = r.body?.inUseByUserId as string | undefined;
        if (other) {
          const { data: who } = await sb.from("profiles").select("full_name").eq("id", other).maybeSingle();
          inUseBy = (who as { full_name?: string } | null)?.full_name ?? null;
        }
        return json({ ok: false, inUse: true, inUseBy, error: "in_use" });
      }
      if (r.body?.ok) {
        // recién con el arranque OK: cerramos las otras sesiones abiertas del usuario en el log
        // (un-teléfono-a-la-vez) e insertamos la nueva.
        await sb
          .from("cloudphone_sessions")
          .update({ ended_at: new Date().toISOString(), end_reason: "replaced" })
          .is("ended_at", null)
          .eq("user_id", uid);
        await sb.from("cloudphone_sessions").insert({
          profile_id: profileId,
          serial_name: payload?.serial_name ?? null,
          user_id: uid,
        });
      }
      return json(r.body, r.status);
    }

    if (action === "stop") {
      if (!profileId || !(await canUse(profileId))) return json({ ok: false, error: "forbidden" }, 403);
      const r = await gw(`/phones/${encodeURIComponent(profileId)}/stop`, { method: "POST" });
      await sb
        .from("cloudphone_sessions")
        .update({ ended_at: new Date().toISOString(), end_reason: "manual" })
        .is("ended_at", null)
        .eq("profile_id", profileId);
      return json(r.body, r.status);
    }

    if (action === "heartbeat") {
      if (!profileId || !(await canUse(profileId))) return json({ ok: false, error: "forbidden" }, 403);
      const r = await gw(`/phones/${encodeURIComponent(profileId)}/heartbeat`, {
        method: "POST",
        body: JSON.stringify({ userId: uid }),
      });
      return json(r.body, r.status);
    }

    if (action === "extend") {
      if (!profileId || !(await canUse(profileId))) return json({ ok: false, error: "forbidden" }, 403);
      const r = await gw(`/phones/${encodeURIComponent(profileId)}/extend`, { method: "POST" });
      return json(r.body, r.status);
    }

    if (action === "status") {
      if (!canSeeAll) {
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
      // Set COMPLETO de asignados del teléfono: borramos los actuales e insertamos los nuevos.
      // Acepta userIds:[...] (multi) o userId (single, retrocompat). [] = sin asignar.
      const userIds: string[] = Array.isArray(payload?.userIds)
        ? (payload.userIds as string[]).filter(Boolean)
        : payload?.userId
          ? [payload.userId as string]
          : [];
      const { error: delErr } = await sb.from("cloudphone_assignments").delete().eq("profile_id", profileId);
      if (delErr) return json({ ok: false, error: delErr.message }, 500);
      if (userIds.length) {
        const rows = userIds.map((u) => ({
          profile_id: profileId,
          assigned_to: u,
          assigned_by: uid,
          serial_name: payload?.serial_name ?? null,
          remark: payload?.remark ?? null,
        }));
        const { error: insErr } = await sb.from("cloudphone_assignments").insert(rows);
        if (insErr) return json({ ok: false, error: insErr.message }, 500);
      }
      return json({ ok: true });
    }
    if (action === "users") {
      if (!isAdmin) return json({ ok: false, error: "forbidden" }, 403);
      const { data } = await sb.from("profiles").select("id, full_name").order("full_name");
      return json({ ok: true, users: data ?? [] });
    }
    if (action === "usage") {
      if (!canSeeAll) return json({ ok: false, error: "forbidden" }, 403);
      const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
      const { data: rows } = await sb
        .from("cloudphone_sessions")
        .select("user_id, serial_name, started_at, ended_at, end_reason")
        .gte("started_at", since)
        .not("ended_at", "is", null)
        .order("started_at", { ascending: false })
        .limit(1000);
      const mins = (a: string, b: string) => Math.max(0, (new Date(b).getTime() - new Date(a).getTime()) / 60000);
      const byUserMap = new Map<string, { user_id: string; minutes: number; sessions: number }>();
      for (const r of rows ?? []) {
        const cur = byUserMap.get(r.user_id) || { user_id: r.user_id, minutes: 0, sessions: 0 };
        cur.minutes += mins(r.started_at, r.ended_at);
        cur.sessions += 1;
        byUserMap.set(r.user_id, cur);
      }
      const ids = [...byUserMap.keys()].filter(Boolean);
      const names = new Map<string, string | null>();
      if (ids.length) {
        const { data: profs } = await sb.from("profiles").select("id, full_name").in("id", ids);
        for (const p of profs ?? []) names.set(p.id, p.full_name);
      }
      const byUser = [...byUserMap.values()]
        .map((x) => ({ ...x, minutes: Math.round(x.minutes), full_name: names.get(x.user_id) ?? null }))
        .sort((a, b) => b.minutes - a.minutes);
      const recent = (rows ?? []).slice(0, 20).map((r) => ({
        serial_name: r.serial_name,
        full_name: names.get(r.user_id) ?? null,
        started_at: r.started_at,
        ended_at: r.ended_at,
        end_reason: r.end_reason,
        minutes: Math.round(mins(r.started_at, r.ended_at)),
      }));
      return json({ ok: true, byUser, recent });
    }

    return json({ ok: false, error: "unknown_action" }, 400);
  } catch (e) {
    return json({ ok: false, error: String((e as Error)?.message ?? e) }, 500);
  }
});
