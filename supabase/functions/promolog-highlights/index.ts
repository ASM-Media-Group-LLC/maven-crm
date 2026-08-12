// promolog-highlights — reportes automáticos de destacados al grupo de Managers.
//
//   mode="daily_quality"  (cron 7pm Col)    → top 3 modelos con mejor % de calidad de promo HOY
//   mode="daily_income"   (cron 11pm Col)   → top 5 modelos por ingreso de HOY (vs ayer, ↑/↓)
//   mode="weekly"         (cron sáb 2pm Col)→ top 3 calidad de la semana + top 5 ingresos de la semana
//
// La "calidad" es EXACTAMENTE la barrita de Promolog (frontend promoScore.ts):
//   score_día = Σ (peso_red × calidad_de_la_mejor_promo_en_esa_red)
//   pesos fijos: IG 60% · X 13,3% · Telegram 13,3% · Facebook 13,3%.
// Port fiel de qualityForEntry/computeDayScore — si cambia el modelo allá, cambiar acá.
//
// Ingresos: creator_daily_earnings (BLU, sync ~3×/día: ~8am/11am/5pm Col). Cada mensaje
// de ingresos incluye el CORTE (max imported_at) para no vender data vieja como fresca.
//
// Auth: X-Cron-Token (crons) o JWT admin/manager. body: { mode, dry_run? }.
// Deployar con --no-verify-jwt (config.toml ya lo declara).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const MANAGERS_GROUP_JID = "120363408785575383@g.us"; // grupo "Managers" (igual que manager-tick)
const BOG_OFFSET_MS = 5 * 3600 * 1000; // Bogotá = UTC-5 fijo (sin DST)

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-token",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b, null, 2), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

// ── Fechas Bogotá ─────────────────────────────────────────────────────────────
const bogNow = () => new Date(Date.now() - BOG_OFFSET_MS);
const dayKey = (d: Date) => d.toISOString().slice(0, 10); // YYYY-MM-DD (ya corrida a Bogotá)
const bogToday = () => dayKey(bogNow());
const bogShift = (days: number) => dayKey(new Date(bogNow().getTime() + days * 86400 * 1000));
// Lunes de esta semana (Bogotá). getUTCDay sobre la fecha corrida = día de semana Bogotá.
function bogMonday(): string {
  const n = bogNow();
  const dow = n.getUTCDay(); // 0=dom … 6=sáb
  const delta = dow === 0 ? -6 : 1 - dow;
  return dayKey(new Date(n.getTime() + delta * 86400 * 1000));
}
// Un día Bogotá (YYYY-MM-DD) empieza a las 05:00Z.
const bogDayStartUtc = (key: string) => `${key}T05:00:00Z`;
const fmtDia = (key: string) => `${key.slice(8, 10)}/${key.slice(5, 7)}`;
const money = (n: number) => "$" + Math.round(n).toLocaleString("en-US");

// ── Port fiel de promoScore.ts (calidad) ─────────────────────────────────────
const NETWORK_WEIGHTS: Record<string, number> = { instagram: 0.6, x: 0.4 / 3, telegram: 0.4 / 3, facebook: 0.4 / 3 };
const NET_LABEL: Record<string, string> = { instagram: "IG", x: "X", telegram: "TG", facebook: "FB" };
const canonicalNetwork = (n?: string | null) => { const v = (n || "").toLowerCase().trim(); return v === "twitter" ? "x" : v; };
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const MANAGED = new Set(["onlyfans", "unlok", "piclink", "linktree"]);
const KNOWN_UNMANAGED = new Set(["fansly"]);

type Row = {
  creator_id: string; date: string; network: string | null; promoted: string | null;
  analyzed_by_ai: boolean | null; ai_reasoning: string | null; platform: string | null;
  has_buy_link: boolean | null; buy_link_type: string | null; ai_confidence: number | string | null;
  notes: string | null; needs_review: boolean | null;
};

