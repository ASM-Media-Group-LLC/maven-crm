import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { adminClient, authorizeCronOrJwt, logEvent, whatsappCors } from "../_shared/whatsapp.ts";
import { logAnthropicUsage } from "../_shared/usage.ts";

// whatsapp-audit-history — escanea los mensajes de un grupo de los últimos
// N días, detecta eventos estructurados (reportes de jornada, anuncios de
// confirmación/rechazo de modelos, días libres), los cruza con Maven, y:
//   1) Inserta automáticamente lo que es safe (reportes diarios, días libres)
//   2) Reporta gaps en closer_creators con instrucciones de cómo cargar
//   3) Envía un mensaje-resumen al grupo cuando termina
//
// Trigger:
//   - whatsapp-ingest fire-and-forget cuando alguien escribe "@maven audita"
//   - Cron eventual (futuro): correr 1x/semana automáticamente
//
// Diseño:
//   - Una sola llamada a Sonnet 4.6 con los mensajes filtrados (max 200)
//     para extraer JSON estructurado. Sin tool_use porque es batch.
//   - Cross-reference con queries directas a Maven, sin LLM en el medio.
//   - Inserts idempotentes (upsert on conflict).
//
// Hard caps:
//   - max 200 mensajes input (los más estructurados/largos)
//   - max wall time 90s
//   - max 8000 tokens output

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const MODEL = "claude-sonnet-4-6";
const MAX_MESSAGES = 200;
const MAX_WALL_MS = 90_000;
const PROJECT_URL = Deno.env.get("SUPABASE_URL")!;

interface AuditRequest {
  group_id: string;
  since_days?: number;
  requested_by?: string;
}

interface ParsedEvent {
  type: "llg_report" | "closer_announcement" | "day_off";
  sender_display_name: string;
  source_message_id?: string;

  // LLG report
  report_date?: string;
  contactados?: number;
  respuestas?: number;
  numeros_obtenidos?: number;

  // Closer announcement
  instagram_handle?: string;
  status?: "confirmed" | "rejected" | "scheduled" | "cancelled";
  monetization_usd?: number;
  quality?: string;
  rejection_reason?: string;
  meeting_at?: string; // ISO o "26/5 4PM" — el LLM lo deja libre
  notes?: string;

  // Day off
  target_display_name?: string; // a quien le aplica (puede ser distinto del sender)
  off_date?: string;
  off_type?: "day_off" | "partial" | "sick" | "vacation";
}

// Pre-filter regex — solo mandamos a Sonnet mensajes con potencial de tener evento.
const EVENT_PATTERNS = [
  /\bcontactad(?:os|as)?\b/i,
  /\bn[uú]meros?\s*[:=]?\s*\d+/i,
  /\brespuestas?\s*[:=]?\s*\d+/i,
  /\breporte\b/i,
  /\bjornada\b/i,
  /\bconfirmada?\b/i,
  /\brechazada?\b/i,
  /\bcancelad[oa]\b/i,
  /\bd[ií]a\s+libre\b/i,
  /\bme\s+tomo\s+el\s+d[ií]a\b/i,
  /\bdescanso\b/i,
  /\benferm[oa]\b/i,
  /\bvacaciones\b/i,
  /instagram\.com\//i,
  /\bpara\s+ma[ñn]ana\b/i,
  /\breuni[oó]n\b/i,
];

function matchesEventPattern(text: string): boolean {
  return EVENT_PATTERNS.some((p) => p.test(text));
}

