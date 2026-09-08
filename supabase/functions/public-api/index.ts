// API pública de Maven — autenticada por API key (no por sesión Maven).
// verify_jwt=false: la auth es la key `mvk_live_...` que mandan en
//   Authorization: Bearer mvk_live_...   (o en el header X-API-Key)
//
// Recursos (Fase 1): datos de la AGENCIA (no data de fans de OF).
//   GET /public-api/creators           scope creators:read
//   GET /public-api/creators/:id        creators:read
//   GET /public-api/contacts            contacts:read   (+ contacts:phone para PII)
//   GET /public-api/contacts/:id        contacts:read
//   GET /public-api/employees           employees:read
//   GET /public-api/sales               sales:read      (ganancias diarias por creadora)
//   GET /public-api/sales/chatters      sales:chatters  (ventas diarias por chatter)
//   GET /public-api/cowork/time         cowork:read     (tiempo en Cowork por empleado y día)
//   GET /public-api/cowork/time/segments cowork:read    (cada tramo del reloj, al detalle)
//   GET /public-api/cowork/breaks       cowork:read     (cada pausa: baño o break, con tope y exceso)
//
// La key se busca por su hash SHA-256; se chequea que no esté revocada ni vencida,
// que la IP esté permitida (si tiene whitelist) y que tenga el scope del recurso.
import { corsFor } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = (req: Request) =>
  corsFor(req, {
    "Access-Control-Allow-Headers": "authorization, x-api-key, content-type, apikey",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
  });

const json = (req: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });

