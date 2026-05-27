import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { adminClient, authorizeCronOrJwt, logEvent, whatsappCors } from "../_shared/whatsapp.ts";
import { logAnthropicUsage } from "../_shared/usage.ts";

// whatsapp-extract-commitments — corre Claude sobre un mensaje (o batch)
// para detectar compromisos del estilo "el lunes contacto a Camila" y
// resoluciones del estilo "ya hablé con Camila".
//
// Patrón de uso:
//   1. whatsapp-ingest lo dispara por cada mensaje nuevo (async).
//   2. Cron whatsapp-followup-tick lo puede llamar en batch para
//      mensajes con analyzed_at NULL (catch-up).
//
// Output de Claude (JSON estricto):
//   {
//     "commitments": [
//       {
//         "subject": "contactar a Camila Pérez",
//         "target_subject": "Camila Pérez",
//         "committed_by_text": "Miguel",   // como aparece en el msg
//         "due_at_iso": "2026-05-27T17:00:00-03:00",
//         "confidence": 0.85,
//         "kind": "contact_lead" | "send_info" | "review_case" | "other"
//       }
//     ],
//     "resolutions": [
//       {
//         "target_subject": "Camila",
//         "outcome": "done" | "no_answer" | "rejected" | "rescheduled",
//         "note": "le mandó audio y no contestó",
//         "confidence": 0.9
//       }
//     ],
//     "mentions": [
//       { "name": "Camila Pérez", "kind": "lead_handle_or_name" }
//     ]
//   }
//
// Después:
//   - Cada commitment se inserta en whatsapp_commitments con status pending.
//   - Cada resolution intenta linkearse con un commitment open del mismo
//     target_subject y lo marca como done con el resolution_note.
//   - Mentions se guardan en messages.analysis para futuras búsquedas.

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const MODEL = "claude-haiku-4-5";  // Haiku es suficiente para extracción
const CLAUDE_TIMEOUT_MS = 60_000;

