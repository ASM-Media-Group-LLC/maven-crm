import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encode as encodeBase64 } from "https://deno.land/std@0.168.0/encoding/base64.ts";

// scouter-spam-account-scan — al registrarse una cuenta de spam nueva
// (o al re-escanear mensualmente), fetcheamos datos públicos del perfil
// de IG y le pedimos a Sonnet 4.6 que evalúe qué tan creíble se ve la
// cuenta desde la perspectiva de una creadora target. Persistimos
// score (0-100) + análisis estructurado en scouter_spammer_accounts.
//
// Endpoints:
//   POST { account_id: uuid } → escanea esa fila específica.
//   POST { instagram_handle: string } → escanea por handle (busca la
//     fila más reciente del tenant; útil para fire-and-forget desde el
//     hook del create).

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

interface IgProfileSnapshot {
  username: string;
  full_name: string | null;
  biography: string | null;
  followers_count: number | null;
  following_count: number | null;
  posts_count: number | null;
  is_verified: boolean | null;
  is_private: boolean | null;
  is_business_account: boolean | null;
  external_url: string | null;
  profile_pic_url: string | null;
  account_created_year: number | null;
  // IG aplica este flag automáticamente a cuentas que detecta como
  // adult/spam/reportadas. Cuando es true, los endpoints públicos
  // devuelven 404 "Profile is restricted" o `isRestricted:true` y
  // no podemos leer bio/followers/posts sin cookies de sesión.
  is_restricted: boolean;
}

interface ScanRequest {
  account_id?: string;
  instagram_handle?: string;
}

interface AiAnalysis {
  score: number;
  summary: string;
  would_respond: "si" | "no" | "tal_vez";
  why_not: string;
  strengths: string[];
  red_flags: Array<{ signal: string; severity: "low" | "medium" | "high" }>;
  urgent_improvements: string[];
  recommendations: string[];
  scanned_at: string;
}