async function sha256hex(s: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

// --- IP whitelist ---
function clientIp(req: Request): string | null {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("x-real-ip");
}
function ipv4ToInt(ip: string): number | null {
  const p = ip.split(".");
  if (p.length !== 4) return null;
  let n = 0;
  for (const o of p) { const x = Number(o); if (!Number.isInteger(x) || x < 0 || x > 255) return null; n = (n << 8) + x; }
  return n >>> 0;
}
function ipv4InCidr(ip: string, cidr: string): boolean {
  const [base, bitsStr] = cidr.split("/");
  const bits = Number(bitsStr);
  const a = ipv4ToInt(ip), b = ipv4ToInt(base);
  if (a === null || b === null || !Number.isInteger(bits) || bits < 0 || bits > 32) return false;
  if (bits === 0) return true;
  const mask = bits === 32 ? 0xffffffff : (~((1 << (32 - bits)) - 1)) >>> 0;
  return (a & mask) === (b & mask);
}
function ipAllowed(ip: string | null, whitelist: string[]): boolean {
  if (!whitelist || whitelist.length === 0) return true; // sin restricción
  if (!ip) return false;
  for (const entry of whitelist) {
    if (entry === ip) return true;
    if (entry.includes("/") && ipv4InCidr(ip, entry)) return true;
  }
  return false;
}

// --- Normalización de redes: { handle, url } por red. Si el valor ya es URL, se respeta. ---
const SOCIAL_BASE: Record<string, string> = {
  instagram: "https://instagram.com/", tiktok: "https://tiktok.com/@", twitter: "https://x.com/",
  youtube: "https://youtube.com/@", facebook: "https://facebook.com/", reddit: "https://reddit.com/user/",
  telegram: "https://t.me/", linkedin: "https://linkedin.com/in/",
};
function social(kind: string, value: unknown): { handle: string | null; url: string | null } | null {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const isUrl = /^https?:\/\//i.test(raw) || /\b[\w-]+\.(com|me|tv|net|org|io|link|to)\b/i.test(raw);
  if (isUrl) return { handle: null, url: /^https?:\/\//i.test(raw) ? raw : `https://${raw}` };
  const handle = raw.replace(/^@+/, "");
  const base = SOCIAL_BASE[kind];
  return { handle, url: base ? `${base}${handle}` : null };
}
function urlOnly(value: unknown): { url: string } | null {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  return { url: /^https?:\/\//i.test(raw) ? raw : `https://${raw}` };
}

type Row = Record<string, unknown> & { id: string };

function shapeCreator(c: Row, ofAccounts: Array<{ account_handle: string | null; onlyfans_url: string | null }>) {
  const socials: Record<string, unknown> = {};
  const put = (k: string, v: unknown) => { if (v) socials[k] = v; };
  put("instagram", social("instagram", c.instagram_handle));
  put("tiktok", social("tiktok", c.tiktok_handle));
  put("twitter", social("twitter", c.twitter_handle));
  put("youtube", social("youtube", c.youtube_handle));
  put("facebook", social("facebook", c.facebook_handle));
  put("reddit", social("reddit", c.reddit_handle));
  put("telegram", social("telegram", c.telegram_handle));
  put("linkedin", social("linkedin", c.linkedin_handle));
  put("onlyfans", urlOnly(c.onlyfans_url));
  put("other", urlOnly(c.other_url ?? c.link_otras_plataformas));
  const of = ofAccounts
    .map((a) => ({ handle: a.account_handle ?? null, url: urlOnly(a.onlyfans_url)?.url ?? null }))
    .filter((a) => a.handle || a.url);
  return {
    id: c.id, name: c.name ?? null, artistic_name: c.artistic_name ?? null,
    category: c.category ?? null, status: c.status ?? null,
    country: c.country ?? null, city: c.city ?? null,
    instagram_followers: c.instagram_followers ?? null,
    socials, onlyfans_accounts: of, updated_at: c.updated_at ?? null,
  };
}

const CREATOR_COLUMNS =
  "id, name, artistic_name, category, status, country, city, instagram_followers, " +
  "instagram_handle, tiktok_handle, twitter_handle, youtube_handle, linkedin_handle, " +
  "facebook_handle, reddit_handle, telegram_handle, onlyfans_url, other_url, link_otras_plataformas, updated_at";

function pageParams(url: URL, defLimit = 100, maxLimit = 500) {
  const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") ?? String(defLimit), 10) || defLimit, 1), maxLimit);
  const offset = Math.max(parseInt(url.searchParams.get("offset") ?? "0", 10) || 0, 0);
  return { limit, offset };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(req) });
  if (req.method !== "GET") return json(req, { error: "method_not_allowed" }, 405);

  // --- Auth por API key ---
  const authHeader = req.headers.get("Authorization") ?? "";
  const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  const rawKey = (req.headers.get("X-API-Key") || bearer || "").trim();
  if (!rawKey || !rawKey.startsWith("mvk_")) {
    return json(req, { error: "unauthorized", message: "Falta la API key (Authorization: Bearer mvk_live_...)" }, 401);
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const key_hash = await sha256hex(rawKey);
  const { data: keyRow } = await admin
    .from("api_keys")
    .select("id, scopes, ip_whitelist, revoked_at, expires_at")
    .eq("key_hash", key_hash).maybeSingle();

  if (!keyRow) return json(req, { error: "unauthorized", message: "API key inválida" }, 401);
  if (keyRow.revoked_at) return json(req, { error: "unauthorized", message: "API key revocada" }, 401);
  if (keyRow.expires_at && new Date(keyRow.expires_at as string).getTime() <= Date.now()) {
    return json(req, { error: "unauthorized", message: "API key vencida" }, 401);
  }
  const ip = clientIp(req);
  if (!ipAllowed(ip, (keyRow.ip_whitelist as string[]) ?? [])) {
    return json(req, { error: "forbidden", message: `IP ${ip ?? "desconocida"} no está en la whitelist de esta API key` }, 403);
  }
  const scopes: string[] = (keyRow.scopes as string[]) ?? [];
  const need = (s: string) => scopes.includes(s);

  // bump de uso (best-effort, atómico, no bloquea la respuesta)
  admin.rpc("increment_api_key_usage", { _id: keyRow.id as string }).then(() => {}, () => {});

  // --- Routing ---
  const url = new URL(req.url);
  const parts = url.pathname.split("/").filter(Boolean);
  const idx = parts.indexOf("public-api");
  const rest = idx >= 0 ? parts.slice(idx + 1) : parts;
  const resource = rest[0] ?? "";
  const sub = rest[1] ?? null;

  if (!resource) {
    return json(req, {
      object: "api", name: "Maven Public API", version: "v1", your_scopes: scopes,
      resources: [
        { path: "/creators", scope: "creators:read" },
        { path: "/creators/{id}", scope: "creators:read" },
        { path: "/contacts", scope: "contacts:read" },
        { path: "/contacts/{id}", scope: "contacts:read" },
        { path: "/employees", scope: "employees:read" },
        { path: "/hubstaff", scope: "hubstaff:read" },
        { path: "/cowork/time", scope: "cowork:read" },
        { path: "/cowork/time/segments", scope: "cowork:read" },
        { path: "/cowork/breaks", scope: "cowork:read" },
        { path: "/sales", scope: "sales:read" },
        { path: "/sales/chatters", scope: "sales:chatters" },
        { path: "/promolog", scope: "promolog:read" },
      ],
    });
  }

  // ===== /creators =====
  if (resource === "creators") {
    if (!need("creators:read")) return json(req, { error: "forbidden", message: "Falta el scope creators:read" }, 403);

    if (sub) {
      const { data: c, error } = await admin.from("creators").select(CREATOR_COLUMNS).eq("id", sub).maybeSingle();
      if (error) return json(req, { error: "server_error", message: error.message }, 500);
      if (!c) return json(req, { error: "not_found", message: "Creadora no encontrada" }, 404);
      const { data: ofa } = await admin.from("creator_of_accounts").select("account_handle, onlyfans_url").eq("creator_id", sub);
      return json(req, { object: "creator", data: shapeCreator(c as unknown as Row, ofa ?? []) });
    }

    const status = url.searchParams.get("status") ?? "active";
    const { limit, offset } = pageParams(url);
    let q = admin.from("creators").select(CREATOR_COLUMNS, { count: "exact" });
    if (status !== "all") q = q.eq("status", status);
    q = q.order("name", { ascending: true }).range(offset, offset + limit - 1);
    const { data: rows, count, error } = await q;
    if (error) return json(req, { error: "server_error", message: error.message }, 500);

    const ids = (rows ?? []).map((r) => (r as unknown as Row).id);
    const ofByCreator = new Map<string, Array<{ account_handle: string | null; onlyfans_url: string | null }>>();
    if (ids.length) {
      const { data: ofa } = await admin.from("creator_of_accounts").select("creator_id, account_handle, onlyfans_url").in("creator_id", ids);
      for (const a of ofa ?? []) {
        const cid = (a as { creator_id: string }).creator_id;
        if (!ofByCreator.has(cid)) ofByCreator.set(cid, []);
        ofByCreator.get(cid)!.push(a as { account_handle: string | null; onlyfans_url: string | null });
      }
    }
    const data = (rows ?? []).map((r) => {
      const row = r as unknown as Row;
      return shapeCreator(row, ofByCreator.get(row.id) ?? []);
    });
    return json(req, { object: "list", resource: "creators", count: count ?? data.length, limit, offset, data });
  }

  // ===== /contacts =====
  // Directorio comercial: modelos, AGENCIAS y ex-creadoras (closers_contacts).
  // Las agencias NO son un recurso aparte: son este mismo con kind=agencia — viven
  // en la misma tabla separadas por contact_kind, y darles endpoint propio duplicaba
  // el codigo sin agregar un solo campo.
  //
  // ⚠️ PII: telefono y email van ENMASCARADOS salvo que la key tenga contacts:phone.
  // Dentro de Maven ese dato esta restringido a admins (columna solo-admin + permiso
  // "Ver Telefonos" + vista enmascarada), y una API key corre con service_role: se
  // saltea las tres capas. El scope separado es lo unico que la frena, y permite
  // revocar el telefono sin cortar el resto del acceso.
  if (resource === "contacts") {
    if (!need("contacts:read")) return json(req, { error: "forbidden", message: "Falta el scope contacts:read" }, 403);
    const conPii = need("contacts:phone");

    const COLS = "id, name, handle, platform, email, phone, country_code, city, company, " +
      "status, source, contact_kind, record_type, onlyfans_url, created_at, updated_at";

    // Enmascarado: se conservan los ultimos 4 digitos, que alcanzan para cotejar sin
    // entregar el numero. El booleano permite contar cobertura sin ver el dato.
    const enmascararTel = (t: unknown): string | null => {
      const s = String(t ?? "").trim();
      if (!s) return null;
      const d = s.replace(/\D/g, "");
      return d.length >= 4 ? `*****${d.slice(-4)}` : "*****";
    };
    const enmascararMail = (m: unknown): string | null => {
      const s = String(m ?? "").trim();
      if (!s || !s.includes("@")) return s ? "*****" : null;
      const [u, dom] = s.split("@");
      return `${u.slice(0, 1)}***@${dom}`;
    };
    const shape = (c: Row) => ({
      id: c.id,
      nombre: c.name ?? null,
      handle: c.handle ?? null,
      plataforma: c.platform ?? null,
      tipo: c.contact_kind ?? null,           // modelo | agencia | ex_creadora
      estado: c.status ?? null,
      empresa: c.company ?? null,
      pais_codigo: c.country_code ?? null,
      ciudad: c.city ?? null,
      onlyfans_url: c.onlyfans_url ?? null,
      origen: c.source ?? null,               // de que base salio (import, contacto_directo…)
      registro: c.record_type ?? null,        // nuevo | reactivado
      tiene_telefono: !!String(c.phone ?? "").trim(),
      telefono: conPii ? (c.phone ?? null) : enmascararTel(c.phone),
      email: conPii ? (c.email ?? null) : enmascararMail(c.email),
      creado_at: c.created_at ?? null,
      actualizado_at: c.updated_at ?? null,
    });

    if (sub) {
      const { data: c, error } = await admin.from("closers_contacts").select(COLS).eq("id", sub).maybeSingle();
      if (error) return json(req, { error: "server_error", message: error.message }, 500);
      if (!c) return json(req, { error: "not_found", message: "Contacto no encontrado" }, 404);
      return json(req, { object: "contact", pii: conPii, data: shape(c as unknown as Row) });
    }

    const { limit, offset } = pageParams(url);
    const kind = url.searchParams.get("kind");        // modelo | agencia | ex_creadora
    const status = url.searchParams.get("status");    // new | converted | ...
    const country = url.searchParams.get("country");
    const conTel = url.searchParams.get("con_telefono"); // "true" = solo los que tienen

    let q = admin.from("closers_contacts").select(COLS, { count: "exact" });
    if (kind) {
      const validos = ["modelo", "agencia", "ex_creadora"];
      if (!validos.includes(kind)) {
        return json(req, { error: "bad_request", message: `kind invalido. Usa: ${validos.join(" | ")}` }, 400);
      }
      q = q.eq("contact_kind", kind);
    }
    if (status) q = q.eq("status", status);
    if (country) q = q.eq("country_code", country);
    if (conTel === "true") q = q.not("phone", "is", null);
    q = q.order("created_at", { ascending: false }).range(offset, offset + limit - 1);

    const { data: rows, count, error } = await q;
    if (error) return json(req, { error: "server_error", message: error.message }, 500);
    return json(req, {
      object: "list", resource: "contacts",
      pii: conPii,
      count: count ?? (rows ?? []).length, limit, offset,
      data: (rows ?? []).map((r) => shape(r as unknown as Row)),
    });
  }

  // ===== /employees =====
  if (resource === "employees") {
    if (!need("employees:read")) return json(req, { error: "forbidden", message: "Falta el scope employees:read" }, 403);
    const { limit, offset } = pageParams(url);
    const roleFilter = url.searchParams.get("role");

    const { data: profs, count, error } = await admin
      .from("profiles")
      .select("id, full_name, avatar_url, is_owner, created_at", { count: "exact" })
      .order("full_name", { ascending: true }).range(offset, offset + limit - 1);
    if (error) return json(req, { error: "server_error", message: error.message }, 500);

    const ids = (profs ?? []).map((p) => (p as { id: string }).id);
    const roleById = new Map<string, string>();
    if (ids.length) {
      const { data: roles } = await admin.from("user_roles").select("user_id, role").in("user_id", ids);
      for (const r of roles ?? []) roleById.set((r as { user_id: string }).user_id, (r as { role: string }).role);
    }
    let data = (profs ?? []).map((p) => {
      const row = p as { id: string; full_name: string | null; avatar_url: string | null; is_owner: boolean | null; created_at: string | null };
      return {
        id: row.id, name: row.full_name ?? null, role: roleById.get(row.id) ?? null,
        is_owner: row.is_owner ?? false, avatar_url: row.avatar_url ?? null, created_at: row.created_at ?? null,
      };
    });
    if (roleFilter) data = data.filter((e) => (e.role ?? "").toLowerCase() === roleFilter.toLowerCase());
    return json(req, { object: "list", resource: "employees", count: roleFilter ? data.length : (count ?? data.length), limit, offset, data });
  }

  // ===== /sales =====
  if (resource === "sales") {
    // /sales/chatters -> ventas por chatter
    if (sub === "chatters") {
      if (!need("sales:chatters")) return json(req, { error: "forbidden", message: "Falta el scope sales:chatters" }, 403);
      const { limit, offset } = pageParams(url);
      let q = admin.from("chatter_daily_sales")
        .select("blu_employee_id, date, name, total_sales, sold_messages, fans_chatted", { count: "exact" });
      const from = url.searchParams.get("from"), to = url.searchParams.get("to");
      if (from) q = q.gte("date", from);
      if (to) q = q.lte("date", to);
      q = q.order("date", { ascending: false }).range(offset, offset + limit - 1);
      const { data: rows, count, error } = await q;
      if (error) return json(req, { error: "server_error", message: error.message }, 500);
      const data = (rows ?? []).map((r) => {
        const x = r as Record<string, unknown>;
        return {
          date: x.date, chatter: x.name ?? null, blu_employee_id: x.blu_employee_id ?? null,
          total_sales: x.total_sales ?? 0, sold_messages: x.sold_messages ?? 0, fans_chatted: x.fans_chatted ?? 0,
        };
      });
      return json(req, { object: "list", resource: "sales/chatters", count: count ?? data.length, limit, offset, data });
    }
    if (sub) return json(req, { error: "not_found", message: `Sub-recurso de sales desconocido: ${sub}` }, 404);

    // /sales -> ganancias diarias por creadora
    if (!need("sales:read")) return json(req, { error: "forbidden", message: "Falta el scope sales:read" }, 403);
    const { limit, offset } = pageParams(url);
    let q = admin.from("creator_daily_earnings").select(
      "date, creator_id, blu_creator_name, total_gross, subscription_gross, new_sub_gross, recurring_sub_gross, tips_gross, message_gross, post_gross, referral_gross, stream_gross, chargebacks_gross, contribution_pct, active_fans, new_fans",
      { count: "exact" },
    );
    const from = url.searchParams.get("from"), to = url.searchParams.get("to"), creatorId = url.searchParams.get("creator_id");
    if (from) q = q.gte("date", from);
    if (to) q = q.lte("date", to);
    if (creatorId) q = q.eq("creator_id", creatorId);
    q = q.order("date", { ascending: false }).range(offset, offset + limit - 1);
    const { data: rows, count, error } = await q;
    if (error) return json(req, { error: "server_error", message: error.message }, 500);
    const data = (rows ?? []).map((r) => {
      const x = r as Record<string, unknown>;
      return {
        date: x.date, creator_id: x.creator_id ?? null, creator: x.blu_creator_name ?? null,
        total_gross: x.total_gross ?? 0,
        breakdown: {
          subscription: x.subscription_gross ?? 0, new_subscription: x.new_sub_gross ?? 0,
          recurring_subscription: x.recurring_sub_gross ?? 0, tips: x.tips_gross ?? 0,
          message: x.message_gross ?? 0, post: x.post_gross ?? 0,
          referral: x.referral_gross ?? 0, stream: x.stream_gross ?? 0, chargebacks: x.chargebacks_gross ?? 0,
        },
        contribution_pct: x.contribution_pct ?? null, active_fans: x.active_fans ?? null, new_fans: x.new_fans ?? null,
      };
    });
    return json(req, { object: "list", resource: "sales", count: count ?? data.length, limit, offset, data });
  }

  // ===== /hubstaff =====
  if (resource === "hubstaff") {
    if (!need("hubstaff:read")) return json(req, { error: "forbidden", message: "Falta el scope hubstaff:read" }, 403);
    const { limit, offset } = pageParams(url);
    const { data, error } = await admin.rpc("api_hubstaff_daily", {
      _from: url.searchParams.get("from"),
      _to: url.searchParams.get("to"),
      _profile_id: url.searchParams.get("profile_id"),
      _limit: limit,
      _offset: offset,
    });
    if (error) return json(req, { error: "server_error", message: error.message }, 500);
    return json(req, { object: "list", resource: "hubstaff", count: (data ?? []).length, limit, offset, data: data ?? [] });
  }

  // ===== /cowork/time  y  /cowork/time/segments =====
  // El reloj de Cowork (reemplazo de Hubstaff). `time` = por empleado y día,
  // con los segundos repartidos por estado. `time/segments` = cada tramo, al
  // detalle: inicio, fin, estado y motivo, sesión y sala.
  if (resource === "cowork") {
    if (!need("cowork:read")) return json(req, { error: "forbidden", message: "Falta el scope cowork:read" }, 403);
    if (sub !== "time" && sub !== "breaks") return json(req, { error: "not_found", message: "Usa /cowork/time, /cowork/time/segments o /cowork/breaks" }, 404);
    const { limit, offset } = pageParams(url);
    const detalle = rest[2] === "segments";
    const params = {
      _from: url.searchParams.get("from"),
      _to: url.searchParams.get("to"),
      _profile_id: url.searchParams.get("profile_id"),
      _limit: limit,
      _offset: offset,
    };
    // Cada pausa al detalle: bathroom | break, duración, tope vigente de la
    // sesión y si se pasó. Pedido del jefe (08/09): "que la API lo tenga".
    if (sub === "breaks") {
      const { data, error } = await admin.rpc("api_cowork_breaks", params);
      if (error) return json(req, { error: "server_error", message: error.message }, 500);
      return json(req, { object: "list", resource: "cowork/breaks", count: (data ?? []).length, limit, offset, data: data ?? [] });
    }
    if (detalle) {
      const { data, error } = await admin.rpc("api_cowork_time_segments", params);
      if (error) return json(req, { error: "server_error", message: error.message }, 500);
      return json(req, { object: "list", resource: "cowork/time/segments", count: (data ?? []).length, limit, offset, data: data ?? [] });
    }
    const { data, error } = await admin.rpc("cowork_tiempo_diario", {
      _desde: params._from, _hasta: params._to, _user_id: params._profile_id, _limit: limit, _offset: offset,
    });
    if (error) return json(req, { error: "server_error", message: error.message }, 500);
    // El desglose de la pausa (baño vs break) sale del histórico de pausas, por
    // persona y día; se pega a cada fila. `paused_seconds` sigue siendo lo que
    // el reloj vio detenido por pausa; bathroom/break cuentan pausas cerradas.
    const pausasPorClave = new Map<string, Record<string, unknown>>();
    if ((data ?? []).length) {
      const { data: pausas } = await admin.rpc("cowork_pausas_resumen", {
        _desde: params._from, _hasta: params._to, _user_id: params._profile_id, _limit: 2000, _offset: 0,
      });
      for (const p of (pausas ?? []) as Record<string, unknown>[]) pausasPorClave.set(`${p.dia}|${p.user_id}`, p);
    }
    // Nombres en inglés y planos, como el resto de la API.
    const filas = (data ?? []).map((r: Record<string, unknown>) => {
      const pz = pausasPorClave.get(`${r.dia}|${r.user_id}`);
      return {
      date: r.dia,
      profile_id: r.user_id,
      employee: r.nombre,
      active_seconds: r.seg_activo,
      active_hours: r.horas_activas,
      paused_seconds: r.seg_pausa,
      bathroom_breaks: pz?.banos ?? 0,
      bathroom_seconds: pz?.seg_bano ?? 0,
      bathroom_limit_seconds: pz?.bano_limite_seg ?? null,
      bathroom_exceeded: pz?.bano_excedido ?? false,
      breaks: pz?.breaks ?? 0,
      break_seconds: pz?.seg_break ?? 0,
      break_limit_seconds: pz?.break_limite_seg ?? null,
      breaks_exceeded: pz?.breaks_excedidos ?? 0,
      break_excess_seconds: pz?.seg_break_de_mas ?? 0,
      no_camera_seconds: r.seg_sin_camara,
      no_screen_seconds: r.seg_sin_pantalla,
      away_seconds: r.seg_fuera_de_camara,
      in_room_seconds: r.seg_en_sala,
      sessions: r.sesiones,
      first_join: r.primer_ingreso,
      last_leave: r.ultima_salida,
      };
    });
    return json(req, { object: "list", resource: "cowork/time", count: filas.length, limit, offset, data: filas });
  }

  // ===== /promolog =====
  if (resource === "promolog") {
    if (!need("promolog:read")) return json(req, { error: "forbidden", message: "Falta el scope promolog:read" }, 403);
    const { limit, offset } = pageParams(url);
    const { data, error } = await admin.rpc("api_promolog_daily", {
      _from: url.searchParams.get("from"),
      _to: url.searchParams.get("to"),
      _creator_id: url.searchParams.get("creator_id"),
      _network: url.searchParams.get("network"),
      _limit: limit,
      _offset: offset,
    });
    if (error) return json(req, { error: "server_error", message: error.message }, 500);
    return json(req, { object: "list", resource: "promolog", count: (data ?? []).length, limit, offset, data: data ?? [] });
  }

  return json(req, { error: "not_found", message: `Recurso desconocido: ${resource}` }, 404);
});
