// Gestión de API keys de Maven — SOLO admins.
// Acciones: list | create | update | revoke, y las de los webhooks del Messenger
// (webhook_create | webhook_test | webhook_resume | webhook_pause | webhook_delete |
// webhook_deliveries, en ./webhooks.ts). El secreto completo se devuelve UNA sola
// vez al crear; después solo queda el hash + últimos 4 chars para mostrar.
// verify_jwt=false: validamos el JWT y el rol admin acá adentro (mismo gate que
// el frontend: user_roles.role='admin').
import { corsFor } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  esScopeMessenger,
  isValidScope,
  MESSENGER_MAX_DIAS,
  SCOPE_CATALOG,
  SCOPE_GROUPS,
} from "./api-scopes.ts";
import { type ClaveDeMensaje, type Idioma, idiomaDe, msg } from "./mensajes.ts";
import { crearDatos, servirWebhook, webhooksDeLlaves } from "./webhooks.ts";

// Igual que Infloww: hasta 3 keys válidas a la vez, POR AGENCIA. Antes se contaba
// para toda la plataforma: con las 3 de la primera agencia, la segunda no habría
// podido crear ni una.
const MAX_ACTIVE_KEYS = 3;

const corsHeaders = (req: Request) =>
  corsFor(req, {
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  });

const json = (req: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });

// mvk_live_<48 hex> = 24 bytes de aleatoriedad (~192 bits). El prefijo público
// guarda mvk_live_ + los primeros 6 hex; last_four = los últimos 4 para mostrar
// la key enmascarada en la lista.
function generateKey(): { full: string; prefix: string } {
  const buf = new Uint8Array(24);
  crypto.getRandomValues(buf);
  const hex = Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
  return { full: `mvk_live_${hex}`, prefix: `mvk_live_${hex.slice(0, 6)}` };
}

async function sha256hex(s: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

function statusOf(row: { revoked_at: string | null; expires_at: string | null }): string {
  if (row.revoked_at) return "revoked";
  if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) return "expired";
  return "active";
}

// Valida IP v4/v6 o CIDR de forma laxa (no exhaustiva; enforcement exacto en public-api).
function looksLikeIpOrCidr(v: string): boolean {
  const s = v.trim();
  if (!s) return false;
  if (/^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/.test(s)) return true;      // v4 / v4-CIDR
  if (s.includes(":") && /^[0-9a-fA-F:]+(\/\d{1,3})?$/.test(s)) return true; // v6 (laxo)
  return false;
}
// Las keys con Messenger leen conversaciones privadas: IPs EXACTAS (un rango como
// 0.0.0.0/0 deja entrar a todo el mundo) y vencimiento de 90 días como máximo.
// Decisión de Jhon del 25/09. La base lo vuelve a exigir (api_keys_reglas_messenger).
function problemaDeReglasMessenger(ips: string[], vence: Date | null): ClaveDeMensaje | null {
  if (ips.length === 0) return "messengerSinIps";
  if (ips.some((ip) => ip.includes("/"))) return "messengerSinRangos";
  if (!vence) return "messengerSinVencimiento";
  const ahora = Date.now();
  if (vence.getTime() <= ahora) return "vencimientoPasado";
  if (vence.getTime() > ahora + MESSENGER_MAX_DIAS * 86_400_000) return "messengerMaxDias";
  return null;
}