const SYSTEM_PROMPT = `Eres un experto en credibilidad de cuentas de Instagram de AGENCIAS de talent / management de OnlyFans. Te paso datos públicos de una cuenta de agencia que un agente comercial usa para hacer outreach (DMs, follows, comentarios) a creadoras grandes y prospectivas. Las cuentas pueden ser de cualquier agencia — propias del grupo o de terceros con los que se trabaja, conocidas o no listadas en ningún CRM. No asumas marcas particulares; evaluá lo que ves en el snapshot.

Tu tarea: ponerte en el lugar de una INFLUENCER GRANDE que recibe un DM o follow de esta cuenta. La pregunta clave es:

   ¿Esta influencer respondería a esta cuenta? ¿Por qué sí o por qué no?

Las creadoras grandes son selectivas, ya las contactan muchas agencias. Para responder, necesitan ver que la cuenta es de una agencia REAL, profesional, con track record visible — no un fake recién armado.

DEAL-BREAKERS automáticos (score ≤ 30, would_respond = "no", el primer red_flag debe explicarlo en texto plano):
- is_restricted = true: IG marcó la cuenta como restringida — está oculta a no-loggeados. Cuando el agente comercial le mande DM a una creadora, lo más probable es que el perfil le aparezca con muro de login, "Esta cuenta es restringida" o sin info pública. Las creators target no van a poder validar quién manda el DM → no responden. Eso pasa por contenido NSFW visible, patrones de spam previos, reportes de usuarios, o cuenta sin verificación. Para que la cuenta sirva para scouting hay que resolverlo primero (verificar mail+teléfono, eliminar posts problemáticos, esperar weeks hasta que IG levante el flag). El red_flag debe decir literal: "IG marcó la cuenta como restringida — las creators target podrían no verla al recibir el DM".

Señales QUE PENALIZAN (la creadora skipea):
- Cuenta muy nueva (< 6 meses) sin track record.
- Foto de perfil genérica, baja calidad, o sin logo claro de la agencia.
- Bio sin claridad sobre qué hace la agencia (no dice "management de OF / talent agency / etc").
- Bio sin link a sitio web profesional, o link roto / sospechoso.
- Username sin alineación con el nombre de la agencia (random, números, typos).
- Pocos posts (<10), o todos del mismo día (cuenta inflada).
- Posts genéricos sin mostrar a creadoras del roster (sin social proof).
- Ratio raro: muchos following (>5k) y pocos followers (<500) → patrón de spam mass-follow.
- Sin engagement orgánico (posts con likes en 0).
- Sin verificación azul (no es deal-breaker pero suma si la tiene).
- Bio en mayúsculas excesivas, emojis exagerados, o tono spam.
- No hay testimonios o menciones de modelos del roster.

Señales QUE CONSTRUYEN CREDIBILIDAD:
- Cuenta con historia (>1 año), actividad consistente.
- Logo claro de la agencia, paleta de marca coherente.
- Bio profesional y clara: qué hace, para quién, link al sitio web real.
- Posts mostrando creadoras del roster (social proof visible).
- Engagement orgánico (comments reales, no solo emojis spam).
- Followers consistentes con following (no inflated).
- Link a sitio web profesional con dominio propio.
- Verificación azul o cuenta business legítima.
- Username matchea el nombre de la agencia (sin números random).
- Bio con CTA claro ("DM us to apply", "talent applications", etc.).

Tu respuesta DEBE ser un JSON válido con esta forma exacta (sin backticks, sin texto adicional):

{
  "score": <int 0-100>,
  "summary": "<string: 1-2 frases para preview en card, max 25 palabras. Respondé en concreto si una influencer grande respondería o no a esta cuenta>",
  "would_respond": "si" | "no" | "tal_vez",
  "why_not": "<string: razón principal por la que una influencer grande NO respondería, o vacío si el score >=80>",
  "strengths": ["<string concreto, qué tiene la cuenta a favor>", "..."],
  "red_flags": [{"signal": "<string concreto del input>", "severity": "low" | "medium" | "high"}],
  "urgent_improvements": ["<string: punto de mejora URGENTE para empezar a generar respuestas ya>", "..."],
  "recommendations": ["<string accionable a mediano plazo>", "..."]
}

Reglas de scoring:
- 85-100: cuenta sólida de agencia profesional, influencers grandes responderían sin dudar.
- 65-84: aceptable, pasa el primer filtro de una creadora media. Influencers muy selectivas podrían dudar.
- 45-64: tibia, una influencer grande probablemente la skipea por falta de social proof o profesionalismo.
- 25-44: claramente recién armada o sin track record visible. Casi ninguna influencer grande responde.
- 0-24: huele a fake o muy bajo esfuerzo. Solo creadoras desesperadas responden.

Sé estricto y específico. urgent_improvements deben ser cosas que se pueden hacer en una semana (subir 5 posts del roster, escribir bio profesional, agregar link). recommendations son acciones más sostenidas (construir engagement, conseguir verificación, etc.). Cita detalles concretos del input — no recomendaciones genéricas.`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) {
      return jsonError("ANTHROPIC_API_KEY no configurada en los secrets de Supabase.", 500);
    }
    const SCAN_MODEL = Deno.env.get("CLAUDE_MODEL_STANDARD") || "claude-sonnet-4-6";

    let body: ScanRequest;
    try {
      body = await req.json();
    } catch {
      return jsonError("JSON inválido.", 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey);

    // Resolver la fila a actualizar.
    let accountRow:
      | {
          id: string;
          tenant_id: string;
          instagram_handle: string;
        }
      | null = null;

    if (body.account_id) {
      const { data, error } = await sb
        .from("scouter_spammer_accounts")
        .select("id, tenant_id, instagram_handle")
        .eq("id", body.account_id)
        .maybeSingle();
      if (error) throw error;
      accountRow = data as typeof accountRow;
    } else if (body.instagram_handle) {
      const handle = body.instagram_handle.toLowerCase().trim();
      const { data, error } = await sb
        .from("scouter_spammer_accounts")
        .select("id, tenant_id, instagram_handle")
        .eq("instagram_handle", handle)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      accountRow = data as typeof accountRow;
    }

    if (!accountRow) {
      return jsonError("Cuenta no encontrada.", 404);
    }

    // Marcar como scanning para que el frontend muestre estado.
    await sb
      .from("scouter_spammer_accounts")
      .update({ scan_status: "scanning", scan_error: null })
      .eq("id", accountRow.id);

    // Fetchear perfil público de IG.
    let snapshot: IgProfileSnapshot | null = null;
    try {
      snapshot = await fetchIgProfile(accountRow.instagram_handle);
    } catch (fetchErr) {
      console.error("ig fetch failed:", fetchErr);
    }

    // La foto de IG viene como CDN URL con tokens que caducan o que IG
    // bloquea cross-origin (no se puede renderizar desde otro dominio).
    // Bajamos la imagen acá y la persistimos como data URL — así se
    // sirve desde la propia row sin depender del CDN de IG. Si falla,
    // dejamos null y el frontend usa fallback con la inicial.
    if (snapshot?.profile_pic_url) {
      const dataUrl = await fetchAsDataUrl(snapshot.profile_pic_url);
      if (dataUrl) {
        snapshot = { ...snapshot, profile_pic_url: dataUrl };
      } else {
        snapshot = { ...snapshot, profile_pic_url: null };
      }
    }

    if (!snapshot) {
      await sb
        .from("scouter_spammer_accounts")
        .update({
          scan_status: "failed",
          scan_error: "No se pudo fetchear el perfil de IG (cuenta privada, baneada, o IG bloqueó la request).",
          last_scanned_at: new Date().toISOString(),
        })
        .eq("id", accountRow.id);
      return jsonError("No se pudo fetchear el perfil de IG.", 502);
    }

    // Llamar a Sonnet 4.6 con el snapshot.
    let analysis: AiAnalysis;
    try {
      analysis = await runAiScan(ANTHROPIC_API_KEY, SCAN_MODEL, snapshot);
    } catch (aiErr) {
      const msg = (aiErr as Error).message ?? "Error de IA.";
      await sb
        .from("scouter_spammer_accounts")
        .update({
          scan_status: "failed",
          scan_error: `IA: ${msg}`,
          last_scanned_at: new Date().toISOString(),
        })
        .eq("id", accountRow.id);
      return jsonError(msg, 502);
    }

    // Persistir resultado completo. Importante:
    // - profile_pic_url (no profile_photo_url) — la tabla existente ya
    //   usa esa convención, así que la respetamos.
    // - NO pisamos display_name — el spammer lo eligió a mano cuando
    //   registró la cuenta; el full_name del IG sería ruido.
    const { error: updateErr } = await sb
      .from("scouter_spammer_accounts")
      .update({
        profile_pic_url: snapshot.profile_pic_url,
        followers_count: snapshot.followers_count,
        following_count: snapshot.following_count,
        posts_count: snapshot.posts_count,
        bio: snapshot.biography,
        is_verified: snapshot.is_verified,
        is_restricted: snapshot.is_restricted,
        ai_score: analysis.score,
        ai_analysis: analysis,
        last_scanned_at: new Date().toISOString(),
        scan_status: "done",
        scan_error: null,
      })
      .eq("id", accountRow.id);

    if (updateErr) throw updateErr;

    return new Response(
      JSON.stringify({
        ok: true,
        account_id: accountRow.id,
        score: analysis.score,
        analysis,
        snapshot,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("scouter-spam-account-scan error:", e);
    return jsonError((e as Error).message ?? "Error interno.", 500);
  }
});

function jsonError(error: string, status: number): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ─── IG profile fetch ────────────────────────────────────────────────
// Estrategia: intentar primero ScrapeCreators (paid, con cookies/auth,
// no se rate-limita desde IPs cloud). Si no hay API key o falla,
// fallback al endpoint público web_profile_info de IG.
// El fallback público se rompe seguido porque IG bloquea las IPs de
// Supabase edge functions.
async function fetchIgProfile(username: string): Promise<IgProfileSnapshot | null> {
  const u = username.replace(/^@+/, "").toLowerCase();
  // Intento 1: ScrapeCreators.
  const scKey = Deno.env.get("SCRAPECREATORS_API_KEY");
  if (scKey) {
    try {
      const scRes = await fetchWithTimeout(
        `https://api.scrapecreators.com/v1/instagram/profile?handle=${encodeURIComponent(u)}`,
        { headers: { "x-api-key": scKey } },
        10000,
      );
      // El endpoint devuelve 200 incluso cuando IG bloquea — el body
      // tiene un campo `error` o `message: "Profile is restricted"`.
      // Para 404/200-con-restricted, todavía consideramos que la cuenta
      // existe y se la pasamos al AI con is_restricted:true en vez de
      // fallar el scan entero.
      const scData = (await scRes.json().catch(() => null)) as {
        success?: boolean;
        message?: string;
        error?: string;
        errorStatus?: number;
        isRestricted?: boolean;
        handle?: string;
        userId?: string | null;
        data?: {
          user?: {
            username?: string;
            full_name?: string;
            biography?: string;
            edge_followed_by?: { count?: number };
            edge_follow?: { count?: number };
            edge_owner_to_timeline_media?: { count?: number };
            is_verified?: boolean;
            is_private?: boolean;
            is_business_account?: boolean;
            external_url?: string;
            profile_pic_url_hd?: string;
            profile_pic_url?: string;
          };
        };
      } | null;
      const restrictedHint =
        scData?.isRestricted === true ||
        (typeof scData?.message === "string" && /restricted/i.test(scData.message)) ||
        scData?.error === "not_found" && scData.errorStatus === 404;
      if (scRes.ok || scData) {
        const su = scData?.data?.user;
        if (su) {
          return {
            username: su.username ?? u,
            full_name: su.full_name ?? null,
            biography: su.biography ?? null,
            followers_count: su.edge_followed_by?.count ?? null,
            following_count: su.edge_follow?.count ?? null,
            posts_count: su.edge_owner_to_timeline_media?.count ?? null,
            is_verified: su.is_verified ?? null,
            is_private: su.is_private ?? null,
            is_business_account: su.is_business_account ?? null,
            external_url: su.external_url ?? null,
            profile_pic_url: su.profile_pic_url_hd ?? su.profile_pic_url ?? null,
            account_created_year: null,
            is_restricted: false,
          };
        }
        if (restrictedHint) {
          // Cuenta existe pero IG la oculta sin login. Confirmamos con
          // /v2/instagram/user/posts (devuelve isRestricted:true sin 404)
          // para descartar typo / cuenta inexistente.
          const confirmed = await confirmRestrictedViaPosts(u, scKey);
          if (confirmed) {
            return makeRestrictedSnapshot(u);
          }
        }
      }
      if (!scRes.ok) {
        console.warn(
          "[spam-scan] ScrapeCreators failed, falling back to IG direct:",
          scRes.status,
          (scData?.message ?? "").slice(0, 150),
        );
      }
    } catch (e) {
      console.warn("[spam-scan] ScrapeCreators exception, falling back:", (e as Error).message);
    }
  }

  // Intento 2 (fallback): web_profile_info público de IG. Frecuentemente
  // bloqueado desde Supabase edges, pero gratis.
  try {
    const res = await fetchWithTimeout(
      `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(u)}`,
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
          referer: `https://www.instagram.com/${u}/`,
          origin: "https://www.instagram.com",
        },
      },
      8000,
    );
    if (!res.ok) return null;
    const data = (await res.json().catch(() => null)) as {
      status?: string;
      data?: {
        user?: {
          username?: string;
          full_name?: string;
          biography?: string;
          edge_followed_by?: { count?: number };
          edge_follow?: { count?: number };
          edge_owner_to_timeline_media?: { count?: number };
          is_verified?: boolean;
          is_private?: boolean;
          is_business_account?: boolean;
          external_url?: string;
          profile_pic_url_hd?: string;
          profile_pic_url?: string;
        };
      };
    } | null;
    const u_ = data?.data?.user;
    if (!u_) {
      // IG devuelve `{"status":"ok"}` sin data.user cuando la cuenta
      // está restricted y no hay cookies de sesión. Lo tratamos como
      // restricted confirmado (mejor falso positivo de restricted que
      // perder el scan entero).
      if (data?.status === "ok") {
        return makeRestrictedSnapshot(u);
      }
      return null;
    }
    return {
      username: u_.username ?? u,
      full_name: u_.full_name ?? null,
      biography: u_.biography ?? null,
      followers_count: u_.edge_followed_by?.count ?? null,
      following_count: u_.edge_follow?.count ?? null,
      posts_count: u_.edge_owner_to_timeline_media?.count ?? null,
      is_verified: u_.is_verified ?? null,
      is_private: u_.is_private ?? null,
      is_business_account: u_.is_business_account ?? null,
      external_url: u_.external_url ?? null,
      profile_pic_url: u_.profile_pic_url_hd ?? u_.profile_pic_url ?? null,
      account_created_year: null,
      is_restricted: false,
    };
  } catch {
    return null;
  }
}

