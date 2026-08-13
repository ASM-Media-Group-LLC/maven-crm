// promolog-highlights — reportes automáticos de destacados al grupo de Managers.
//
//   mode="daily_quality"  (cron 7pm Col)    → top 3 del SCORE de promo v2, ventana 7 días
//   mode="daily_income"   (cron 11pm Col)   → top 5 modelos por ingreso de HOY (vs ayer, ↑/↓)
//   mode="weekly"         (cron sáb 2pm Col)→ top 3 score de la semana + top 5 ingresos de la semana
//
// SCORE v2 (2026-08-13): el ranking viene del RPC `promo_creator_period_scores`
// (fuente ÚNICA de verdad — misma que el leaderboard de la UI, ya no hay port):
//   score 0-100 = Frecuencia 40 (promo-días / días LEÍDOS en las redes objetivo de
//   la creadora) + Calidad 30 (CTA estructurado: link 1.0 · funnel 0.85 · mención 0.6)
//   + Consistencia 20 (racha máxima sin promo) + Diversificación 10 (promo fuera del plan).
//   Días no leídos NO castigan; cobertura <60% → marcada "parcial". El lift ($) es
//   señal aparte: ingreso del día siguiente a promo vs sin promo (BLU liquidado).
// El day-score viejo (promoScore.ts, IG 60% fijo) queda SOLO como visual de detalle
// del día en la UI — capaba a las creadoras que no viven en IG (caso Martina Smith).
//
// Ingresos: creator_daily_earnings (BLU, sync ~3×/día: ~8am/11am/5pm Col). Cada mensaje
// de ingresos incluye el CORTE (max imported_at) para no vender data vieja como fresca.
//
// Auth: X-Cron-Token (crons) o JWT admin/manager. body: { mode, dry_run? }.
// Deployar con --no-verify-jwt (config.toml ya lo declara).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const MANAGERS_GROUP_JID = "120363408785575383@g.us"; // grupo "Managers" (igual que manager-tick)
const TENANT_ID = Deno.env.get("PROMOLOG_TENANT_ID") ?? "30869615-f579-4981-8a1f-dbebc61eae2d";
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
const fmtDia = (key: string) => `${key.slice(8, 10)}/${key.slice(5, 7)}`;
const money = (n: number) => "$" + Math.round(n).toLocaleString("en-US");

// ── Score v2: RPC promo_creator_period_scores (fuente única) ──────────────────
type ScoreRow = {
  creator_id: string; name: string; instagram_handle: string | null; manager_name: string | null;
  target_networks: string[]; window_days: number; covered_days: number; coverage_pct: number | string | null;
  promo_days: number; freq_pts: number | string; quality_pts: number | string;
  consistency_pts: number | string; diversification_pts: number | string;
  score: number; is_partial: boolean; promo_networks: string | null;
  manual_share: number | string | null; lift_pct: number | string | null;
  lift_n_promo: number; lift_n_quiet: number;
};

async function periodScores(sb: any, fromKey: string, toKey: string): Promise<ScoreRow[]> {
  const { data, error } = await sb.rpc("promo_creator_period_scores", {
    p_tenant: TENANT_ID, p_from: fromKey, p_to: toKey,
  });
  if (error) throw new Error(`promo_creator_period_scores: ${error.message}`);
  return (data ?? []) as ScoreRow[];
}

// Línea de podio: score + desglose compacto + lift si hay señal + marca parcial.
function scoreLine(r: ScoreRow): string {
  const parts = `frec ${Math.round(Number(r.freq_pts))} · cta ${Math.round(Number(r.quality_pts))} · const ${Math.round(Number(r.consistency_pts))}` +
    (Number(r.diversification_pts) > 0 ? ` · redes ${Math.round(Number(r.diversification_pts))}` : "");
  const lift = r.lift_pct != null ? ` · $ ${Number(r.lift_pct) >= 0 ? "+" : ""}${Math.round(Number(r.lift_pct))}% con promo (${r.lift_n_promo}v${r.lift_n_quiet}d)` : "";
  const manual = Number(r.manual_share ?? 0) >= 50 ? ` · ✍️ ${Math.round(Number(r.manual_share))}% manual` : "";
  const partial = r.is_partial ? " ⚠️ poca lectura" : "";
  return `*${r.name}* — ${r.score}/100  (${parts})${lift}${manual}${partial}`;
}

async function activeNames(sb: any): Promise<Map<string, string>> {
  const { data } = await sb.from("creators").select("id, name, artistic_name").eq("status", "active");
  const m = new Map<string, string>();
  for (const c of data ?? []) m.set(c.id, (c.artistic_name || "").trim() || c.name);
  return m;
}

