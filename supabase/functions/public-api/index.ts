// API pública de Maven — autenticada por API key (no por sesión Maven).
// verify_jwt=false: la auth es la key `mvk_live_...` que mandan en
//   Authorization: Bearer mvk_live_...   (o en el header X-API-Key)
// Fase 1: GET /public-api/creators  (+ /creators/:id) con sus redes sociales.
//
// La key se busca por su hash SHA-256; se chequea que no esté revocada ni
// vencida y que tenga el scope del recurso. Cada request bumpea last_used_at.
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

// --- Normalización de redes: expone { handle, url } por red. Si el valor
// guardado ya es una URL (el usuario pegó el link), se respeta tal cual. ---
const SOCIAL_BASE: Record<string, string> = {
  instagram: "https://instagram.com/",
  tiktok: "https://tiktok.com/@",
  twitter: "https://x.com/",
  youtube: "https://youtube.com/@",
  facebook: "https://facebook.com/",
  reddit: "https://reddit.com/user/",
  telegram: "https://t.me/",
  linkedin: "https://linkedin.com/in/",
};

function social(kind: string, value: unknown): { handle: string | null; url: string | null } | null {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const isUrl = /^https?:\/\//i.test(raw) || /\b[\w-]+\.(com|me|tv|net|org|io|link|to)\b/i.test(raw);
  if (isUrl) {
    return { handle: null, url: /^https?:\/\//i.test(raw) ? raw : `https://${raw}` };
  }
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

type CreatorRow = Record<string, unknown> & { id: string };

function shapeCreator(c: CreatorRow, ofAccounts: Array<{ account_handle: string | null; onlyfans_url: string | null }>) {
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
    id: c.id,
    name: c.name ?? null,
    artistic_name: c.artistic_name ?? null,
    category: c.category ?? null,
    status: c.status ?? null,
    country: c.country ?? null,
    city: c.city ?? null,
    instagram_followers: c.instagram_followers ?? null,
    socials,
    onlyfans_accounts: of,
    updated_at: c.updated_at ?? null,
  };
}

const CREATOR_COLUMNS =
  "id, name, artistic_name, category, status, country, city, instagram_followers, " +
  "instagram_handle, tiktok_handle, twitter_handle, youtube_handle, linkedin_handle, " +
  "facebook_handle, reddit_handle, telegram_handle, onlyfans_url, other_url, link_otras_plataformas, updated_at";

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
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const key_hash = await sha256hex(rawKey);
  const { data: keyRow } = await admin
    .from("api_keys")
    .select("id, scopes, revoked_at, expires_at")
    .eq("key_hash", key_hash)
    .maybeSingle();

  if (!keyRow) return json(req, { error: "unauthorized", message: "API key inválida" }, 401);
  if (keyRow.revoked_at) return json(req, { error: "unauthorized", message: "API key revocada" }, 401);
  if (keyRow.expires_at && new Date(keyRow.expires_at as string).getTime() <= Date.now()) {
    return json(req, { error: "unauthorized", message: "API key vencida" }, 401);
  }
  const scopes: string[] = (keyRow.scopes as string[]) ?? [];

  // bump de uso (best-effort, no bloquea la respuesta): incrementa request_count
  // y setea last_used_at de forma atómica.
  admin.rpc("increment_api_key_usage", { _id: keyRow.id as string }).then(() => {}, () => {});

  // --- Routing ---
  const parts = new URL(req.url).pathname.split("/").filter(Boolean);
  const idx = parts.indexOf("public-api");
  const rest = idx >= 0 ? parts.slice(idx + 1) : parts;
  const resource = rest[0] ?? "";
  const resourceId = rest[1] ?? null;

  // Índice de la API
  if (!resource) {
    return json(req, {
      object: "api",
      name: "Maven Public API",
      version: "v1",
      your_scopes: scopes,
      resources: [{ path: "/creators", scope: "creators:read", methods: ["GET"] }],
    });
  }

  // --- /creators ---
  if (resource === "creators") {
    if (!scopes.includes("creators:read")) {
      return json(req, { error: "forbidden", message: "Tu API key no tiene el scope creators:read" }, 403);
    }
    const url = new URL(req.url);

    // Detalle: /creators/:id
    if (resourceId) {
      const { data: c, error } = await admin
        .from("creators").select(CREATOR_COLUMNS).eq("id", resourceId).maybeSingle();
      if (error) return json(req, { error: "server_error", message: error.message }, 500);
      if (!c) return json(req, { error: "not_found", message: "Creadora no encontrada" }, 404);
      const { data: ofa } = await admin
        .from("creator_of_accounts").select("account_handle, onlyfans_url").eq("creator_id", resourceId);
      return json(req, { object: "creator", data: shapeCreator(c as unknown as CreatorRow, ofa ?? []) });
    }

    // Listado: /creators?status=active&limit=100&offset=0
    const status = url.searchParams.get("status") ?? "active";
    const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") ?? "100", 10) || 100, 1), 500);
    const offset = Math.max(parseInt(url.searchParams.get("offset") ?? "0", 10) || 0, 0);

    let q = admin.from("creators").select(CREATOR_COLUMNS, { count: "exact" });
    if (status !== "all") q = q.eq("status", status);
    q = q.order("name", { ascending: true }).range(offset, offset + limit - 1);
    const { data: rows, count, error } = await q;
    if (error) return json(req, { error: "server_error", message: error.message }, 500);

    const ids = (rows ?? []).map((r) => (r as unknown as CreatorRow).id);
    const ofByCreator = new Map<string, Array<{ account_handle: string | null; onlyfans_url: string | null }>>();
    if (ids.length) {
      const { data: ofa } = await admin
        .from("creator_of_accounts").select("creator_id, account_handle, onlyfans_url").in("creator_id", ids);
      for (const a of ofa ?? []) {
        const cid = (a as { creator_id: string }).creator_id;
        if (!ofByCreator.has(cid)) ofByCreator.set(cid, []);
        ofByCreator.get(cid)!.push(a as { account_handle: string | null; onlyfans_url: string | null });
      }
    }

    const data = (rows ?? []).map((r) => {
      const row = r as unknown as CreatorRow;
      return shapeCreator(row, ofByCreator.get(row.id) ?? []);
    });
    return json(req, { object: "list", resource: "creators", count: count ?? data.length, limit, offset, data });
  }

  return json(req, { error: "not_found", message: `Recurso desconocido: ${resource}` }, 404);
});
