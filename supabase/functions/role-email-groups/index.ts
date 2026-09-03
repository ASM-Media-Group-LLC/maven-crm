// Grupos de correo por rol de Maven (listas de distribución Zoho) con auto-sync.
// SOLO admins. La membresía se mantiene al día contra user_roles.
// Acciones: list | provision | sync (+ diagnósticos zoho_whoami / zoho_groups).
import { corsFor } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  listGroups, createGroup, addGroupMembers, removeGroupMembers, addGroupAliases, zohoConfigured,
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

// Dominio de los grupos = el de las casillas (MAIL_TEAM_DOMAIN; mismo valor que
// DOMINIO_CASILLA en _shared/mail-provision.ts — mantener en sincronía).
const GROUP_DOMAIN = Deno.env.get("MAIL_TEAM_DOMAIN") || "maven-ai.me";

/** "Operations Sales" → "operations-sales". Sin acentos, solo [a-z0-9-]. */
function slugRol(rol: string): string {
  return rol.normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

// AUTO-DESCUBRIMIENTO: cada rol de roles_config sin fila en email_role_groups
// recibe su mapeo (slug@dominio) para que provision/sync le creen el grupo.
// Regla: rol activo Y (custom —no is_system— O con al menos un usuario). Así
// "Operations Sales" o "LLG" tienen grupo apenas se crean, pero los roles base
// legacy del sistema sin gente (closer, supervisor) no ensucian Zoho.
// deno-lint-ignore no-explicit-any
async function ensureMappings(admin: any, desired: Map<string, Set<string>>): Promise<string[]> {
  const { data: roles, error } = await admin
    .from("roles_config").select("name, is_system").eq("is_active", true);
  if (error) throw new Error(`roles_config falló (${error.message})`);
  const { data: maps } = await admin.from("email_role_groups").select("role, group_email");
  const mapped = new Set(((maps ?? []) as { role: string }[]).map((m) => m.role));
  const emailsUsados = new Set(((maps ?? []) as { group_email: string }[]).map((m) => m.group_email.toLowerCase()));
  const creados: string[] = [];
  for (const r of (roles ?? []) as { name: string; is_system: boolean }[]) {
    if (mapped.has(r.name)) continue;
    const tieneGente = (desired.get(r.name)?.size ?? 0) > 0;
    if (r.is_system && !tieneGente) continue;
    const slug = slugRol(r.name);
    if (!slug) continue;
    const group_email = `${slug}@${GROUP_DOMAIN}`;
    if (emailsUsados.has(group_email)) {
      console.warn(`[role-email-groups] colisión de slug para "${r.name}": ${group_email} ya existe — mapear a mano`);
      continue;
    }
    const { error: insErr } = await admin
      .from("email_role_groups").insert({ role: r.name, group_email, group_name: r.name });
    if (insErr) { console.warn(`[role-email-groups] no pude mapear "${r.name}": ${insErr.message}`); continue; }
    emailsUsados.add(group_email);
    creados.push(r.name);
  }
  return creados;
}

// Crea (o vincula, si ya existía en Zoho) los grupos mapeados que aún no tienen zgid.
// deno-lint-ignore no-explicit-any
async function provisionMissing(admin: any, zoho: { byEmail: Map<string, { zgid: string }> }, desired: Map<string, Set<string>>, onlyRole?: string): Promise<unknown[]> {
  const { data: maps } = await admin.from("email_role_groups").select("*").eq("enabled", true).is("zgid", null);
  const results: unknown[] = [];
  for (const m of (maps as Mapping[]) ?? []) {
    if (onlyRole && m.role !== onlyRole) continue;
    const existing = zoho.byEmail.get(m.group_email.toLowerCase());
    if (existing) {
      await admin.from("email_role_groups").update({ zgid: existing.zgid, updated_at: new Date().toISOString() }).eq("role", m.role);
      results.push({ role: m.role, status: "vinculado_existente", zgid: existing.zgid });
      continue;
    }
    const members = [...(desired.get(m.role) ?? new Set<string>())];
    // Zoho exige al menos un miembro para crear un grupo (mailGroupMemberList es
    // obligatorio): con la lista vacía la creación falla. Un rol recién creado sin
    // nadie asignado (caso LLG) queda MAPEADO y pendiente; en cuanto alguien
    // reciba el rol, el trigger de user_roles dispara sync y acá se crea con esa
    // persona adentro. Sin placeholders ni errores repetidos en cada corrida.
    if (members.length === 0) {
      results.push({ role: m.role, status: "pendiente_sin_miembros", detalle: "Zoho exige ≥1 miembro; se crea cuando alguien tenga el rol" });
      continue;
    }
    const cr = await createGroup({ emailId: m.group_email, name: m.group_name, accessType: m.access_type as "Public", members });
    if (!cr.ok) { results.push({ role: m.role, status: "error", error: cr.error }); continue; }
    const zgid = String(cr.data?.zgid ?? "");
    await admin.from("email_role_groups").update({ zgid, updated_at: new Date().toISOString() }).eq("role", m.role);
    results.push({ role: m.role, status: "creado", zgid, miembros_iniciales: members.length });
  }
  return results;
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
    // El camino cron/trigger puede: sincronizar (idempotente) y LEER (diagnósticos).
    // Lo que muta estructura (provision) sigue exigiendo JWT de admin.
    const CRON_ALLOWED = new Set(["sync", "list", "zoho_groups", "zoho_group_raw"]);
    if (isCron && !CRON_ALLOWED.has(action ?? "")) {
      return json(req, { error: "cron: solo sync / list / zoho_groups / zoho_group_raw" }, 403);
    }

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

    // Diagnóstico CRUDO: los objetos de grupo tal cual los devuelve Zoho (incluye
    // campos que ZohoGroup no tipa, p. ej. alias de correo). body.q = substring a
    // buscar en TODO el JSON del grupo (emailId, alias, nombre…); sin q devuelve
    // las claves de cada grupo para descubrir dónde vive cada dato.
    if (action === "zoho_group_raw") {
      if (!zohoConfigured()) return json(req, { error: "Zoho no configurado" }, 400);
      const r = await listGroups();
      if (!r.ok) return json(req, { ok: false, error: r.error ?? null }, 502);
      const q = String(body?.q ?? "").toLowerCase();
      const all = (r.data?.groups ?? []) as unknown as Record<string, unknown>[];
      const hit = q
        ? all.filter((g) => JSON.stringify(g).toLowerCase().includes(q))
        : all.map((g) => ({ emailId: g.emailId, keys: Object.keys(g) }));
      return json(req, { ok: true, total: all.length, q, hit });
    }

    // ── ADD_ALIAS (solo admin JWT): suma direcciones alternativas a un grupo ──
    // body: { role, aliases: ["hhrr@maven-ai.me"] }. Es una mutación estructural,
    // así que NO está en CRON_ALLOWED: el cron/trigger no puede invocarla.
    if (action === "add_alias") {
      if (!zohoConfigured()) return json(req, { error: "Zoho no configurado" }, 400);
      const rol = String(body?.role ?? "").trim();
      const aliases: string[] = Array.isArray(body?.aliases)
        ? body.aliases.map((a: unknown) => String(a).trim().toLowerCase()).filter(Boolean)
        : [];
      if (!rol || !aliases.length) return json(req, { error: "role y aliases[] son requeridos" }, 400);
      const { data: m } = await admin.from("email_role_groups").select("zgid, group_email").eq("role", rol).maybeSingle();
      if (!m?.zgid) return json(req, { error: `el rol "${rol}" no tiene grupo provisionado` }, 404);
      const r = await addGroupAliases(m.zgid as string, aliases);
      return json(req, { ok: r.ok, status: r.status ?? null, error: r.error ?? null, group: m.group_email, aliases });
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
      const mapeados_nuevos = await ensureMappings(admin, desired);
      const results = await provisionMissing(admin, zoho, desired, onlyRole);
      return json(req, { mapeados_nuevos, results });
    }

    // ── SYNC: agrega/saca miembros según user_roles ──
    if (action === "sync") {
      if (!zohoConfigured()) return json(req, { error: "Zoho no configurado" }, 400);
      let zoho = await getZohoGroups();
      if (!zoho.ok) return json(req, { error: `Zoho: ${zoho.error}` }, 502);
      const desired = await getDesired(admin);
      // Auto-descubrir roles nuevos y crear sus grupos ANTES de reconciliar: así
      // "creé un rol" o "cambié a alguien de rol" quedan en Zoho en la misma
      // corrida (los triggers de user_roles / roles_config disparan este sync).
      const mapeados_nuevos = await ensureMappings(admin, desired);
      const provisionados = await provisionMissing(admin, zoho, desired, onlyRole);
      if (provisionados.length) {
        // Grupos recién creados no están en la lista leída arriba: releer para
        // no intentar re-agregar a miembros que ya entraron en la creación.
        zoho = await getZohoGroups();
        if (!zoho.ok) return json(req, { error: `Zoho (releer): ${zoho.error}` }, 502);
      }
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
      return json(req, { mapeados_nuevos, provisionados, results });
    }

    return json(req, { error: `Acción desconocida: ${action ?? "(vacía)"}` }, 400);
  } catch (e) {
    return json(req, { error: String((e as Error)?.message ?? e) }, 500);
  }
});