const SYSTEM_PROMPT = `Sos un extractor de "items operativos" para un grupo de WhatsApp de un equipo de ventas/agencia. Tu tarea es leer mensajes en español (argentino/colombiano/mexicano) y detectar TODO lo que el equipo necesita rastrear, esté o no formalizado en un CRM.

Detectás 5 TIPOS de items (cada uno usa el campo "kind"):

1. *kind="promise"* — compromiso clásico: alguien dice que va a hacer algo concreto.
   - "mañana le escribo a Camila" → promise
   - "el lunes paso por ahí" → promise
   - "voy a revisar el caso de Sofi" → promise
   - "lo llamo en un rato" → promise (due_at = +2h)

2. *kind="meeting"* — REUNIÓN AGENDADA con un externo (modelo, prospecto, cliente). Patrones típicos:
   - "*Para mañana 4PM*: https://www.instagram.com/arq.gloriatorres89/" → meeting con esa modelo
   - "reuniones confirmadas 2: @elpadreamen.core, @mariiaroz" → 2 meetings separados
   - "reunión con Camila martes 3pm" → meeting
   target_subject = handle/nombre del externo. due_at = fecha-hora de la reunión.

3. *kind="task"* — TAREA ASIGNADA explícitamente a alguien (interno del equipo):
   - "Juan compra 4 cuentas para Daniel" → task assignada a Juan
   - "Miguel se encarga de pasarnos más cuentas" → task a Miguel
   - "Juan pachas de comprar seguidores" → task a Juan Pachas
   - "Todos los días entregar una cuenta nueva a Juan pachas" → task recurrente (poné due_at = mañana 11am)
   committed_by_text = la persona ASIGNADA.

4. *kind="tracking"* — ITEM CON ESTADO EVOLUTIVO que el equipo necesita seguir. Cosas que NO están en el CRM pero importan:
   - "Daniel ahora tiene 7 cuentas" → tracking del stock de cuentas IG de Daniel
   - "12 cuentas nuevas en el sheet, 4 para cada uno" → tracking de cuentas distribuidas
   - "1 cuenta antigua de Daniel + 1 antigua de Yeison" → tracking de qué cuentas tiene cada uno
   - "se rechazó la cuenta @X" → tracking de estado
   subject = qué se trackea ("cuentas IG de Daniel"). target_subject = cantidad o detalle. NO due_at necesariamente.

5. *kind="followup"* — algo a verificar después, sin acción específica asignada:
   - "después chequeamos cómo le fue" → followup
   - "verifiquemos si respondió" → followup
   - "esperando respuesta de Camila" → followup

Y también detectás RESOLUCIONES (cuando alguien cierra un item):
   - "ya hablé con Camila, dijo que sí" → resolution outcome=done
   - "Sofi no me contestó" → outcome=no_answer
   - "dijo que mejor en otro momento" → outcome=rescheduled
   - "me rechazó" → outcome=rejected
   - "ya cargamos las 4 cuentas" → resolution sobre tracking previo

REGLAS:
- Solo extraé items con SUJETO + ACCIÓN claros. NO inventes.
- TIEMPOS por defecto (zona horaria local del grupo):
  · "mañana a las 4PM" / "el lunes 3PM" / "el martes 10AM" → due_at exacto en zona local
  · "mañana le escribo" / "mañana le hablo" / "mañana le mando" (con acción comunicativa específica) → due_at = mañana 11:00 local (inicio típico de turno)
  · "mañana lo uso" / "mañana lo trabajo" / "mañana sigo con" (acción difusa sin compromiso de hora) → kind="followup" con due_at = mañana 17:00 local (final del día, sin urgencia matutina)
  · "el lunes" sin hora → kind=followup con due_at lunes 17:00
  · "en un rato" → +2h desde el mensaje
  · "después" → kind=followup con due_at = +6h desde el mensaje
  · NUNCA poner due_at antes de las 11:00 ni después de las 19:00 local (no spamear fuera de horario laboral)
- IMPORTANTE: si el compromiso NO incluye una hora explícita y la acción no es comunicativa (escribir, llamar, mandar), preferí kind="followup" sobre "promise". Followup no dispara recordatorios urgentes — promise sí. No conviertas un "voy a usar la cuenta mañana" en promesa con hora puntual.
- confidence = 0.5-0.7 si ambiguo, 0.8-1.0 si claro.
- confidence = 0.5-0.7 si ambiguo, 0.8-1.0 si claro.
- "committed_by_text" = el ASIGNADO/COMPROMETIDO (no necesariamente el sender). Si dice "Juan compra cuentas", committed_by_text="Juan" aunque el sender sea Luis.
- target_subject corto: nombre, handle, entidad, cantidad. NO frases largas.
- NO son items:
  - "tengo ganas de", "habría que", "deberíamos" (sin asignación clara)
  - charlas off-topic, memes, saludos
  - reportes de jornada con números puros ("contactados 70") — esos los captura otro módulo
- Si el mensaje no contiene ningún item NI resolución, devolvé arrays vacíos. Lo más común — no inventes.

OUTPUT: JSON estricto con shape:
{
  "commitments": [
    { "kind": "promise|meeting|task|tracking|followup", "subject": "...", "target_subject": "...", "committed_by_text": "...", "due_at_iso": "..." | null, "confidence": 0.0-1.0 }
  ],
  "resolutions": [...],
  "mentions": [...]
}
Sin markdown, sin explicaciones.`;

interface ExtractRequest {
  message_id?: string;
  // Procesar batch de mensajes pending. Útil para el cron de catch-up.
  batch?: boolean;
  batch_size?: number;
}

interface CommitmentOut {
  subject: string;
  target_subject?: string;
  committed_by_text?: string;
  due_at_iso?: string | null;
  confidence?: number;
  kind?: string;
}

interface ResolutionOut {
  target_subject: string;
  outcome: "done" | "no_answer" | "rejected" | "rescheduled" | "other";
  note?: string;
  confidence?: number;
}

interface ExtractedAnalysis {
  commitments: CommitmentOut[];
  resolutions: ResolutionOut[];
  mentions: Array<{ name: string; kind?: string }>;
}

