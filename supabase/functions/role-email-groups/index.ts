// Grupos de correo por rol de Maven (listas de distribución Zoho) con auto-sync.
// SOLO admins. La membresía se mantiene al día contra user_roles.
// Acciones: list | provision | sync (+ diagnósticos zoho_whoami / zoho_groups).
import { corsFor } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  listGroups, createGroup, addGroupMembers, removeGroupMembers, zohoConfigured,
} from "../_shared/zoho.ts";

const corsHeaders = (req: Request) =>
  corsFor(req, {
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  });
const json = (req: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders(req), "Content-Type": "application/json" } });

type Mapping = {
  role: string; group_email: string; group_name: string; zgid: string | null;
  enabled: boolean; access_type: string; last_synced_at: string | null;
};

// Miembros esperados por rol (Set de emails en minúscula). '__all__' = todos.
// deno-lint-ignore no-explicit-any
async function getDesired(admin: any): Promise<Map<string, Set<string>>> {
  const { data, error } = await admin.rpc("role_group_members");
  // ── FRENO DE MANO ─────────────────────────────────────────────────────────
  //
  // Antes esto era `const { data } = ...` y `data ?? []`: el error se descartaba
  // y el sync seguía con el padrón VACÍO. Y como más abajo saca del grupo a todo
  // el que no esté en el padrón, un fallo de esta consulta —un deploy a medias,
  // un cambio en la función, un timeout— habría VACIADO LOS DOCE GRUPOS de una
  // sola corrida, dejando como único rastro un `removed: N` en una tabla que
  // ninguna pantalla de Maven muestra. Nadie se habría enterado hasta que RH
  // mandara un correo y no le llegara a nadie.
  //
  // El padrón de correo de la empresa entera sale de acá: si no se pudo leer, no
  // se toca nada. Fallar ruidosamente es lo correcto — el cron reintenta mañana
  // y el estado de los grupos queda como estaba.
  if (error) {
    throw new Error(`role_group_members falló (${error.message}) — sync abortado para no vaciar los grupos`);
  }
  const rows = (data ?? []) as { role: string; email: string }[];
  // Cero filas no es "la empresa se quedó vacía", es un problema de datos:
  // siempre hay alguien con rol (de hecho `handle_new_user` le pone `employee`
  // a todo usuario nuevo). Tratarlo como padrón válido sería el mismo desastre.
  if (rows.length === 0) {
    throw new Error("role_group_members devolvió CERO filas — sync abortado (siempre hay usuarios con rol; esto es un problema de datos)");
  }
  const byRole = new Map<string, Set<string>>();
  const all = new Set<string>();
  for (const row of rows) {
    const email = String(row.email).toLowerCase();
    if (!byRole.has(row.role)) byRole.set(row.role, new Set());
    byRole.get(row.role)!.add(email);
    all.add(email);
  }
  byRole.set("__all__", all);
  return byRole;
}

