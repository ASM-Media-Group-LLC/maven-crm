// Wrapper sobre ScrapeCreators API — reemplazo de apify.ts.
//
// Migrado desde Apify (2026-05) porque la cuenta Apify quedó sin
// créditos y ScrapeCreators ofrece la misma información de IG profiles
// con un pricing más predecible (1 crédito por request, no por item).
//
// La interfaz pública (`runProfileScrape`, `runPostScrape`,
// `runHashtagDiscovery`) se mantiene idéntica para que los handlers
// (enrich.ts / discover.ts / refreshPosts.ts) no requieran cambios
// salvo el path del import.
//
// Auth: header `x-api-key`. Env var: `SCRAPECREATORS_API_KEY`.
// Base URL: `SCRAPECREATORS_BASE_URL` (default api.scrapecreators.com).
//
// Limitación conocida: ScrapeCreators no expone un hashtag scraper de
// IG en el MVP. `runHashtagDiscovery` queda como stub que lanza error
// explicativo — el caller (handleDiscoverHashtag) ya maneja errores
// y queda inhabilitado hasta que migremos a `/v2/instagram/reels/search`
// o usemos otra estrategia.

import { markCreditsDepleted, recordSpend } from "./budget.ts";

const API_KEY = process.env.SCRAPECREATORS_API_KEY;
const BASE_URL = process.env.SCRAPECREATORS_BASE_URL ?? "https://api.scrapecreators.com";

if (!API_KEY) {
  console.warn("scouter-worker: SCRAPECREATORS_API_KEY ausente — discovery jobs van a fallar.");
}

// Costo: 1 crédito por request. ScrapeCreators no publica precio por
// crédito vs Apify — usamos el mismo número que antes para que la
// telemetría de budget siga comparable durante el cutover.
const COST_PER_REQUEST_USD = 0.0023;

// Detector de respuestas "sin créditos en la cuenta" de ScrapeCreators.
// Cubre:
//   · HTTP 402 Payment Required (estándar para "pagá").
//   · HTTP 403/429 cuyo body menciona credit/insufficient/depleted/balance.
const CREDIT_DEPLETED_RE =
  /credit|insufficient|depleted|exhausted|balance|out of (credits|funds)/i;

function looksLikeCreditDepleted(status: number, body: string): boolean {
  if (status === 402) return true;
  if ((status === 403 || status === 429) && CREDIT_DEPLETED_RE.test(body)) return true;
  return false;
}

