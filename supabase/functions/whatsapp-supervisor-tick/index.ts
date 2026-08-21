import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { adminClient, authorizeCronOrJwt, logEvent, whatsappCors } from "../_shared/whatsapp.ts";

// Link clickeable de IG de una creadora. Acepta handle, @handle o URL completa
// (instagram_handle a veces viene como URL) → https://instagram.com/<handle>.
// Pedido de Alvaro: SIEMPRE referirse a una creadora con el link, NO con @handle
// pelado (el @ es solo para pinguear miembros del equipo). "(sin handle)" se deja igual.
function igLink(raw: string | null | undefined): string {
  const s = String(raw ?? "").trim();
  if (!s || s === "(sin handle)") return s || "(sin handle)";
  const m = s.match(/instagram\.com\/([A-Za-z0-9_.]+)/i);
  const h = (m ? m[1] : s).replace(/^@+/, "").replace(/[/?#].*$/, "").trim();
  return h ? `https://instagram.com/${h}` : s;
}

// whatsapp-supervisor-tick — el corazón del supervisor proactivo.
//
// Corre cada 15 min (pg_cron). En cada tick:
//   1. Detecta qué hora es en Bogotá (timezone America/Bogota).
//   2. Para cada user con schedule activo hoy + en turno ahora:
//      - LLG: calcula contactos del día (closers_contacts.created_by) y
//        decide si mandar check-in según % del turno completado.
//      - Closer: chequea pipeline (leads asignados sin contactos,
//        overdues del cron interno), 1h antes del cierre pregunta
//        cuántas llamadas hizo.
//   3. Dedup vía whatsapp_supervisor_state — el cron puede correr
//      múltiples veces sin spamear al grupo.
//   4. Reporte cierre del día al terminar el último turno del día
//      (19:00 lun-vie, 13:00 sáb).
//
// Tono: profesional, directo, mensajes cortos.

interface UserSchedule {
  user_id: string;
  full_name: string | null;
  whatsapp_lid: string | null;
  whatsapp_push_name: string | null;
  start_time: string;            // "09:00:00"
  end_time: string;
  daily_goal: number | null;
  role_kind: "llg" | "closer";
}

interface GroupInfo {
  id: string;
  tenant_id: string;
  bot_enabled: boolean;
  external_id: string;
}

// ─────────────────────────────────────────────────────────────────────────
// Time helpers — manejamos todo en Bogotá (UTC-5, sin DST).
// ─────────────────────────────────────────────────────────────────────────
function bogotaNow(): { hhmm: string; weekday: number; date: string } {
  // Bogotá = UTC-5 fijo, no tiene DST. Más simple que Intl.DateTimeFormat.
  const now = new Date(Date.now() - 5 * 3600 * 1000);
  const hh = String(now.getUTCHours()).padStart(2, "0");
  const mm = String(now.getUTCMinutes()).padStart(2, "0");
  // getUTCDay: 0=domingo..6=sábado (igual que nuestra convención).
  return { hhmm: `${hh}:${mm}`, weekday: now.getUTCDay(), date: now.toISOString().slice(0, 10) };
}

function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

// ─────────────────────────────────────────────────────────────────────────
// Métricas — consultas a Maven
// ─────────────────────────────────────────────────────────────────────────
async function getCloserStatsToday(
  sb: SupabaseClient,
  userId: string,
  today: string,
): Promise<{ leads_assigned: number; calls: number; closed: number; confirmed: number }> {
  const [assignedRes, callsRes, closedRes, confirmedRes] = await Promise.all([
    // Leads nuevos asignados hoy
    sb.from("closer_creators").select("id", { count: "exact", head: true })
      .eq("assigned_to", userId).eq("passed_date", today),
    // Llamadas hechas hoy (vía RPC que cuenta multi-closer)
    sb.rpc("closer_calls_count", { p_closer_id: userId, p_since: today }),
    // Cerradas hoy (suma ponderada)
    sb.rpc("closer_closed_calls", { p_closer_id: userId, p_since: today }),
    // Confirmadas hoy (creators con confirmed_date = hoy y assigned_to = closer)
    sb.from("closer_creators").select("id", { count: "exact", head: true })
      .eq("assigned_to", userId)
      .gte("confirmed_date", `${today}T00:00:00-05:00`)
      .lte("confirmed_date", `${today}T23:59:59-05:00`),
  ]);
  return {
    leads_assigned: assignedRes.count ?? 0,
    calls: typeof callsRes.data === "number" ? callsRes.data : 0,
    closed: Number(closedRes.data ?? 0),
    confirmed: confirmedRes.count ?? 0,
  };
}

// Detecta si el grupo habló del tema del check en las últimas N min.
// Si sí, NO mandamos para no encimar.
async function recentlyDiscussed(
  sb: SupabaseClient,
  groupId: string,
  pushName: string,
  minutesBack: number,
): Promise<boolean> {
  const since = new Date(Date.now() - minutesBack * 60 * 1000).toISOString();
  const { count } = await sb
    .from("whatsapp_messages")
    .select("id", { count: "exact", head: true })
    .eq("group_id", groupId)
    .gte("sent_at", since)
    .ilike("sender_display_name", `%${pushName}%`);
  // Aproximación: si el user mismo escribió en últimos N min, probablemente
  // ya está al tanto. No es perfecto pero evita spam.
  return (count ?? 0) > 0;
}

// ─────────────────────────────────────────────────────────────────────────
// Send + dedup
// ─────────────────────────────────────────────────────────────────────────
async function sendToGroup(sb: SupabaseClient, groupId: string, body: string): Promise<void> {
  const url = `${Deno.env.get("SUPABASE_URL")!}/functions/v1/whatsapp-send`;
  try {
    await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Cron-Token": Deno.env.get("CRON_INTERNAL_TOKEN") ?? "",
      },
      body: JSON.stringify({ group_id: groupId, body }),
    });
  } catch (e) {
    console.warn("sendToGroup failed:", (e as Error).message);
  }
}