async function callClaude(
  contextLines: string[],
  targetMessage: { sender: string; body: string; sent_at: string; group_id?: string | null },
  tenantId: string,
): Promise<{ analysis: ExtractedAnalysis | null; usage: Record<string, number> }> {
  const userContent = [
    "Contexto (últimos mensajes del grupo, para entender la conversación):",
    contextLines.length ? contextLines.join("\n") : "(sin contexto previo)",
    "",
    "Mensaje a analizar:",
    `[${targetMessage.sent_at}] ${targetMessage.sender}: ${targetMessage.body}`,
  ].join("\n");

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CLAUDE_TIMEOUT_MS);

  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1500,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userContent }],
      }),
      signal: controller.signal,
    });

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`anthropic ${resp.status}: ${errText.slice(0, 200)}`);
    }

    const data = await resp.json() as {
      content: Array<{ type: string; text?: string }>;
      usage: Record<string, number>;
    };
    const text = data.content?.find((c) => c.type === "text")?.text ?? "";

    // Intentar parsear el JSON. Si Claude devolvió markdown, sacamos los
    // backticks. Si parseo falla, devolvemos null y el caller decide qué
    // hacer.
    let parsed: ExtractedAnalysis | null = null;
    try {
      const cleaned = text.trim().replace(/^```json\s*/i, "").replace(/```$/, "").trim();
      const obj = JSON.parse(cleaned);
      parsed = {
        commitments: Array.isArray(obj.commitments) ? obj.commitments : [],
        resolutions: Array.isArray(obj.resolutions) ? obj.resolutions : [],
        mentions: Array.isArray(obj.mentions) ? obj.mentions : [],
      };
    } catch (e) {
      console.warn("claude json parse failed:", (e as Error).message);
    }

    // Log usage best-effort.
    await logAnthropicUsage({
      operation: "whatsapp_extract_commitments",
      model: MODEL,
      usage: data.usage,
      tenantId,
      context: { sender: targetMessage.sender, group_id: targetMessage.group_id },
    });

    return { analysis: parsed, usage: data.usage };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function processMessage(messageId: string): Promise<{ ok: boolean; reason?: string }> {
  const sb = adminClient();

  const { data: msg, error: msgErr } = await sb
    .from("whatsapp_messages")
    .select(
      "id, tenant_id, group_id, body, transcribed_text, sender_display_name, sender_external_id, sent_at, analyzed_at, is_from_bot, msg_type",
    )
    .eq("id", messageId)
    .single();

  if (msgErr || !msg) return { ok: false, reason: "message_not_found" };
  if (msg.analyzed_at) return { ok: true, reason: "already_analyzed" };
  if (msg.is_from_bot) {
    await sb.from("whatsapp_messages").update({ analyzed_at: new Date().toISOString() }).eq("id", msg.id);
    return { ok: true, reason: "skip_bot_message" };
  }

  // Para audios e imágenes usamos transcribed_text (que contiene el
  // texto transcripto via Whisper o la descripción + OCR via Gemini
  // Vision). Si todavía no está, el ingestor disparó el procesamiento
  // async — volveremos a procesarlo cuando esa function termine y nos
  // invoque de vuelta con el mismo message_id.
  // Si transcribed_text empieza con '[' es un placeholder de error
  // (ej. '[no transcribible: ...]' o '[imagen no recuperable: ...]') —
  // lo skipeamos.
  let analyzeText: string | null = msg.body;
  if (msg.msg_type === "audio" || msg.msg_type === "image") {
    if (!msg.transcribed_text) {
      // Aún no procesado. Salimos sin marcar analyzed_at para reintentar.
      return { ok: true, reason: `${msg.msg_type}_pending_analysis` };
    }
    if (msg.transcribed_text.startsWith("[")) {
      // Placeholder de error: dejamos analyzed_at para no reintentar.
      await sb
        .from("whatsapp_messages")
        .update({ analyzed_at: new Date().toISOString() })
        .eq("id", msg.id);
      return { ok: true, reason: `${msg.msg_type}_unanalyzable` };
    }
    analyzeText = msg.transcribed_text;
  }

  if (!analyzeText || analyzeText.length < 10) {
    await sb.from("whatsapp_messages").update({ analyzed_at: new Date().toISOString() }).eq("id", msg.id);
    return { ok: true, reason: "skip_too_short" };
  }

  // Contexto: últimos 8 mensajes del grupo previos a este. Le da a
  // Claude visión de la conversación para detectar resoluciones
  // ("sí, ese mismo") y compromisos implícitos por respuesta.
  // Para audios del contexto usamos transcribed_text si está disponible
  // (sino body='[audio]' no aporta nada).
  const { data: ctx } = await sb
    .from("whatsapp_messages")
    .select("sender_display_name, body, transcribed_text, msg_type, sent_at")
    .eq("group_id", msg.group_id)
    .lt("sent_at", msg.sent_at)
    .order("sent_at", { ascending: false })
    .limit(8);

  const contextLines = (ctx ?? [])
    .reverse()
    .map((m) => {
      let txt: string | null;
      if ((m.msg_type === "audio" || m.msg_type === "image") && m.transcribed_text) {
        const prefix = m.msg_type === "audio" ? "[audio]" : "[imagen]";
        txt = `${prefix} ${m.transcribed_text}`;
      } else {
        txt = m.body;
      }
      return txt
        ? `[${m.sent_at}] ${m.sender_display_name ?? "anon"}: ${txt}`
        : null;
    })
    .filter((s): s is string => s !== null);

  const senderName = msg.sender_display_name ?? msg.sender_external_id.split("@")[0];
  // Prefijamos el marker según origen para que Claude sepa el tipo de
  // contenido y no se confunda con el tono más informal de un audio o
  // con la descripción visual de una imagen.
  const textForClaude = msg.msg_type === "audio"
    ? `[audio transcripto] ${analyzeText}`
    : msg.msg_type === "image"
    ? `[imagen analizada]\n${analyzeText}`
    : analyzeText!;
  const { analysis } = await callClaude(
    contextLines,
    { sender: senderName, body: textForClaude, sent_at: msg.sent_at, group_id: msg.group_id },
    msg.tenant_id,
  );

  if (!analysis) {
    // Mark analyzed=now igual para no reintentar para siempre. Loggeamos
    // el error.
    await sb
      .from("whatsapp_messages")
      .update({ analyzed_at: new Date().toISOString(), analysis: { error: "parse_failed" } })
      .eq("id", msg.id);
    await logEvent(sb, {
      tenantId: msg.tenant_id,
      groupId: msg.group_id,
      kind: "error",
      payload: { stage: "extract_commitments", message_id: msg.id, reason: "parse_failed" },
    });
    return { ok: false, reason: "claude_parse_failed" };
  }

  // Insert commitments. item_kind se setea como columna dedicada (no solo en
  // metadata) para que el agent pueda filtrar/agrupar eficiente.
  const VALID_KINDS = new Set(["promise", "meeting", "task", "tracking", "followup"]);
  const commitmentsToInsert = analysis.commitments
    .filter((c) => c.subject && (c.confidence ?? 1) >= 0.5)
    .map((c) => {
      const kind = c.kind && VALID_KINDS.has(c.kind) ? c.kind : "promise";
      return {
        tenant_id: msg.tenant_id,
        group_id: msg.group_id,
        source_message_id: msg.id,
        committed_by_text: c.committed_by_text ?? senderName,
        subject: c.subject,
        target_subject: c.target_subject ?? null,
        due_at: c.due_at_iso ?? null,
        confidence: c.confidence ?? 0.7,
        item_kind: kind,
        metadata: { kind },
      };
    });

  let insertedCommitments = 0;
  if (commitmentsToInsert.length > 0) {
    const { error: cErr } = await sb.from("whatsapp_commitments").insert(commitmentsToInsert);
    if (cErr) {
      console.warn("insert commitments error:", cErr.message);
    } else {
      insertedCommitments = commitmentsToInsert.length;
    }
  }

  // Try to match member_id for each commitment we just inserted.
  if (insertedCommitments > 0) {
    await tryMatchCommittedByMembers(sb, msg.group_id);
  }

  // Apply resolutions: for each, find open commitments with matching
  // target_subject in this group and mark them done.
  let resolvedCount = 0;
  for (const r of analysis.resolutions) {
    if (!r.target_subject) continue;
    if ((r.confidence ?? 1) < 0.5) continue;

    const status = r.outcome === "done"
      ? "done"
      : r.outcome === "rejected"
      ? "cancelled"
      : r.outcome === "rescheduled"
      ? "pending"  // reschedule → vuelve a pending, el bot pregunta otra vez
      : "done";    // no_answer → marcamos done para no insistir; el equipo lo retomará

    const { data: matched } = await sb
      .from("whatsapp_commitments")
      .select("id")
      .eq("group_id", msg.group_id)
      .in("status", ["pending", "overdue"])
      .ilike("target_subject", `%${r.target_subject}%`)
      .order("created_at", { ascending: false })
      .limit(3);

    if (matched && matched.length > 0) {
      const ids = matched.map((m) => m.id);
      await sb
        .from("whatsapp_commitments")
        .update({
          status,
          resolved_at: new Date().toISOString(),
          resolved_by_message_id: msg.id,
          resolution_note: r.note ?? null,
        })
        .in("id", ids);
      resolvedCount += ids.length;
    }
  }

  // Update analyzed_at + analysis summary.
  await sb
    .from("whatsapp_messages")
    .update({
      analyzed_at: new Date().toISOString(),
      analysis: {
        commitments_extracted: insertedCommitments,
        resolutions_applied: resolvedCount,
        mentions: analysis.mentions,
      },
    })
    .eq("id", msg.id);

  if (insertedCommitments > 0 || resolvedCount > 0) {
    await logEvent(sb, {
      tenantId: msg.tenant_id,
      groupId: msg.group_id,
      kind: "commitment_extracted",
      payload: {
        message_id: msg.id,
        commitments: insertedCommitments,
        resolutions: resolvedCount,
      },
    });
  }

  return { ok: true };
}

