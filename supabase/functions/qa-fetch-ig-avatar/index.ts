import { corsFor } from "../_shared/cors.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encode as encodeBase64 } from "https://deno.land/std@0.168.0/encoding/base64.ts";

// qa-fetch-ig-avatar — fetches an Instagram profile photo for a
// qa_models row and persists it as a base64 data URL in
// qa_models.avatar_data_url. Port verbatim de kash lib/avatar.ts:
// 3 estrategias en cascada (web_profile_info API → og:image scrape →
// unavatar.io fallback), runtime Deno con `fetch` global.
//
// Llamada: { model_id?: string, ig_url?: string }
//   - Si viene model_id, leemos el ig_url de la BD y al terminar
//     updateamos avatar_data_url en la misma row.
//   - Si viene solo ig_url (one-off lookup), devolvemos el data URL
//     sin tocar la BD.

const corsHeaders = (req: Request) => corsFor(req, { "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version" });

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36";

const FETCH_TIMEOUT_MS = 10_000;

function extractIgUsername(input: string | null | undefined): string | null {
  if (!input) return null;
  const s = input.trim();
  if (!s) return null;
  const atMatch = s.match(/^@?([a-zA-Z0-9._]{1,30})$/);
  if (atMatch) return atMatch[1];
  const urlMatch = s.match(/instagram\.com\/([a-zA-Z0-9._]{1,30})/i);
  if (urlMatch) return urlMatch[1];
  return null;
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchAsDataUrl(url: string): Promise<string | null> {
  try {
    const isIgCdn = /cdninstagram\.com|fbcdn\.net/i.test(url);
    const res = await fetchWithTimeout(url, {
      headers: {
        "user-agent": BROWSER_UA,
        accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        ...(isIgCdn
          ? {
              referer: "https://www.instagram.com/",
              origin: "https://www.instagram.com",
              "sec-fetch-site": "cross-site",
              "sec-fetch-mode": "no-cors",
              "sec-fetch-dest": "image",
            }
          : {}),
      },
    });
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.startsWith("image/")) return null;
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.byteLength < 500) return null;
    return `data:${contentType};base64,${encodeBase64(buf)}`;
  } catch {
    return null;
  }
}

// Strategy 1: Instagram web_profile_info JSON API.
async function fetchFromWebApi(username: string): Promise<string | null> {
  try {
    const res = await fetchWithTimeout(
      `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`,
      {
        headers: {
          "user-agent": BROWSER_UA,
          accept: "*/*",
          "x-ig-app-id": "936619743392459",
          "x-asbd-id": "129477",
          "x-requested-with": "XMLHttpRequest",
          "accept-language": "en-US,en;q=0.9",
          "sec-fetch-site": "same-origin",
          "sec-fetch-mode": "cors",
          "sec-fetch-dest": "empty",
          referer: `https://www.instagram.com/${username}/`,
          origin: "https://www.instagram.com",
        },
      },
    );
    if (!res.ok) return null;
    const data = await res.json().catch(() => null) as
      | { data?: { user?: { profile_pic_url_hd?: string; profile_pic_url?: string } } }
      | null;
    const picUrl = data?.data?.user?.profile_pic_url_hd ?? data?.data?.user?.profile_pic_url;
    if (!picUrl) return null;
    return await fetchAsDataUrl(picUrl);
  } catch {
    return null;
  }
}

