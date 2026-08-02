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
import { postKey, MARKER_KEY, esDuplicado, clavesYaGuardadas } from "../_shared/promolog-dedup.ts";

const TENANT_ID = "30869615-f579-4981-8a1f-dbebc61eae2d"; // ASM Tech (igual que promolog-dispatch)
const GW_URL = (Deno.env.get("TELEGRAM_GW_URL") || "http://telegram-gw.147.93.3.97.nip.io").replace(/\/+$/, "");

// Ritmo contra el gateway MTProto. Diagnóstico 30/07: el edge disparaba los ~37 canales
// sin pausa → el gateway (sesión única en el VPS) se saturaba a mitad y devolvía 502/504 en
// una banda corrida de ~13 canales, hasta recuperarse solo. THROTTLE (con jitter) espacia
// las llamadas para NO provocar ese atragantamiento; el reintento pesca los 502 que igual
// se cuelen. El 504 NO se reintenta (puede tapar un floodwait, ver el loop).
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const THROTTLE_MS = 400;        // pausa base entre canales (+ jitter 0-400ms)
const GW_RETRY_PAUSE_MS = 2500; // espera antes del único reintento en 502

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

// ── Segunda opinión de IA (SOLO texto, SOLO para "sin-señales") ─────────────────
// Telegram era la única red 100% heurística sin red de seguridad de IA (la media viene
// protegida → no hay visión). La heurística pierde obfuscaciones que un humano lee al
// vuelo: "𝑶𝑵𝑳𝒀𝑭𝑨𝑵𝑺" estilizado, typos ("onlifans"), referencias fraseadas raro.
// Repesca: un post que la heurística dejó en "sin-señales" pasa por Gemini con la MISMA
// regla estricta del dueño (solo puntero a OF/pago/funnel; canal VIP/packs/DM ≠ OF).
// La IA solo puede subir No→Sí con puntero explícito; NUNCA baja un Sí heurístico.
// Cap por corrida + best-effort: si la IA falla, queda el veredicto heurístico.
const LLM_MODEL = "google/gemini-2.5-flash";
const LLM_CAP_PER_RUN = 40;
const TG_LLM_PROMPT = `Sos analista de una agencia de OnlyFans. REGLA ESTRICTA del dueño: un post del canal de Telegram de una creadora cuenta como PROMOCIÓN DE SU ONLYFANS solo si APUNTA a su contenido de pago FUERA de Telegram: menciona OnlyFans (incluye typos, leet o letras estilizadas: 0nlyfans, onlifans, 𝑶𝑵𝑳𝒀𝑭𝑨𝑵𝑺, "mi OF", "mi Only"), otra plataforma de pago (Fansly, Fanvue, ManyVids), un funnel/link-in-bio (linktr.ee, bybio, beacons, piclink, stan store, allmylinks), o el nick de OF de la creadora.
NO cuenta (promoted=false): promocionar su propio canal/grupo VIP de Telegram, vender packs por DM ("escríbeme", "mp"), contenido +18/🔞 SIN destino de pago nombrado, publicidad de marcas/tiendas, casino/apuestas/trading/"gana dinero", saludos y vida diaria. Si la referencia es ambigua o implícita sin destino claro → promoted=false.
Respondé SOLO JSON: {"promoted": true|false, "reason": "breve, en español"}`;