// Marca el check como mandado para que no se repita hoy. Devuelve true si
// se insertó (era nuevo), false si ya existía (no debemos mandar).
async function tryClaim(sb: SupabaseClient, userId: string, kind: string, today: string, payload: Record<string, unknown>): Promise<boolean> {
  const { error } = await sb.from("whatsapp_supervisor_state").insert({
    user_id: userId,
    check_kind: kind,
    check_date: today,
    payload,
  });
  if (error) {
    if (error.message.includes("duplicate") || error.message.includes("unique")) return false;
    console.warn("tryClaim error:", error.message);
    return false;
  }
  return true;
}

// Igual que tryClaim pero para checks GRUPALES (EOD, follow-ups): claim por
// (group_id, check_kind, check_date) en whatsapp_supervisor_group_state. NO usa
// whatsapp_supervisor_state porque su user_id tiene FK->profiles y un group/tenant
// id la viola → por eso los claims grupales con tenant_id fallaban siempre y esos
// checks nunca disparaban. Devuelve true si insertó (era nuevo), false si ya existía.
async function tryClaimGroup(sb: SupabaseClient, groupId: string, kind: string, today: string, payload: Record<string, unknown>): Promise<boolean> {
  const { error } = await sb.from("whatsapp_supervisor_group_state").insert({
    group_id: groupId,
    check_kind: kind,
    check_date: today,
    payload,
  });
  if (error) {
    if (error.message.includes("duplicate") || error.message.includes("unique")) return false;
    console.warn("tryClaimGroup error:", error.message);
    return false;
  }
  return true;
}

// NOTA (2026-07-29): acá vivía `checkLlg` — los pings de meta de LLG ("@X vas
// 0/3", "Última recta", "Última media hora"). Se eliminó porque los LLGs pasaron
// al grupo AI WARMING y este tick solo corre en grupos de ventas, así que los
// pings caían en Marketing/Ventas (hoy solo closers). El seguimiento de LLGs lo
// hace el bot de AI WARMING. Si algún día se quiere volver a tener nudges de LLG
// automáticos, hay que hacerlos apuntando al grupo de warming, no acá.

// ─────────────────────────────────────────────────────────────────────────
// Closer checker — preguntas abiertas (sin meta numérica fija)
// ─────────────────────────────────────────────────────────────────────────
// Top leads sin asignar (closer_creators stage='Nuevo') rankeados por calidad —
// para que el supervisor RECOMIENDE cuáles agarrar a un closer sin leads, en vez
// de solo preguntar. Mismo criterio que get_unassigned_leads del agent.
async function topUnassignedLeads(
  sb: SupabaseClient,
  limit: number,
): Promise<Array<{ handle: string; quality: string }>> {
  const { data: rows } = await sb
    .from("closer_creators")
    .select("instagram_handle, category, estimated_monetization")
    .eq("stage", "Nuevo")
    .limit(500);
  const RANK: Record<string, number> = { elite: 0, "a++": 0, "a+": 1, a: 2, "b+": 3, b: 4, "c+": 5, c: 6 };
  const rankOf = (c: string | null) => {
    const k = String(c ?? "").trim().toLowerCase();
    return k in RANK ? RANK[k] : 8;
  };
  return ((rows ?? []) as Array<{ instagram_handle: string | null; category: string | null; estimated_monetization: number | null }>)
    .slice()
    .sort((a, b) => {
      const ra = rankOf(a.category), rb = rankOf(b.category);
      if (ra !== rb) return ra - rb;
      return Number(b.estimated_monetization ?? 0) - Number(a.estimated_monetization ?? 0);
    })
    .slice(0, limit)
    .map((r) => ({ handle: r.instagram_handle ?? "(sin handle)", quality: r.category ?? "?" }));
}