const SYSTEM_PROMPT = `Eres un auditor de mensajes de WhatsApp de equipos de agencias de OnlyFans.

Tu trabajo: leer mensajes del grupo y extraer eventos ESTRUCTURADOS en JSON, sin inventar.

Tipos de eventos:

1. *llg_report* — reporte de jornada de un LLG (lead generator). Patrones típicos:
   "Reporte Daniel: contactados 70, respuestas 1, números 0"
   "✅Total escritos: 49 ✅Respuestas: 2 ✅Números obtenidos: 3"
   "- Numeros contactados: 47 - Respuestas: 4 - Numeros obtenidos: 4"
   Campos: sender_display_name, report_date (YYYY-MM-DD), contactados, respuestas, numeros_obtenidos.

2. *closer_announcement* — anuncio de un closer sobre una modelo de Instagram. Patrones:
   "*CONFIRMADA:* https://www.instagram.com/catalinaofficer..., factura $3000, modelo B"
   "*RECHAZADA:* https://www.instagram.com/larola_a..., quiere ser cantante"
   "*Para mañana 4PM*: https://www.instagram.com/arq.gloriatorres89/, Modelo B"
   "reuniones confirmadas 2: @elpadreamen.core, @mariiaroz"
   Campos: sender_display_name, instagram_handle (limpio, sin @ ni URL), status (confirmed/rejected/scheduled/cancelled), monetization_usd (si lo dijeron), quality (A+/A/B+/B/C si lo dijeron), rejection_reason, meeting_at (si dio fecha y hora — descríbelo libre, no fuerces ISO), notes (cualquier extra relevante).

3. *day_off* — anuncio de que alguien NO va a trabajar un día. Patrones:
   "Es mi día libre hoy"
   "Mañana me tomo el día"
   "El viernes no entro"
   "Estoy enfermo"
   Campos: sender_display_name, target_display_name (a quien aplica — puede ser el sender o un tercero), off_date (YYYY-MM-DD, ya resuelto), off_type (day_off/partial/sick/vacation).

REGLAS:
- Solo extrae eventos CONCRETOS y CLAROS. No inventes números ni fechas.
- Si no hay evento claro, no lo incluyas.
- Si el mismo handle aparece en 2 mensajes con info contradictoria, devuelve los 2 eventos (el cliente decide).
- Para fechas relativas ("mañana", "el viernes"), usa la fecha del mensaje original como referencia y devuelve YYYY-MM-DD ya resuelto.
- IMPORTANTE: instagram_handle siempre en minúsculas, sin @ ni URL. Ej: "catalinaofficer", no "@catalinaofficer".

Output: JSON con shape { events: [...] }. Nada más, sin markdown.`;

interface Message {
  id: string;
  sender_display_name: string | null;
  body: string | null;
  transcribed_text: string | null;
  msg_type: string;
  sent_at: string;
}

function effectiveText(m: Message): string {
  if ((m.msg_type === "audio" || m.msg_type === "image") && m.transcribed_text) {
    return m.transcribed_text;
  }
  return m.body ?? "";
}

async function callSonnetExtract(messages: Message[]): Promise<{
  events: ParsedEvent[];
  usage: Record<string, number>;
} | { error: string }> {
  const contextLines = messages.map((m) =>
    `[id=${m.id}] [${m.sent_at}] ${m.sender_display_name ?? "—"}: ${effectiveText(m)}`
  ).join("\n");

  const userContent =
    "Mensajes del grupo (últimos 30 días). Extrae los eventos estructurados:\n\n" +
    contextLines;

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 8000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userContent }],
    }),
  });

  if (!resp.ok) {
    const txt = await resp.text();
    return { error: `anthropic ${resp.status}: ${txt.slice(0, 200)}` };
  }
  const data = await resp.json() as { content: Array<{ type: string; text?: string }>; usage: Record<string, number>; };
  const text = data.content.filter((b) => b.type === "text").map((b) => b.text ?? "").join("");
  try {
    // El modelo a veces wrappea en ```json — pelamos.
    const cleaned = text.replace(/^```(?:json)?\n?/i, "").replace(/```\s*$/i, "").trim();
    const parsed = JSON.parse(cleaned);
    const events = Array.isArray(parsed.events) ? parsed.events as ParsedEvent[] : [];
    return { events, usage: data.usage };
  } catch (e) {
    return { error: `parse_failed: ${(e as Error).message}` };
  }
}

