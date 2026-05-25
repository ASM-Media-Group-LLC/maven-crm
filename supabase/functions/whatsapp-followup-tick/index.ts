import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { adminClient, authorizeCronOrJwt, logEvent, whatsappCors } from "../_shared/whatsapp.ts";

// whatsapp-followup-tick — corre cada hora (vía pg_cron) y:
//   1. Procesa mensajes pendientes (sin analyzed_at) en batch via
//      whatsapp-extract-commitments (catch-up por si el async del
//      ingest falló).
//   2. Marca compromisos vencidos como overdue.
//   3. Para cada compromiso overdue sin recordatorio reciente, crea un
//      whatsapp_reminder con el texto del seguimiento.
//   4. Dispara whatsapp-send para drenar la queue.
//
// Configuración:
//   - Solo follow-up en grupos con bot_enabled=true.
//   - No spamear: si followup_count >= 2 marcamos stale y no insistimos.
//   - Cooldown entre follow-ups del mismo commitment: 24h.

const PROJECT_URL = Deno.env.get("SUPABASE_URL")!;
const CRON_TOKEN = Deno.env.get("CRON_INTERNAL_TOKEN") ?? "";

// Build el texto del recordatorio. Mantenido simple y en español
// argentino. Después podemos hacer que el agente lo genere con tools.
function buildReminderText(args: {
  committedBy: string | null;
  subject: string;
  targetSubject: string | null;
  hoursOverdue: number;
  followupCount: number;
}): string {
  const who = args.committedBy ? `@${args.committedBy}` : "Hola equipo";
  const target = args.targetSubject ? ` con ${args.targetSubject}` : "";
  const action = args.subject;

  if (args.followupCount === 0) {
    if (args.hoursOverdue < 24) {
      return `${who} 👋 te pregunto rápido — ¿pudiste ${action}${target ? "" : ""}? Lo tenías para hoy.`;
    }
    const days = Math.floor(args.hoursOverdue / 24);
    return `${who} 👋 ¿qué pasó con "${action}"? Lo habías agendado hace ${days} día${days > 1 ? "s" : ""}.`;
  }

  // Segundo intento: más directo.
  return `${who} insisto: ¿se hizo "${action}"${target}? Si ya no aplica, decímelo y lo cierro.`;
}

async function markOverdue(): Promise<number> {
  const sb = adminClient();
  // pending con due_at < now → overdue.
  const { data, error } = await sb
    .from("whatsapp_commitments")
    .update({ status: "overdue" })
    .eq("status", "pending")
    .lt("due_at", new Date().toISOString())
    .select("id");

  if (error) {
    console.warn("markOverdue error:", error.message);
    return 0;
  }
  return data?.length ?? 0;
}

async function enqueueFollowups(): Promise<number> {
  const sb = adminClient();

  // Compromisos overdue sin follow-up reciente. Cooldown 24h.
  const cutoff = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

  const { data: rows, error } = await sb
    .from("whatsapp_commitments")
    .select(`
      id,
      tenant_id,
      group_id,
      subject,
      target_subject,
      due_at,
      followup_count,
      committed_by_text,
      committed_by_member_id,
      member:whatsapp_members!whatsapp_commitments_committed_by_member_id_fkey(display_name),
      group:whatsapp_groups!inner(bot_enabled, active)
    `)
    .eq("status", "overdue")
    .lt("followup_count", 2)
    .or(`last_followup_at.is.null,last_followup_at.lt.${cutoff}`)
    .limit(50);

  if (error) {
    console.warn("enqueueFollowups query error:", error.message);
    return 0;
  }

  if (!rows || rows.length === 0) return 0;

  // Filtrar solo grupos con bot habilitado.
  const eligible = rows.filter((r) => {
    const g = r.group as unknown as { bot_enabled: boolean; active: boolean } | null;
    return g?.bot_enabled === true && g?.active === true;
  });

  let enqueued = 0;
  for (const c of eligible) {
    const member = c.member as unknown as { display_name: string } | null;
    const committedBy = member?.display_name ?? c.committed_by_text ?? null;

    const hoursOverdue = c.due_at
      ? (Date.now() - new Date(c.due_at).getTime()) / 3600 / 1000
      : 0;

    const body = buildReminderText({
      committedBy,
      subject: c.subject,
      targetSubject: c.target_subject ?? null,
      hoursOverdue,
      followupCount: c.followup_count,
    });

    // Chequear que no haya ya un reminder pending para este commitment.
    const { data: existing } = await sb
      .from("whatsapp_reminders")
      .select("id")
      .eq("commitment_id", c.id)
      .eq("status", "pending")
      .limit(1);

    if (existing && existing.length > 0) continue;

    const { error: insErr } = await sb.from("whatsapp_reminders").insert({
      tenant_id: c.tenant_id,
      group_id: c.group_id,
      kind: "commitment_followup",
      commitment_id: c.id,
      trigger_at: new Date().toISOString(),
      body,
    });
    if (!insErr) enqueued += 1;
  }

  return enqueued;
}