async function checkCloser(
  sb: SupabaseClient,
  user: UserSchedule,
  group: GroupInfo,
  now: { hhmm: string; date: string },
): Promise<void> {
  const startM = timeToMinutes(user.start_time.slice(0, 5));
  const endM = timeToMinutes(user.end_time.slice(0, 5));
  const nowM = timeToMinutes(now.hhmm);
  if (nowM < startM || nowM > endM) return;

  const mention = user.whatsapp_push_name ?? user.full_name?.split(" ")[0] ?? "equipo";

  // 1h antes del fin del turno: preguntar cuántas llamadas hicieron — UNA sola
  // pregunta GRUPAL (pedido de Jhon 03/08: le llegaba solo a Miguel; debe
  // incluir a María y a cualquier MIEMBRO DEL GRUPO con rol closer/closer
  // supervisor). El primer closer que entra a su última hora dispara el mensaje
  // para todos; claim por GRUPO+día para no repetir ni spamear.
  if (endM - nowM <= 60 && endM - nowM > 30) {
    // Closers/supervisores PRESENTES en el grupo: miembros activos linkeados
    // cuyo rol en Maven contenga "closer" (cubre closer y closer supervisor).
    const { data: mrows } = await sb
      .from("whatsapp_members")
      .select("user_id, display_name")
      .eq("group_id", group.id)
      .eq("active", true)
      .not("user_id", "is", null);
    const ids = ((mrows ?? []) as Array<{ user_id: string }>).map((r) => r.user_id);
    const { data: rrows } = ids.length > 0
      ? await sb.from("user_roles").select("user_id, role").in("user_id", ids)
      : { data: [] as Array<{ user_id: string; role: unknown }> };
    const closerIds = new Set(
      ((rrows ?? []) as Array<{ user_id: string; role: unknown }>)
        .filter((r) => String(r.role).toLowerCase().includes("closer"))
        .map((r) => r.user_id),
    );
    const closers = ((mrows ?? []) as Array<{ user_id: string; display_name: string | null }>)
      .filter((r) => closerIds.has(r.user_id));
    if (closers.length === 0) return;

    // Nombre REAL del perfil, no el display de WhatsApp: María figura como
    // "Msv" y el primer mensaje grupal salió "@Msv" (03/08).
    const { data: profs } = await sb
      .from("profiles")
      .select("id, full_name")
      .in("id", closers.map((c) => c.user_id));
    const nombreDe = new Map(
      ((profs ?? []) as Array<{ id: string; full_name: string | null }>)
        .map((p) => [p.id, String(p.full_name ?? "").trim().split(" ")[0]]),
    );
    const porCloser = await Promise.all(closers.map(async (c) => ({
      nombre: nombreDe.get(c.user_id) || (c.display_name ?? "").trim().split(" ")[0] || "closer",
      s: await getCloserStatsToday(sb, c.user_id, now.date),
    })));
    const total = porCloser.reduce((a, x) => a + x.s.calls, 0);
    const menciones = porCloser.map((x) => `@${x.nombre}`).join(" ");
    const detalle = total > 0 && porCloser.length > 1
      ? ` (${porCloser.map((x) => `${x.nombre} ${x.s.calls}`).join(" · ")})`
      : "";

    // Frase rotada por día (pedido de Jhon: que no sea siempre el mismo texto).
    // Índice por día calendario: cambia a diario, estable dentro del día.
    const VARIANTES: Array<(m: string, n: number, d: string) => string> = [
      (m, n, d) => `${m} ¿cuántas llamadas hoy? QA marca ${n}${d}.`,
      (m, n, d) => `${m} cierre de llamadas: QA marca ${n} hoy${d}. ¿Coincide?`,
      (m, n, d) => `${m} antes de cerrar: ¿cuántas llamadas? QA lleva ${n}${d}.`,
      (m, n, d) => `${m} ¿me confirman las llamadas de hoy? QA tiene ${n}${d}. Suban las que falten.`,
      (m, n, d) => `${m} repaso: ${n} llamadas en QA hoy${d}. ¿Están todas?`,
    ];
    const dia = Math.floor(Date.parse(now.date) / 86_400_000);
    const msg = VARIANTES[dia % VARIANTES.length](menciones, total, detalle);

    const ok = await tryClaimGroup(sb, group.id, "closer_calls_pre_close_group", now.date, {
      total,
      closers: porCloser.map((x) => ({ nombre: x.nombre, llamadas: x.s.calls })),
    });
    if (ok) await sendToGroup(sb, group.id, msg);
    return;
  }

  // A las ~2h del inicio del turno, si no tiene leads asignados, avisar.
  if (nowM - startM >= 120 && nowM - startM < 150) {
    const stats = await getCloserStatsToday(sb, user.user_id, now.date);
    if (stats.leads_assigned === 0) {
      const ok = await tryClaim(sb, user.user_id, "closer_no_leads_2h", now.date, stats);
      if (ok) {
        // Estratega, no notetaker: en vez de solo preguntar "¿algo pendiente?",
        // recomienda leads de alta calidad sin asignar para que los agarre y les
        // dé seguimiento hoy.
        const top = await topUnassignedLeads(sb, 4);
        const msg = top.length > 0
          ? `@${mention} sin leads asignados hoy. Toma 2-3 de estos y arráncales seguimiento:\n${
            top.map((l) => `· ${igLink(l.handle)} (${l.quality})`).join("\n")
          }\n¿Cuáles tomas?`
          : `@${mention} sin leads asignados hoy y el pool de Nuevas está vacío. ¿Reactivamos un seguimiento o conseguimos más leads?`;
        await sendToGroup(sb, group.id, msg);
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Invoca al whatsapp-agent en modo EOD summary. El agent leyó los mensajes
// del día, las stats de Maven, y compone el cierre via reply_to_group.
// ─────────────────────────────────────────────────────────────────────────
async function invokeAgentForEod(groupId: string): Promise<void> {
  const url = `${Deno.env.get("SUPABASE_URL")!}/functions/v1/whatsapp-agent`;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!}`,
      "x-cron-token": Deno.env.get("CRON_INTERNAL_TOKEN") ?? "",
    },
    body: JSON.stringify({
      group_id: groupId,
      report_kind: "eod_summary",
      invoked_by: "supervisor_tick_eod",
    }),
  });
  if (!resp.ok) {
    const txt = await resp.text().catch(() => "");
    console.warn("invokeAgentForEod failed:", resp.status, txt.slice(0, 300));
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Commitment follow-ups (tracking determinístico, $0 tokens LLM).
// Detecta items en whatsapp_commitments que necesitan follow-up por tiempo
// vencido y manda mensajes con templates hardcodeados al grupo.
//
// Reglas:
//   1. meeting_followup: kind=meeting con due_at 1.5-3h atrás y sin
//      menciones del target en mensajes posteriores -> "¿Cómo fue la X?"
//   2. promise_overdue: kind=promise con due_at venció hace 1-6h -> ping
//   3. tracking_stale: kind=tracking sin followup en 3+ días -> ping
//   4. closer_contact_overdue: stage=Asignada con contacto cadencia
//      (1,3,5,8,15,29) vencido y sin closer_contact_history nuevo -> ping
//   5. confirmada_stale: stage=Confirmada hace 7+ días sin pasar a
//      Completada -> pregunta por la firma
//
// Dedup via whatsapp_supervisor_state con check_kind único por (regla, target).
// ─────────────────────────────────────────────────────────────────────────

interface CommitmentRow {
  id: string;
  subject: string;
  target_subject: string | null;
  due_at: string | null;
  item_kind: string;
  committed_by_text: string | null;
  last_followup_at: string | null;
  followup_count: number | null;
}

// Helper: ¿Alguien menciono este target en el grupo en la ultima N hora?
// Si si, no preguntamos (el grupo ya esta hablando del tema).
async function recentlyMentioned(
  sb: SupabaseClient,
  groupId: string,
  target: string,
  sinceHoursAgo: number,
): Promise<boolean> {
  if (!target || target.length < 2) return false;
  const since = new Date(Date.now() - sinceHoursAgo * 3600_000).toISOString();
  const safe = target.replace(/[%_]/g, (m) => `\\${m}`);
  const { count } = await sb
    .from("whatsapp_messages")
    .select("id", { count: "exact", head: true })
    .eq("group_id", groupId)
    .gte("sent_at", since)
    .ilike("body", `%${safe}%`);
  return (count ?? 0) > 0;
}

// Anti-flood de follow-ups grupales: máximo por tick. Si nunca dispararon
// (como pasó por el bug del FK), al revivirlos hay un backlog grande; este tope
// hace que se escalonen en ticks de 15 min en vez de inundar el grupo de golpe.
// Se resetea al inicio de cada invocación del handler.
const MAX_GROUP_FOLLOWUPS_PER_TICK = 4;
let groupFollowupsSentThisTick = 0;

// Allowlist de follow-ups grupales ACTIVOS. Tras el incidente del 05/06 (spam +
// menciones a no-miembros / nombres crudos), solo dejamos los de bajo ruido + alto
// valor + acotados que mencionan a un CLOSER (miembro del grupo, por su nombre real).
// "closer_contact_overdue" se reemplazó por "closer_contact_digest" (1 resumen/closer/día,
// no 1 ping por lead). PENDIENTE de sumar (necesita tuneo antes):
//  · commitment-based (pre_meeting, meeting_followup, promise_overdue, tracking_stale)
//    — fueron EL spam → bajar la agresividad de whatsapp-extract-commitments + expirar
//    backlog viejo antes de prenderlos.
const ENABLED_FOLLOWUP_KINDS = new Set(["confirmada_stale", "monetization_followup", "closer_contact_digest"]);

async function sendFollowup(
  sb: SupabaseClient,
  group: GroupInfo,
  checkKey: string,
  message: string,
): Promise<void> {
  // Gate por TIPO: solo dispara lo que está en la allowlist (el resto queda OFF
  // hasta tunearlo). El checkKey es "<kind>:<id>...".
  if (!ENABLED_FOLLOWUP_KINDS.has(checkKey.split(":")[0])) return;
  // Solo en horario laboral del grupo. FAIL-CLOSED: solo mandamos si la RPC
  // confirma POSITIVAMENTE que estamos en horario. Si devuelve false/null o
  // tira error, NO mandamos (antes era fail-open → riesgo de pings fuera de hora).
  let isBH = false;
  try {
    const { data } = await sb.rpc("whatsapp_group_in_business_hours", { p_group_id: group.id });
    isBH = data === true;
  } catch (_e) { isBH = false; }
  if (!isBH) return;

  // Anti-flood: si ya gastamos el presupuesto de este tick, NO claimamos —
  // el item queda sin reclamar y el próximo tick lo retoma (se escalona).
  if (groupFollowupsSentThisTick >= MAX_GROUP_FOLLOWUPS_PER_TICK) return;

  // Claim de dedup GRUPAL en whatsapp_supervisor_group_state (sin el FK
  // user_id->profiles que rompía el claim con tenant_id y hacía que estos
  // follow-ups NUNCA dispararan).
  const today = bogotaNow().date;
  const ok = await tryClaimGroup(sb, group.id, checkKey, today, {});
  if (!ok) return;
  await sendToGroup(sb, group.id, message);
  groupFollowupsSentThisTick++;
}

// ─────────────────────────────────────────────────────────────────────────
// Alerta de ausencia no anunciada — al dueño en DM, no al grupo.
// Si un user con schedule hoy no se reportó "activo" 30 min despues de
// su start_time y no tiene day_off registrado → ping al owner.
// ─────────────────────────────────────────────────────────────────────────
async function checkUnannouncedAbsence(
  sb: SupabaseClient,
  group: GroupInfo,
  now: { hhmm: string; weekday: number; date: string },
): Promise<void> {
  // Owner del tenant (uno solo asumimos para v1).
  const { data: owners } = await sb
    .from("profiles")
    .select("id, full_name, whatsapp_lid")
    .eq("is_owner", true)
    .limit(1);
  const owner = (owners ?? [])[0];
  if (!owner?.whatsapp_lid) return; // sin owner verificado no podemos DM-ear

  // Schedules de hoy con role llg/closer.
  const { data: scheds } = await sb
    .from("whatsapp_user_schedules")
    .select("user_id, start_time, role_kind, profile:profiles!whatsapp_user_schedules_user_id_fkey(full_name, whatsapp_push_name)")
    .eq("weekday", now.weekday);
  if (!scheds || scheds.length === 0) return;

  const nowM = timeToMinutes(now.hhmm);
  const missing: string[] = [];

  for (const s of scheds as Array<{
    user_id: string;
    start_time: string;
    role_kind: string;
    profile: { full_name: string | null; whatsapp_push_name: string | null } | null;
  }>) {
    const startM = timeToMinutes(s.start_time.slice(0, 5));
    // Solo chequear entre +30 y +60 min del inicio (ventana estrecha, dedup natural).
    if (nowM < startM + 30 || nowM > startM + 60) continue;

    // ¿Tiene día libre hoy?
    const { count: dayOff } = await sb
      .from("whatsapp_user_time_off")
      .select("id", { count: "exact", head: true })
      .eq("user_id", s.user_id)
      .eq("off_date", now.date);
    if ((dayOff ?? 0) > 0) continue;

    // ¿Ya se reportó activo hoy?
    const { count: active } = await sb
      .from("whatsapp_supervisor_state")
      .select("id", { count: "exact", head: true })
      .eq("user_id", s.user_id)
      .eq("check_kind", "user_active")
      .eq("check_date", now.date);
    if ((active ?? 0) > 0) continue;

    const display = s.profile?.whatsapp_push_name ?? s.profile?.full_name?.split(" ")[0] ?? "anon";
    missing.push(display);
  }

  if (missing.length === 0) return;

  // Claim para dedup (UNIQUE por user_id=owner+check_kind+date).
  const ok = await tryClaim(sb, owner.id, `unannounced_absence:${now.hhmm}`, now.date, { missing });
  if (!ok) return;

  // DM al owner via gateway directo. Necesitamos el JID del owner.
  const ownerJid = owner.whatsapp_lid;
  const msg = `🚨 Ausencia no anunciada · *${group.tenant_id ? "Marketing/Ventas" : "grupo"}*\n` +
    `Sin reportarse activos hoy (+30 min del inicio):\n` +
    missing.map((m) => `· ${m}`).join("\n") +
    `\n¿Sabes si están OK?`;
  // Send via gateway directo (DM al owner, no al grupo).
  try {
    const gwUrl = Deno.env.get("WHATSAPP_EVOLUTION_URL") ?? "";
    const gwKey = Deno.env.get("WHATSAPP_EVOLUTION_API_KEY") ?? "";
    const gwInst = Deno.env.get("WHATSAPP_EVOLUTION_INSTANCE") ?? "maven-bot";
    if (gwUrl && gwKey) {
      await fetch(`${gwUrl}/message/sendText/${gwInst}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "apikey": gwKey },
        body: JSON.stringify({ number: ownerJid.replace(/@.*/, ""), text: msg }),
      });
    }
  } catch (e) {
    console.warn("absence DM failed:", (e as Error).message);
  }
}