// Resolver display_name → user_id buscando en whatsapp_members del grupo.
async function resolveUserId(
  sb: ReturnType<typeof adminClient>,
  groupId: string,
  displayName: string,
): Promise<string | null> {
  if (!displayName) return null;
  const safe = displayName.replace(/[%_]/g, (m) => `\\${m}`);
  const { data } = await sb
    .from("whatsapp_members")
    .select("user_id, display_name")
    .eq("group_id", groupId)
    .ilike("display_name", `%${safe}%`)
    .not("user_id", "is", null)
    .order("last_seen_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  return data?.user_id ?? null;
}

interface AuditResult {
  reports_inserted: number;
  reports_skipped_no_user: number;
  days_off_inserted: number;
  days_off_skipped_no_user: number;
  closer_gaps: Array<{
    instagram_handle: string;
    claimed: string;          // ej: "CONFIRMADA, $3000, Modelo B"
    actual_stage: string;     // ej: "Nuevo"
    actual_monetization: number;
    instructions: string;     // "Closers → busca ... → cambia stage a ..."
    sender: string;
  }>;
  closer_not_in_maven: Array<{
    instagram_handle: string;
    claimed: string;
    instructions: string;
    sender: string;
  }>;
  consistent: number; // cuántos eventos cuadraron con Maven (no se muestran en detalle)
}

async function processEvents(
  sb: ReturnType<typeof adminClient>,
  groupId: string,
  tenantId: string,
  events: ParsedEvent[],
): Promise<AuditResult> {
  const result: AuditResult = {
    reports_inserted: 0,
    reports_skipped_no_user: 0,
    days_off_inserted: 0,
    days_off_skipped_no_user: 0,
    closer_gaps: [],
    closer_not_in_maven: [],
    consistent: 0,
  };

  for (const ev of events) {
    try {
      // ===== LLG REPORT =====
      if (ev.type === "llg_report" && ev.sender_display_name && ev.report_date) {
        const userId = await resolveUserId(sb, groupId, ev.sender_display_name);
        if (!userId) { result.reports_skipped_no_user += 1; continue; }
        const { error } = await sb.from("whatsapp_daily_reports").upsert({
          user_id: userId,
          report_date: ev.report_date,
          role_kind: "llg",
          contactados: ev.contactados ?? null,
          respuestas: ev.respuestas ?? null,
          numeros_obtenidos: ev.numeros_obtenidos ?? null,
          source_message_id: ev.source_message_id ?? null,
          group_id: groupId,
        }, { onConflict: "user_id,report_date" });
        if (!error) result.reports_inserted += 1;
        continue;
      }

      // ===== DAY OFF =====
      if (ev.type === "day_off" && ev.off_date) {
        const targetName = ev.target_display_name || ev.sender_display_name;
        if (!targetName) { result.days_off_skipped_no_user += 1; continue; }
        const userId = await resolveUserId(sb, groupId, targetName);
        if (!userId) { result.days_off_skipped_no_user += 1; continue; }
        const { error } = await sb.from("whatsapp_user_time_off").upsert({
          user_id: userId,
          off_date: ev.off_date,
          off_type: ev.off_type ?? "day_off",
          source: "wpp_message",
          source_message_id: ev.source_message_id ?? null,
        }, { onConflict: "user_id,off_date" });
        if (!error) result.days_off_inserted += 1;
        continue;
      }

      // ===== CLOSER ANNOUNCEMENT =====
      if (ev.type === "closer_announcement" && ev.instagram_handle) {
        const handle = ev.instagram_handle.toLowerCase().replace(/^@/, "");
        // Buscar en closer_creators
        const { data: cc } = await sb
          .from("closer_creators")
          .select("id, instagram_handle, stage, rejection_reason, estimated_monetization, assigned_to")
          .ilike("instagram_handle", handle)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        const expectedStage =
          ev.status === "confirmed" ? "Confirmada" :
          ev.status === "rejected"  ? "Rechazada" :
          ev.status === "cancelled" ? "Cancelada" :
          ev.status === "scheduled" ? "Por Confirmar" : null;

        if (!cc) {
          // Modelo no existe en closer_creators
          result.closer_not_in_maven.push({
            instagram_handle: handle,
            claimed: describeAnnouncement(ev),
            instructions: instructionsToCreateCloserContact(handle, ev),
            sender: ev.sender_display_name ?? "—",
          });
          continue;
        }

        // Existe — verificar consistencia
        const stageOK = !expectedStage || cc.stage === expectedStage;
        const moneyOK = !ev.monetization_usd || Number(cc.estimated_monetization ?? 0) >= ev.monetization_usd;
        const reasonOK = ev.status !== "rejected" || !!cc.rejection_reason;

        if (stageOK && moneyOK && reasonOK) {
          result.consistent += 1;
        } else {
          result.closer_gaps.push({
            instagram_handle: handle,
            claimed: describeAnnouncement(ev),
            actual_stage: cc.stage ?? "—",
            actual_monetization: Number(cc.estimated_monetization ?? 0),
            instructions: instructionsToUpdateCloserContact(handle, ev, expectedStage),
            sender: ev.sender_display_name ?? "—",
          });
        }
      }
    } catch (e) {
      console.warn("event processing failed:", (e as Error).message, ev);
    }
  }

  return result;
}

function describeAnnouncement(ev: ParsedEvent): string {
  const parts: string[] = [];
  if (ev.status) parts.push(ev.status.toUpperCase());
  if (ev.monetization_usd) parts.push(`$${ev.monetization_usd}`);
  if (ev.quality) parts.push(`modelo ${ev.quality}`);
  if (ev.rejection_reason) parts.push(`razón: ${ev.rejection_reason}`);
  if (ev.meeting_at) parts.push(`reunión: ${ev.meeting_at}`);
  return parts.join(", ");
}

function instructionsToCreateCloserContact(handle: string, ev: ParsedEvent): string {
  const lines: string[] = [];
  lines.push(`Ve a *Closers → Nuevo Contacto*.`);
  lines.push(`Pega el handle: \`${handle}\``);
  if (ev.status === "confirmed") {
    lines.push(`Stage: *Confirmada*`);
    if (ev.monetization_usd) lines.push(`Monetización estimada: *$${ev.monetization_usd}*`);
  } else if (ev.status === "rejected") {
    lines.push(`Stage: *Rechazada*`);
    if (ev.rejection_reason) lines.push(`Razón: "${ev.rejection_reason}"`);
  } else if (ev.status === "scheduled") {
    lines.push(`Stage: *Por Confirmar*`);
    if (ev.meeting_at) lines.push(`Notas: reunión ${ev.meeting_at}`);
  }
  if (ev.quality) lines.push(`Categoría: *${ev.quality}*`);
  return lines.join("\n");
}

function instructionsToUpdateCloserContact(handle: string, ev: ParsedEvent, expectedStage: string | null): string {
  const lines: string[] = [];
  lines.push(`Ve a *Closers* → busca \`${handle}\` → editar.`);
  if (expectedStage) lines.push(`Cambia Stage a: *${expectedStage}*`);
  if (ev.monetization_usd) lines.push(`Setear Monetización estimada: *$${ev.monetization_usd}*`);
  if (ev.rejection_reason) lines.push(`Razón de rechazo: "${ev.rejection_reason}"`);
  if (ev.meeting_at && ev.status === "scheduled") lines.push(`Notas: reunión ${ev.meeting_at}`);
  return lines.join("\n");
}

function buildSummary(result: AuditResult, sinceDays: number): string {
  const lines: string[] = [];
  lines.push(`📋 *Auditoría del historial — últimos ${sinceDays} días*`);
  lines.push("━━━━━━━━━━━━━━━");
  lines.push("");

  // Lo capturado
  if (result.reports_inserted > 0 || result.days_off_inserted > 0) {
    lines.push("🔄 *Capturé y guardé automáticamente:*");
    if (result.reports_inserted > 0) lines.push(`• ${result.reports_inserted} reportes de jornada`);
    if (result.days_off_inserted > 0) lines.push(`• ${result.days_off_inserted} días libres / parciales`);
    lines.push("_Ver en Panel de Control → WhatsApp Bot → Reportes diarios._");
    lines.push("");
  }

  // Gaps en Maven
  if (result.closer_gaps.length > 0 || result.closer_not_in_maven.length > 0) {
    lines.push("⚠️ *Falta cargar en Maven (acción humana):*");
    lines.push("");
    let idx = 1;
    for (const g of result.closer_gaps) {
      lines.push(`*${idx}.* @${g.instagram_handle} — _${g.sender}_ dijo: ${g.claimed}`);
      lines.push(`   En Maven está como *${g.actual_stage}*. Para corregir:`);
      lines.push(g.instructions.split("\n").map((l) => `   ${l}`).join("\n"));
      lines.push("");
      idx += 1;
    }
    for (const g of result.closer_not_in_maven) {
      lines.push(`*${idx}.* @${g.instagram_handle} — _${g.sender}_ dijo: ${g.claimed}`);
      lines.push(`   *No está en Maven.* Para cargarla:`);
      lines.push(g.instructions.split("\n").map((l) => `   ${l}`).join("\n"));
      lines.push("");
      idx += 1;
    }
  } else if (result.consistent > 0) {
    lines.push(`✅ *${result.consistent} anuncios cuadran con Maven.* Buen trabajo.`);
    lines.push("");
  }

  // Si todo fue vacío
  if (result.reports_inserted === 0 && result.days_off_inserted === 0 && result.closer_gaps.length === 0 && result.closer_not_in_maven.length === 0) {
    lines.push("Sin eventos nuevos detectados. Todo en orden.");
  }

  return lines.join("\n").slice(0, 4000); // WhatsApp text limit
}

async function sendToGroup(groupId: string, body: string): Promise<void> {
  const url = `${PROJECT_URL}/functions/v1/whatsapp-send`;
  const token = Deno.env.get("CRON_INTERNAL_TOKEN") ?? "";
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Cron-Token": token },
      body: JSON.stringify({ group_id: groupId, body }),
    });
  } catch (e) {
    console.warn("sendToGroup failed:", (e as Error).message);
  }
}

