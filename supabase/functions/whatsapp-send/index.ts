import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { adminClient, authorizeCronOrJwt, logEvent, redactPhones, whatsappCors } from "../_shared/whatsapp.ts";

// whatsapp-send — manda mensajes a un grupo via el provider configurado.
//
// Acepta dos modos:
//   1. Drain queue: POST sin body → procesa whatsapp_reminders pending
//      con trigger_at <= now() y los manda. Esto lo llama el cron cada
//      pocos minutos.
//   2. Send ad-hoc: POST con { group_id, body, [commitment_id] } → manda
//      un mensaje directo (lo usa whatsapp-agent y futuras integraciones).
//
// Provider: por ahora soportamos Evolution API (POST a su /sendText/...).
// El URL base y la instance se leen del config del grupo (provider) y
// del env (WHATSAPP_EVOLUTION_URL, WHATSAPP_EVOLUTION_API_KEY).
//
// Defensa: si bot_enabled=false en el grupo, marcamos el reminder como
// cancelled con reason 'bot_disabled' y NO mandamos nada. El admin lo
// debe habilitar explícito por grupo.

const EVOLUTION_URL = Deno.env.get("WHATSAPP_EVOLUTION_URL") ?? "";
const EVOLUTION_API_KEY = Deno.env.get("WHATSAPP_EVOLUTION_API_KEY") ?? "";
const EVOLUTION_INSTANCE = Deno.env.get("WHATSAPP_EVOLUTION_INSTANCE") ?? "maven";
// EVOLUTION_API_VERSION controla el shape del payload de /message/sendText:
//   v1 (default): { number, options:{delay,presence}, textMessage:{text} }  ← Evolution v1.8.x
//   v2:           { number, text }                                          ← Evolution v2.4.x
// Cambiar cuando se haga el upgrade del contenedor a v2.
const EVOLUTION_API_VERSION = Deno.env.get("WHATSAPP_EVOLUTION_API_VERSION") ?? "v1";

interface SendRequest {
  // Modo ad-hoc.
  group_id?: string;
  body?: string;
  commitment_id?: string;
  // Menciones reales: array de JIDs/LIDs completos
  // (ej. ["143250161664036@lid", "123@s.whatsapp.net"]) que se pasan al
  // gateway para que WhatsApp renderice esos @ como pings reales.
  // El texto en `body` debe contener "@<lid_o_phone_sin_sufijo>" en
  // los lugares donde quieras la mención.
  mentions?: string[];
  // Modo queue (default true si no hay group_id+body).
  drain?: boolean;
  drain_limit?: number;
}

interface ProviderSendResult {
  ok: boolean;
  externalId?: string;
  error?: string;
}

async function sendViaEvolution(
  groupExternalId: string,
  body: string,
  mentions?: string[],
): Promise<ProviderSendResult> {
  if (!EVOLUTION_URL || !EVOLUTION_API_KEY) {
    return { ok: false, error: "evolution_not_configured" };
  }
  const url = `${EVOLUTION_URL.replace(/\/$/, "")}/message/sendText/${EVOLUTION_INSTANCE}`;
  // Payload depende de la versión de Evolution. Ver constante EVOLUTION_API_VERSION.
  // mentions es opcional — solo lo agrega nuestro Baileys gateway, no
  // las Evolution oficiales. Si no se pasa, el endpoint manda texto plano.
  const basePayload = EVOLUTION_API_VERSION === "v2"
    ? { number: groupExternalId, text: body }
    : {
        number: groupExternalId,
        options: { delay: 0, presence: "composing" },
        textMessage: { text: body },
      };
  const payload = mentions && mentions.length > 0
    ? { ...basePayload, mentions }
    : basePayload;
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": EVOLUTION_API_KEY,
      },
      body: JSON.stringify(payload),
    });
    if (!resp.ok) {
      const txt = await resp.text();
      return { ok: false, error: `evolution ${resp.status}: ${txt.slice(0, 200)}` };
    }
    const data = await resp.json() as { key?: { id?: string } };
    return { ok: true, externalId: data?.key?.id };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