// Confirma que el handle existe en IG pero está restricted. El endpoint
// /v2/instagram/user/posts devuelve `isRestricted:true` con status 200
// cuando es realmente restricted (vs 404 si no existe). Diferenciar
// importa porque si el user puso un handle inexistente queremos fallar
// el scan en vez de armar un análisis fantasma.
async function confirmRestrictedViaPosts(handle: string, scKey: string): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(
      `https://api.scrapecreators.com/v2/instagram/user/posts?handle=${encodeURIComponent(handle)}`,
      { headers: { "x-api-key": scKey } },
      10000,
    );
    if (!res.ok) return false;
    const j = (await res.json().catch(() => null)) as {
      isRestricted?: boolean;
      message?: string;
    } | null;
    return j?.isRestricted === true || (!!j?.message && /restricted/i.test(j.message));
  } catch {
    return false;
  }
}

// Snapshot mínimo para cuenta confirmada como restricted. El AI lo va
// a evaluar tomando is_restricted=true como deal-breaker (regla en el
// system prompt). No tenemos bio/followers/pic porque IG los oculta.
function makeRestrictedSnapshot(username: string): IgProfileSnapshot {
  return {
    username,
    full_name: null,
    biography: null,
    followers_count: null,
    following_count: null,
    posts_count: null,
    is_verified: null,
    is_private: null,
    is_business_account: null,
    external_url: null,
    profile_pic_url: null,
    account_created_year: null,
    is_restricted: true,
  };
}