// Strategy 2: scrape public HTML for og:image / profile_pic_url_hd.
function decodeIgUrl(raw: string): string {
  return raw
    .replace(/\\u0026/g, "&")
    .replace(/\\\//g, "/")
    .replace(/&amp;/g, "&");
}

function findProfilePicInHtml(html: string): string | null {
  const hd = html.match(/"profile_pic_url_hd":"([^"]+)"/);
  if (hd?.[1]) return decodeIgUrl(hd[1]);
  const metaMatch = html.match(/<meta\b[^>]*\bproperty=["']og:image["'][^>]*>/i);
  if (metaMatch) {
    const contentMatch = metaMatch[0].match(/\bcontent=["']([^"']+)["']/i);
    if (contentMatch?.[1]) return decodeIgUrl(contentMatch[1]);
  }
  const std = html.match(/"profile_pic_url":"([^"]+)"/);
  if (std?.[1]) return decodeIgUrl(std[1]);
  return null;
}

async function fetchFromOgScrape(username: string): Promise<string | null> {
  try {
    const res = await fetchWithTimeout(`https://www.instagram.com/${username}/`, {
      headers: {
        "user-agent": BROWSER_UA,
        accept: "text/html,application/xhtml+xml",
        "accept-language": "en-US,en;q=0.9",
      },
    });
    if (!res.ok) return null;
    const html = await res.text();
    const imgUrl = findProfilePicInHtml(html);
    if (!imgUrl) return null;
    return await fetchAsDataUrl(imgUrl);
  } catch {
    return null;
  }
}

// Strategy 3: unavatar.io fallback (rate-limited for anon).
async function fetchFromUnavatar(username: string): Promise<string | null> {
  return await fetchAsDataUrl(
    `https://unavatar.io/instagram/${username}?fallback=false`,
  );
}

async function fetchAvatarDataUrl(username: string): Promise<string | null> {
  return (
    (await fetchFromWebApi(username)) ??
    (await fetchFromOgScrape(username)) ??
    (await fetchFromUnavatar(username))
  );
}

interface InvokeBody {
  model_id?: string;
  ig_url?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(req) });

  try {
    const body = (await req.json()) as InvokeBody;

    let igUrl = body.ig_url ?? null;
    let modelId = body.model_id?.trim() || null;
    let supabase: ReturnType<typeof createClient> | null = null;

    // Si vino un model_id, leemos su ig_url. Necesitamos el service
    // role porque updatear avatar_data_url requiere el RLS scoping
    // al tenant — y la función no tiene contexto de auth.uid() del
    // user invoker (lo recibe pero el client lo perdería).
    if (modelId) {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      supabase = createClient(supabaseUrl, serviceKey);
      const { data: model, error } = await supabase
        .from("qa_models")
        .select("id, ig_url, avatar_data_url")
        .eq("id", modelId)
        .maybeSingle();
      if (error) throw error;
      if (!model) {
        return new Response(JSON.stringify({ error: "Modelo no encontrado." }), {
          status: 404,
          headers: { ...corsHeaders(req), "Content-Type": "application/json" },
        });
      }
      // Si ya tiene avatar y no estamos forzando refresh, salimos.
      if (model.avatar_data_url) {
        return new Response(
          JSON.stringify({ ok: true, cached: true, avatar_data_url: model.avatar_data_url }),
          { headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
        );
      }
      igUrl = (model.ig_url as string) ?? null;
    }

    const username = extractIgUsername(igUrl);
    if (!username) {
      return new Response(
        JSON.stringify({ error: "No se pudo extraer username de IG." }),
        { status: 400, headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
      );
    }

    const dataUrl = await fetchAvatarDataUrl(username);
    if (!dataUrl) {
      return new Response(
        JSON.stringify({
          error:
            "No se pudo obtener la foto de perfil. Cuenta privada o IG está bloqueando el scrape.",
        }),
        { status: 502, headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
      );
    }

    if (modelId && supabase) {
      const { error: updateErr } = await supabase
        .from("qa_models")
        .update({ avatar_data_url: dataUrl })
        .eq("id", modelId);
      if (updateErr) throw updateErr;
    }

    return new Response(
      JSON.stringify({ ok: true, avatar_data_url: dataUrl, username }),
      { headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("qa-fetch-ig-avatar error:", e);
    return new Response(
      JSON.stringify({ error: (e as Error).message ?? "Error interno." }),
      { status: 500, headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
    );
  }
});