async function runAudit(req: AuditRequest): Promise<{ ok: boolean; error?: string; summary?: string }> {
  const sb = adminClient();
  const sinceDays = Math.min(Math.max(req.since_days ?? 30, 1), 90);
  const since = new Date(Date.now() - sinceDays * 24 * 3600 * 1000).toISOString();

  const { data: group } = await sb
    .from("whatsapp_groups")
    .select("id, tenant_id, name, active, bot_enabled")
    .eq("id", req.group_id)
    .single();
  if (!group) return { ok: false, error: "group_not_found" };
  if (!group.active) return { ok: false, error: "group_inactive" };

  // Aviso inmediato al grupo
  await sendToGroup(group.id, `📋 *Auditando últimos ${sinceDays} días del grupo...*\nEsto puede tardar 1-2 min.`);

  // Cargar mensajes
  const { data: messages } = await sb
    .from("whatsapp_messages")
    .select("id, sender_display_name, body, transcribed_text, msg_type, sent_at")
    .eq("group_id", group.id)
    .gte("sent_at", since)
    .eq("is_from_bot", false)
    .order("sent_at", { ascending: true })
    .limit(1000); // pre-fetch generoso, después filtramos

  const allMessages = (messages ?? []) as Message[];

  // Pre-filtro: solo los que matchean algún patrón. Limitamos a MAX_MESSAGES
  // tomando los más recientes (cuestan menos tokens y son más relevantes).
  const candidates = allMessages
    .filter((m) => matchesEventPattern(effectiveText(m)))
    .slice(-MAX_MESSAGES);

  if (candidates.length === 0) {
    await sendToGroup(group.id, "📋 Audit terminado. No detecté mensajes con eventos para procesar.");
    return { ok: true, summary: "no_candidates" };
  }

  // Extraer con Sonnet
  const extracted = await callSonnetExtract(candidates);
  if ("error" in extracted) {
    await sendToGroup(group.id, `📋 Audit falló en extracción: ${extracted.error}`);
    return { ok: false, error: extracted.error };
  }

  // Log costo
  void logAnthropicUsage({
    operation: "whatsapp_audit_history",
    model: MODEL,
    usage: extracted.usage,
    tenantId: group.tenant_id,
    context: { group_id: group.id, candidates: candidates.length, events_extracted: extracted.events.length, requested_by: req.requested_by },
  });

  // Procesar eventos (auto-insert lo safe + detectar gaps)
  const result = await processEvents(sb, group.id, group.tenant_id, extracted.events);

  // Mensaje resumen al grupo
  const summary = buildSummary(result, sinceDays);
  await sendToGroup(group.id, summary);

  await logEvent(sb, {
    tenantId: group.tenant_id,
    groupId: group.id,
    kind: "audit_completed",
    payload: {
      requested_by: req.requested_by,
      since_days: sinceDays,
      candidates: candidates.length,
      events_extracted: extracted.events.length,
      ...result,
    },
  });

  return { ok: true, summary };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: whatsappCors });
  if (!authorizeCronOrJwt(req)) {
    return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), {
      status: 401,
      headers: { ...whatsappCors, "Content-Type": "application/json" },
    });
  }

  let body: AuditRequest;
  try {
    body = (await req.json()) as AuditRequest;
  } catch {
    return new Response(JSON.stringify({ ok: false, error: "invalid_json" }), {
      status: 400,
      headers: { ...whatsappCors, "Content-Type": "application/json" },
    });
  }

  // Hard timeout protection
  const timeoutPromise = new Promise<{ ok: false; error: string }>((resolve) =>
    setTimeout(() => resolve({ ok: false, error: "audit_timeout" }), MAX_WALL_MS)
  );

  try {
    const result = await Promise.race([runAudit(body), timeoutPromise]);
    return new Response(JSON.stringify(result), {
      status: result.ok ? 200 : 500,
      headers: { ...whatsappCors, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: (e as Error).message }),
      { status: 500, headers: { ...whatsappCors, "Content-Type": "application/json" } },
    );
  }
});
