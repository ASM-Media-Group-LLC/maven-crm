// promolog-scan-targets — le da a la extensión la lista de creadoras activas a
// escanear en IG: handle + (si está cacheado) el user-id numérico. Si no hay id, la
// extensión lo resuelve sola desde el navegador (web_profile_info). Read-only.
// Auth: header `x-ext-token` == secret PROMOLOG_EXT_TOKEN. Deploy --no-verify-jwt.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-ext-token",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const norm = (s: string | null | undefined) =>
  String(s ?? "").toLowerCase().replace(/.*instagram\.com\//i, "").replace(/[@/\s]/g, "").replace(/[/?#].*$/, "").trim();

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const EXT_TOKEN = Deno.env.get("PROMOLOG_EXT_TOKEN");
  if (!EXT_TOKEN || req.headers.get("x-ext-token") !== EXT_TOKEN) return json({ error: "unauthorized" }, 401);

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

  // ── ?mode=estado — ÚLTIMA CORRIDA POR RED ─────────────────────────────────
  // El panel local no tenía forma de saber cuándo fue el último scan de cada red
  // ni cómo salió: había que abrir Maven o preguntarle al bot. Se sirve desde acá
  // (y no en una función nueva) porque el agente YA llama a este endpoint con el
  // mismo token — cero configuración extra.
  //
  // Los datos salen de promolog_dispatch_runs, que es donde cada corrida deja su
  // resumen; se derivan del MISMO payload que lee get_promolog_scan_report, así
  // que el panel y el bot cuentan la misma historia.
  if ((new URL(req.url)).searchParams.get("mode") === "estado") {
    const { data, error } = await sb.from("promolog_dispatch_runs")
      .select("created_at, apify_actor_id, creators_count, entries_created, payload")
      .order("created_at", { ascending: false }).limit(120);
    if (error) return json({ error: error.message }, 500);

    const porRed: Record<string, unknown> = {};
    for (const r of (data ?? []) as Array<any>) {
      // La red viene del payload (Telegram/X la declaran) o se infiere del actor:
      // las corridas de IG son las de la extensión / el agente local.
      // OJO con los nombres de actor: Telegram/X locales escriben "local-agent",
      // el ingest de IG del agente escribe "promolog-agent" y la extensión
      // "browser-extension". Solo las corridas de IG carecen de payload.network.
      const actor = String(r.apify_actor_id ?? "");
      const esIG = actor === "browser-extension" || actor === "promolog-agent";
      const red = String(r.payload?.network ?? "").toLowerCase() || (esIG ? "instagram" : "");
      if (!red || porRed[red]) continue;   // ya tenemos la más reciente de esa red
      porRed[red] = {
        cuando: r.created_at,
        origen: actor === "browser-extension" ? "extensión"
              : (actor === "promolog-agent" || actor === "local-agent" || r.payload?.source === "local")
                ? "agente local" : "servidor",
        creadoras: r.creators_count ?? null,
        entradas: r.entries_created ?? null,
        resumen: r.payload?.resumen ?? null,
      };
    }
    return json({ ok: true, redes: porRed });
  }

  // ── REPARTO DE CARGA ENTRE CUENTAS SCANNER (slot A/B) ─────────────────────
  // El burn de IG es por VOLUMEN por sesión: una cuenta haciendo 75 lecturas se
  // sensibiliza y cae; dos cuentas haciendo ~37 c/u no. Cada cliente lector se
  // identifica con ?slot=a|b&slots=2 y recibe SOLO su partición. La partición es
  // por creator_id (hash estable) → todas las cuentas de IG de una creadora caen
  // en el MISMO slot (la misma cuenta scanner las lee → no se pisan entre cuentas).
  // Sin slot → devuelve TODO (compatible con la extensión actual y con 1 sola cuenta).
  const url = new URL(req.url);
  const slotParam = (url.searchParams.get("slot") ?? "").trim().toLowerCase();
  const slotsCount = Math.max(1, Math.min(Number(url.searchParams.get("slots") ?? "0") || 0, 8));
  // slot como índice: "a"→0, "b"→1, … o numérico "0","1".
  const slotIdx = /^\d+$/.test(slotParam) ? Number(slotParam)
    : (slotParam.length === 1 && slotParam >= "a" && slotParam <= "h" ? slotParam.charCodeAt(0) - 97 : -1);
  const partitionOn = slotsCount >= 2 && slotIdx >= 0 && slotIdx < slotsCount;
  // Hash determinístico y balanceado del uuid (FNV-1a sobre los hex del creator_id).
  const creatorSlot = (creatorId: string): number => {
    let h = 0x811c9dc5;
    for (let i = 0; i < creatorId.length; i++) { h ^= creatorId.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return (h >>> 0) % slotsCount;
  };

  // Activas elegibles (misma vista que el resto de Promolog).
  const { data: creators, error } = await (sb as any)
    .from("v_promolog_eligible_creators").select("id, instagram_handle, name, artistic_name");
  if (error) return json({ error: error.message }, 500);

  // ids cacheados (para que la extensión no tenga que resolverlos). El caché es por
  // (creadora, cuenta) — cubre la principal Y las extra de creator_social_accounts.
  // Sin el id, la extensión resuelve vía web_profile_info, el endpoint que IG limita
  // silenciosamente → las cuentas sin caché salían "throttled" en cada corrida.
  const ids = (creators ?? []).map((c: any) => c.id);
  const idByAccount = new Map<string, string>(); // `${creator_id}:${handle}` → ig_user_id
  if (ids.length) {
    const { data: cached } = await (sb as any).from("promolog_ig_identity").select("creator_id, handle, ig_user_id").in("creator_id", ids);
    for (const r of (cached ?? [])) idByAccount.set(`${r.creator_id}:${norm(r.handle)}`, r.ig_user_id);
  }

  // Estado del scan de HOY para ordenar: nunca-escaneada (0) → pendiente/reintentable (1)
  // → definitiva Sí/No (2). Así una corrida parcial de la extensión ataca la cola sin
  // escanear en vez de re-leer siempre el principio. Si el RPC falla, se cae al orden de
  // la vista (todas rank 0 = orden por c.id) → cero pérdida de cobertura.
  // Estado del scan de HOY por (creator_id, handle) — NO por creador. Antes era por
  // creador y eso hacía que la 2ª/3ª cuenta de IG heredara el rank de la principal y
  // quedara al fondo de la cola para siempre (caso yessca2of, ver migración
  // 20260730120000). La clave es `${creator_id}:${handle normalizado}`.
  const definitive = new Set<string>();
  const scannedAny = new Set<string>();
  try {
    const { data: st } = await (sb as any).rpc("promolog_ig_scan_state_today");
    for (const r of (st ?? [])) {
      const k = `${r.creator_id}:${norm(r.source_handle)}`;
      scannedAny.add(k);
      if (r.has_definitive === true) definitive.add(k);
    }
  } catch (_) { /* fallback: orden de la vista (c.id) */ }
  const rank = (cid: string, handle: string) => {
    const k = `${cid}:${handle}`;
    return !scannedAny.has(k) ? 0 : (definitive.has(k) ? 2 : 1);
  };

  // Cuentas de IG ADICIONALES (creator_social_accounts) — igual que x-scan/fb-scan/
  // telegram-scan, que SÍ escanean las cuentas extra. La vista solo trae el
  // instagram_handle PRINCIPAL, así que sin esto una 2ª/3ª cuenta de IG quedaba sin
  // escanear (sub-conteo; caso jacqueenriquez: promociona en una 2ª cuenta invisible).
  const extraByCreator = new Map<string, string[]>();
  if (ids.length) {
    const { data: extra } = await (sb as any).from("creator_social_accounts")
      .select("creator_id, username").eq("network", "instagram").eq("active", true).in("creator_id", ids);
    for (const a of (extra ?? [])) {
      const h = norm(a.username);
      if (!h) continue;
      const arr = extraByCreator.get(a.creator_id) ?? [];
      if (!arr.includes(h)) arr.push(h);
      extraByCreator.set(a.creator_id, arr);
    }
  }

  // Handle principal + cada cuenta EXTRA, ambos con su ig_user_id cacheado si existe
  // (por (creator_id, handle)). La primera pasada de una cuenta nueva va con id=null →
  // la extensión lo resuelve UNA vez, el ingest lo persiste, y de ahí en más viaja
  // cacheado (sin pasar por web_profile_info). Dedupe por (creator_id, handle) → la
  // principal, que también aparece en creator_social_accounts, no se duplica.
  const rows: Array<{ creator_id: string; handle: string; ig_user_id: string | null; name: string }> = [];
  const seen = new Set<string>();
  const push = (creator_id: string, handle: string, ig_user_id: string | null, name: string) => {
    if (!handle) return;
    const k = `${creator_id}:${handle}`;
    if (seen.has(k)) return;
    seen.add(k);
    rows.push({ creator_id, handle, ig_user_id, name });
  };
  for (const c of (creators ?? [])) {
    const primary = norm(c.instagram_handle);
    const name = c.artistic_name || c.name;
    push(c.id, primary, idByAccount.get(`${c.id}:${primary}`) ?? null, name);
    for (const h of (extraByCreator.get(c.id) ?? [])) if (h !== primary) push(c.id, h, idByAccount.get(`${c.id}:${h}`) ?? null, name);
  }
  // Partición por slot (si se pidió): cada cuenta scanner lee solo su mitad.
  const partitioned = partitionOn ? rows.filter((r) => creatorSlot(r.creator_id) === slotIdx) : rows;
  // Array.sort es estable → dentro de cada rango se conserva el orden de la vista (c.id).
  const targets = partitioned.sort((a, b) => rank(a.creator_id, a.handle) - rank(b.creator_id, b.handle));

  return json({ ok: true, count: targets.length, slot: partitionOn ? slotParam : null, slots: partitionOn ? slotsCount : null, total_sin_particion: rows.length, targets });
});
