import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Built-in base64 — evita dependencia de deno.land/std (que está caído
// upstream con 500 en deploy). btoa() acepta strings binarios, así que
// pasamos los bytes uno a uno como char codes.
function encodeBase64(buf: Uint8Array): string {
  let s = "";
  for (let i = 0; i < buf.length; i++) s += String.fromCharCode(buf[i]);
  return btoa(s);
}

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

const SYSTEM_PROMPT = `Eres un experto en credibilidad de cuentas de Instagram de AGENCIAS de talent / management de OnlyFans. Te paso datos públicos de una cuenta que el user registró como herramienta de outreach (DMs, follows, comentarios) hacia creadoras grandes y prospectivas. Las cuentas pueden ser de cualquier agencia — propias del grupo o de terceros con los que se trabaja, conocidas o no listadas en ningún CRM. No asumas marcas particulares; evaluá lo que ves en el snapshot.

Tu tarea: ponerte en el lugar de una INFLUENCER GRANDE que recibe un DM o follow de esta cuenta. La pregunta clave es:

   ¿Esta influencer respondería a esta cuenta? ¿Por qué sí o por qué no?

Las creadoras grandes son selectivas, ya las contactan muchas agencias. Para responder, necesitan ver que la cuenta es de una agencia REAL, profesional, con track record visible — no un fake recién armado.

═══ PASO 1 OBLIGATORIO: clasificá el tipo de cuenta antes de scorear ═══

Antes de aplicar reglas, decidí cuál de estos 4 tipos es la cuenta. Esto define la franja de score base — después ajustás dentro de la franja con las señales positivas/negativas:

A) RESTRICTED (is_restricted=true) — PEOR CASO. IG ocultó la cuenta a viewers no-loggeados. Las creators target ni siquiera pueden validar el perfil al recibir el DM (muro de login, "cuenta restringida", sin info pública). Salir del flag toma weeks: verificar mail+teléfono, eliminar posts NSFW reportados, esperar que IG levante el shadow-flag. Franja: **0-15** sin importar lo que diga el resto del snapshot.

  CRÍTICO para tipo A: cuando is_restricted=true Y el snapshot vino vacío (sin bio, sin foto, sin link, sin followers, sin posts), eso NO significa que la cuenta esté efectivamente vacía — significa que el scraper no pudo verla por la restricción. Los datos de la cuenta posiblemente existen, simplemente no los podemos leer. POR LO TANTO:

    · El ÚNICO red_flag debe ser el del restricted-flag, severity high.
    · NO inventes red_flags low/medium tipo "sin foto de perfil", "bio vacía", "sin link externo", "nombre de cuenta vacío" — no sabés si están vacíos, no podés verlos. Esos red_flags serían INVENTADOS y le dan info incorrecta al user.
    · NO incluyas en strengths/weaknesses cosas que dependan de datos de profile que no podemos ver.
    · summary, why_not y urgent_improvements deben enfocarse en CÓMO RECUPERAR LA RESTRICCIÓN, no en supuestos defectos del perfil. Ejemplos de urgent_improvements correctos para tipo A:
        - "Verificar email + teléfono real en Settings → Account"
        - "Eliminar cualquier post NSFW o reportado del feed"
        - "Activar 2FA y cambiar a perfil business"
        - "Apelar formalmente via Settings → Help → Report a Problem"
        - "Parar TODO outreach hasta que se levante el flag — sino IG nunca lo levanta"
    · Si el snapshot trae bio/nombre/link/followers (vienen de un screenshot manual que el user subió), AHÍ sí podés ajustar el análisis con esa info verdadera. Pero NO subas el score arriba de 15 — el problema técnico de visibilidad es lo que mata el outreach.

B) PERFIL PERSONAL sin pretensión de agencia — la cuenta NO se presenta como agencia: bio vacía o personal ("Jorge, BsAs"), username random con números (jorgejunior12748), 0 posts del roster, sin link, sin logo de marca, sin CTA. No es fake-de-agencia; literalmente no intenta serlo. Es accesible (no restricted), las creators sí pueden ver el perfil, pero al chequearlo se dan cuenta que no es agencia y no responden. Franja: **15-30**. El why_not debe decir claro: "No es una cuenta de agencia, es perfil personal — convertila a agencia (bio profesional + posts del roster + link al sitio) o usá otra cuenta para outreach". CLAVE: no acumular red_flags hostiles tipo "cuenta privada" o "bio vacía" como si fuera fake; el problema es de categoría, no de calidad.

C) AGENCIA FAKE / MUY RECIÉN ARMADA — la cuenta SÍ intenta presentarse como agencia (bio dice "talent management", "OF agency", etc.) pero los detalles cantan: pocos posts, sin roster visible, link roto, ratios extraños, mass-following, foto de perfil genérica, bio en mayúsculas con emojis exagerados. Franja: **25-45** (más alto que B porque hay BASE de agencia sobre la cual mejorar; con 5 posts del roster reales sube rápido). Si el patrón es claramente bot/scam (mass-follow + bio spam + 0 engagement), bajá al piso de la franja.

D) AGENCIA LEGÍTIMA (con distintos grados de profesionalismo):
   - **45-64**: tibia — bio decente, algunos posts, pero falta social proof (roster visible, engagement orgánico, link al sitio). Una creator muy selectiva la skipea.
   - **65-84**: sólida — bio profesional, posts del roster, link al sitio, ratios normales. Pasa el primer filtro.
   - **85-100**: top — historia >1 año, roster claro, engagement real, link a sitio propio, verificada o business confirmada. Influencers grandes responden sin dudar.

═══ PASO 2: ajustes dentro de la franja ═══

Subir dentro de la franja:
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

Bajar dentro de la franja (NO bajar de franja por estas señales solas — sirven para ajuste fino):
- Cuenta muy nueva (< 6 meses) sin track record.
- Foto de perfil genérica, baja calidad, o sin logo claro.
- Bio sin claridad o sin link.
- Username random / con números.
- Pocos posts (<10), o todos del mismo día.
- Sin engagement orgánico.
- Bio en mayúsculas excesivas, emojis exagerados, o tono spam.
- Ratio raro: muchos following (>5k) y pocos followers (<500).

═══ Output ═══

Tu respuesta DEBE ser un JSON válido con esta forma exacta (sin backticks, sin texto adicional):

{
  "score": <int 0-100>,
  "summary": "<string: 1-2 frases para preview en card, max 25 palabras. Respondé en concreto si una influencer grande respondería o no a esta cuenta. Si es tipo B (personal), aclaralo>",
  "would_respond": "si" | "no" | "tal_vez",
  "why_not": "<string: razón principal por la que NO respondería, o vacío si el score >=80. Si es tipo A, mencioná el restricted-flag. Si es tipo B, mencioná que no es agencia y pedí convertir o cambiar de cuenta>",
  "strengths": ["<string concreto, qué tiene la cuenta a favor>", "..."],
  "red_flags": [{"signal": "<string concreto del input>", "severity": "low" | "medium" | "high"}],
  "urgent_improvements": ["<string: punto de mejora URGENTE para empezar a generar respuestas ya>", "..."],
  "recommendations": ["<string accionable a mediano plazo>", "..."]
}

Reglas para red_flags por tipo:
- Tipo A (restricted) sin screenshot manual: SOLO un red_flag, high, sobre la restricción de IG. NO inventes low/medium sobre datos faltantes — no podés ver el perfil real. Acumular esos red_flags da información falsa al user (la cuenta tal vez SÍ tiene foto/bio/link, pero no podés verlos por la restricción).
- Tipo A (restricted) con screenshot manual del perfil logueado: red_flag high de restricción + low/medium sobre lo que efectivamente veas mal en el screenshot.
- Tipo B (personal): NO acumules red_flags con severity high (la cuenta no pretende ser agencia, marcar "bio vacía" como high es ruido). Limitate a 1-2 medium explicando que falta convertir. Las urgent_improvements deben ser: "armar bio profesional de agencia", "subir 5 posts del roster", "agregar link al sitio", "considerar cambiar a una cuenta de marca".
- Tipo C/D: regla normal — high para problemas estructurales, medium/low para detalles.

Sé estricto y específico. urgent_improvements deben ser cosas que se pueden hacer en una semana. recommendations son acciones más sostenidas. Cita detalles concretos del input — no recomendaciones genéricas.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Variables del scope outer para que el catch final pueda hacer
  // cleanup fail-loud: si llegamos a marcar scan_status='scanning' y
  // después el flow tira excepción, la row debería quedar 'failed'
  // (no stuck en scanning). Sin esto, el cron de recovery tiene que
  // limpiar 5 min después — feo para el user.
  let cleanupAccountId: string | null = null;
  let cleanupSb: ReturnType<typeof createClient> | null = null;
  let markedScanning = false;

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

    // Set vars de cleanup para que el catch final pueda recuperar la row.
    cleanupAccountId = accountRow.id;
    cleanupSb = sb;

    // Marcar como scanning para que el frontend muestre estado.
    await sb
      .from("scouter_spammer_accounts")
      .update({ scan_status: "scanning", scan_error: null })
      .eq("id", accountRow.id);
    markedScanning = true;

    // Fetchear perfil público de IG.
    let snapshot: IgProfileSnapshot | null = null;
    try {
      snapshot = await fetchIgProfile(accountRow.instagram_handle);
    } catch (fetchErr) {
      console.error("ig fetch failed:", fetchErr);
    }

    // ScrapeCreators sin sesión logueada NO detecta correctamente las
    // cuentas restringidas — devuelve un snapshot con todos los campos
    // vacíos en lugar de marcar is_restricted=true. Si vemos que el
    // snapshot existe pero no tiene NINGÚN dato sustantivo (sin bio,
    // sin followers, sin posts, sin foto), asumimos que es restringida
    // y promovemos el snapshot a is_restricted=true. El branch de
    // screenshot abajo se encarga del resto.
    //
    // Fallback adicional: si snapshot vino null (fetch tiró excepción
    // o devolvió null), también asumimos restricted en vez de marcar
    // failed — el user puede subir screenshots y rescatar el análisis
    // con Claude vision.
    const snapshotIsEmpty =
      !!snapshot &&
      !snapshot.biography &&
      (snapshot.followers_count == null || snapshot.followers_count === 0) &&
      (snapshot.posts_count == null || snapshot.posts_count === 0) &&
      !snapshot.profile_pic_url;
    if (snapshot && snapshotIsEmpty && !snapshot.is_restricted) {
      console.warn(
        `[snapshot empty] ${accountRow.instagram_handle} — asumiendo restricted (ScrapeCreators sin sesión no detecta restringidas).`,
      );
      snapshot = { ...snapshot, is_restricted: true };
    }
    if (!snapshot) {
      console.warn(
        `[snapshot null] ${accountRow.instagram_handle} — fetch falló, asumiendo restricted para que el user suba screenshots.`,
      );
      snapshot = {
        username: accountRow.instagram_handle,
        full_name: null,
        biography: null,
        followers_count: null,
        following_count: null,
        posts_count: null,
        profile_pic_url: null,
        is_verified: false,
        is_restricted: true,
      } as IgProfileSnapshot;
    }

    // Si la cuenta vino marcada como restricted y el user ya subió un
    // screenshot manual, lo mandamos a Claude vision para extraer bio +
    // nombre + followers + link + posts + verified, y mergeamos esos
    // campos sobre el snapshot vacío. is_restricted queda en true (el
    // problema real de visibilidad sigue ahí — las creators target topan
    // con el wall cuando reciban el DM), pero el AI puede analizar con
    // la data verdadera de la cuenta.
    if (snapshot?.is_restricted) {
      const { data: full } = await sb
        .from("scouter_spammer_accounts")
        .select("manual_screenshot_path, manual_screenshot_paths")
        .eq("id", accountRow.id)
        .maybeSingle();
      const row = full as
        | {
            manual_screenshot_path?: string | null;
            manual_screenshot_paths?: string[] | null;
          }
        | null;
      // Soportamos el array nuevo (manual_screenshot_paths) + fallback al
      // campo legacy single (manual_screenshot_path). Si hay varias, las
      // procesamos todas y mergeamos los resultados — campos populados en
      // una screenshot pisan los nulls de las anteriores.
      const arrayPaths = (row?.manual_screenshot_paths ?? []).filter(
        (p): p is string => !!p,
      );
      const legacyPath = row?.manual_screenshot_path;
      const paths =
        arrayPaths.length > 0 ? arrayPaths : legacyPath ? [legacyPath] : [];
      if (paths.length > 0) {
        try {
          let merged: Partial<IgProfileSnapshot> = {};
          for (const path of paths) {
            const enriched = await extractFromScreenshot(
              sb,
              ANTHROPIC_API_KEY,
              SCAN_MODEL,
              path,
              accountRow.instagram_handle,
            );
            if (enriched) {
              // Merge: campos non-null/non-empty del screenshot nuevo pisan
              // los anteriores. Permite ir refinando con más capturas.
              for (const [k, v] of Object.entries(enriched)) {
                if (v !== null && v !== undefined && v !== "") {
                  (merged as Record<string, unknown>)[k] = v;
                }
              }
            }
          }
          if (Object.keys(merged).length > 0) {
            snapshot = { ...snapshot, ...merged, is_restricted: true };
          }
        } catch (visionErr) {
          console.warn("vision extract failed:", (visionErr as Error).message);
        }
      }
      // Cambio 2026-05-25: cuando la cuenta está restringida y no hay
      // screenshots manuales, ANTES marcábamos 'awaiting_screenshot'
      // y pedíamos al user subir capturas. Pero como dijo el user:
      // "si IG marcó la cuenta como restringida, los DMs caen en spam
      // de la creadora — no tiene sentido pedir screenshots para
      // enriquecer un análisis de una cuenta que ya está perdida para
      // outreach". Mejor: dejamos fluir al AI scan con is_restricted=true
      // como signal principal, Claude genera el análisis explicando la
      // situación + red_flag de "cuenta restringida = mensajes a spam =
      // baja respuesta", y el user decide si cambiar de cuenta o
      // arreglar la restricción (verificar email/tel, limpiar contenido).
      //
      // Si tiene screenshots, igual los procesamos para enriquecer la
      // bio/followers en el análisis (mismo bloque de vision arriba).
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
    const errorMsg = (e as Error).message ?? "Error interno.";
    console.error("scouter-spam-account-scan error:", e);

    // FAIL-LOUD: si llegamos a marcar la row como 'scanning' y después
    // hubo excepción, marcamos como 'failed' para que NO quede stuck.
    // Sin esto, el bug que destrabamos el 2026-05-25 (constraint
    // violation silente) podía pasar de nuevo en otros paths que tiran
    // excepciones inesperadas.
    if (markedScanning && cleanupAccountId && cleanupSb) {
      try {
        await cleanupSb
          .from("scouter_spammer_accounts")
          .update({
            scan_status: "failed",
            scan_error: `Excepción no manejada: ${errorMsg}`.slice(0, 500),
            last_scanned_at: new Date().toISOString(),
          })
          .eq("id", cleanupAccountId);
      } catch (cleanupErr) {
        console.error(
          "[cleanup failed] no pudimos marcar row como failed:",
          cleanupErr,
        );
      }
    }

    return jsonError(errorMsg, 500);
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

// Para cuentas restricted que IG oculta a scrapers, el user sube un
// screenshot del perfil tomado desde su browser logueado. Acá bajamos
// la imagen del bucket, la mandamos a Claude vision y le pedimos que
// extraiga la data estructurada del perfil. El resultado se mergea
// sobre el snapshot vacío y el AI corre análisis normal con data real.
async function extractFromScreenshot(
  sb: ReturnType<typeof createClient>,
  apiKey: string,
  model: string,
  path: string,
  expectedHandle: string,
): Promise<Partial<IgProfileSnapshot> | null> {
  const { data: file, error } = await sb.storage
    .from("scouter-screenshots")
    .download(path);
  if (error || !file) {
    console.warn("screenshot download failed:", error?.message);
    return null;
  }
  const buf = new Uint8Array(await file.arrayBuffer());
  const mime = (file as Blob).type || "image/png";
  const dataUrl = `data:${mime};base64,${encodeBase64(buf)}`;

  const extractPrompt = `Mirá este screenshot de un perfil de Instagram (cuenta @${expectedHandle}). Extraé los siguientes datos visibles del perfil y devolvé SOLO un JSON con esta forma exacta (sin backticks ni texto adicional):

{
  "full_name": "<string o null — el nombre que figura en grande arriba de la bio>",
  "biography": "<string o null — el texto completo de la bio>",
  "external_url": "<string o null — el link en azul abajo de la bio, si tiene>",
  "followers_count": <int o null>,
  "following_count": <int o null>,
  "posts_count": <int o null>,
  "is_verified": <true si tiene badge azul al lado del nombre, false si no>,
  "is_business_account": <true si dice "Cuenta empresa" / "Business" o tiene categoría visible, false si no>,
  "has_profile_pic": <true si se ve la foto de perfil, false si solo el placeholder gris>,
  "notes": "<string corto: cualquier detalle relevante visible — categoría declarada, ubicación, indicadores de profesionalismo, contenido visible en posts, etc.>"
}

Los counts pueden venir abreviados (1.2K, 16.5K, 1M); convertilos a número entero. Si algún dato no es visible en el screenshot, usá null. No inventes nada.`;

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
        max_tokens: 1000,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: mime,
                  data: dataUrl.split(",")[1],
                },
              },
              { type: "text", text: extractPrompt },
            ],
          },
        ],
      }),
    },
    60_000,
  );

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    console.warn("vision API error:", res.status, txt.slice(0, 200));
    return null;
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
  if (data.usage) {
    void (async () => {
      try {
        const { logAnthropicUsage } = await import("../_shared/usage.ts");
        await logAnthropicUsage({
          operation: "scouter-spam-screenshot-extract",
          model,
          usage: data.usage as any,
          context: { handle: expectedHandle },
        });
      } catch {
        // silent
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

  let parsed: {
    full_name?: string | null;
    biography?: string | null;
    external_url?: string | null;
    followers_count?: number | null;
    following_count?: number | null;
    posts_count?: number | null;
    is_verified?: boolean | null;
    is_business_account?: boolean | null;
    has_profile_pic?: boolean | null;
  };
  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
    console.warn("vision JSON parse failed:", (e as Error).message, raw.slice(0, 200));
    return null;
  }

  return {
    full_name: parsed.full_name ?? null,
    biography: parsed.biography ?? null,
    external_url: parsed.external_url ?? null,
    followers_count: parsed.followers_count ?? null,
    following_count: parsed.following_count ?? null,
    posts_count: parsed.posts_count ?? null,
    is_verified: parsed.is_verified ?? null,
    is_business_account: parsed.is_business_account ?? null,
  };
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

NOTA: la cuenta está marcada como restringida por IG. ${
          snapshot.biography || snapshot.full_name
            ? "La data de bio/nombre/followers que ves arriba vino de un screenshot que subió el user (perfil real visto logueado). Es contexto válido para entender la cuenta, pero NO cambia el problema central: las creators target que reciban el DM y vayan a chequear el perfil sin estar logueadas en IG van a topar con un muro o aviso de cuenta restringida. Por eso la regla del deal-breaker se mantiene — la cuenta puede verse bárbara logueado pero no sirve para outreach mientras IG la oculte."
            : "No tenemos visibilidad sobre bio, followers, ni foto desde un viewer no-loggeado. Evaluá pensando que las creators target reciben el DM y al chequear el perfil van a topar con un muro / aviso de cuenta restringida — eso baja la confianza al piso."
        } Aplicá la regla del deal-breaker.`
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