// Grupos actuales en Zoho, indexados por email en minúscula.
async function getZohoGroups(): Promise<{ ok: boolean; error?: string; byEmail: Map<string, { zgid: string; members: Set<string> }> }> {
  const r = await listGroups();
  const byEmail = new Map<string, { zgid: string; members: Set<string> }>();
  if (!r.ok) return { ok: false, error: r.error, byEmail };
  for (const g of r.data?.groups ?? []) {
    byEmail.set(String(g.emailId).toLowerCase(), {
      zgid: String(g.zgid),
      members: new Set((g.mailGroupMemberList ?? []).map((m) => String(m.memberEmailId).toLowerCase())),
    });
  }
  return { ok: true, byEmail };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(req) });
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Dos vías de auth: (a) el cron entra con X-Cron-Token (así no viaja una
    // llave de service_role), (b) un admin con su JWT. El cron solo puede syncar.
    const cronExpected = Deno.env.get("CRON_INTERNAL_TOKEN") ?? "";
    const isCron = !!cronExpected && req.headers.get("X-Cron-Token") === cronExpected;

    if (!isCron) {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader?.startsWith("Bearer ")) return json(req, { error: "Unauthorized" }, 401);
      const token = authHeader.replace("Bearer ", "");
      const authClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
      const { data: { user }, error: uErr } = await authClient.auth.getUser(token);
      if (uErr || !user?.id) return json(req, { error: "Unauthorized" }, 401);
      const { data: roleRow } = await admin.from("user_roles").select("role").eq("user_id", user.id).maybeSingle();
      if (roleRow?.role !== "admin") return json(req, { error: "Forbidden: solo admins" }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const action = body?.action as string | undefined;
    const onlyRole = body?.role as string | undefined;
    if (isCron && action !== "sync") return json(req, { error: "cron: solo sync" }, 403);

    // ── Diagnósticos ──
    if (action === "zoho_whoami") {
      return json(req, {
        client_id: Deno.env.get("ZOHO_CLIENT_ID") ?? null, zoid: Deno.env.get("ZOHO_ZOID") ?? null,
        dc: Deno.env.get("ZOHO_DC") ?? "com", tiene_secret: !!Deno.env.get("ZOHO_CLIENT_SECRET"), tiene_refresh: !!Deno.env.get("ZOHO_REFRESH_TOKEN"),
      });
    }
    if (action === "zoho_groups") {
      if (!zohoConfigured()) return json(req, { error: "Zoho no configurado" }, 400);
      const r = await listGroups();
      return json(req, { ok: r.ok, status: r.status, error: r.error ?? null, count: r.data?.count ?? null,
        groups: (r.data?.groups ?? []).map((g) => ({ zgid: g.zgid, email: g.emailId, name: g.name, members: (g.mailGroupMemberList ?? []).length })) });
    }

    // ── LIST: mapa + preview desired vs actual ──
    if (action === "list") {
      const { data: maps } = await admin.from("email_role_groups").select("*").order("group_name");
      const zoho = await getZohoGroups();
      const desired = await getDesired(admin);
      const preview = ((maps as Mapping[]) ?? []).map((m) => {
        const want = desired.get(m.role) ?? new Set<string>();
        const grp = m.zgid ? zoho.byEmail.get(m.group_email.toLowerCase()) : null;
        const have = grp?.members ?? null;
        return {
          role: m.role, group_email: m.group_email, group_name: m.group_name, enabled: m.enabled,
          provisioned: !!m.zgid, desired: want.size, actual: have ? have.size : null,
          to_add: have ? [...want].filter((e) => !have.has(e)).length : want.size,
          to_remove: have ? [...have].filter((e) => !want.has(e)).length : 0,
          last_synced_at: m.last_synced_at,
        };
      });
      return json(req, { zoho_ok: zoho.ok, zoho_error: zoho.error ?? null, preview });
    }

    // ── PROVISION: crea (o vincula) los grupos en Zoho ──
    if (action === "provision") {
      if (!zohoConfigured()) return json(req, { error: "Zoho no configurado" }, 400);
      const zoho = await getZohoGroups();
      if (!zoho.ok) return json(req, { error: `Zoho: ${zoho.error}` }, 502);
      const desired = await getDesired(admin);
      const { data: maps } = await admin.from("email_role_groups").select("*").eq("enabled", true);
      const results: unknown[] = [];
      for (const m of (maps as Mapping[]) ?? []) {
        if (onlyRole && m.role !== onlyRole) continue;
        if (m.zgid) { results.push({ role: m.role, status: "ya_provisionado", zgid: m.zgid }); continue; }
        const existing = zoho.byEmail.get(m.group_email.toLowerCase());
        if (existing) {
          await admin.from("email_role_groups").update({ zgid: existing.zgid, updated_at: new Date().toISOString() }).eq("role", m.role);
          results.push({ role: m.role, status: "vinculado_existente", zgid: existing.zgid });
          continue;
        }
        const members = [...(desired.get(m.role) ?? new Set<string>())];
        const cr = await createGroup({ emailId: m.group_email, name: m.group_name, accessType: m.access_type as "Public", members });
        if (!cr.ok) { results.push({ role: m.role, status: "error", error: cr.error }); continue; }
        const zgid = String(cr.data?.zgid ?? "");
        await admin.from("email_role_groups").update({ zgid, updated_at: new Date().toISOString() }).eq("role", m.role);
        results.push({ role: m.role, status: "creado", zgid, miembros_iniciales: members.length });
      }
      return json(req, { results });
    }

    // ── SYNC: agrega/saca miembros según user_roles ──
    if (action === "sync") {
      if (!zohoConfigured()) return json(req, { error: "Zoho no configurado" }, 400);
      const zoho = await getZohoGroups();
      if (!zoho.ok) return json(req, { error: `Zoho: ${zoho.error}` }, 502);
      const desired = await getDesired(admin);
      const { data: maps } = await admin.from("email_role_groups").select("*").eq("enabled", true).not("zgid", "is", null);
      const results: unknown[] = [];
      for (const m of (maps as Mapping[]) ?? []) {
        if (onlyRole && m.role !== onlyRole) continue;
        const want = desired.get(m.role) ?? new Set<string>();
        const grp = zoho.byEmail.get(m.group_email.toLowerCase());
        const have = grp?.members ?? new Set<string>();
        const groupSelf = m.group_email.toLowerCase();
        const toAdd = [...want].filter((e) => !have.has(e));
        const toRemove = [...have].filter((e) => !want.has(e) && e !== groupSelf);
        let addErr: string | null = null, remErr: string | null = null;
        if (toAdd.length) { const r = await addGroupMembers(m.zgid!, toAdd); if (!r.ok) addErr = r.error ?? "add failed"; }
        if (toRemove.length) { const r = await removeGroupMembers(m.zgid!, toRemove); if (!r.ok) remErr = r.error ?? "remove failed"; }
        const result = { desired: want.size, added: addErr ? 0 : toAdd.length, removed: remErr ? 0 : toRemove.length, add_error: addErr, remove_error: remErr };
        await admin.from("email_role_groups").update({ last_synced_at: new Date().toISOString(), last_sync_result: result, updated_at: new Date().toISOString() }).eq("role", m.role);
        results.push({ role: m.role, group: m.group_email, ...result });
      }
      return json(req, { results });
    }

    return json(req, { error: `Acción desconocida: ${action ?? "(vacía)"}` }, 400);
  } catch (e) {
    return json(req, { error: String((e as Error)?.message ?? e) }, 500);
  }
});
