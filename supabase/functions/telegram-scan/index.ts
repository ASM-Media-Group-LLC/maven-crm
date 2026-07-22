// telegram-scan — verifica promos por TELEGRAM y las registra en promolog_entries.
//
// Es el equivalente de promolog-dispatch+webhook (IG) pero para Telegram:
//   1. Lista creadoras con creators.telegram_handle.
//   2. Por cada una, llama al telegram-gateway POST /channel/join (idempotente:
//      une la cuenta si hace falta, si ya es miembro igual lee; devuelve los
//      posts de las últimas `hours`). El gateway ya está validado (spike).
//   3. Clasifica cada post: ¿hace referencia a su OnlyFans? (regla de Jhon).
//      En canales DRM el texto + links SIEMPRE llegan, así que clasificamos por
//      texto (la imagen es bonus, se suma en un slice posterior).
//   4. Inserta 1 fila por post en promolog_entries con network="Telegram",
//      promoted "true"/"false" — mismo molde que el bot de IG (promolog-webhook).
//      El frontend dedup colapsa a 1 fila/creadora/día (Sí si promocionó en algún post).
//
// Auth: X-Cron-Token (cron) o JWT admin/manager (invocación manual desde el panel).
// IMPORTANTE: deployar con `--no-verify-jwt` (usa X-Cron-Token) — ver memory
// edge_deploy_verify_jwt. Idempotente: no re-inserta un permalink ya guardado.
//
// SECRETOS (Supabase edge function):
//   TELEGRAM_GW_API_KEY     → apikey del telegram-gateway (igual que en Dokploy)
//   TELEGRAM_GW_URL         → (opcional) URL del gateway; default nip.io
//   CRON_INTERNAL_TOKEN     → token del cron (igual que las otras fns)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { classifyLinkDestination } from "../_shared/link-classifier.ts";

const TENANT_ID = "30869615-f579-4981-8a1f-dbebc61eae2d"; // ASM Tech (igual que promolog-dispatch)
const GW_URL = (Deno.env.get("TELEGRAM_GW_URL") || "http://telegram-gw.147.93.3.97.nip.io").replace(/\/+$/, "");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-token",
};

// Deriva el handle de OF desde la URL (https://onlyfans.com/anadevinvip → "anadevinvip").
function ofHandleFromUrl(url: string): string {
  const m = String(url || "").match(/onlyfans\.com\/([A-Za-z0-9_.]+)/i);
  return m ? m[1].toLowerCase() : "";
}

// Regla de Jhon: "promo en Telegram = todo lo que haga referencia a su OnlyFans".
// Heurística conservadora sobre el texto del post (gratis, sin LLM):
//   - link/palabra de onlyfans, o su handle de OF (de creators.onlyfans_url)
//   - otras plataformas de pago / funnels nombrados (fansly/fanvue/piclink/unlok/manyvids)
//   - un link cuyo DESTINO es OF / pago / funnel (link-classifier tier paid|aggregator)
// NO cuenta como promo de OnlyFans (regla explícita del dueño, 2026-07-21): promocionar
// el PROPIO canal/grupo VIP de Telegram, ni vender packs por Telegram/DM. Sin un puntero
// a OF/pago/funnel, un CTA genérico ("suscríbete", "acceso VIP", "packs", "🔞 contenido",
// "mi canal privado") es venta del canal de Telegram, no de OF → NO cuenta.
function classifyPromo(text: string, ofHandles: string[]): { promoted: boolean; reason: string } {
  const raw = text || "";
  const t = raw.toLowerCase();
  const signals: string[] = [];
  // OnlyFans: la palabra "onlyfans"/"only fans" (+ leet 0nly/f4ns) SIEMPRE cuenta. La
  // abreviatura "OF" NO se matchea suelta porque el "of" INGLÉS aparece por todos lados
  // ("Booty OF the day", "House OF CB", "50% OF", "GAME OF THRONES") → sobre-conteo. Solo
  // cuenta la abreviatura en contexto posesivo ("mi/tu/su OF"), que es inequívoco.
  if (/(?:0|o)nly\s?f[a4]ns|\b(?:mi|tu|su)\s+(?:nuev[oa]\s+)?[o0]\.?f\b/i.test(raw)) signals.push("onlyfans");
  // Cualquier nickname de OF (principal + secundarias) cuenta como señal.
  if (ofHandles.some((h) => h && t.includes(h.toLowerCase()))) signals.push("of_handle");
  // Otras plataformas de pago / funnels nombrados. NO "fans" suelto (da FP "hola fans").
  // "linktr(ee)" cubre tanto "linktr.ee" como la palabra "Linktree".
  if (/\bfansly\b|\bfanvue\b|\bpiclink\b|\bunlok\b|\blinktr(?:ee)?\b|\bmanyvids\b/i.test(raw)) signals.push("plataforma");
  // URL/funnel: link en tier PAGO o AGREGADOR (onlyfans, piclink, linktr.ee, bybio…) =
  // puntero a contenido pago. OJO: t.me es NONPAID en el link-classifier → un link a SU
  // canal de Telegram NO cuenta como promo de OF. Reusa la lógica ya vetada del classifier.
  // Captura subdominios completos (\b(?:label\.)+tld) para no perder el host de wrappers
  // sin esquema (l.instagram.com/?u=… → si tomáramos solo "instagram.com" no se desenvuelve).
  const urls = raw.match(/https?:\/\/[^\s]+|\b(?:t|telegram)\.me\/[^\s]+|\b(?:[a-z0-9-]+\.)+(?:co|com|me|link|bio|store|to|ai|ly)\/[^\s]+/gi) || [];
  if (urls.some((u) => { const tier = classifyLinkDestination(u).tier; return tier === "paid" || tier === "aggregator"; })) signals.push("of_link");
  // Todas las señales de arriba son "fuertes" (apuntan a OF / pago / funnel). Si no hay
  // ninguna, es actividad de Telegram genérica (o venta del propio canal) → NO promo de OF.
  const promoted = signals.length > 0;
  return { promoted, reason: signals.join("+") || "sin-señales" };
}