async function sendOne(args: {
  groupId: string;
  body: string;
  tenantId: string;
  reminderId?: string;
  mentions?: string[];
}): Promise<ProviderSendResult> {
  const sb = adminClient();

  const { data: group, error: gErr } = await sb
    .from("whatsapp_groups")
    .select("id, tenant_id, external_id, provider, bot_enabled, active, is_direct")
    .eq("id", args.groupId)
    .single();

  if (gErr || !group) {
    return { ok: false, error: "group_not_found" };
  }
  if (!group.active) return { ok: false, error: "group_inactive" };
  if (!group.bot_enabled) return { ok: false, error: "bot_disabled" };

  // ── GUARDA DE PII: nunca publicar teléfonos en un GRUPO ─────────────────────
  // Maven oculta los teléfonos por permiso (can_see_contact_phone, default-deny), pero el
  // bot corre con service_role y escribe texto libre. El 30/07, al reconocerle a Daniel su
  // primer número del día, publicó el teléfono de la lead en AI WARMING — dos veces, a la
  // vista de todo el grupo. Va acá, en el ÚNICO punto por el que salen TODOS los mensajes
  // (respuestas del agente, recordatorios, digests, reportes), en vez de confiar en una
  // regla del prompt que el modelo puede ignorar.
  // Los DMs quedan afuera: son 1-a-1 con el dueño de la data.
  const bodyFinal = group.is_direct === true ? args.body : redactPhones(args.body);

  let result: ProviderSendResult;
  if (group.provider === "evolution") {
    result = await sendViaEvolution(group.external_id, bodyFinal, args.mentions);
  } else if (group.provider === "manual") {
    // Modo manual: no mandamos al provider, solo grabamos la salida en
    // whatsapp_messages para testing y para ver lo que el bot habría
    // dicho.
    result = { ok: true, externalId: `manual-${crypto.randomUUID()}` };
  } else {
    result = { ok: false, error: `unsupported_provider:${group.provider}` };
  }

  // Registrar el mensaje saliente en whatsapp_messages si se mandó OK.
  if (result.ok && result.externalId) {
    const { data: inserted } = await sb
      .from("whatsapp_messages")
      .insert({
        tenant_id: group.tenant_id,
        group_id: group.id,
        external_id: result.externalId,
        sender_external_id: "bot@maven",
        sender_display_name: "Maven Asistente",
        body: bodyFinal,
        msg_type: "text",
        is_from_bot: true,
        sent_at: new Date().toISOString(),
        analyzed_at: new Date().toISOString(),
        analysis: { source: "bot", reminder_id: args.reminderId ?? null },
      })
      .select("id")
      .single();

    await logEvent(sb, {
      tenantId: group.tenant_id,
      groupId: group.id,
      kind: "message_out",
      payload: {
        body_preview: bodyFinal.slice(0, 120),
        reminder_id: args.reminderId,
        provider_msg_id: result.externalId,
        message_id: inserted?.id,
      },
    });

    return { ok: true, externalId: inserted?.id };
  }

  await logEvent(sb, {
    tenantId: group.tenant_id,
    groupId: group.id,
    kind: "error",
    payload: { stage: "send", error: result.error, reminder_id: args.reminderId },
  });

  return result;
}