function cleanIpList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((x) => String(x).trim()).filter(Boolean);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(req) });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json(req, { error: "Unauthorized", reason: "missing_auth_header" }, 401);
    }
    const token = authHeader.replace("Bearer ", "");

    const authClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: userErr } = await authClient.auth.getUser(token);
    if (userErr || !user?.id) {
      return json(req, { error: "Unauthorized", reason: "invalid_token" }, 401);
    }
    const callerId = user.id;

    // El cuerpo se lee recién con la sesión validada (a un anónimo no se le lee
    // nada) y trae el idioma de la página: todo mensaje traducido viene de acá para
    // abajo. Los dos 401 de arriba dicen "Unauthorized" a propósito: adminInvoke
    // lo mira para saber que la sesión se cayó. Sin `lang`, español como siempre.
    const body = await req.json().catch(() => ({}));
    const idioma: Idioma = idiomaDe(body);
    const m = (clave: ClaveDeMensaje, vars?: Record<string, string | number>) => msg(idioma, clave, vars);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Gate estricto: SOLO admins (igual que useUserRole().isAdmin en el front).
    const { data: roleRow } = await admin
      .from("user_roles").select("role").eq("user_id", callerId).maybeSingle();
    if (roleRow?.role !== "admin") {
      return json(req, { error: m("soloAdmins") }, 403);
    }

    // ⚠️ AISLAMIENTO ENTRE AGENCIAS. Esta función usa service_role, que salta la
    // RLS: lo único que separa las llaves de una agencia de las de otra es que CADA
    // consulta de abajo filtre por esta agencia. Sin esto, un admin de una agencia
    // veía —y podía editar o revocar por id— las llaves de todas.
    const { data: agenciasDelAdmin, error: tErr } = await admin
      .from("tenant_members").select("tenant_id").eq("user_id", callerId);
    if (tErr) return json(req, { error: tErr.message }, 500);
    if (!agenciasDelAdmin?.length) {
      return json(req, { error: m("sinAgencia") }, 403);
    }
    if (agenciasDelAdmin.length > 1) {
      // Adivinar la agencia acá es justo cómo se termina administrando la ajena.
      return json(req, { error: m("variasAgencias") }, 409);
    }
    const tenantId = (agenciasDelAdmin[0] as { tenant_id: string }).tenant_id;

    const action = body?.action as string | undefined;

    const SELECT_COLS =
      "id, name, key_prefix, last_four, scopes, ip_whitelist, created_at, created_by_email, last_used_at, request_count, expires_at, revoked_at, acts_as_user_id, limite_por_hora";

    // Como quién actúa cada llave, con nombre y si sigue vigente: es lo primero que
    // tiene que ver quien la administra. Si a esa persona la dieron de baja, el API
    // rechaza la llave con 401 aunque acá diga "Activa"; sin esto no hay cómo saberlo.
    // `active` sale de api_key_vigente, la MISMA regla que usa el API (sin baja, sin
    // bloqueo, en la agencia): si la página y el API no coinciden, alguien revoca la
    // llave equivocada. Solo para las llaves activas (a lo sumo MAX_ACTIVE_KEYS).
    // null = no se pudo saber, y la página lo muestra así, sin adivinar.
    const conPersona = async <T extends {
      id: string; acts_as_user_id?: string | null; revoked_at: string | null; expires_at: string | null;
    }>(filas: T[]) => {
      const ids = [...new Set(filas.map((f) => f.acts_as_user_id).filter((x): x is string => !!x))];
      const nombres = new Map<string, string | null>();
      if (ids.length) {
        const { data: perfiles, error: pErr } = await admin
          .from("profiles").select("id, full_name").in("id", ids);
        if (pErr) console.error("[manage-api-keys] personas de las llaves:", pErr.message);
        for (const p of (perfiles ?? []) as { id: string; full_name: string | null }[]) {
          nombres.set(p.id, p.full_name ?? null);
        }
      }
      const vigentes = await Promise.all(filas.map(async (f) => {
        if (statusOf(f) !== "active") return null;
        const { data, error: vErr } = await admin.rpc("api_key_vigente", { _id: f.id });
        if (vErr) console.error("[manage-api-keys] vigencia de la llave:", vErr.message);
        return vErr || typeof data !== "boolean" ? null : data;
      }));
      return filas.map((f, i) => {
        const id = f.acts_as_user_id;
        return { ...f, acts_as: id ? { id, name: nombres.get(id) ?? null, active: vigentes[i] } : null };
      });
    };

    // === LIST ===
    if (action === "list") {
      const [{ data, error }, { data: yoPerfil }] = await Promise.all([
        admin.from("api_keys").select(SELECT_COLS).eq("tenant_id", tenantId).order("created_at", { ascending: false }),
        admin.from("profiles").select("full_name").eq("id", callerId).maybeSingle(),
      ]);
      if (error) return json(req, { error: error.message }, 500);
      // El webhook de cada llave (a lo sumo uno): lo que la página muestra al lado.
      // Si no se pudo consultar, webhooks_unknown: la página dice "no se sabe" (y
      // no ofrece Registrar ni esconde Pausar), en vez de "sin webhook".
      const webhooks = await webhooksDeLlaves(crearDatos(admin, tenantId), (data ?? []).map((k: { id: string }) => k.id));
      const keys = (await conPersona(data ?? [])).map((k) => ({ ...k, status: statusOf(k), webhook: webhooks?.get(k.id) ?? null }));
      return json(req, {
        keys, webhooks_unknown: webhooks === null,
        scope_catalog: SCOPE_CATALOG, scope_groups: SCOPE_GROUPS, max_active_keys: MAX_ACTIVE_KEYS,
        // Quién está mirando: una key nueva actúa como esta persona. La página lo
        // usa para decir de quién son las conversaciones que leería con Messenger.
        you: { id: callerId, name: (yoPerfil as { full_name?: string | null } | null)?.full_name ?? null },
      });
    }

    // === CREATE ===
    if (action === "create") {
      const name = String(body?.name ?? "").trim();
      const scopes: string[] = Array.isArray(body?.scopes) ? body.scopes : [];
      // El vencimiento lo calcula el SERVIDOR a partir de los días elegidos: si lo
      // calculaba el navegador, uno con el reloj adelantado pedía "90 días" y el
      // servidor lo leía como 90 días y un poco, y lo rechazaba. Un minuto de margen
      // cubre la diferencia entre el reloj de la función y el de la base. Si no vienen
      // días (un frontend viejo), se usa expires_at como antes.
      const dias = body?.expires_in_days;
      if (dias !== undefined && (!Number.isInteger(dias) || dias < 0 || dias > 3650)) {
        return json(req, { error: m("diasInvalidos") }, 400);
      }
      const expiresAt: Date | null = dias !== undefined
        ? (dias === 0 ? null : new Date(Date.now() + dias * 86_400_000 - 60_000))
        : (body?.expires_at ? new Date(body.expires_at) : null);
      const ipWhitelist = cleanIpList(body?.ip_whitelist);

      if (!name) return json(req, { error: m("nombreRequerido") }, 400);
      if (scopes.length === 0) return json(req, { error: m("alMenosUnScope") }, 400);
      const bad = scopes.filter((s) => !isValidScope(s));
      if (bad.length) return json(req, { error: m("scopesInvalidos", { lista: bad.join(", ") }) }, 400);
      if (expiresAt && Number.isNaN(expiresAt.getTime())) {
        return json(req, { error: m("fechaInvalida") }, 400);
      }
      const badIps = ipWhitelist.filter((ip) => !looksLikeIpOrCidr(ip));
      if (badIps.length) return json(req, { error: m("ipsInvalidas", { lista: badIps.join(", ") }) }, 400);

      if (scopes.some(esScopeMessenger)) {
        const problema = problemaDeReglasMessenger(ipWhitelist, expiresAt);
        if (problema) return json(req, { error: m(problema, { dias: MESSENGER_MAX_DIAS }) }, 400);
        // Que quien la crea diga que sí sabiendo que la key lee SUS conversaciones.
        // Un frontend viejo en caché no manda esto: no puede crearla sin darse cuenta.
        if (body?.acknowledge_messenger_reads_as !== callerId) {
          return json(req, { error: m("confirmarMessenger") }, 400);
        }
      }

      // Límite de keys activas (no revocadas ni vencidas).
      const nowIso = new Date().toISOString();
      const { count: activeCount } = await admin
        .from("api_keys").select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .is("revoked_at", null)
        .or(`expires_at.is.null,expires_at.gt.${nowIso}`);
      if ((activeCount ?? 0) >= MAX_ACTIVE_KEYS) {
        return json(req, { error: m("maximoDeKeys", { max: MAX_ACTIVE_KEYS }) }, 400);
      }

      const { full, prefix } = generateKey();
      const key_hash = await sha256hex(full);

      const { data: inserted, error } = await admin
        .from("api_keys")
        .insert({
          name, key_prefix: prefix, last_four: full.slice(-4), key_hash, scopes,
          ip_whitelist: ipWhitelist,
          created_by: callerId, created_by_email: user.email ?? null,
          // La llave actúa como quien la crea, y no cambia nunca: la base rechaza
          // cualquier cambio y exige que esa persona sea de esta agencia y esté activa.
          acts_as_user_id: callerId,
          // Explícita. El trigger de la base igual verifica que sea una agencia de
          // quien la crea: el cliente no puede elegir una ajena.
          tenant_id: tenantId,
          expires_at: expiresAt ? expiresAt.toISOString() : null,
        })
        .select("id, name, key_prefix, last_four, scopes, ip_whitelist, created_at, expires_at, revoked_at, acts_as_user_id, limite_por_hora")
        .single();
      if (error) return json(req, { error: error.message }, 500);

      // El secreto completo viaja UNA sola vez. No se vuelve a poder recuperar.
      const [conNombre] = await conPersona([inserted]);
      return json(req, { ...conNombre, key: full, status: "active" }, 201);
    }

    // === UPDATE (editar nombre / scopes / IPs / expiración de una key activa) ===
    if (action === "update") {
      const id = String(body?.id ?? "").trim();
      if (!id) return json(req, { error: m("idRequerido") }, 400);

      const patch: Record<string, unknown> = {};
      if (body?.name !== undefined) {
        const name = String(body.name).trim();
        if (!name) return json(req, { error: m("nombreVacio") }, 400);
        patch.name = name;
      }
      if (body?.scopes !== undefined) {
        const scopes: string[] = Array.isArray(body.scopes) ? body.scopes : [];
        if (scopes.length === 0) return json(req, { error: m("alMenosUnScope") }, 400);
        const bad = scopes.filter((s) => !isValidScope(s));
        if (bad.length) return json(req, { error: m("scopesInvalidos", { lista: bad.join(", ") }) }, 400);
        patch.scopes = scopes;
      }
      if (body?.ip_whitelist !== undefined) {
        const ips = cleanIpList(body.ip_whitelist);
        const badIps = ips.filter((ip) => !looksLikeIpOrCidr(ip));
        if (badIps.length) return json(req, { error: m("ipsInvalidas", { lista: badIps.join(", ") }) }, 400);
        patch.ip_whitelist = ips;
      }
      if (body?.expires_at !== undefined) {
        if (body.expires_at === null) patch.expires_at = null;
        else {
          const d = new Date(body.expires_at);
          if (Number.isNaN(d.getTime())) return json(req, { error: m("fechaInvalida") }, 400);
          patch.expires_at = d.toISOString();
        }
      }
      if (Object.keys(patch).length === 0) return json(req, { error: m("nadaQueActualizar") }, 400);

      // Reglas del Messenger contra lo que la key tiene HOY, no contra lo que dice
      // el pedido.
      const { data: actual, error: aErr } = await admin
        .from("api_keys").select("scopes, ip_whitelist, expires_at, acts_as_user_id")
        .eq("id", id).eq("tenant_id", tenantId).is("revoked_at", null).maybeSingle();
      if (aErr) return json(req, { error: aErr.message }, 500);
      if (!actual) return json(req, { error: m("noExisteORevocada") }, 404);
      const hoy = actual as { scopes: string[]; ip_whitelist: string[]; expires_at: string | null; acts_as_user_id: string };
      const teniaMessenger = (hoy.scopes ?? []).some(esScopeMessenger);
      const scopesNuevos = (patch.scopes as string[] | undefined) ?? hoy.scopes ?? [];
      const tendraMessenger = scopesNuevos.some(esScopeMessenger);
      if (tendraMessenger && !teniaMessenger) {
        // Las 3 keys de hoy actúan como el CEO y las usan integraciones: sumarles
        // Messenger les daría sus chats sin que nadie lo note.
        return json(req, { error: m("messengerSoloNuevas") }, 400);
      }
      if (tendraMessenger) {
        // Solo la persona como la que actúa puede editarla (cualquier admin la revoca).
        if (hoy.acts_as_user_id !== callerId) {
          return json(req, { error: m("messengerSoloDueno") }, 403);
        }
        const ips = (patch.ip_whitelist as string[] | undefined) ?? hoy.ip_whitelist ?? [];
        const venceNuevo = patch.expires_at === undefined
          ? (hoy.expires_at ? new Date(hoy.expires_at) : null)
          : (patch.expires_at === null ? null : new Date(patch.expires_at as string));
        const problema = problemaDeReglasMessenger(ips, venceNuevo);
        if (problema) return json(req, { error: m(problema, { dias: MESSENGER_MAX_DIAS }) }, 400);
        if (hoy.expires_at && venceNuevo && venceNuevo.getTime() > new Date(hoy.expires_at).getTime()) {
          return json(req, { error: m("messengerNoExtender") }, 400);
        }
      }

      const { data, error } = await admin
        .from("api_keys").update(patch).eq("id", id).eq("tenant_id", tenantId).is("revoked_at", null)
        .select(SELECT_COLS);
      if (error) return json(req, { error: error.message }, 500);
      if (!data?.length) return json(req, { error: m("noExisteORevocada") }, 404);
      const [conNombre] = await conPersona(data);
      return json(req, { ...conNombre, status: statusOf(data[0]) });
    }

    // === REVOKE ===
    if (action === "revoke") {
      const id = String(body?.id ?? "").trim();
      if (!id) return json(req, { error: m("idRequerido") }, 400);
      const { data, error } = await admin
        .from("api_keys")
        .update({ revoked_at: new Date().toISOString(), revoked_by: callerId })
        .eq("id", id).eq("tenant_id", tenantId).is("revoked_at", null).select("id");
      if (error) return json(req, { error: error.message }, 500);
      if (!data?.length) return json(req, { error: m("noExisteOYaRevocada") }, 404);
      return json(req, { success: true, id });
    }

    // === WEBHOOKS del Messenger ===
    if (typeof action === "string" && action.startsWith("webhook_")) {
      const r = await servirWebhook(action, (body ?? {}) as Record<string, unknown>, {
        datos: crearDatos(admin, tenantId),
        callerId,
        idioma,
      });
      return json(req, r.cuerpo, r.estado);
    }

    return json(req, { error: m("accionDesconocida", { accion: action ?? (idioma === "en" ? "(empty)" : "(vacía)") }) }, 400);
  } catch (e) {
    return json(req, { error: String((e as Error)?.message ?? e) }, 500);
  }
});