async function fetchWithTimeout(url: string, init: RequestInit, ms = 8000): Promise<Response> {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(id);
  }
}

// Bajamos una imagen pública de IG CDN y la convertimos a data URL.
// IG sirve sus fotos con tokens que caducan + chequea referer/origin
// cuando se cargan cross-origin, así que el navegador del user no
// puede renderizar el URL crudo. Descargándola server-side y guardando
// como data URL, queda autocontenida en la row.
async function fetchAsDataUrl(url: string): Promise<string | null> {
  try {
    const isIgCdn = /cdninstagram\.com|fbcdn\.net/i.test(url);
    const res = await fetchWithTimeout(
      url,
      {
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
      },
      8000,
    );
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.startsWith("image/")) return null;
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.byteLength < 500) return null; // sanity: imágenes IG nunca <500B
    return `data:${contentType};base64,${encodeBase64(buf)}`;
  } catch {
    return null;
  }
}

// ─── AI scan ─────────────────────────────────────────────────────────
async function runAiScan(
  apiKey: string,
  model: string,
  snapshot: IgProfileSnapshot,
): Promise<AiAnalysis> {
  const userMessage = `[CUENTA A EVALUAR]
Username: @${snapshot.username}
Nombre: ${snapshot.full_name ?? "(vacío)"}
Bio: ${snapshot.biography ?? "(vacía)"}
Followers: ${snapshot.followers_count ?? "?"}
Following: ${snapshot.following_count ?? "?"}
Posts: ${snapshot.posts_count ?? "?"}
Verificada: ${snapshot.is_verified ? "sí (badge azul)" : "no"}
Privada: ${snapshot.is_private ? "sí" : "no"}
Cuenta business: ${snapshot.is_business_account ? "sí" : "no"}
Link externo: ${snapshot.external_url ?? "(ninguno)"}
Foto de perfil: ${snapshot.profile_pic_url ? "sí, la veo" : "no tiene"}
Restringida por IG: ${snapshot.is_restricted ? "SÍ — IG ocultó la cuenta a viewers no-loggeados (deal-breaker)" : "no"}${
    snapshot.is_restricted
      ? `

NOTA: la cuenta está marcada como restringida por IG, así que no tenemos visibilidad sobre bio, followers, ni foto desde un viewer no-loggeado. Evaluá pensando que las creators target reciben el DM y al chequear el perfil van a topar con un muro / aviso de cuenta restringida — eso baja la confianza al piso. Aplicá la regla del deal-breaker.`
      : ""
  }

Devolvé el JSON de evaluación.`;

  const res = await fetchWithTimeout(
    "https://api.anthropic.com/v1/messages",
    {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: 2000,
        system: [
          {
            type: "text",
            text: SYSTEM_PROMPT,
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: [{ role: "user", content: userMessage }],
      }),
    },
    60_000,
  );

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Claude API error ${res.status}: ${text.slice(0, 300)}`);
  }

  const data = (await res.json()) as {
    content?: Array<{ type: string; text?: string }>;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
    };
  };
  // Loggea para Control de Gasto (fire-and-forget, no awaitea).
  if (data.usage) {
    void (async () => {
      try {
        const { logAnthropicUsage } = await import("../_shared/usage.ts");
        await logAnthropicUsage({
          operation: "scouter-spam-account-scan",
          model,
          usage: data.usage as any,
          context: { username: snapshot.username },
        });
      } catch (e) {
        console.warn("logAnthropicUsage failed:", (e as Error).message);
      }
    })();
  }
  const raw = (data.content ?? [])
    .filter((c) => c.type === "text" && c.text)
    .map((c) => c.text!)
    .join("")
    .trim();

  let cleaned = raw;
  if (cleaned.startsWith("```json")) cleaned = cleaned.slice(7);
  if (cleaned.startsWith("```")) cleaned = cleaned.slice(3);
  if (cleaned.endsWith("```")) cleaned = cleaned.slice(0, -3);
  cleaned = cleaned.trim();

  const parsed = JSON.parse(cleaned) as Omit<AiAnalysis, "scanned_at">;
  if (
    typeof parsed.score !== "number" ||
    typeof parsed.summary !== "string" ||
    !Array.isArray(parsed.strengths) ||
    !Array.isArray(parsed.red_flags) ||
    !Array.isArray(parsed.recommendations) ||
    !Array.isArray(parsed.urgent_improvements ?? []) ||
    !["si", "no", "tal_vez"].includes(String(parsed.would_respond))
  ) {
    throw new Error("La IA devolvió un JSON con shape inválida.");
  }
  // Defaults defensivos por si la IA omite campos opcionales.
  parsed.urgent_improvements = parsed.urgent_improvements ?? [];
  parsed.why_not = parsed.why_not ?? "";

  return {
    ...parsed,
    scanned_at: new Date().toISOString(),
  };
}