// Helper genérico — agrega auth header + chequeos comunes. Si la API
// responde "credit depleted", seteamos cooldown global ANTES de tirar
// el error, así el queue (queue.ts) puede detectarlo y rescheduleNoAttempt.
async function scFetch<T>(path: string, params: Record<string, string>): Promise<T> {
  if (!API_KEY) throw new Error("SCRAPECREATORS_API_KEY no configurada.");
  const url = new URL(BASE_URL + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, {
    method: "GET",
    headers: { "x-api-key": API_KEY },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    if (looksLikeCreditDepleted(res.status, text)) {
      const errMsg = `ScrapeCreators credits depleted (${res.status}): ${text.slice(0, 200) || res.statusText}`;
      await markCreditsDepleted(errMsg);
      // Mensaje con prefijo reconocible para que queue.ts lo trate como
      // rescheduleNoAttempt en vez de consumir un attempt del job.
      throw new Error(`scrapecreators-credits-depleted: ${errMsg}`);
    }
    throw new Error(`ScrapeCreators ${path} ${res.status}: ${text || res.statusText}`);
  }
  return (await res.json()) as T;
}

// ─── Profile ──────────────────────────────────────────────────────────

interface ProfileResponse {
  data?: {
    user?: {
      username?: string;
      full_name?: string;
      biography?: string;
      profile_pic_url?: string;
      profile_pic_url_hd?: string;
      external_url?: string;
      is_verified?: boolean;
      edge_followed_by?: { count?: number };
      edge_follow?: { count?: number };
    };
  };
}

// Shape devuelto al handler — igual al que producía apify.ts (mantenemos
// los nombres camelCase para no romper los consumers).
export interface IgProfileItem {
  username?: string;
  url?: string;
  fullName?: string;
  biography?: string;
  followersCount?: number;
  followsCount?: number;
  verified?: boolean;
  profilePicUrl?: string;
  profilePicUrlHD?: string;
  externalUrl?: string;
  [k: string]: unknown;
}

/** Trae perfil(es) de IG. ScrapeCreators es 1 request por handle, así
 *  que iteramos secuencialmente. Para batches grandes el handler decide
 *  el throttle. Mantiene la misma signatura que apify.ts:runProfileScrape. */
export async function runProfileScrape(
  usernames: string[],
  tenantId: string,
): Promise<IgProfileItem[]> {
  const out: IgProfileItem[] = [];
  let requestsMade = 0;
  for (const raw of usernames) {
    const handle = raw.replace(/^@/, "").trim();
    if (!handle) continue;
    try {
      const json = await scFetch<ProfileResponse>("/v1/instagram/profile", {
        handle,
        trim: "false",
      });
      requestsMade += 1;
      const u = json.data?.user;
      if (!u || !u.username) continue;
      out.push({
        username: u.username,
        url: `https://www.instagram.com/${u.username}/`,
        fullName: u.full_name,
        biography: u.biography,
        followersCount: u.edge_followed_by?.count,
        followsCount: u.edge_follow?.count,
        verified: u.is_verified,
        profilePicUrl: u.profile_pic_url,
        profilePicUrlHD: u.profile_pic_url_hd,
        externalUrl: u.external_url,
      });
    } catch (e) {
      // Una cuenta privada / 404 / etc. NO debe romper el batch — solo
      // saltea ese handle. El handler ve menos items que pidió y decide.
      console.warn(`scrapecreators profile skip ${handle}:`, (e as Error).message);
    }
  }
  if (requestsMade > 0) {
    await recordSpend(tenantId, requestsMade * COST_PER_REQUEST_USD, requestsMade);
  }
  return out;
}

// ─── Posts ────────────────────────────────────────────────────────────

interface PostsResponse {
  items?: Array<{
    code?: string;
    pk?: string;
    caption?: { text?: string } | null;
    like_count?: number;
    taken_at?: number;
    media_type?: number;
    is_video?: boolean;
    video_versions?: Array<unknown>;
  }>;
}

export interface PostItem {
  url: string;
  caption: string | null;
  like_count: number | null;
  posted_at: string | null;
  is_video: boolean | null;
}

const POSTS_PER_LEAD = parseInt(process.env.SCRAPECREATORS_POSTS_PER_LEAD ?? "5", 10);

export async function runPostScrape(
  username: string,
  tenantId: string,
  limit = POSTS_PER_LEAD,
): Promise<PostItem[]> {
  const handle = username.replace(/^@/, "").trim();
  const json = await scFetch<PostsResponse>("/v2/instagram/user/posts", {
    handle,
    trim: "true",
  });
  await recordSpend(tenantId, COST_PER_REQUEST_USD, 1);

  const items = (json.items ?? []).slice(0, limit);
  return items
    .map((it) => {
      const code = it.code;
      const url = code ? `https://www.instagram.com/p/${code}/` : "";
      const captionText = it.caption?.text ?? null;
      const isVideo = it.is_video ?? (Array.isArray(it.video_versions) && it.video_versions.length > 0);
      const postedAt = it.taken_at ? new Date(it.taken_at * 1000).toISOString() : null;
      return {
        url,
        caption: captionText,
        like_count: it.like_count ?? null,
        posted_at: postedAt,
        is_video: isVideo ?? false,
      };
    })
    .filter((p) => !!p.url);
}

// ─── Hashtag ──────────────────────────────────────────────────────────
//
// Implementado vía /v2/instagram/reels/search (ScrapeCreators no expone
// un endpoint dedicado de IG hashtag scrape). Estrategia:
//   1. Pedimos reels que contengan el hashtag en su caption.
//   2. Extraemos los usernames únicos de los autores.
//   3. El caller (handleDiscoverHashtag) los pasa a runProfileScrape.
//
// Costo: 1 crédito por search request. Devuelve hasta ~25 reels por
// página; con esos sacamos ~15-25 autores únicos típicamente.

interface ReelsSearchResponse {
  reels?: Array<{
    media?: {
      code?: string;
      user?: { username?: string };
      caption?: { text?: string } | null;
    };
  }>;
}

export async function runHashtagDiscovery(
  hashtag: string,
  tenantId: string,
  maxItems?: number,
): Promise<Array<{ username: string; postUrl: string }>> {
  const clean = hashtag.replace(/^#/, "").trim();
  if (!clean) return [];

  // /v2/instagram/reels/search devuelve reels populares con ese tag.
  // El query param se llama `query` (no `keyword` — ese era el bug:
  // la API devolvía 400 "You must provide a query").
  const json = await scFetch<ReelsSearchResponse>(
    "/v2/instagram/reels/search",
    { query: clean, trim: "true" },
  );
  await recordSpend(tenantId, COST_PER_REQUEST_USD, 1);

  const seenUsers = new Set<string>();
  const out: Array<{ username: string; postUrl: string }> = [];
  for (const reel of json.reels ?? []) {
    const username = reel.media?.user?.username?.trim();
    const code = reel.media?.code;
    if (!username || !code) continue;
    if (seenUsers.has(username)) continue;
    seenUsers.add(username);
    out.push({
      username,
      postUrl: `https://www.instagram.com/reel/${code}/`,
    });
    if (maxItems && out.length >= maxItems) break;
  }
  return out;
}