function isManagedPromo(e: Row): boolean {
  const p = (e.platform || "").toLowerCase();
  const b = (e.buy_link_type || "").toLowerCase();
  const r = (e.ai_reasoning || "").toLowerCase();
  if (MANAGED.has(p) || MANAGED.has(b)) return true;
  if (/unlok/.test(r)) return true;
  if (p === "otra" || KNOWN_UNMANAGED.has(p) || KNOWN_UNMANAGED.has(b)) return false;
  if (b === "other") return false;
  return true;
}

function qualityForEntry(e: Row): number {
  const promotedStr = (e.promoted || "").toLowerCase();
  const isPromoted = ["true", "yes", "partial"].includes(promotedStr);
  if (!isPromoted) return 0;
  if (!isManagedPromo(e) && e.needs_review !== true) return 0;
  const net = canonicalNetwork(e.network);
  const notes = (e.notes || "").toLowerCase();
  const hasLink = e.has_buy_link === true || !!e.buy_link_type || /(onlyfans|enlace|\blink\b|fans)/.test(notes);
  let q: number;
  if (e.analyzed_by_ai !== true) {
    q = 0.75 + (hasLink ? 0.25 : 0);
  } else if (net === "instagram") {
    const conf = e.ai_confidence != null ? clamp01(Number(e.ai_confidence)) : 0.6;
    q = 0.45 + (e.has_buy_link ? 0.35 : 0) + 0.2 * conf;
  } else {
    const r = (e.ai_reasoning || "").toLowerCase();
    if (/(onlyfans|of_handle|link_agg)/.test(r)) q = 1.0;
    else if (r.includes("vision-of")) q = 0.85;
    else if (r.includes("plataforma")) q = 0.75;
    else if (r.includes("promo")) q = 0.6;
    else q = 0.5;
  }
  if (promotedStr === "partial") q *= 0.5;
  return clamp01(q);
}

// Score de UN día para UN creador (0-1) + qué redes promocionó.
function dayScore(rows: Row[]): { score: number; nets: string[] } {
  const byNet = new Map<string, number>();
  const promotedNets = new Set<string>();
  for (const e of rows) {
    const net = canonicalNetwork(e.network);
    if (!(net in NETWORK_WEIGHTS)) continue;
    const q = qualityForEntry(e);
    if (q > 0) promotedNets.add(net);
    byNet.set(net, Math.max(byNet.get(net) ?? 0, q));
  }
  let score = 0;
  for (const [net, q] of byNet) score += NETWORK_WEIGHTS[net] * q;
  const order = ["instagram", "x", "telegram", "facebook"];
  return { score: clamp01(score), nets: order.filter((n) => promotedNets.has(n)).map((n) => NET_LABEL[n]) };
}

