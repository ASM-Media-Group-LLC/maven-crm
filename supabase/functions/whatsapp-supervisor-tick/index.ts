import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { adminClient, authorizeCronOrJwt, logEvent, whatsappCors } from "../_shared/whatsapp.ts";

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
async function getLlgContactsToday(sb: SupabaseClient, userId: string, today: string): Promise<number> {
  // Meta del LLG: filas en closers_contacts creadas hoy por este user.
  const { count } = await sb
    .from("closers_contacts")
    .select("id", { count: "exact", head: true })
    .eq("created_by", userId)
    .gte("created_at", `${today}T00:00:00-05:00`)
    .lte("created_at", `${today}T23:59:59-05:00`);
  return count ?? 0;
}

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

// ─────────────────────────────────────────────────────────────────────────
// LLG checker
// ─────────────────────────────────────────────────────────────────────────
async function checkLlg(
  sb: SupabaseClient,
  user: UserSchedule,
  group: GroupInfo,
  now: { hhmm: string; date: string },
): Promise<void> {
  if (user.daily_goal === null) return;
  const startM = timeToMinutes(user.start_time.slice(0, 5));
  const endM = timeToMinutes(user.end_time.slice(0, 5));
  const nowM = timeToMinutes(now.hhmm);
  if (nowM < startM || nowM > endM) return;

  const turnoTotal = endM - startM;
  const progresoMin = nowM - startM;
  const pctTurno = progresoMin / turnoTotal;

  const contacts = await getLlgContactsToday(sb, user.user_id, now.date);
  const goal = user.daily_goal;
  const mention = user.whatsapp_push_name ?? user.full_name?.split(" ")[0] ?? "equipo";

  // Si ya llegó a la meta, no se molesta.
  if (contacts >= goal) return;

  // 3 puntos de check según % de turno. Cada uno tiene su check_kind para
  // dedup independiente.
  // 1/3 turno: si va 0/goal
  if (pctTurno >= 0.33 && pctTurno < 0.65) {
    if (contacts === 0) {
      const ok = await tryClaim(sb, user.user_id, "llg_progress_1_3", now.date, { contacts, goal });
      if (ok) await sendToGroup(sb, group.id, `@${mention} vas 0/${goal}.`);
    }
    return;
  }

  // 2/3 turno: si va <2/3 del goal
  if (pctTurno >= 0.65 && pctTurno < 0.9) {
    const umbral = Math.ceil(goal * 0.66);
    if (contacts < umbral) {
      const ok = await tryClaim(sb, user.user_id, "llg_progress_2_3", now.date, { contacts, goal });
      if (ok) await sendToGroup(sb, group.id, `@${mention} ${contacts}/${goal}. Última recta.`);
    }
    return;
  }

  // Últimos 30 min: si va <goal
  if (endM - nowM <= 30 && endM - nowM > 0) {
    if (contacts < goal) {
      const ok = await tryClaim(sb, user.user_id, "llg_last_30min", now.date, { contacts, goal });
      if (ok) await sendToGroup(sb, group.id, `@${mention} ${contacts}/${goal}. Última media hora.`);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Closer checker — preguntas abiertas (sin meta numérica fija)
// ─────────────────────────────────────────────────────────────────────────
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

  // 1h antes del fin del turno: preguntar cuántas llamadas hicieron.
  // Solo si están en la última hora y no se preguntó hoy.
  if (endM - nowM <= 60 && endM - nowM > 30) {
    const stats = await getCloserStatsToday(sb, user.user_id, now.date);
    // Si no hubo llamadas en QA, preguntar abierto.
    if (stats.calls === 0) {
      const ok = await tryClaim(sb, user.user_id, "closer_calls_pre_close", now.date, stats);
      if (ok) await sendToGroup(sb, group.id, `@${mention} ¿cuántas llamadas hiciste hoy? Veo 0 en QA.`);
    } else {
      const ok = await tryClaim(sb, user.user_id, "closer_calls_pre_close", now.date, stats);
      if (ok) await sendToGroup(sb, group.id, `@${mention} ¿confirmás que ${stats.calls} llamadas en QA son todas las de hoy?`);
    }
    return;
  }

  // A las ~2h del inicio del turno, si no tiene leads asignados, avisar.
  if (nowM - startM >= 120 && nowM - startM < 150) {
    const stats = await getCloserStatsToday(sb, user.user_id, now.date);
    if (stats.leads_assigned === 0) {
      const ok = await tryClaim(sb, user.user_id, "closer_no_leads_2h", now.date, stats);
      if (ok) await sendToGroup(sb, group.id, `@${mention} 0 leads nuevos asignados hoy. ¿Algo pendiente del pipeline?`);
    }
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
  // Hora del último turno del día: tomar el end_time max de schedules de ese weekday.
  const { data: schedules } = await sb
    .from("whatsapp_user_schedules")
    .select("end_time")
    .eq("weekday", now.weekday)
    .order("end_time", { ascending: false })
    .limit(1);
  if (!schedules || schedules.length === 0) return;
  const lastEndM = timeToMinutes((schedules[0].end_time as string).slice(0, 5));
  const nowM = timeToMinutes(now.hhmm);
  // Solo dentro de los 15 min siguientes al fin del último turno.
  if (nowM < lastEndM || nowM > lastEndM + 15) return;

  const ok = await tryClaim(sb, group.tenant_id, "end_of_day_report", now.date, {});
  if (!ok) return;

  // Recolectar stats de todos los users con schedule hoy.
  const { data: usersToday } = await sb
    .from("whatsapp_user_schedules")
    .select("user_id, daily_goal, role_kind, profile:profiles!whatsapp_user_schedules_user_id_fkey(full_name, whatsapp_push_name)")
    .eq("weekday", now.weekday);
  if (!usersToday) return;

  const llgLines: string[] = [];
  const closerLines: string[] = [];
  let totalClosedToday = 0;

  for (const u of usersToday as Array<{
    user_id: string;
    daily_goal: number | null;
    role_kind: "llg" | "closer";
    profile: { full_name: string | null; whatsapp_push_name: string | null } | null;
  }>) {
    const display = u.profile?.whatsapp_push_name ?? u.profile?.full_name?.split(" ")[0] ?? "anon";
    if (u.role_kind === "llg" && u.daily_goal !== null) {
      const contacts = await getLlgContactsToday(sb, u.user_id, now.date);
      const emoji = contacts >= u.daily_goal ? "✅" : contacts > 0 ? "⚠️" : "❌";
      llgLines.push(`${display} ${contacts}/${u.daily_goal} ${emoji}`);
    } else if (u.role_kind === "closer") {
      const stats = await getCloserStatsToday(sb, u.user_id, now.date);
      totalClosedToday += stats.closed;
      closerLines.push(
        `${display}: ${stats.calls} llamadas · ${stats.closed.toFixed(1)} cerradas · ${stats.confirmed} confirmadas`,
      );
    }
  }

  const lines: string[] = ["📊 *Cierre del día*"];
  if (llgLines.length > 0) {
    lines.push("");
    lines.push("LLGs:");
    for (const l of llgLines) lines.push(`  ${l}`);
  }
  if (closerLines.length > 0) {
    lines.push("");
    lines.push("Closers:");
    for (const l of closerLines) lines.push(`  ${l}`);
    lines.push(`  Total cerradas: ${totalClosedToday.toFixed(1)}`);
  }
  await sendToGroup(sb, group.id, lines.join("\n"));
}

// ─────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────
async function tick(sb: SupabaseClient): Promise<{ checked: number; sent: number }> {
  const now = bogotaNow();

  // Domingo: cero schedules — salir.
  if (now.weekday === 0) return { checked: 0, sent: 0 };

  // Grupos activos con bot_enabled=true. Si bot_enabled=false NO se manda nada.
  const { data: groups } = await sb
    .from("whatsapp_groups")
    .select("id, tenant_id, bot_enabled, external_id")
    .eq("active", true)
    .eq("bot_enabled", true);
  if (!groups || groups.length === 0) return { checked: 0, sent: 0 };

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
        if (user.role_kind === "llg") {
          await checkLlg(sb, user, g, now);
        } else if (user.role_kind === "closer") {
          await checkCloser(sb, user, g, now);
        }
      } catch (e) {
        console.warn("check failed:", user.user_id, (e as Error).message);
      }
    }

    // Reporte cierre del día (una sola vez por grupo por día).
    try {
      await maybeEndOfDayReport(sb, g, now);
    } catch (e) {
      console.warn("end of day report failed:", (e as Error).message);
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
