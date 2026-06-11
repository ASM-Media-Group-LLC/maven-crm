// fb-scan — verifica promos por FACEBOOK y las registra en promolog_entries.
//
// Igual que x-scan pero el transporte es Apify (apify/facebook-posts-scraper).
// FB usa URLs de página/perfil (no handles), y los formatos varían
// (facebook.com/nombre, /profile.php?id=…) → guardamos la URL entera en
// creators.facebook_handle y acá la usamos tal cual (o la construimos si vino
// como username pelado).
//
//   1. Lista creadoras ACTIVAS con facebook_handle.
//   2. Por creadora corre el actor (run-sync) con su URL.  [POR-CREADORA: simple y
//      confiable con la baja adopción actual de FB; si crece mucho hay que pasar a
//      lotes/async — hay un cap defensivo.]
//   3. Clasifica con la MISMA heurística (regla "Funnel" de Jhon): señal explícita
//      (link OF/agregador, menciona OF, CTA) o foto/video → promovió; solo texto → No.
//   4. Inserta 1 fila por post (network="Facebook"); evidence_url = imagen real del
//      post o el permalink. Marker "sin-actividad" si no posteó. Idempotente.
//
// Auth: X-Cron-Token o JWT admin/manager. Deployar con --no-verify-jwt.
// SECRETOS: APIFY_TOKEN, CRON_INTERNAL_TOKEN.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const TENANT_ID = "30869615-f579-4981-8a1f-dbebc61eae2d";
const APIFY_ACTOR = "apify~facebook-posts-scraper";
const MAX_CREATORS = 30; // cap defensivo por invocación (FB es por-creadora, run-sync)

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-token",
};
const json = (obj: unknown, status = 200): Response =>
  new Response(JSON.stringify(obj, null, 2), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

function ofHandleFromUrl(url: string): string {
  const m = String(url || "").match(/onlyfans\.com\/([A-Za-z0-9_.]+)/i);
  return m ? m[1].toLowerCase() : "";
}

// Misma heurística que x-scan/telegram-scan.
function ofSignals(haystack: string, ofHandle: string): string[] {
  const raw = (haystack || "").toLowerCase();
  const s: string[] = [];
  if (/onlyfans\.com|\bonlyfans\b|\bo\.?f\.?\b/i.test(raw)) s.push("onlyfans");
  if (ofHandle && raw.includes(ofHandle)) s.push("of_handle");
  if (/linktr\.ee|beacons\.ai|allmylinks|hoo\.be|linkr\.bio|fanvue|fansly|fans\.ly|coomer|throne|piclink|campsite\.bio|snipfeed|tap\.bio|justfor\.fans|loyalfans|manyvids|fapello/i.test(raw)) s.push("link_agg");
  if (/(link en bio|link in (my )?bio|ve al link|mira (el|mi) link|mi link|link abajo|abajo (el|mi) link|en el link|mi p[áa]gina|ya fuiste|checa mi|mira mi|te espero en|mi contenido|contenido (exclusivo|completo|nuevo)|suscr[ií]b|\bsub a mi\b|premium|\bvip\b|descuento|oferta|c[óo]mprame|mi of\b|aqu[ií] me lo|sin censura|\+18|18\+)/i.test(raw)) s.push("promo");
  return s;
}

// Texto del post (el shape de apify/facebook-posts-scraper varía → probamos varias claves).
const postText = (it: any): string => it?.text || it?.message || it?.postText || it?.caption || it?.content || "";
const postUrl = (it: any): string => it?.url || it?.postUrl || it?.topLevelUrl || it?.facebookUrl || it?.permalink || "";
const postDate = (it: any): string => it?.time || it?.timestamp || it?.date || it?.publishTime || it?.publishedTime || "";
function postMedia(it: any): { count: number; firstImage: string | null } {
  const urls: string[] = [];
  const media = it?.media || it?.attachments || it?.images || it?.photos || [];
  if (Array.isArray(media)) {
    for (const m of media) {
      // Solo imagen/video real: FB mete un item cuyo "url" es el PERMALINK del post
      // (no una foto) → tomamos image.uri / thumbnail, NO m.url.
      const u = m?.image?.uri || m?.photo_image?.uri || m?.media?.image?.uri || m?.thumbnail || (typeof m === "string" ? m : null);
      if (u) urls.push(String(u));
    }
  }
  if (!urls.length && it?.imageUrl) urls.push(String(it.imageUrl));
  return { count: urls.length || (it?.imageUrl ? 1 : 0), firstImage: urls[0] || null };
}
const postLinks = (it: any): string[] => {
  const out: string[] = [];
  const links = it?.links || it?.externalLinks || it?.urls || [];
  if (Array.isArray(links)) for (const l of links) { const u = typeof l === "string" ? l : (l?.url || l?.link); if (u) out.push(String(u)); }
  if (it?.link) out.push(String(it.link));
  return out;
};

function classifyFb(it: any, ofUrl: string): { promoted: boolean; reason: string } {
  // FB ≠ X: en Facebook las creadoras suben contenido personal/normal (FB restringe
  // OF). Una foto NO es promo por sí sola → exige señal EXPLÍCITA de OF (link a OF/
  // agregador, mención de onlyfans, o CTA de promo). Sin señal → No, aunque haya foto.
  const text = postText(it);
  const links = postLinks(it);
  const sig = ofSignals(text + " " + links.join(" "), ofHandleFromUrl(ofUrl));
  if (sig.length) return { promoted: true, reason: sig.join("+") };
  return { promoted: false, reason: "sin-senal-of" };
}

// facebook_handle → URL de FB (acepta URL completa o username pelado).
function fbUrl(handle: string): string {
  const h = (handle || "").trim();
  if (/^https?:\/\//i.test(h)) return h;
  return `https://www.facebook.com/${h.replace(/^@/, "")}`;
}

async function runApify(token: string, url: string, since: string, limit: number): Promise<any[]> {
  const input = { startUrls: [{ url }], resultsLimit: limit, onlyPostsNewerThan: since };
  const r = await fetch(`https://api.apify.com/v2/acts/${APIFY_ACTOR}/run-sync-get-dataset-items?token=${token}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input),
  });
  if (!r.ok) throw new Error(`apify ${r.status}: ${(await r.text()).slice(0, 300)}`);
  return await r.json();
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const APIFY_TOKEN = Deno.env.get("APIFY_TOKEN") || "";
  const CRON_TOKEN = Deno.env.get("CRON_INTERNAL_TOKEN");
  const sb = createClient(SUPABASE_URL, SERVICE_KEY);

  const cronHeader = req.headers.get("x-cron-token");
  const isCron = !!(cronHeader && CRON_TOKEN && cronHeader === CRON_TOKEN);
  if (!isCron) {
    const token = (req.headers.get("Authorization") || "").replace("Bearer ", "");
    const { data: { user } } = await sb.auth.getUser(token);
    if (!user) return json({ error: "unauthorized" }, 401);
    const { data: roles } = await sb.from("user_roles").select("role").eq("user_id", user.id);
    const ok = (roles || []).some((r: { role: string }) => r.role === "admin" || r.role === "manager");
    if (!ok) return json({ error: "forbidden (admin/manager)" }, 403);
  }
  if (!APIFY_TOKEN) return json({ error: "falta APIFY_TOKEN" }, 500);

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const hours = Number(body.hours) || 24;
  const onlyIds = Array.isArray(body.only_creator_ids) ? body.only_creator_ids as string[] : null;
  const limit = Number(body.limit) || 0;
  const dryRun = body.dry_run === true;
  const since = new Date(Date.now() - hours * 3600 * 1000).toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);

  let q = sb.from("creators")
    .select("id, name, facebook_handle, onlyfans_url")
    .eq("status", "active") // SOLO activas (igual que IG/X/TG)
    .not("facebook_handle", "is", null).neq("facebook_handle", "");
  if (onlyIds && onlyIds.length) q = q.in("id", onlyIds);
  const { data: creators, error: cErr } = await q;
  if (cErr) return json({ error: cErr.message }, 500);

  let list = creators || [];
  if (limit > 0) list = list.slice(0, limit);
  const capped = list.length > MAX_CREATORS;
  list = list.slice(0, MAX_CREATORS);

  const results: unknown[] = [];
  let rawSample: unknown = null;
  for (const c of list) {
    try {
      const items = await runApify(APIFY_TOKEN, fbUrl(c.facebook_handle), since, 15);
      if (dryRun && !rawSample && items[0]) rawSample = { keys: Object.keys(items[0]).slice(0, 40), first: items[0] };

      if (!items.length) {
        if (!dryRun) {
          const { data: ex } = await sb.from("promolog_entries")
            .select("id").eq("creator_id", c.id).eq("network", "Facebook").gte("date", today).limit(1);
          if (!ex || !ex.length) {
            await sb.from("promolog_entries").insert({
              tenant_id: TENANT_ID, creator_id: c.id, date: new Date().toISOString(),
              promoted: "false", network: "Facebook", platform: "Ninguna",
              notes: null, evidence_url: null,
              analyzed_by_ai: true, ai_model: "regla-texto-fb", ai_reasoning: "sin-actividad",
              scraped_at: new Date().toISOString(),
            });
          }
        }
        results.push({ creator: c.name, posts: 0, marker: true });
        continue;
      }

      let inserted = 0, promotedCount = 0, skipped = 0;
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        const { promoted, reason } = classifyFb(it, c.onlyfans_url);
        if (promoted) promotedCount++;
        const { firstImage } = postMedia(it);
        const evidence = firstImage || postUrl(it) || null;
        if (dryRun || !evidence) { if (!evidence) skipped++; continue; }

        const { data: dupe } = await sb.from("promolog_entries")
          .select("id").eq("creator_id", c.id).eq("network", "Facebook").eq("evidence_url", evidence).limit(1);
        if (dupe && dupe.length) { skipped++; continue; }

        const d = postDate(it);
        const when = d ? new Date(d) : null;
        const { error: insErr } = await sb.from("promolog_entries").insert({
          tenant_id: TENANT_ID, creator_id: c.id,
          date: (when && !isNaN(when.getTime()) ? when : new Date()).toISOString(),
          promoted: promoted ? "true" : "false", network: "Facebook",
          platform: promoted ? "OnlyFans" : "Ninguna",
          notes: (postText(it) || "").slice(0, 2000) || null,
          evidence_url: evidence,
          analyzed_by_ai: true, ai_model: "regla-texto-fb", ai_reasoning: reason,
          story_index: i, story_count: items.length, scraped_at: new Date().toISOString(),
        });
        if (insErr) results.push({ creator: c.name, insertError: insErr.message });
        else inserted++;
      }
      results.push({ creator: c.name, posts: items.length, promoted: promotedCount, inserted, skipped, ...(dryRun ? { dry_run: true } : {}) });
    } catch (e) {
      results.push({ creator: c.name, error: String((e as Error)?.message || e) });
    }
  }

  return json({ ok: true, since, hours, creators: list.length, capped, results, ...(dryRun ? { rawSample } : {}) });
});