function jsonResponse(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj, null, 2), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const GW_API_KEY = Deno.env.get("TELEGRAM_GW_API_KEY") || "";
  const CRON_TOKEN = Deno.env.get("CRON_INTERNAL_TOKEN");

  const sb = createClient(SUPABASE_URL, SERVICE_KEY);

  // ── Auth: cron (X-Cron-Token) o admin/manager (JWT) ─────────────────────────
  const cronHeader = req.headers.get("x-cron-token");
  const isCron = !!(cronHeader && CRON_TOKEN && cronHeader === CRON_TOKEN);
  if (!isCron) {
    const token = (req.headers.get("Authorization") || "").replace("Bearer ", "");
    const { data: { user } } = await sb.auth.getUser(token);
    if (!user) return jsonResponse({ error: "unauthorized" }, 401);
    const { data: roles } = await sb.from("user_roles").select("role").eq("user_id", user.id);
    const ok = (roles || []).some((r: { role: string }) => r.role === "admin" || r.role === "manager");
    if (!ok) return jsonResponse({ error: "forbidden (admin/manager)" }, 403);
  }

  if (!GW_API_KEY) return jsonResponse({ error: "falta TELEGRAM_GW_API_KEY (secreto de la edge function)" }, 500);

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  // scan_date → columna `date` (el dashboard corta por fecha). Naive, igual que IG.
  const scanDate = (body.scan_date as string) || new Date().toISOString().slice(0, 10);
  const hours = Number(body.hours) || 24;
  const onlyIds = Array.isArray(body.only_creator_ids) ? body.only_creator_ids as string[] : null;
  const dryRun = body.dry_run === true; // clasifica y devuelve, sin insertar (para probar)

  // Creadoras con Telegram (la principal vive en creators.telegram_handle).
  let q = sb.from("creators")
    .select("id, name, instagram_handle, telegram_handle, onlyfans_url")
    .eq("status", "active") // solo creadoras activas (no escanear bajas/terminated)
    .not("telegram_handle", "is", null)
    .neq("telegram_handle", "");
  if (onlyIds && onlyIds.length) q = q.in("id", onlyIds);
  const { data: creators, error: cErr } = await q;
  if (cErr) return jsonResponse({ error: cErr.message }, 500);

  // Multi-cuenta: nicknames de OF por creadora (principal onlyfans_url + secundarias)
  // → señal of_handle; y canales TELEGRAM extra (también se escanean). Una sola query
  // a creator_social_accounts: network in (onlyfans, telegram).
  const ofNicksByCreator = new Map<string, string[]>();
  for (const c of creators || []) { const p = ofHandleFromUrl(c.onlyfans_url); ofNicksByCreator.set(c.id, p ? [p] : []); }
  const tgExtraByCreator = new Map<string, string[]>();
  const creatorIds = (creators || []).map((c: any) => c.id);
  if (creatorIds.length) {
    const { data: extra } = await sb.from("creator_social_accounts")
      .select("creator_id, network, username").in("network", ["onlyfans", "telegram"]).eq("active", true).in("creator_id", creatorIds);
    for (const a of (extra ?? []) as Array<{ creator_id: string; network: string; username: string }>) {
      const u = String(a.username || "").trim();
      if (!u) continue;
      if (a.network === "onlyfans") {
        const nick = u.replace(/^@+/, "").toLowerCase();
        const arr = ofNicksByCreator.get(a.creator_id) ?? [];
        if (nick && !arr.includes(nick)) arr.push(nick);
        ofNicksByCreator.set(a.creator_id, arr);
      } else { // telegram extra → se escanea igual que el canal principal
        const arr = tgExtraByCreator.get(a.creator_id) ?? [];
        if (!arr.includes(u)) arr.push(u);
        tgExtraByCreator.set(a.creator_id, arr);
      }
    }
  }

  // Targets de escaneo: canal principal (telegram_handle) + cada canal TG extra. Cada
  // target se une/escanea por separado y la fila lleva source_handle = ese canal.
  const targets: Array<{ c: any; handle: string }> = [];
  for (const c of creators || []) {
    targets.push({ c, handle: c.telegram_handle });
    for (const u of tgExtraByCreator.get(c.id) ?? []) targets.push({ c, handle: u });
  }

  const results: unknown[] = [];
  for (const t of targets) {
    const c = t.c;
    const handle = t.handle;
    try {
      const r = await fetch(`${GW_URL}/channel/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: GW_API_KEY },
        body: JSON.stringify({ link: handle, hours }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) { results.push({ creator: c.name, ok: false, error: j.error || `gw ${r.status}` }); continue; }
      if (j.pending) { results.push({ creator: c.name, ok: true, pending: true, note: "esperando aprobación del admin del canal" }); continue; }

      const posts: Array<{ id: number; text: string; permalink: string; hasMedia: boolean; mediaDownloadable: boolean }> = j.posts || [];
      let inserted = 0, promotedCount = 0, skipped = 0;
      for (let i = 0; i < posts.length; i++) {
        const p = posts[i];
        const { promoted, reason } = classifyPromo(p.text, ofNicksByCreator.get(c.id) ?? []);
        if (promoted) promotedCount++;
        if (dryRun) continue;

        // Idempotente: no re-insertar el mismo permalink (re-corridas no duplican).
        if (p.permalink) {
          const { data: dupe } = await sb.from("promolog_entries")
            .select("id").eq("creator_id", c.id).eq("network", "Telegram").eq("evidence_url", p.permalink).limit(1);
          if (dupe && dupe.length) { skipped++; continue; }
        }

        const { error: insErr } = await sb.from("promolog_entries").insert({
          tenant_id: TENANT_ID,
          creator_id: c.id,
          // Telegram tiene fecha real por post → la usamos (a diferencia de IG
          // stories que son del día). Así cada promo cae en SU día.
          date: p.date ? new Date(p.date * 1000).toISOString() : scanDate,
          promoted: promoted ? "true" : "false",
          network: "Telegram",
          platform: promoted ? "OnlyFans" : "Ninguna",
          notes: (p.text || "").slice(0, 2000) || null,
          evidence_url: p.permalink || null,
          analyzed_by_ai: true,
          ai_model: "heuristic-of-v1",
          ai_reasoning: reason,
          source_handle: (handle || "").trim() || null,
          story_index: i,
          story_count: posts.length,
          scraped_at: new Date().toISOString(),
        });
        if (insErr) { results.push({ creator: c.name, insertError: insErr.message }); }
        else inserted++;
      }
      // Marker "revisada · sin actividad" si el canal no tuvo posts → la columna
      // Red Social muestra Telegram en gris (dejamos constancia del scan). 1/día.
      if (posts.length === 0 && !dryRun) {
        const today = new Date().toISOString().slice(0, 10);
        const { data: ex } = await sb.from("promolog_entries")
          .select("id").eq("creator_id", c.id).eq("network", "Telegram").gte("date", today).limit(1);
        if (!ex || !ex.length) {
          await sb.from("promolog_entries").insert({
            tenant_id: TENANT_ID, creator_id: c.id, date: new Date().toISOString(),
            promoted: "false", network: "Telegram", platform: "Ninguna",
            notes: null, evidence_url: null,
            analyzed_by_ai: true, ai_model: "heuristic-of-v1", ai_reasoning: "sin-actividad",
            scraped_at: new Date().toISOString(),
          });
        }
      }
      results.push({
        creator: c.name, ok: true, channel: j.channel?.title ?? null, protected: !!j.protected,
        joined: !!j.joined, alreadyMember: !!j.alreadyMember, posts: posts.length, promoted: promotedCount,
        inserted, skipped, ...(dryRun ? { dry_run: true } : {}),
      });
    } catch (e) {
      results.push({ creator: c.name, ok: false, error: String((e as Error)?.message || e) });
    }
  }

  return jsonResponse({ ok: true, scan_date: scanDate, hours, creators: creators?.length || 0, results });
});