async function drainQueue(limit: number): Promise<{ sent: number; failed: number }> {
  const sb = adminClient();

  const { data: reminders, error } = await sb
    .rpc("whatsapp_pending_reminders", { p_limit: limit });

  if (error) {
    console.warn("drainQueue rpc error:", error.message);
    return { sent: 0, failed: 0 };
  }
  if (!reminders || reminders.length === 0) return { sent: 0, failed: 0 };

  let sent = 0;
  let failed = 0;

  for (const r of reminders as Array<{
    id: string;
    tenant_id: string;
    group_id: string;
    body: string | null;
    attempt_count: number;
    commitment_id: string | null;
  }>) {
    if (!r.body) {
      // body NULL — tendríamos que generar contenido dinámico, pero
      // por ahora marcamos como failed para que un admin lo revise.
      await sb
        .from("whatsapp_reminders")
        .update({ status: "failed", error: "body_null_not_supported_yet" })
        .eq("id", r.id);
      failed += 1;
      continue;
    }

    // Los recordatorios se guardan como TEXTO PLANO, y el agente suele escribir el
    // destinatario como "@<lid>" (copiado de la tabla de miembros). Como el drain
    // mandaba el body tal cual, SIN el array `mentions`, WhatsApp no podía resolver
    // el LID y el equipo veía "@249125350154247, recordatorio: ..." — números crudos.
    // (Caso real 29/07 con María.) Acá resolvemos cada @<dígitos> a su NOMBRE y de paso
    // pasamos los LIDs en `mentions` para que además le llegue el ping.
    let outBody = r.body;
    let mentions: string[] | undefined;
    const lids = [...String(r.body).matchAll(/@(\d{6,})/g)].map((m) => m[1]);
    if (lids.length > 0) {
      const { data: mem } = await sb
        .from("whatsapp_members")
        .select("external_id, display_name, profiles:user_id(full_name)")
        .eq("group_id", r.group_id)
        .in("external_id", lids.map((d) => `${d}@lid`));
      const found: string[] = [];
      for (const d of lids) {
        const row = (mem ?? []).find((x: any) => x.external_id === `${d}@lid`) as any;
        if (!row) continue;
        const nombre = String(row.profiles?.full_name ?? row.display_name ?? "").split(" ")[0];
        if (nombre) outBody = outBody.split(`@${d}`).join(nombre);
        found.push(`${d}@lid`);
      }
      if (found.length > 0) mentions = found;
    }

    const result = await sendOne({
      groupId: r.group_id,
      body: outBody,
      tenantId: r.tenant_id,
      reminderId: r.id,
      mentions,
    });

    if (result.ok) {
      await sb
        .from("whatsapp_reminders")
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
          sent_message_id: result.externalId ?? null,
        })
        .eq("id", r.id);

      // Si está atado a un commitment, bumpeamos followup_count y
      // movemos status si corresponde (pending→overdue, overdue→stale).
      // La RPC hace todo atómicamente, evita races con el extractor.
      if (r.commitment_id) {
        const { error: bumpErr } = await sb.rpc(
          "whatsapp_bump_commitment_followup",
          { p_id: r.commitment_id },
        );
        if (bumpErr) console.warn("bump followup err:", bumpErr.message);
      }

      sent += 1;
    } else {
      const nextAttempt = (r.attempt_count ?? 0) + 1;
      const newStatus = nextAttempt >= 3 ? "failed" : "pending";
      await sb
        .from("whatsapp_reminders")
        .update({
          status: newStatus,
          attempt_count: nextAttempt,
          error: result.error?.slice(0, 500),
        })
        .eq("id", r.id);
      failed += 1;
    }
  }

  return { sent, failed };
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

  let body: SendRequest = {};
  try {
    body = (await req.json()) as SendRequest;
  } catch {
    // OK — POST sin body = drain.
  }

  try {
    if (body.group_id && body.body) {
      // Resolver tenant del grupo.
      const sb = adminClient();
      const { data: g } = await sb
        .from("whatsapp_groups")
        .select("tenant_id")
        .eq("id", body.group_id)
        .single();
      if (!g) {
        return new Response(JSON.stringify({ ok: false, error: "group_not_found" }), {
          status: 404,
          headers: { ...whatsappCors, "Content-Type": "application/json" },
        });
      }
      const result = await sendOne({
        groupId: body.group_id,
        body: body.body,
        tenantId: g.tenant_id,
        mentions: body.mentions,
      });
      return new Response(JSON.stringify(result), {
        status: result.ok ? 200 : 500,
        headers: { ...whatsappCors, "Content-Type": "application/json" },
      });
    }

    if (body.drain !== false) {
      const result = await drainQueue(body.drain_limit ?? 20);
      return new Response(JSON.stringify({ ok: true, ...result }), {
        status: 200,
        headers: { ...whatsappCors, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: false, error: "no_action" }), {
      status: 400,
      headers: { ...whatsappCors, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: (e as Error).message }),
      { status: 500, headers: { ...whatsappCors, "Content-Type": "application/json" } },
    );
  }
});