// Resume el ÚLTIMO contacto de un lead para el digest del supervisor: canal +
// resultado + nota (pedido de Luis: que el bot "vea el canal y las notas", no
// solo cuente). `rows` viene ordenado por contact_date DESC. Ignora la nota
// placeholder '(auto)' (los contactos auto de la bandeja no tienen nota real).
function lastContactSummary(
  rows: Array<{ channel: string | null; result: string | null; notes: string | null; contact_date: string }>,
  nowMs: number,
): string {
  if (!rows || rows.length === 0) return "sin contactos aún";
  const last = rows[0];
  const d = Math.floor((nowMs - new Date(last.contact_date).getTime()) / 86_400_000);
  const when = d <= 0 ? "hoy" : `hace ${d}d`;
  const parts: string[] = [];
  if (last.channel) parts.push(last.channel);
  if (last.result) parts.push(last.result);
  let s = `${when}${parts.length ? " · " + parts.join(" · ") : ""}`;
  const note = String(last.notes ?? "").trim();
  if (note && note !== "(auto)") s += ` · ${note.slice(0, 80)}`;
  return s;
}

async function checkCommitmentFollowups(
  sb: SupabaseClient,
  group: GroupInfo,
): Promise<void> {
  const now = Date.now();

  // ── Regla 0: PRE-meeting reminder (15-45 min antes) ─────────────────
  // Cuando hay un meeting agendado en los próximos 15-45 min, recordamos
  // al responsable + traemos contexto del lead (handle Maven lookup).
  const preMeetingFrom = new Date(now + 15 * 60_000).toISOString();
  const preMeetingTo = new Date(now + 45 * 60_000).toISOString();
  const { data: upcomingMeetings } = await sb
    .from("whatsapp_commitments")
    .select("id, subject, target_subject, due_at, item_kind, committed_by_text, last_followup_at, followup_count")
    .eq("group_id", group.id)
    .eq("item_kind", "meeting")
    .eq("status", "pending")
    .gte("due_at", preMeetingFrom)
    .lte("due_at", preMeetingTo);
  for (const m of (upcomingMeetings ?? []) as CommitmentRow[]) {
    const target = m.target_subject ?? m.subject;
    const handle = target.replace(/^@/, "").trim();
    const who = m.committed_by_text ?? "equipo";

    // Lookup en Maven para traer contexto del lead.
    let context = "";
    try {
      const { data: lg } = await sb
        .from("leadgen_entries")
        .select("model_handle, quality, status, notes")
        .ilike("model_handle", handle)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (lg) {
        const parts: string[] = [];
        if (lg.quality) parts.push(`quality ${lg.quality}`);
        if (lg.status) parts.push(`status ${lg.status}`);
        if (parts.length > 0) context = ` Contexto Maven: ${parts.join(", ")}.`;
      }
    } catch (_e) { /* no context, no problem */ }

    const due = m.due_at ? new Date(m.due_at).toLocaleTimeString("es-ES", { timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit" }) : "?";
    const msg = `⏰ @${who}, en ~30 min reunión con ${igLink(handle)} (${due} Bogotá).${context}`;
    await sendFollowup(sb, group, `pre_meeting:${m.id}`, msg);
  }

  // ── Regla 1: meeting follow-up (due_at hace 1.5-3h) ─────────────────
  const meetingFrom = new Date(now - 3 * 3600_000).toISOString();
  const meetingTo = new Date(now - 1.5 * 3600_000).toISOString();
  const { data: meetings } = await sb
    .from("whatsapp_commitments")
    .select("id, subject, target_subject, due_at, item_kind, committed_by_text, last_followup_at, followup_count")
    .eq("group_id", group.id)
    .eq("item_kind", "meeting")
    .eq("status", "pending")
    .gte("due_at", meetingFrom)
    .lte("due_at", meetingTo);
  for (const m of (meetings ?? []) as CommitmentRow[]) {
    const target = m.target_subject ?? m.subject;
    if (await recentlyMentioned(sb, group.id, target, 1)) continue;
    const who = m.committed_by_text ?? "equipo";
    const msg = `@${who}, ¿cómo fue la reunión con ${igLink(target)}? 👀`;
    await sendFollowup(sb, group, `meeting_followup:${m.id}`, msg);
  }

  // ── Regla 2: promise overdue (due_at venció hace 1-6h) ──────────────
  const promiseFrom = new Date(now - 6 * 3600_000).toISOString();
  const promiseTo = new Date(now - 1 * 3600_000).toISOString();
  const { data: promises } = await sb
    .from("whatsapp_commitments")
    .select("id, subject, target_subject, due_at, item_kind, committed_by_text, last_followup_at, followup_count")
    .eq("group_id", group.id)
    .eq("item_kind", "promise")
    .eq("status", "pending")
    .gte("due_at", promiseFrom)
    .lte("due_at", promiseTo);
  for (const p of (promises ?? []) as CommitmentRow[]) {
    const target = p.target_subject ?? p.subject;
    if (await recentlyMentioned(sb, group.id, target, 2)) continue;
    const who = p.committed_by_text ?? "equipo";
    const msg = `@${who}, te recuerdo: *${p.subject.slice(0, 100)}*. ¿Cómo va?`;
    await sendFollowup(sb, group, `promise_overdue:${p.id}`, msg);
  }

  // ── Regla 3: tracking stale (sin followup en 3+ días) ────────────────
  const staleThreshold = new Date(now - 3 * 24 * 3600_000).toISOString();
  const { data: stale } = await sb
    .from("whatsapp_commitments")
    .select("id, subject, target_subject, due_at, item_kind, committed_by_text, last_followup_at, followup_count")
    .eq("group_id", group.id)
    .eq("item_kind", "tracking")
    .eq("status", "pending")
    .or(`last_followup_at.is.null,last_followup_at.lt.${staleThreshold}`)
    .lt("created_at", staleThreshold);
  for (const t of (stale ?? []) as CommitmentRow[]) {
    const target = t.target_subject ?? t.subject;
    if (await recentlyMentioned(sb, group.id, target, 12)) continue;
    const who = t.committed_by_text ?? "equipo";
    const msg = `@${who}, hace +3 días que no hay updates sobre *${t.subject.slice(0, 80)}*. ¿En qué quedó?`;
    await sendFollowup(sb, group, `tracking_stale:${t.id}`, msg);
  }

  // ── Regla 4: closer_contact_overdue → RESUMEN (digest) por closer ────
  // Cadencia 1,3,5,8,15,29 días desde passed_date. En vez de 1 ping por lead
  // vencido (era spam: ~27 de una), agrupamos por closer y mandamos UN solo
  // resumen con la lista → acotado a 1 mensaje/closer/día (dedup por checkKey).
  //
  // Pedido de Luis: el supervisor no solo cuenta — para cada lead vencido trae
  // el ÚLTIMO contacto (canal + resultado + nota) leyendo closer_contact_history,
  // así el closer ve de un vistazo en qué quedó cada gestión.
  const cadence = [1, 3, 5, 8, 15, 29];
  const { data: assigned } = await sb
    .from("closer_creators")
    .select("id, instagram_handle, assigned_to, passed_date")
    .eq("stage", "Asignada")
    .not("assigned_to", "is", null)
    .not("passed_date", "is", null);
  const assignedRows = (assigned ?? []) as Array<{
    id: string;
    instagram_handle: string | null;
    assigned_to: string | null;
    passed_date: string | null;
  }>;

  // Historial de TODAS las leads en UNA query (antes: 1 query por lead) —
  // ordenado desc global, agrupado por lead (queda desc por lead también).
  const histByLead = new Map<string, Array<{ channel: string | null; result: string | null; notes: string | null; contact_date: string }>>();
  const assignedIds = assignedRows.map((cc) => cc.id);
  if (assignedIds.length) {
    const { data: allHist } = await sb
      .from("closer_contact_history")
      .select("creator_id, channel, result, notes, contact_date")
      .in("creator_id", assignedIds)
      .order("contact_date", { ascending: false });
    for (const h of (allHist ?? []) as Array<{ creator_id: string; channel: string | null; result: string | null; notes: string | null; contact_date: string }>) {
      const arr = histByLead.get(h.creator_id) ?? [];
      arr.push(h);
      histByLead.set(h.creator_id, arr);
    }
  }

  // Overdue RE-ANCLADO al último contacto (mismo criterio que el frontend
  // isContactOverdue y whatsapp-agent #917): contactar "pone al día" el lead;
  // deadline = (sin contactos) passed+1d ; (con ≥1) último_contacto + gap.
  // ⚠️ ANTES: anclado a passed_date FIJO → falsos positivos masivos (María
  // "58 vencidas" cuando lo real era 42; Miguel "10" vs 1 — digest 2026-07-23).
  const bogotaDate = (ms: number) => new Date(ms - 5 * 3_600_000).toISOString().slice(0, 10);
  const addDays = (dateStr: string, n: number) =>
    new Date(new Date(dateStr + "T00:00:00Z").getTime() + n * 86_400_000).toISOString().slice(0, 10);
  const todayBog = bogotaDate(now);

  const overdueByCloser = new Map<string, Array<{ handle: string; detail: string }>>();
  for (const cc of assignedRows) {
    if (!cc.passed_date || !cc.assigned_to) continue;
    const hist = histByLead.get(cc.id) ?? [];
    const done = hist.length;
    if (done >= 6) continue;
    const pd = cc.passed_date.slice(0, 10);
    let deadline: string;
    if (done === 0) {
      deadline = addDays(pd, cadence[0]); // 1 día tras la asignación
    } else {
      const gap = (cadence[done] ?? 29) - (cadence[done - 1] ?? 0);
      const lastMs = Date.parse(hist[0].contact_date); // hist viene desc
      const base = Number.isFinite(lastMs) ? bogotaDate(lastMs) : pd;
      deadline = addDays(base, gap);
    }
    if (todayBog <= deadline) continue;
    const list = overdueByCloser.get(cc.assigned_to) ?? [];
    list.push({ handle: cc.instagram_handle ?? "(sin handle)", detail: lastContactSummary(hist, now) });
    overdueByCloser.set(cc.assigned_to, list);
  }
  for (const [closerId, leads] of overdueByCloser) {
    const { data: prof } = await sb
      .from("profiles")
      .select("whatsapp_push_name, full_name")
      .eq("id", closerId)
      .maybeSingle();
    // Nombre REAL primero (full_name), no el apodo de WhatsApp.
    const closerName = prof?.full_name?.split(" ")[0] ?? prof?.whatsapp_push_name ?? "closer";
    // 6 con detalle (canal/resultado/nota) para no pasarnos de largo en el grupo.
    const top = leads.slice(0, 6);
    const lista = top.map((l) => `· ${igLink(l.handle)} — ${l.detail}`).join("\n");
    const extra = leads.length > top.length ? `\n…y ${leads.length - top.length} más` : "";
    const msg = `@${closerName} · ${leads.length} lead${leads.length === 1 ? "" : "s"} con contacto vencido (cadencia 1-3-5-8-15-29):\n${lista}${extra}\nAvánzalos hoy. Si ya los tocaste, registra canal + resultado.`;
    await sendFollowup(sb, group, `closer_contact_digest:${closerId}`, msg);
  }

  // ── Regla 5: confirmada_stale (confirmada hace 7+ días sin Completada) ─
  const confirmedStaleCutoff = new Date(now - 7 * 24 * 3600_000).toISOString();
  const { data: stuckConfirmed } = await sb
    .from("closer_creators")
    .select("id, instagram_handle, assigned_to, confirmed_date")
    .eq("stage", "Confirmada")
    .not("assigned_to", "is", null)
    .lte("confirmed_date", confirmedStaleCutoff);
  for (const cc of (stuckConfirmed ?? []) as Array<{
    id: string;
    instagram_handle: string | null;
    assigned_to: string | null;
    confirmed_date: string | null;
  }>) {
    if (!cc.assigned_to) continue;
    const handle = cc.instagram_handle ?? "(sin handle)";
    if (await recentlyMentioned(sb, group.id, handle, 24)) continue;
    const { data: prof } = await sb
      .from("profiles")
      .select("whatsapp_push_name, full_name")
      .eq("id", cc.assigned_to)
      .maybeSingle();
    // Nombre REAL primero (full_name), no el apodo de WhatsApp (evita "@Juli 💘💘").
    const closerName = prof?.full_name?.split(" ")[0] ?? prof?.whatsapp_push_name ?? "closer";
    const daysSince = cc.confirmed_date ? Math.floor((now - new Date(cc.confirmed_date).getTime()) / 86_400_000) : "?";
    const msg = `@${closerName}, ${igLink(handle)} lleva ${daysSince} días confirmada sin pasar a *Completada*. ¿Cómo va la firma?`;
    await sendFollowup(sb, group, `confirmada_stale:${cc.id}`, msg);
  }

  // ── Regla 6: monetization_followup ──────────────────────────────────
  // Oportunidades de venta de productos (monetization_opportunities) que el
  // equipo cargó en la pantalla de Maven y dejó con un next_followup_at ya
  // vencido. Pedido de Alvaro: que el bot "persiga" esos seguimientos sin que
  // se lo recuerden. Solo las ABIERTAS (no won/lost) y CON dueño (assigned_to)
  // → ping dirigido a quien la trabaja. Dedup: recentlyMentioned por handle +
  // sendFollowup (1 ping/oportunidad/día mientras siga vencida).
  // DEFENSIVO: si la migración de la tabla aún no está aplicada en prod,
  // `oppsErr` viene set y la regla queda inerte (no rompe el tick); se activa
  // sola cuando la tabla exista.
  const PRODUCT_ES: Record<string, string> = {
    piclink: "Piclink", content_protector: "Content Protector", blu: "Blu",
    exchange: "Exchange", agency: "Agencia", other: "el producto",
  };
  const STAGE_ES: Record<string, string> = {
    interested: "interesada", offered: "con oferta hecha", negotiating: "en negociación",
  };
  const { data: opps, error: oppsErr } = await sb
    .from("monetization_opportunities")
    .select("id, creator_handle, product, stage, assigned_to, next_followup_at")
    .eq("tenant_id", group.tenant_id)
    .in("stage", ["interested", "offered", "negotiating"])
    .not("assigned_to", "is", null)
    .not("next_followup_at", "is", null)
    .lte("next_followup_at", new Date(now).toISOString());
  for (const o of (oppsErr ? [] : (opps ?? [])) as Array<{
    id: string;
    creator_handle: string | null;
    product: string;
    stage: string;
    assigned_to: string | null;
    next_followup_at: string | null;
  }>) {
    if (!o.assigned_to) continue;
    const handle = (o.creator_handle ?? "").replace(/^@/, "") || "(sin handle)";
    if (await recentlyMentioned(sb, group.id, handle, 24)) continue;
    const { data: prof } = await sb
      .from("profiles")
      .select("whatsapp_push_name, full_name")
      .eq("id", o.assigned_to)
      .maybeSingle();
    // Nombre REAL primero (full_name), no el apodo de WhatsApp.
    const who = prof?.full_name?.split(" ")[0] ?? prof?.whatsapp_push_name ?? "equipo";
    const prod = PRODUCT_ES[o.product] ?? o.product;
    const stageEs = STAGE_ES[o.stage] ?? o.stage;
    const msg = `@${who}, monetización: ${igLink(handle)} quedó *${stageEs}* con ${prod}. Toca retomar, ¿la avanzas hoy?`;
    await sendFollowup(sb, group, `monetization_followup:${o.id}`, msg);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Reporte cierre del día — al fin del turno más tardío
// ─────────────────────────────────────────────────────────────────────────
async function maybeEndOfDayReport(
  sb: SupabaseClient,
  group: GroupInfo,
  now: { hhmm: string; weekday: number; date: string },
): Promise<void> {
  // Hora del último turno del día: el end_time máximo de LOS MIEMBROS DE ESTE GRUPO.
  // ⚠️ Antes esta query no filtraba por grupo y tomaba el máximo GLOBAL del sistema:
  // todos los grupos cerraban a la misma hora, la del turno más largo de cualquier
  // equipo, sin relación con la jornada real de sus miembros.
  const { data: miembros } = await sb
    .from("whatsapp_members")
    .select("user_id")
    .eq("group_id", group.id)
    .not("user_id", "is", null);
  const userIds = [...new Set((miembros ?? []).map((m: any) => m.user_id as string))];
  if (userIds.length === 0) return;
  const { data: schedules } = await sb
    .from("whatsapp_user_schedules")
    .select("end_time")
    .eq("weekday", now.weekday)
    .in("user_id", userIds)
    .order("end_time", { ascending: false })
    .limit(1);
  if (!schedules || schedules.length === 0) return;
  const lastEndM = timeToMinutes((schedules[0].end_time as string).slice(0, 5));
  const nowM = timeToMinutes(now.hhmm);
  // Solo dentro de los 15 min siguientes al fin del último turno.
  if (nowM < lastEndM || nowM > lastEndM + 15) return;

  // Claim grupal SIN el FK roto (antes usaba tryClaim(group.tenant_id) → FK-fail →
  // el EOD nunca disparaba). Ver whatsapp_supervisor_group_state.
  const ok = await tryClaimGroup(sb, group.id, "end_of_day_report", now.date, {});
  if (!ok) return;

  // Delegamos la composición del mensaje al agent (whatsapp-agent con
  // report_kind="eod_summary"). El agent lee mensajes del día, cruza con
  // Maven, identifica gaps + achievements, y envía el resumen via
  // reply_to_group. Ver sección "REPORTE FIN DE TURNO" en el system prompt
  // del agent para el formato exacto.
  await invokeAgentForEod(group.id);
}

// ─────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────
async function tick(sb: SupabaseClient): Promise<{ checked: number; sent: number }> {
  const now = bogotaNow();

  // Domingo: cero schedules — salir.
  if (now.weekday === 0) return { checked: 0, sent: 0 };

  // Grupos activos con bot_enabled=true. Si bot_enabled=false NO se manda nada.
  const { data: groupsRaw } = await sb
    .from("whatsapp_groups")
    .select("id, tenant_id, bot_enabled, external_id, bot_mode, wa_bot_id")
    .eq("active", true)
    .eq("bot_enabled", true);
  // El supervisor de closers/LLG SOLO corre en grupos de ventas. Excluir:
  //   - bot_mode='off' (solo-envío)
  //   - grupos cuyo bot NO es de department='sales' (ej. Managers = 'manager', que
  //     tiene su propio supervisor promolog-manager-tick). Evita que los checks de
  //     closers se cuelen en otros departamentos.
  const { data: nonSalesBots } = await sb.from("wa_bots").select("id").neq("department", "sales");
  const excludeBotIds = new Set((nonSalesBots ?? []).map((b: any) => b.id));
  const activos = (groupsRaw ?? []).filter((g: any) => g.bot_mode !== "off");
  const groups = activos.filter((g: any) => !(g.wa_bot_id && excludeBotIds.has(g.wa_bot_id)));
  // El CIERRE DE JORNADA no es específico de ventas: es "se terminó el turno de este
  // equipo, resume el día". Excluirlo junto con los checks de closers dejó a AI WARMING
  // sin cierre PROGRAMADO desde el 08/07 — el 30/07, el día de mayor producción del
  // equipo (14 videos, 14 fotos, 6 posts), no hubo ningún resumen. Corre para todos los
  // grupos con bot activo; los checks de closers siguen scopeados a department='sales'.
  //
  // EXCEPTO los 3 grupos del régimen de cortes 2h: su cierre de las 19:00 lo publica
  // whatsapp-corte-tick (corte_cierre, con las notas oficiales). El 04/08 salieron DOS
  // cierres casi idénticos con 1 minuto de diferencia en cada grupo ("Resumen de hoy"
  // de este tick + "Cierre del día" del corte) — doble ruido y doble costo.
  const GRUPOS_CORTE = new Set([
    "a12d9f41-c962-4d98-b0bb-6b2d2573534c", // AI WARMING
    "73a4414e-2546-4ca7-9289-7cbec70b0273", // Managers
    "d12ec56f-b324-4369-b72d-7540fb930ef6", // Marketing/Ventas
  ]);
  const gruposParaCierre = activos.filter((g: any) => !GRUPOS_CORTE.has(g.id));
  if (activos.length === 0) return { checked: 0, sent: 0 };

  // Por tenant, sacar users en schedule hoy con sus profile data.
  let checked = 0;
  for (const g of groups as GroupInfo[]) {
    const { data: schedules } = await sb
      .from("whatsapp_user_schedules")
      .select(`
        user_id, weekday, start_time, end_time, daily_goal, role_kind,
        profile:profiles!whatsapp_user_schedules_user_id_fkey(full_name, whatsapp_lid, whatsapp_push_name)
      `)
      .eq("weekday", now.weekday);
    if (!schedules) continue;

    for (const s of schedules as Array<UserSchedule & {
      profile: { full_name: string | null; whatsapp_lid: string | null; whatsapp_push_name: string | null } | null;
    }>) {
      const user: UserSchedule = {
        user_id: s.user_id,
        start_time: s.start_time,
        end_time: s.end_time,
        daily_goal: s.daily_goal,
        role_kind: s.role_kind,
        full_name: s.profile?.full_name ?? null,
        whatsapp_lid: s.profile?.whatsapp_lid ?? null,
        whatsapp_push_name: s.profile?.whatsapp_push_name ?? null,
      };
      checked += 1;
      try {
        // Los LLGs se movieron al grupo AI WARMING (2026-07-29) y su seguimiento
        // lo hace el bot de ese grupo. Este tick corre SOLO en grupos de ventas,
        // así que sus pings de meta ("@X vas 0/3") caían en Marketing/Ventas, que
        // ya es solo de closers. Se elimina el checker de LLG por pedido del owner.
        if (user.role_kind === "closer") {
          await checkCloser(sb, user, g, now);
        }
      } catch (e) {
        console.warn("check failed:", user.user_id, (e as Error).message);
      }
    }

    // Follow-ups deterministicos de commitments + closer pipeline.
    try {
      await checkCommitmentFollowups(sb, g);
    } catch (e) {
      console.warn("commitment followups failed:", (e as Error).message);
    }

    // Alerta al owner si alguien no se reportó activo.
    try {
      await checkUnannouncedAbsence(sb, g, now);
    } catch (e) {
      console.warn("unannounced absence check failed:", (e as Error).message);
    }
  }

  // Cierre del día: TODOS los grupos con bot activo, no solo los de ventas (una vez
  // por grupo por día, garantizado por tryClaimGroup dentro de maybeEndOfDayReport).
  for (const g of gruposParaCierre as GroupInfo[]) {
    try {
      await maybeEndOfDayReport(sb, g, now);
    } catch (e) {
      console.warn("end of day report failed:", g.id, (e as Error).message);
    }
  }

  return { checked, sent: 0 };  // sent no se trackea por simplicidad
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: whatsappCors });
  if (!authorizeCronOrJwt(req)) {
    return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), {
      status: 401, headers: { ...whatsappCors, "Content-Type": "application/json" },
    });
  }
  const sb = adminClient();
  groupFollowupsSentThisTick = 0; // reset del tope anti-flood (por invocación/tick)
  try {
    const result = await tick(sb);
    await logEvent(sb, {
      tenantId: null,
      kind: "supervisor_tick",
      payload: { checked: result.checked, ...bogotaNow() },
    });
    return new Response(JSON.stringify({ ok: true, ...result }), {
      status: 200, headers: { ...whatsappCors, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
      status: 500, headers: { ...whatsappCors, "Content-Type": "application/json" },
    });
  }
});