// Best-effort: para los commitments con committed_by_member_id NULL,
// intenta matchearlos contra whatsapp_members del grupo por display_name
// (ILIKE %text%). Si hay varios matches, no asignamos (queda manual).
async function tryMatchCommittedByMembers(
  sb: ReturnType<typeof adminClient>,
  groupId: string,
): Promise<void> {
  const { data: pending } = await sb
    .from("whatsapp_commitments")
    .select("id, committed_by_text")
    .eq("group_id", groupId)
    .is("committed_by_member_id", null)
    .not("committed_by_text", "is", null)
    .limit(50);

  if (!pending) return;

  const { data: members } = await sb
    .from("whatsapp_members")
    .select("id, display_name, external_id")
    .eq("group_id", groupId);

  if (!members) return;

  for (const c of pending) {
    const text = (c.committed_by_text as string).toLowerCase();
    const candidates = members.filter((m) =>
      m.display_name.toLowerCase().includes(text) ||
      text.includes(m.display_name.toLowerCase().split(" ")[0])
    );
    if (candidates.length === 1) {
      await sb
        .from("whatsapp_commitments")
        .update({ committed_by_member_id: candidates[0].id })
        .eq("id", c.id);
    }
  }
}

async function processBatch(batchSize: number): Promise<number> {
  const sb = adminClient();
  const { data: pending } = await sb
    .from("whatsapp_messages")
    .select("id")
    .is("analyzed_at", null)
    .eq("is_from_bot", false)
    .not("body", "is", null)
    .order("received_at", { ascending: true })
    .limit(batchSize);

  if (!pending || pending.length === 0) return 0;

  let processed = 0;
  for (const row of pending) {
    try {
      const r = await processMessage(row.id);
      if (r.ok) processed += 1;
    } catch (e) {
      console.warn("processMessage failed:", row.id, (e as Error).message);
    }
  }
  return processed;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: whatsappCors });
  }

  if (!authorizeCronOrJwt(req)) {
    return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), {
      status: 401,
      headers: { ...whatsappCors, "Content-Type": "application/json" },
    });
  }

  let body: ExtractRequest = {};
  try {
    body = (await req.json()) as ExtractRequest;
  } catch {
    // OK — soportamos invocación sin body para batch default.
  }

  try {
    if (body.message_id) {
      const r = await processMessage(body.message_id);
      return new Response(JSON.stringify({ ok: r.ok, reason: r.reason }), {
        status: 200,
        headers: { ...whatsappCors, "Content-Type": "application/json" },
      });
    }

    if (body.batch !== false) {
      const processed = await processBatch(body.batch_size ?? 20);
      return new Response(JSON.stringify({ ok: true, processed }), {
        status: 200,
        headers: { ...whatsappCors, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: false, error: "no_action" }), {
      status: 400,
      headers: { ...whatsappCors, "Content-Type": "application/json" },
    });
  } catch (e) {
    const errMsg = (e as Error).message;
    return new Response(JSON.stringify({ ok: false, error: errMsg }), {
      status: 500,
      headers: { ...whatsappCors, "Content-Type": "application/json" },
    });
  }
});