const medals = ["🥇", "🥈", "🥉", "4️⃣", "5️⃣"];

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
// Top del SCORE v2 en una ventana [fromKey, toKey]. Compartido por el 7pm (7 días
// móviles) y el semanal (lunes→hoy). Podio por PUNTAJES DISTINTOS: repartir 🥇🥈🥉
// entre scores idénticos inventa un orden que no existe (lección del day-score).
function scorePodium(rows: ScoreRow[]): { lines: string[]; pie: string } {
  const conDatos = rows.filter((r) => r.covered_days > 0);
  // Las de POCA lectura (is_partial) no compiten por medallas: con poca evidencia el
  // score sale INFLADO (1 día leído con promo = 90). Se cuentan aparte en el pie.
  const conPuntaje = conDatos.filter((r) => r.score > 0 && !r.is_partial);
  const puntajes = [...new Set(conPuntaje.map((r) => r.score))].slice(0, 3);
  const lines = puntajes.map((sc, i) => {
    const grupo = conPuntaje.filter((r) => r.score === sc);
    return grupo.length === 1
      ? `${medals[i]} ${scoreLine(grupo[0])}`
      : `${medals[i]} *Empate — ${sc}/100*: ${grupo.map((r) => r.name + (r.is_partial ? " ⚠️" : "")).join(" · ")}`;
  });
  // Denominador honesto: el score solo existe donde el scan LEYÓ. Las no leídas no
  // cuentan — jamás convertir "no poder leer" en "no promocionó" (#818).
  const sinLectura = rows.length - conDatos.length;
  const parciales = conDatos.filter((r) => r.is_partial && r.score > 0).length;
  const pie = `_Score 0-100 sobre días LEÍDOS en las redes objetivo de cada una (frecuencia 40 · CTA 30 · constancia 20 · multi-red 10 = promo en 2+ redes). ` +
    `${conPuntaje.length} con promo de ${conDatos.length} con lectura` +
    (parciales > 0 ? ` · ${parciales} con poca lectura (no compiten)` : "") +
    (sinLectura > 0 ? ` · ${sinLectura} sin lectura (no cuentan)` : "") +
    `. "$ con promo" = ingreso del día siguiente a un día con promo vs sin promo (BLU liquidado, NvM días)._`;
  return { lines, pie };
}

async function buildDailyQuality(sb: any): Promise<string> {
  const today = bogToday(), from = bogShift(-6);
  const scores = await periodScores(sb, from, today);
  const { lines, pie } = scorePodium(scores);
  const head = `🏆 *Score de promo — últimos 7 días (${fmtDia(from)} → ${fmtDia(today)})*`;
  if (!lines.length) return `${head}\n\nSin promos con score en la ventana.`;
  return `${head}\n\n${lines.join("\n")}\n\n${pie}`;
}

// "Hasta ahora": sync fresco de BLU + total del día al momento del reporte, SIN
// comparación con ayer (pedido del dueño 2026-07-23 — ayer-completo vs hoy-parcial
// daba ↓ falsos que confundían).
// ── ¿Qué significa "hoy" en las filas de BLU? ─────────────────────────────────
// RESUELTO (13/08, PR #1183): BLU trabaja en día de COLOMBIA y sus rangos son
// INCLUSIVOS — el bridge pedía [D, D+1] y cada fila traía el día siguiente
// adentro (danik 12/08: fila $5,800 vs panel $2,422; fila(12)−fila(13) daba el
// cierre del panel al dólar). Con el bridge corregido y el histórico reescrito,
// la fila del día ES el día del panel. El "+118% overnight" y el "lag de ~2
// días" eran ese bug, no liquidación; el ajuste real de BLU existe pero es
// menor (el resync de 90d del bridge lo absorbe). Decisión de Jhon: la cocina
// no va al grupo — el mensaje queda simple.
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
  // "Recién sincronizada" se leía como "cifra cerrada del día", y no lo es del todo:
  // a las 23:00 falta la última hora y BLU puede ajustar (reembolsos). Que el
  // mensaje lo diga sin dramatizar — el "va a SUBIR" de antes era el bug del día
  // inclusivo (#1183), no liquidación.
  const nota = fresh === "fresh"
    ? `_Sync BLU al día (corte ${fmtCorte(hoy.corte)}). La cifra es al corte: puede moverse con ajustes de BLU._`
    : `_Corte BLU: ${fmtCorte(hoy.corte)} — no se pudo refrescar a tiempo; la cifra puede estar atrasada._`;
  return `${head}\n\n${lines.join("\n")}\n\n${nota}`;
}

async function buildWeekly(sb: any): Promise<string> {
  const fresh = await requestFreshBlu(sb, "weekly");
  const monday = bogMonday(), today = bogToday();
  const names = await activeNames(sb);
  const scores = await periodScores(sb, monday, today);
  const { lines: qLines, pie: qPie } = scorePodium(scores);
  const inc = await incomeTop(sb, monday, today, names);
  const i5 = inc.top.slice(0, 5);
  const iLines = i5.length
    ? i5.map(([cid, v], i) => `${medals[i]} *${names.get(cid)}* — ${money(v)}`)
    : ["Sin ingresos registrados esta semana."];
  return [
    `📅 *Resumen semanal (lun ${fmtDia(monday)} → ${fmtDia(today)})*`,
    ``,
    `🏆 *Top score de promo de la semana*`,
    ...(qLines.length ? qLines : ["Sin promos con score esta semana."]),
    ``,
    `💰 *Top ingresos de la semana*`,
    ...iLines,
    ``,
    qPie,
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