async function triggerTranscriber(): Promise<number> {
  if (!CRON_TOKEN) return 0;
  try {
    const resp = await fetch(`${PROJECT_URL}/functions/v1/whatsapp-transcribe-audio`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Cron-Token": CRON_TOKEN,
      },
      // Cap más chico que el extractor — Scribe es 10-30s por audio,
      // si tenemos 10 audios pendientes ya estamos en 3-5 min de tick.
      body: JSON.stringify({ batch: true, batch_size: 5 }),
    });
    if (!resp.ok) return 0;
    const data = await resp.json() as { processed?: number };
    return data.processed ?? 0;
  } catch (e) {
    console.warn("triggerTranscriber failed:", (e as Error).message);
    return 0;
  }
}

async function triggerImageAnalyzer(): Promise<number> {
  if (!CRON_TOKEN) return 0;
  try {
    const resp = await fetch(`${PROJECT_URL}/functions/v1/whatsapp-analyze-image`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Cron-Token": CRON_TOKEN,
      },
      // Gemini Flash es rápido (~3-5s por imagen), podemos procesar más
      // por tick que el transcriber.
      body: JSON.stringify({ batch: true, batch_size: 10 }),
    });
    if (!resp.ok) return 0;
    const data = await resp.json() as { processed?: number };
    return data.processed ?? 0;
  } catch (e) {
    console.warn("triggerImageAnalyzer failed:", (e as Error).message);
    return 0;
  }
}

async function triggerExtractor(): Promise<number> {
  if (!CRON_TOKEN) return 0;
  try {
    const resp = await fetch(`${PROJECT_URL}/functions/v1/whatsapp-extract-commitments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Cron-Token": CRON_TOKEN,
      },
      body: JSON.stringify({ batch: true, batch_size: 30 }),
    });
    if (!resp.ok) return 0;
    const data = await resp.json() as { processed?: number };
    return data.processed ?? 0;
  } catch (e) {
    console.warn("triggerExtractor failed:", (e as Error).message);
    return 0;
  }
}

async function triggerSender(): Promise<{ sent: number; failed: number }> {
  if (!CRON_TOKEN) return { sent: 0, failed: 0 };
  try {
    const resp = await fetch(`${PROJECT_URL}/functions/v1/whatsapp-send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Cron-Token": CRON_TOKEN,
      },
      body: JSON.stringify({ drain: true, drain_limit: 20 }),
    });
    if (!resp.ok) return { sent: 0, failed: 0 };
    const data = await resp.json() as { sent?: number; failed?: number };
    return { sent: data.sent ?? 0, failed: data.failed ?? 0 };
  } catch (e) {
    console.warn("triggerSender failed:", (e as Error).message);
    return { sent: 0, failed: 0 };
  }
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

  try {
    // Orden importa: primero procesamos media pendiente (audio +
    // imagen) que el ingest no logró disparar, después extraemos
    // compromisos (usa transcribed_text si ya está), después marcamos
    // overdues y encolamos.
    const transcribed = await triggerTranscriber();
    const analyzedImages = await triggerImageAnalyzer();
    const extracted = await triggerExtractor();
    const overdue = await markOverdue();
    const enqueued = await enqueueFollowups();
    const sentResult = await triggerSender();

    const sb = adminClient();
    await logEvent(sb, {
      tenantId: "00000000-0000-0000-0000-000000000000",
      kind: "followup_tick",
      payload: {
        transcribed,
        analyzed_images: analyzedImages,
        extracted,
        marked_overdue: overdue,
        enqueued,
        ...sentResult,
      },
    });

    return new Response(
      JSON.stringify({
        ok: true,
        transcribed,
        analyzed_images: analyzedImages,
        extracted,
        marked_overdue: overdue,
        enqueued,
        sent: sentResult.sent,
        failed: sentResult.failed,
      }),
      {
        status: 200,
        headers: { ...whatsappCors, "Content-Type": "application/json" },
      },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: (e as Error).message }),
      { status: 500, headers: { ...whatsappCors, "Content-Type": "application/json" } },
    );
  }
});