// ── Data ──────────────────────────────────────────────────────────────────────
async function fetchEntries(sb: any, fromKey: string): Promise<Row[]> {
  // Paginado (cap 1000 de PostgREST): una semana de entries puede superar 1000 filas.
  const out: Row[] = [];
  for (let page = 0; page < 10; page++) {
    const { data, error } = await sb.from("promolog_entries")
      .select("creator_id, date, network, promoted, analyzed_by_ai, ai_reasoning, platform, has_buy_link, buy_link_type, ai_confidence, notes, needs_review")
      .gte("date", bogDayStartUtc(fromKey))
      .order("date", { ascending: true })
      .range(page * 1000, page * 1000 + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

async function activeNames(sb: any): Promise<Map<string, string>> {
  const { data } = await sb.from("creators").select("id, name, artistic_name").eq("status", "active");
  const m = new Map<string, string>();
  for (const c of data ?? []) m.set(c.id, (c.artistic_name || "").trim() || c.name);
  return m;
}

// Agrupa entries por creador y por día Bogotá; promedia el day-score de los días con registro.
function scoreByCreator(rows: Row[], names: Map<string, string>): Array<{ name: string; score: number; nets: string[] }> {
  const byCreatorDay = new Map<string, Map<string, Row[]>>();
  for (const r of rows) {
    if (!names.has(r.creator_id)) continue; // solo activas
    const dk = dayKey(new Date(new Date(r.date).getTime() - BOG_OFFSET_MS));
    let days = byCreatorDay.get(r.creator_id);
    if (!days) { days = new Map(); byCreatorDay.set(r.creator_id, days); }
    const arr = days.get(dk); if (arr) arr.push(r); else days.set(dk, [r]);
  }
  const out: Array<{ name: string; score: number; nets: string[] }> = [];
  for (const [cid, days] of byCreatorDay) {
    let sum = 0, n = 0; const nets = new Set<string>();
    for (const rows2 of days.values()) {
      const s = dayScore(rows2);
      sum += s.score; n++;
      s.nets.forEach((x) => nets.add(x));
    }
    if (n > 0) out.push({ name: names.get(cid)!, score: sum / n, nets: [...nets] });
  }
  return out.sort((a, b) => b.score - a.score);
}

const medals = ["🥇", "🥈", "🥉", "4️⃣", "5️⃣"];
const pct = (s: number) => `${Math.round(s * 100)}%`;

async function incomeTop(sb: any, fromKey: string, toKey: string, names: Map<string, string>) {
  const { data, error } = await sb.from("creator_daily_earnings")
    .select("creator_id, date, total_gross, imported_at")
    .gte("date", fromKey).lte("date", toKey);
  if (error) throw new Error(error.message);
  const tot = new Map<string, number>();
  let corte = "";
  for (const r of data ?? []) {
    if (!names.has(r.creator_id)) continue;
    tot.set(r.creator_id, (tot.get(r.creator_id) ?? 0) + Number(r.total_gross || 0));
    if (r.imported_at && r.imported_at > corte) corte = r.imported_at;
  }
  const top = [...tot.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  return { top, corte };
}

const fmtCorte = (iso: string) => {
  if (!iso) return "";
  const d = new Date(new Date(iso).getTime() - BOG_OFFSET_MS);
  return `${fmtDia(dayKey(d))} ${d.toISOString().slice(11, 16)}`;
};

// Pide data FRESCA a BLU antes de calcular: encola en blu_sync_requests y espera
// hasta ~75s a que el micro blu-bridge (pollea la cola cada 20s) corra su sync
// QUICK (hoy+ayer, ~10-20s). Best-effort: si no llega a tiempo (micro caído u
// ocupado), seguimos con lo que hay — el corte del mensaje siempre dice la verdad.
async function requestFreshBlu(sb: any, why: string): Promise<"fresh" | "timeout" | "error"> {
  const { data, error } = await sb.from("blu_sync_requests").insert({ requested_by: why }).select("id").single();
  if (error || !data) return "error";
  const deadline = Date.now() + 75_000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 4000));
    const { data: row } = await sb.from("blu_sync_requests").select("status").eq("id", data.id).maybeSingle();
    if (row?.status === "done") return "fresh";
    if (row?.status === "error" || row?.status === "expired") return "error";
  }
  return "timeout";
}

// ── Mensajes ──────────────────────────────────────────────────────────────────
async function buildDailyQuality(sb: any): Promise<string> {
  const today = bogToday();
  const names = await activeNames(sb);
  const rows = await fetchEntries(sb, today);
  const conPuntaje = scoreByCreator(rows, names).filter((r) => r.score > 0);
  if (!conPuntaje.length) return `🏆 *Top calidad de promo — hoy ${fmtDia(today)}*\n\nTodavía no hay promos con calidad registrada hoy.`;

  // Podio por PUNTAJES DISTINTOS, no por posición. La barra de calidad satura (una
  // sola story de IG ya vale 60), así que repartir 🥇🥈🥉 entre puntajes idénticos
  // inventa un orden que no existe: el 30/07 salieron Danikmichelltv, Moramay y
  // Jacqueenriquez5 con 60% EXACTO las tres, presentadas como 1º, 2º y 3º.
  const nets = (r: { nets: string[] }) => r.nets.join(" · ") || "—";
  const puntajes = [...new Set(conPuntaje.map((r) => r.score))].slice(0, 3);
  const lines = puntajes.map((sc, i) => {
    const grupo = conPuntaje.filter((r) => r.score === sc);
    return grupo.length === 1
      ? `${medals[i]} *${grupo[0].name}* — ${pct(sc)}  (${nets(grupo[0])})`
      : `${medals[i]} *Empate — ${pct(sc)}*: ${grupo.map((r) => `${r.name} (${nets(r)})`).join(" · ")}`;
  });

  // Denominador: sin esto un podio de 3 sobre 5 lecturas válidas se lee como si
  // fuera el top de todo el roster.
  //
  // ⚠️ "lectura válida" NO es "aparece en la tabla". El scan escribe fila igual
  // cuando NO pudo leer, con promoted='pending' (error_reason no_ig_id,
  // unconfirmed_empty, throttled…). Contarlas infla el denominador y hace ver al
  // equipo peor de lo que es: el 12/08 había 44 creadoras con lectura definitiva
  // y 13 sin leer, y el pie decía "sobre 57". Es el antipatrón de la casa —
  // "no poder leer" convertido en "no promocionó" (#818) — colado en el ratio.
  const definitiva = (p: string | null) => ["true", "false", "yes", "no", "partial"].includes((p || "").toLowerCase());
  const idsLeidas = new Set(
    rows.filter((e: { promoted: string | null }) => definitiva(e.promoted))
      .map((e: { creator_id: string | null }) => e.creator_id).filter(Boolean),
  );
  const idsTodas = new Set(rows.map((e: { creator_id: string | null }) => e.creator_id).filter(Boolean));
  const leidas = idsLeidas.size;
  const sinLeer = idsTodas.size - leidas;
  const pie = leidas > 0
    ? `_${conPuntaje.length} con promo sobre ${leidas} creadoras con lectura válida hoy` +
      (sinLeer > 0 ? ` · ${sinLeer} sin lectura (no cuentan)` : "") +
      ` · % = barra de calidad de Promolog (IG 60 · X/TG/FB 13,3 c/u)_`
    : `_% = barra de calidad de Promolog (IG 60 · X/TG/FB 13,3 c/u)_`;
  return `🏆 *Top calidad de promo — hoy ${fmtDia(today)}*\n\n${lines.join("\n")}\n\n${pie}`;
}

// "Hasta ahora": sync fresco de BLU + total del día al momento del reporte, SIN
// comparación con ayer (pedido del dueño 2026-07-23 — ayer-completo vs hoy-parcial
// daba ↓ falsos que confundían).
async function buildDailyIncome(sb: any): Promise<string> {
  const fresh = await requestFreshBlu(sb, "daily_income");
  const today = bogToday();
  const names = await activeNames(sb);
  const hoy = await incomeTop(sb, today, today, names);
  const hhmm = bogNow().toISOString().slice(11, 16);
  const top5 = hoy.top.slice(0, 5);
  const head = `💰 *Top ingresos de hoy ${fmtDia(today)} — hasta las ${hhmm}*`;
  if (!top5.length) return `${head}\n\nSin ingresos registrados todavía (corte BLU: ${fmtCorte(hoy.corte) || "s/d"}).`;
  const lines = top5.map(([cid, v], i) => `${medals[i]} *${names.get(cid)}* — ${money(v)}`);
  // "Recién sincronizada" se leía como "cifra cerrada del día", y no lo es: BLU liquida
  // con lag, así que el total de hoy siempre viene PARCIAL (el 30/07 cerró en $15,8k
  // contra $27,6k del 29 y $29,4k del 28 — no fue un mal día, faltaba ingesta). El sync
  // nuestro sí corrió; lo que falta es upstream. Que el mensaje lo diga.
  const nota = fresh === "fresh"
    ? `_Sync BLU al día (corte ${fmtCorte(hoy.corte)}). ⚠️ Parcial: BLU liquida con ~2 días de lag, el total de hoy va a SUBIR._`
    : `_Corte BLU: ${fmtCorte(hoy.corte)} — no se pudo refrescar a tiempo. ⚠️ Parcial: el total de hoy va a subir._`;
  return `${head}\n\n${lines.join("\n")}\n\n${nota}`;
}

async function buildWeekly(sb: any): Promise<string> {
  const fresh = await requestFreshBlu(sb, "weekly");
  const monday = bogMonday(), today = bogToday();
  const names = await activeNames(sb);
  const rows = await fetchEntries(sb, monday);
  const q3 = scoreByCreator(rows, names).filter((r) => r.score > 0).slice(0, 3);
  const inc = await incomeTop(sb, monday, today, names);
  const i5 = inc.top.slice(0, 5);
  const qLines = q3.length
    ? q3.map((r, i) => `${medals[i]} *${r.name}* — ${pct(r.score)} promedio  (${r.nets.join(" · ")})`)
    : ["Sin promos con calidad esta semana."];
  const iLines = i5.length
    ? i5.map(([cid, v], i) => `${medals[i]} *${names.get(cid)}* — ${money(v)}`)
    : ["Sin ingresos registrados esta semana."];
  return [
    `📅 *Resumen semanal (lun ${fmtDia(monday)} → sáb ${fmtDia(today)})*`,
    ``,
    `🏆 *Top calidad de promo de la semana*`,
    ...qLines,
    ``,
    `💰 *Top ingresos de la semana*`,
    ...iLines,
    ``,
    fresh === "fresh"
      ? `_Data BLU recién sincronizada (${fmtCorte(inc.corte)})_`
      : `_Corte BLU: ${fmtCorte(inc.corte)} — no se pudo refrescar a tiempo_`,
  ].join("\n");
}

// ── HTTP ──────────────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const cronHeader = req.headers.get("x-cron-token");
  const CRON_TOKEN = Deno.env.get("CRON_INTERNAL_TOKEN");
  const isCron = !!(cronHeader && CRON_TOKEN && cronHeader === CRON_TOKEN);
  if (!isCron) {
    const token = (req.headers.get("Authorization") || "").replace("Bearer ", "");
    const { data: { user } } = await sb.auth.getUser(token);
    if (!user) return json({ error: "unauthorized" }, 401);
    const { data: roles } = await sb.from("user_roles").select("role").eq("user_id", user.id);
    if (!(roles || []).some((r: { role: string }) => ["admin", "manager"].includes(r.role))) {
      return json({ error: "forbidden" }, 403);
    }
  }

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const mode = String(body.mode || "");
  const dryRun = body.dry_run === true;

  let message: string;
  try {
    if (mode === "daily_quality") message = await buildDailyQuality(sb);
    else if (mode === "daily_income") message = await buildDailyIncome(sb);
    else if (mode === "weekly") message = await buildWeekly(sb);
    else return json({ error: "mode inválido (daily_quality | daily_income | weekly)" }, 400);
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }

  if (dryRun) return json({ ok: true, dry_run: true, mode, message });

  let groupId = Deno.env.get("PROMOLOG_MANAGER_GROUP_ID") ?? "";
  if (!groupId) {
    const { data: grp } = await sb.from("whatsapp_groups").select("id").eq("external_id", MANAGERS_GROUP_JID).maybeSingle();
    groupId = grp?.id ?? "";
  }
  if (!groupId) return json({ ok: true, sent: false, reason: "no_manager_group_configured", message });

  const resp = await fetch(`${Deno.env.get("SUPABASE_URL")!}/functions/v1/whatsapp-send`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Cron-Token": Deno.env.get("CRON_INTERNAL_TOKEN") ?? "" },
    body: JSON.stringify({ group_id: groupId, body: message }),
  });
  return json({ ok: resp.ok, sent: resp.ok, mode, ...(resp.ok ? {} : { error: `whatsapp-send ${resp.status}` }) });
});