async function llmSecondOpinion(text: string, ofHandles: string[], apiKey: string): Promise<{ promoted: boolean; reason: string }> {
  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 12000);
    const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}`, "HTTP-Referer": "https://maven.asmtech.me", "X-Title": "Maven Promolog TG" },
      body: JSON.stringify({
        model: LLM_MODEL,
        messages: [{ role: "user", content: `${TG_LLM_PROMPT}\n\nNicks de OF de ESTA creadora: ${ofHandles.filter(Boolean).join(", ") || "(ninguno)"}\nPost del canal:\n"""${(text || "").slice(0, 1200)}"""` }],
        response_format: { type: "json_object" }, temperature: 0, max_tokens: 200,
      }),
      signal: ac.signal,
    });
    clearTimeout(t);
    if (!resp.ok) return { promoted: false, reason: `or_${resp.status}` };
    const raw = ((await resp.json()) as any)?.choices?.[0]?.message?.content ?? "";
    let parsed: any = null;
    try { parsed = JSON.parse(raw); } catch { try { parsed = JSON.parse(String(raw).replace(/```(?:json)?/gi, "").trim()); } catch { /* noop */ } }
    if (!parsed) return { promoted: false, reason: "llm_parse" };
    return { promoted: parsed.promoted === true, reason: String(parsed.reason || "").slice(0, 160) };
  } catch (e) {
    return { promoted: false, reason: `llm:${String((e as Error)?.message || e).slice(0, 60)}` };
  }
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

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  // scan_date → columna `date` (el dashboard corta por fecha). Naive, igual que IG.
  const scanDate = (body.scan_date as string) || new Date().toISOString().slice(0, 10);
  const hours = Number(body.hours) || 24;
  const onlyIds = Array.isArray(body.only_creator_ids) ? body.only_creator_ids as string[] : null;
  const dryRun = body.dry_run === true; // clasifica y devuelve, sin insertar (para probar)

  // ── MODO INGEST (Plan B local) ──────────────────────────────────────────────
  // El scraper LOCAL (Playwright + web.telegram.org, cuenta dedicada) lee los
  // canales y manda acá los posts YA scrapeados. Reusamos la MISMA clasificación
  // (classifyPromo + repesca LLM) y el MISMO persist que el path del gateway — cero
  // lógica duplicada. NO toca el gateway (no necesita GW_API_KEY). Auth: x-cron-token.
  //   body: { mode:"ingest", items:[ { creator_id, source_handle?, posts:[{text, permalink?, date?}] } ] }
  if (body.mode === "ingest") {
    const items = Array.isArray(body.items) ? body.items as Array<any> : [];
    if (!items.length) return jsonResponse({ ok: true, note: "sin items" });
    const OPENROUTER = Deno.env.get("OPENROUTER_API_KEY") || "";
    const ids = [...new Set(items.map((it) => it.creator_id).filter(Boolean))];
    // OF nicks por creadora (para la clasificación), igual que el path normal.
    const nicksByCreator = new Map<string, string[]>();
    if (ids.length) {
      const { data: crs } = await sb.from("creators").select("id, onlyfans_url").in("id", ids);
      for (const c of (crs ?? []) as any[]) { const p = ofHandleFromUrl(c.onlyfans_url); nicksByCreator.set(c.id, p ? [p] : []); }
      const { data: extra } = await sb.from("creator_social_accounts").select("creator_id, username").eq("network", "onlyfans").eq("active", true).in("creator_id", ids);
      for (const a of (extra ?? []) as any[]) { const nick = String(a.username || "").replace(/^@+/, "").toLowerCase(); if (!nick) continue; const arr = nicksByCreator.get(a.creator_id) ?? []; if (!arr.includes(nick)) arr.push(nick); nicksByCreator.set(a.creator_id, arr); }
    }
    let inserted = 0, promotedTotal = 0, llmUsed2 = 0;
    // Lo ya analizado no vuelve a pasar por el LLM (ver clavesYaGuardadas).
    const yaGuardadas = await clavesYaGuardadas(sb, { creatorIds: ids, network: "telegram" });
    const out: unknown[] = [];
    for (const it of items) {
      const cid = it.creator_id;
      if (!cid) { out.push({ skip: "sin_creator_id" }); continue; }
      const nicks = nicksByCreator.get(cid) ?? [];
      const posts: Array<{ text?: string; permalink?: string; date?: number }> = Array.isArray(it.posts) ? it.posts : [];
      let ins = 0, promo = 0, yaVistos = 0;
      for (let i = 0; i < posts.length; i++) {
        const p = posts[i];
        // La clave se calcula ANTES de clasificar: si el post ya está guardado no hay
        // nada que analizar. El veredicto guardado se reusa para que el conteo de
        // promos del informe siga siendo correcto.
        const clave = postKey({ permalink: p.permalink, text: p.text, date: p.date, index: i });
        const yaVisto = yaGuardadas.get(`${cid}|${clave}`);
        if (yaVisto !== undefined) { yaVistos++; if (yaVisto) promo++; continue; }
        let { promoted, reason } = classifyPromo(p.text || "", nicks);
        let aiModel = "heuristic-of-v1";
        if (!promoted && reason === "sin-señales" && OPENROUTER && llmUsed2 < LLM_CAP_PER_RUN && (p.text || "").trim().length >= 8) {
          llmUsed2++;
          const v = await llmSecondOpinion(p.text || "", nicks, OPENROUTER);
          if (v.promoted) { promoted = true; reason = `llm:${v.reason}`; aiModel = "heuristic+gemini-text-v1"; }
        }
        if (promoted) promo++;
        if (dryRun) continue;
        // Ya no hay "buscá antes de insertar": la clave viaja en la fila y el índice
        // único la rechaza si ya está. Reprocesar es inofensivo y no hay carrera.
        const { error: insErr } = await sb.from("promolog_entries").insert({
          dedup_key: clave,
          tenant_id: TENANT_ID, creator_id: cid,
          date: p.date ? new Date(p.date * 1000).toISOString() : scanDate,
          promoted: promoted ? "true" : "false", network: "telegram",
          platform: promoted ? "OnlyFans" : "Ninguna",
          notes: (p.text || "").slice(0, 2000) || null, evidence_url: p.permalink || null,
          analyzed_by_ai: true, ai_model: aiModel, ai_reasoning: reason,
          source_handle: (it.source_handle || "").trim() || null,
          story_index: i, story_count: posts.length, scraped_at: new Date().toISOString(),
        });
        if (!insErr) { ins++; inserted++; }
        else if (!esDuplicado(insErr)) out.push({ creator_id: cid, insertError: insErr.message });
      }
      // Marker "sin actividad" si el canal no trajo posts (1/día). El chequeo previo
      // usaba `date >= hoy-en-UTC`, que después de las 19:00 Bogotá apunta al día
      // SIGUIENTE → no encontraba nada y reinsertaba el marcador en cada corrida.
      // Ahora la unicidad la da el índice sobre `dia` (que ya es día de Bogotá).
      if (posts.length === 0 && !dryRun) {
        await sb.from("promolog_entries").insert({ dedup_key: MARKER_KEY, tenant_id: TENANT_ID, creator_id: cid, date: new Date().toISOString(), promoted: "false", network: "telegram", platform: "Ninguna", analyzed_by_ai: true, ai_model: "heuristic-of-v1", ai_reasoning: "sin-actividad", scraped_at: new Date().toISOString() });
      }
      promotedTotal += promo;
      out.push({ creator_id: cid, source_handle: it.source_handle, posts: posts.length, promoted: promo, inserted: ins, ya_analizados: yaVistos });
    }

    // ── INFORME DE LA CORRIDA (queda accesible para el bot) ───────────────────
    // Guarda qué se leyó, qué promocionó y —clave— QUÉ NO SE PUDO LEER Y POR QUÉ.
    // Sin esto, un canal ilegible es invisible: no genera fila (a propósito, para
    // no escribir un "No" falso) y nadie se entera de que quedó sin revisar.
    const noLegibles = Array.isArray(body.unreadable) ? body.unreadable as Array<any> : [];
    // El scraper local postea en TANDAS para que el veredicto (promo sí/no) aparezca
    // mientras corre, en vez de esperar ~9 min al final. `acumulado` trae los totales
    // de las tandas previas y `final` marca la última: el informe se escribe UNA vez.
    const acumulado = (body.acumulado ?? null) as any;
    const esFinal = body.final !== false;
    const conPromo = out.filter((r: any) => r.promoted > 0);
    const sinPromo = out.filter((r: any) => r.promoted === 0 && r.posts > 0);
    const sinPosts = out.filter((r: any) => r.posts === 0);
    const resumen = {
      red: "telegram", origen: "agente local",
      canales_leidos: out.length + (acumulado?.leidos ?? 0),
      con_promo: conPromo.length + (acumulado?.con_promo ?? 0),
      sin_promo: sinPromo.length + (acumulado?.sin_promo ?? 0),
      leidos_sin_posts: sinPosts.length + (acumulado?.leidos_sin_posts ?? 0),
      no_legibles: noLegibles.length,
      detalle_con_promo: [...(acumulado?.detalle_con_promo ?? []), ...conPromo.map((r: any) => ({ handle: r.source_handle, promos: r.promoted }))],
      detalle_no_legibles: noLegibles.map((u: any) => ({ handle: u.handle ?? u.source_handle, motivo: u.reason ?? "desconocido" })),
    };
    if (!dryRun && esFinal) {
      await sb.from("promolog_dispatch_runs").insert({
        tenant_id: TENANT_ID, apify_actor_id: "local-agent", status: "succeeded",
        creators_count: items.length + noLegibles.length, creators_succeeded: out.length,
        creators_failed: noLegibles.length, entries_created: inserted,
        payload: { source: "local", network: "telegram", resumen },
        finished_at: new Date().toISOString(),
      });
    }
    return jsonResponse({ ok: true, mode: "ingest", source: "local", items: items.length, inserted, promoted: promotedTotal, resumen, ...(dryRun ? { dry_run: true } : {}), results: out });
  }

  // ── MODO TARGETS ────────────────────────────────────────────────────────────
  // Le da al scraper LOCAL la lista de canales a leer (principal + extra), con el
  // creator_id, sin tocar el gateway.  body: { mode:"targets" }
  if (body.mode === "targets") {
    const { data: crs } = await sb.from("creators").select("id, name, artistic_name, telegram_handle").eq("status", "active").not("telegram_handle", "is", null).neq("telegram_handle", "");
    const cids = (crs ?? []).map((c: any) => c.id);
    const extraByCreator = new Map<string, string[]>();
    if (cids.length) {
      const { data: ex } = await sb.from("creator_social_accounts").select("creator_id, username").eq("network", "telegram").eq("active", true).in("creator_id", cids);
      for (const a of (ex ?? []) as any[]) { const u = String(a.username || "").trim(); if (!u) continue; const arr = extraByCreator.get(a.creator_id) ?? []; if (!arr.includes(u)) arr.push(u); extraByCreator.set(a.creator_id, arr); }
    }
    const targets: any[] = [];
    for (const c of (crs ?? []) as any[]) {
      targets.push({ creator_id: c.id, name: c.artistic_name || c.name, handle: c.telegram_handle });
      for (const u of extraByCreator.get(c.id) ?? []) targets.push({ creator_id: c.id, name: c.artistic_name || c.name, handle: u });
    }
    return jsonResponse({ ok: true, mode: "targets", count: targets.length, targets });
  }

  if (!GW_API_KEY) return jsonResponse({ error: "falta TELEGRAM_GW_API_KEY (secreto de la edge function)" }, 500);

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
  // Posts ya analizados: se consultan UNA vez para toda la corrida y evitan repetir
  // el LLM en cada escaneo del día (ver clavesYaGuardadas).
  const yaGuardadasTg = await clavesYaGuardadas(sb, { creatorIds, network: "telegram" });
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

  // ROTACIÓN JUSTA (igual x-scan #934 / fb-scan #940): las creadoras que hace más que no
  // se escanean por Telegram van PRIMERO. Antes el orden era el de la vista (siempre las
  // mismas primero) → si el gateway se satura a mitad de corrida, la cola de atrás nunca se
  // alcanzaba (Yoisnia caía siempre en la banda de 502). Con rotación, la banda —si queda
  // alguna tras el reintento— cae en creadoras DISTINTAS cada corrida → cobertura completa
  // en pocas pasadas. Nunca-escaneada = prioridad máxima (last=0). Se salta si only_ids.
  if (!onlyIds && (creators?.length ?? 0) > 1 && creatorIds.length) {
    const lastScan = new Map<string, number>();
    // Ventana de 21 días (NO limit(1000) crudo): con 1 fila por post, una creadora chatty se
    // come el tope de 1000 filas de PostgREST y las demás caen a last=0 → el sort estable
    // deja el orden original y vuelve la starvation que esto quería matar. Acotar por fecha
    // (patrón de x-scan/fb-scan) mantiene ≤1 punto por creadora relevante.
    const since = new Date(Date.now() - 21 * 864e5).toISOString();
    const { data: recent } = await sb.from("promolog_entries")
      .select("creator_id, created_at")
      .eq("network", "telegram")
      .in("creator_id", creatorIds)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(2000);
    for (const r of (recent ?? []) as Array<{ creator_id: string; created_at: string }>) {
      if (!lastScan.has(r.creator_id)) lastScan.set(r.creator_id, new Date(r.created_at).getTime());
    }
    (creators as any[]).sort((a, b) => (lastScan.get(a.id) ?? 0) - (lastScan.get(b.id) ?? 0));
  }

  // Targets de escaneo: canal principal (telegram_handle) + cada canal TG extra. Cada
  // target se une/escanea por separado y la fila lleva source_handle = ese canal.
  const allTargets: Array<{ c: any; handle: string }> = [];
  for (const c of creators || []) {
    allTargets.push({ c, handle: c.telegram_handle });
    for (const u of tgExtraByCreator.get(c.id) ?? []) allTargets.push({ c, handle: u });
  }
  // CAP POR CORRIDA (como x-scan #934 / fb-scan #940): el gateway serial + throttle + inserts
  // no entra en el wall-clock de ~150s del edge con las ~37 (se comió un 504 IDLE_TIMEOUT).
  // Cortamos a MAX y dejamos que la ROTACIÓN reparta el resto entre las corridas del día
  // (cron 20:30/08:30/14:00 + sweeps) — los primeros del array ya son los más atrasados.
  // Una corrida manual con only_creator_ids no se capa (batch chico dirigido).
  const MAX_TARGETS_PER_RUN = 22;
  const targets = onlyIds ? allTargets : allTargets.slice(0, MAX_TARGETS_PER_RUN);
  const skipped_por_cap = allTargets.length - targets.length;

  const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY") || "";
  let llmUsed = 0; // cap de costo/tiempo por corrida (solo repesca de "sin-señales")

  const results: unknown[] = [];
  const runStarted = Date.now();
  const RUN_BUDGET_MS = 100_000; // corte prolijo con margen antes del wall-clock del edge (~150s)
  for (const t of targets) {
    // GUARDA DE TIEMPO: cortamos a 120s con lo hecho (los inserts ya commitearon uno a uno)
    // en vez de que la plataforma mate la función seca sin devolver `results`. La rotación
    // hace que la próxima corrida retome por donde quedó.
    if (Date.now() - runStarted > RUN_BUDGET_MS) {
      results.push({ ok: false, aborted: "time_budget", note: "corrida cortada a 120s; el resto lo retoma la próxima por rotación" });
      break;
    }
    const c = t.c;
    const handle = t.handle;
    try {
      const doJoin = async () => {
        const rr = await fetch(`${GW_URL}/channel/join`, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: GW_API_KEY },
          body: JSON.stringify({ link: handle, hours }),
        });
        const jj = await rr.json().catch(() => ({}));
        return { r: rr, j: jj };
      };
      let { r, j } = await doJoin();
      // Reintento SUAVE y ACOTADO: SOLO en 502 (Bad Gateway = el gateway se saturó y rechazó
      // la conexión; se recupera solo). NO reintentamos 504: un timeout del upstream puede
      // ENMASCARAR un FLOOD_WAIT en curso (el cliente MTProto duerme la espera) y reintentar
      // ahí golpea una cuenta que Telegram ya está limitando → ban (ver promolog_direct_read_ig_ban).
      if (r.status === 502) {
        await sleep(GW_RETRY_PAUSE_MS);
        ({ r, j } = await doJoin());
      }
      // CIRCUIT-BREAKER: si el gateway reporta floodwait/peer_flood explícito, Telegram YA está
      // limitando la cuenta → cortamos la corrida ENTERA, no seguimos golpeando canal por canal.
      if (/flood|peer_flood/i.test(String(j?.error ?? ""))) {
        results.push({ creator: c.name, ok: false, error: j.error, aborted: "floodwait" });
        break;
      }
      if (!r.ok || !j.ok) { results.push({ creator: c.name, ok: false, error: j.error || `gw ${r.status}` }); continue; }
      if (j.pending) { results.push({ creator: c.name, ok: true, pending: true, note: "esperando aprobación del admin del canal" }); continue; }

      // `date` (unix s) lo devuelve el gateway y ya se usaba abajo para que la fila
      // caiga en SU día; faltaba en el tipo nomás.
      const posts: Array<{ id: number; date?: number; text: string; permalink: string; hasMedia: boolean; mediaDownloadable: boolean }> = j.posts || [];
      let inserted = 0, promotedCount = 0, skipped = 0, yaAnalizados = 0;
      for (let i = 0; i < posts.length; i++) {
        const p = posts[i];
        const nicks = ofNicksByCreator.get(c.id) ?? [];
        // Ya analizado → se reusa el veredicto y no se gasta LLM (ver clavesYaGuardadas).
        const claveTg = postKey({ permalink: p.permalink, text: p.text, date: p.date, index: i });
        const yaVistoTg = yaGuardadasTg.get(`${c.id}|${claveTg}`);
        if (yaVistoTg !== undefined) { yaAnalizados++; if (yaVistoTg) promotedCount++; continue; }
        let { promoted, reason } = classifyPromo(p.text, nicks);
        let aiModel = "heuristic-of-v1";
        // Repesca IA: solo cuando la heurística NO vio nada ("sin-señales" — un guard
        // como brand_ad/money_making es un No FIRME y no se repesca) y hay texto real.
        // Se apaga si queda poco presupuesto de tiempo (cada llamada aborta a 12s → puede
        // desbordar el wall-clock; mejor un No heurístico que un 504 que mata la corrida).
        const hayPresupuestoLLM = (Date.now() - runStarted) < (RUN_BUDGET_MS - 15_000);
        if (!promoted && reason === "sin-señales" && hayPresupuestoLLM && OPENROUTER_API_KEY && llmUsed < LLM_CAP_PER_RUN && (p.text || "").trim().length >= 8) {
          llmUsed++;
          const v = await llmSecondOpinion(p.text, nicks, OPENROUTER_API_KEY);
          if (v.promoted) { promoted = true; reason = `llm:${v.reason}`; aiModel = "heuristic+gemini-text-v1"; }
        }
        if (promoted) promotedCount++;
        if (dryRun) continue;

        // Idempotencia por índice único, no por "buscar antes de insertar": aquel
        // chequeo se salteaba entero cuando no había permalink (canales privados) y
        // además dos corridas simultáneas lo pasaban las dos.
        const { error: insErr } = await sb.from("promolog_entries").insert({
          dedup_key: claveTg,
          tenant_id: TENANT_ID,
          creator_id: c.id,
          // Telegram tiene fecha real por post → la usamos (a diferencia de IG
          // stories que son del día). Así cada promo cae en SU día.
          date: p.date ? new Date(p.date * 1000).toISOString() : scanDate,
          promoted: promoted ? "true" : "false",
          network: "telegram",
          platform: promoted ? "OnlyFans" : "Ninguna",
          notes: (p.text || "").slice(0, 2000) || null,
          evidence_url: p.permalink || null,
          analyzed_by_ai: true,
          ai_model: aiModel,
          ai_reasoning: reason,
          source_handle: (handle || "").trim() || null,
          story_index: i,
          story_count: posts.length,
          scraped_at: new Date().toISOString(),
        });
        if (insErr) { if (esDuplicado(insErr)) skipped++; else results.push({ creator: c.name, insertError: insErr.message }); }
        else inserted++;
      }
      // Marker "revisada · sin actividad" si el canal no tuvo posts → la columna
      // Red Social muestra Telegram en gris (dejamos constancia del scan). 1/día,
      // garantizado por el índice sobre `dia` (día de Bogotá). El chequeo anterior
      // comparaba contra el día en UTC: pasadas las 19:00 de Bogotá miraba el día
      // siguiente, no encontraba nada y reinsertaba el marcador en cada corrida.
      if (posts.length === 0 && !dryRun) {
        {
          await sb.from("promolog_entries").insert({
            dedup_key: MARKER_KEY,
            tenant_id: TENANT_ID, creator_id: c.id, date: new Date().toISOString(),
            promoted: "false", network: "telegram", platform: "Ninguna",
            notes: null, evidence_url: null,
            analyzed_by_ai: true, ai_model: "heuristic-of-v1", ai_reasoning: "sin-actividad",
            scraped_at: new Date().toISOString(),
          });
        }
      }
      results.push({
        creator: c.name, ok: true, channel: j.channel?.title ?? null, protected: !!j.protected,
        joined: !!j.joined, alreadyMember: !!j.alreadyMember, posts: posts.length, promoted: promotedCount, ya_analizados: yaAnalizados,
        inserted, skipped, ...(dryRun ? { dry_run: true } : {}),
      });
    } catch (e) {
      results.push({ creator: c.name, ok: false, error: String((e as Error)?.message || e) });
    } finally {
      // Throttle CON JITTER entre canales: no saturar el gateway (evita la banda de 502) y
      // no marcar un ritmo robótico perfecto (los antispam premian variación humana).
      await sleep(THROTTLE_MS + Math.floor(Math.random() * 400));
    }
  }

  return jsonResponse({ ok: true, scan_date: scanDate, hours, creators: creators?.length || 0,
    targets_run: targets.length, skipped_por_cap, results });
});
