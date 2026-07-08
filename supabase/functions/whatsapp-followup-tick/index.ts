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

// Build el texto del recordatorio AGRUPADO por persona+grupo.
// En vez de mandar 1 mensaje por commitment (que satura el grupo con
// 10+ mensajes seguidos cuando hay backlog), juntamos todos los
// pendientes de la persona en UN mensaje consolidado.
//
// Ejemplo de output con 1 pendiente: típico "¿pudiste X?"
// Con 3 pendientes: "@Miguel tenés 3 cosas pendientes: · X · Y · Z"
function buildGroupedReminderText(args: {
  committedBy: string | null;
  commitments: Array<{ subject: string; target_subject: string | null; hoursOverdue: number; followupCount: number }>;
}): string {
  const who = args.committedBy ? `@${args.committedBy}` : "Hola equipo";
  const n = args.commitments.length;

  if (n === 1) {
    const c = args.commitments[0];
    if (c.followupCount === 0) {
      if (c.hoursOverdue < 24) {
        return `${who} 👋 ¿pudiste ${c.subject}? Lo tenías para hoy.`;
      }
      const days = Math.floor(c.hoursOverdue / 24);
      return `${who} 👋 ¿qué pasó con "${c.subject}"? Lo habías agendado hace ${days} día${days > 1 ? "s" : ""}.`;
    }
    // Segundo intento
    return `${who} insisto: ¿se hizo "${c.subject}"? Si ya no aplica, decímelo y lo cierro.`;
  }

  // Multi-pendiente: un solo mensaje resumido.
  const lines = [`${who} 👋 tenés ${n} pendientes:`];
  for (const c of args.commitments) {
    let when = "";
    if (c.hoursOverdue < 24) {
      when = " (hoy)";
    } else {
      const days = Math.floor(c.hoursOverdue / 24);
      when = ` (hace ${days} día${days > 1 ? "s" : ""})`;
    }
    lines.push(`· ${c.subject}${when}`);
  }
  lines.push("");
  lines.push("¿Cómo va eso? Si alguno ya no aplica, decímelo y lo cierro.");
  return lines.join("\n");
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
      group:whatsapp_groups!inner(bot_enabled, active, bot_mode, wa_bot_id)
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

  // Filtrar solo grupos con bot habilitado y de department='sales' (el follow-up de
  // closers no aplica a otros departamentos como Managers).
  const { data: nonSalesBots } = await sb.from("wa_bots").select("id").neq("department", "sales");
  const excludeBotIds = new Set((nonSalesBots ?? []).map((b: any) => b.id));
  const eligible = rows.filter((r) => {
    const g = r.group as unknown as { bot_enabled: boolean; active: boolean; bot_mode: string; wa_bot_id: string | null } | null;
    return g?.bot_enabled === true && g?.active === true && g?.bot_mode !== "off" &&
      !(g?.wa_bot_id && excludeBotIds.has(g.wa_bot_id));
  });

  if (eligible.length === 0) return 0;

  // ── Agrupar por (group_id, committed_by_member_id) ──────────────────────
  // Para evitar spam: en vez de N reminders separados (uno por commitment),
  // generamos UN reminder por persona-grupo con todos sus pendientes
  // listados. Máximo 5 items por reminder para no hacer texto enorme.
  const MAX_ITEMS_PER_REMINDER = 5;
  type CommitmentSlim = {
    id: string;
    tenant_id: string;
    group_id: string;
    subject: string;
    target_subject: string | null;
    hoursOverdue: number;
    followupCount: number;
    committedBy: string | null;
    committedByMemberId: string | null;
  };

  // Key: `${group_id}::${committed_by_member_id ?? committed_by_text}`
  const groups = new Map<string, CommitmentSlim[]>();

  for (const c of eligible) {
    const member = c.member as unknown as { display_name: string } | null;
    const committedBy = member?.display_name ?? c.committed_by_text ?? null;
    const personKey = c.committed_by_member_id ?? `text:${c.committed_by_text ?? "unknown"}`;
    const key = `${c.group_id}::${personKey}`;

    const hoursOverdue = c.due_at
      ? (Date.now() - new Date(c.due_at).getTime()) / 3600 / 1000
      : 0;

    const arr = groups.get(key) ?? [];
    arr.push({
      id: c.id,
      tenant_id: c.tenant_id,
      group_id: c.group_id,
      subject: c.subject,
      target_subject: c.target_subject ?? null,
      hoursOverdue,
      followupCount: c.followup_count,
      committedBy,
      committedByMemberId: c.committed_by_member_id,
    });
    groups.set(key, arr);
  }

  let enqueued = 0;
  for (const [_key, commitments] of groups) {
    const first = commitments[0];
    // Truncar a max items para que el mensaje no sea kilométrico
    const items = commitments.slice(0, MAX_ITEMS_PER_REMINDER);
    const more = commitments.length - items.length;

    // Chequear que no haya YA un reminder pending para esta persona+grupo
    // (en kind=commitment_followup_grouped). Esto evita re-enviar antes de
    // que se drene el anterior.
    const { data: existing } = await sb
      .from("whatsapp_reminders")
      .select("id")
      .eq("group_id", first.group_id)
      .eq("kind", "commitment_followup")
      .eq("status", "pending")
      .contains("metadata", { grouped_by_member: first.committedByMemberId ?? "text" })
      .limit(1);

    if (existing && existing.length > 0) continue;

    let body = buildGroupedReminderText({
      committedBy: first.committedBy,
      commitments: items.map((c) => ({
        subject: c.subject,
        target_subject: c.target_subject,
        hoursOverdue: c.hoursOverdue,
        followupCount: c.followupCount,
      })),
    });

    if (more > 0) {
      body += `\n\n(+ ${more} más pendientes, te paso esos en otro tick)`;
    }

    const { error: insErr } = await sb.from("whatsapp_reminders").insert({
      tenant_id: first.tenant_id,
      group_id: first.group_id,
      kind: "commitment_followup",
      // commitment_id queda null porque cubre varios. Auditamos via metadata.
      trigger_at: new Date().toISOString(),
      body,
      metadata: {
        grouped_by_member: first.committedByMemberId ?? "text",
        commitment_ids: items.map((c) => c.id),
        total_pending: commitments.length,
      },
    });
    if (!insErr) {
      enqueued += 1;
      // Marcar followup_count++ en los commitments incluidos
      const ids = items.map((c) => c.id);
      await sb.rpc("increment_followup_count", { p_ids: ids }).catch(() => {
        // Fallback si la RPC no existe: update simple
        return sb
          .from("whatsapp_commitments")
          .update({ last_followup_at: new Date().toISOString() })
          .in("id", ids);
      });
    }
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
