import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  type IncomingMessage,
  parseEvolutionApiMessage,
  parseGenericMessage,
  adminClient,
  logEvent,
  whatsappCors,
} from "../_shared/whatsapp.ts";

// whatsapp-ingest — webhook que reciben los providers de WhatsApp.
//
// Soporta dos formatos:
//   1. Evolution API (default) — header X-Evolution-Token o query
//      ?provider=evolution
//   2. Generic — body con shape IncomingMessage directo, header
//      X-Cron-Token o ?provider=generic. Útil para testing manual y
//      para cualquier provider futuro que se conecte via un proxy
//      interno.
//
// Auth: validamos un shared secret por provider (no JWT — los webhooks
// vienen del provider sin sesión de usuario):
//   - Evolution: env WHATSAPP_EVOLUTION_SECRET ↔ header X-Evolution-Token
//   - Generic:   env CRON_INTERNAL_TOKEN ↔ header X-Cron-Token
//
// Idempotencia: upsert por (group_id, external_id). Si el provider
// reintenta el webhook por timeout, no duplicamos la row.
//
// Después de insertar, disparamos whatsapp-extract-commitments async
// via fetch (no await — no queremos bloquear la respuesta al provider).
// El extractor también está protegido contra re-runs.

interface IngestResponse {
  ok: boolean;
  message_id?: string;
  skipped?: string;
  error?: string;
}

const PROJECT_URL = Deno.env.get("SUPABASE_URL")!;

async function resolveProvider(req: Request): Promise<"evolution" | "generic" | null> {
  const url = new URL(req.url);
  const qp = url.searchParams.get("provider");
  if (qp === "evolution" || qp === "generic") return qp;

  // Inferir por header presente.
  if (req.headers.get("X-Evolution-Token")) return "evolution";
  if (req.headers.get("X-Cron-Token")) return "generic";
  // Default = evolution (es el más probable en prod).
  return "evolution";
}

function authorize(req: Request, provider: "evolution" | "generic"): boolean {
  if (provider === "evolution") {
    const expected = Deno.env.get("WHATSAPP_EVOLUTION_SECRET") ?? "";
    if (!expected) return false;
    // Evolution global webhook no setea headers custom — pasa el secreto
    // como query param `?token=...`. Aceptamos ambas formas (header o
    // query) para que también funcione el modo per-instance.
    const headerToken = req.headers.get("X-Evolution-Token") ?? "";
    const urlToken = new URL(req.url).searchParams.get("token") ?? "";
    return expected === headerToken || expected === urlToken;
  }
  // generic
  const expected = Deno.env.get("CRON_INTERNAL_TOKEN") ?? "";
  const got = req.headers.get("X-Cron-Token") ?? "";
  return Boolean(expected) && expected === got;
}

async function findOrCreateGroup(
  sb: SupabaseClient,
  msg: IncomingMessage,
): Promise<{ id: string; tenant_id: string; bot_enabled: boolean } | null> {
  // Buscar por external_id. Si no existe, NO lo creamos automáticamente
  // — esto evita que cualquier grupo random que agreguen al bot empiece
  // a quemar tokens de Claude sin que un admin lo apruebe. Sí lo
  // logueamos para que el admin lo vea en el panel y lo active.
  const { data, error } = await sb
    .from("whatsapp_groups")
    .select("id, tenant_id, bot_enabled, active")
    .eq("external_id", msg.groupExternalId)
    .maybeSingle();

  if (error) {
    console.warn("findGroup error:", error.message);
    return null;
  }
  if (!data || !data.active) return null;
  return data;
}

// Resuelve el user_id de Maven a partir del JID de WhatsApp via el RPC
// public.whatsapp_resolve_user_by_phone (last-10-digits matching contra
// profiles.phone_e164). Si no hay match devuelve null y el caller deja
// user_id NULL — un admin podrá linkearlo a mano desde el panel.
async function resolveMavenUserByPhone(
  sb: SupabaseClient,
  jid: string,
): Promise<string | null> {
  try {
    const { data, error } = await sb.rpc("whatsapp_resolve_user_by_phone", {
      p_jid_or_phone: jid,
    });
    if (error) {
      console.warn("resolveMavenUserByPhone rpc error:", error.message);
      return null;
    }
    return (data as string | null) ?? null;
  } catch (e) {
    console.warn("resolveMavenUserByPhone threw:", (e as Error).message);
    return null;
  }
}

async function upsertMember(
  sb: SupabaseClient,
  group: { id: string; tenant_id: string },
  msg: IncomingMessage,
): Promise<string | null> {
  if (!msg.senderExternalId) return null;

  // Upsert: si existe, actualizamos display_name + last_seen_at. Si no,
  // creamos. La PK lógica es (group_id, external_id).
  const { data: existing } = await sb
    .from("whatsapp_members")
    .select("id, display_name, user_id")
    .eq("group_id", group.id)
    .eq("external_id", msg.senderExternalId)
    .maybeSingle();

  if (existing) {
    const patch: Record<string, unknown> = { last_seen_at: new Date().toISOString() };
    if (msg.senderDisplayName && msg.senderDisplayName !== existing.display_name) {
      patch.display_name = msg.senderDisplayName;
    }
    // Si todavía no estaba linkeado a un user de Maven, intentamos
    // resolverlo de nuevo — el user puede haber cargado su número
    // recién en Settings y querremos que el link aparezca solo, sin
    // intervención del admin. Idempotente: si el resolve sigue siendo
    // NULL no hacemos nada.
    if (!existing.user_id) {
      const resolved = await resolveMavenUserByPhone(sb, msg.senderExternalId);
      if (resolved) patch.user_id = resolved;
    }
    await sb.from("whatsapp_members").update(patch).eq("id", existing.id);
    return existing.id;
  }

  // Member nuevo: intentamos resolver al user de Maven antes de insertar
  // para que el row arranque ya linkeado (cuando sea posible).
  const resolvedUserId = await resolveMavenUserByPhone(sb, msg.senderExternalId);

  const { data: inserted, error } = await sb
    .from("whatsapp_members")
    .insert({
      tenant_id: group.tenant_id,
      group_id: group.id,
      external_id: msg.senderExternalId,
      display_name: msg.senderDisplayName ?? msg.senderExternalId.split("@")[0],
      last_seen_at: new Date().toISOString(),
      user_id: resolvedUserId,
    })
    .select("id")
    .single();

  if (error) {
    console.warn("insertMember error:", error.message);
    return null;
  }
  return inserted.id;
}

async function insertMessage(
  sb: SupabaseClient,
  group: { id: string; tenant_id: string },
  memberId: string | null,
  msg: IncomingMessage,
): Promise<{ id: string; inserted: boolean }> {
  // Upsert manual: chequeamos primero por (group_id, external_id).
  const { data: existing } = await sb
    .from("whatsapp_messages")
    .select("id")
    .eq("group_id", group.id)
    .eq("external_id", msg.externalId)
    .maybeSingle();

  if (existing) {
    return { id: existing.id, inserted: false };
  }

  const { data, error } = await sb
    .from("whatsapp_messages")
    .insert({
      tenant_id: group.tenant_id,
      group_id: group.id,
      external_id: msg.externalId,
      sender_external_id: msg.senderExternalId,
      sender_display_name: msg.senderDisplayName ?? null,
      member_id: memberId,
      body: msg.body,
      msg_type: msg.msgType,
      media_url: msg.mediaUrl ?? null,
      reply_to_external_id: msg.replyToExternalId ?? null,
      is_from_bot: msg.isFromBot ?? false,
      sent_at: msg.sentAt,
      raw: msg.raw,
    })
    .select("id")
    .single();

  if (error) throw new Error("insertMessage: " + error.message);

  // Actualizar last_message_at del grupo. Best-effort.
  await sb
    .from("whatsapp_groups")
    .update({ last_message_at: msg.sentAt })
    .eq("id", group.id);

  return { id: data.id, inserted: true };
}

// Dispara whatsapp-extract-commitments sin await. La function va a
// procesar el mensaje y guardar compromisos en background.
function fireExtractCommitments(messageId: string): void {
  const url = `${PROJECT_URL}/functions/v1/whatsapp-extract-commitments`;
  const token = Deno.env.get("CRON_INTERNAL_TOKEN") ?? "";
  fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Cron-Token": token,
    },
    body: JSON.stringify({ message_id: messageId }),
  }).catch((e) => {
    console.warn("fireExtractCommitments failed:", (e as Error).message);
  });
}

// Dispara whatsapp-transcribe-audio (fire-and-forget) para audios.
// IMPORTANTE: los media_url de Evolution caducan en ~5 min, por eso
// disparamos sin demora.
function fireTranscribeAudio(messageId: string): void {
  const url = `${PROJECT_URL}/functions/v1/whatsapp-transcribe-audio`;
  const token = Deno.env.get("CRON_INTERNAL_TOKEN") ?? "";
  fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Cron-Token": token,
    },
    body: JSON.stringify({ message_id: messageId }),
  }).catch((e) => {
    console.warn("fireTranscribeAudio failed:", (e as Error).message);
  });
}

// Dispara whatsapp-analyze-image (fire-and-forget) para imágenes con
// Gemini 2.5 vision. Mismo patrón que audios — media_url caduca rápido.
function fireAnalyzeImage(messageId: string): void {
  const url = `${PROJECT_URL}/functions/v1/whatsapp-analyze-image`;
  const token = Deno.env.get("CRON_INTERNAL_TOKEN") ?? "";
  fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Cron-Token": token,
    },
    body: JSON.stringify({ message_id: messageId }),
  }).catch((e) => {
    console.warn("fireAnalyzeImage failed:", (e as Error).message);
  });
}

// Triggers whatsapp-agent (fire-and-forget) cuando un mensaje menciona
// al bot. La heurística es laxa — cubrimos @maven, @bot, "maven bot" y
// "@maven_bot". El agent function valida bot_enabled antes de responder.
function shouldInvokeAgent(body: string | null): boolean {
  if (!body) return false;
  const lower = body.toLowerCase();
  return (
    lower.includes("@maven") ||
    lower.includes("@bot") ||
    lower.includes("maven bot") ||
    lower.includes("maven asistente") ||
    lower.includes("@maven_bot")
  );
}

function fireAgent(messageId: string, groupId: string): void {
  const url = `${PROJECT_URL}/functions/v1/whatsapp-agent`;
  const token = Deno.env.get("CRON_INTERNAL_TOKEN") ?? "";
  fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Cron-Token": token,
    },
    body: JSON.stringify({ message_id: messageId, group_id: groupId, invoked_by: "mention" }),
  }).catch((e) => {
    console.warn("fireAgent failed:", (e as Error).message);
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: whatsappCors });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "method_not_allowed" }), {
      status: 405,
      headers: { ...whatsappCors, "Content-Type": "application/json" },
    });
  }

  const provider = await resolveProvider(req);
  if (!provider) {
    return new Response(JSON.stringify({ ok: false, error: "unknown_provider" }), {
      status: 400,
      headers: { ...whatsappCors, "Content-Type": "application/json" },
    });
  }

  if (!authorize(req, provider)) {
    return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), {
      status: 401,
      headers: { ...whatsappCors, "Content-Type": "application/json" },
    });
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, error: "invalid_json" }), {
      status: 400,
      headers: { ...whatsappCors, "Content-Type": "application/json" },
    });
  }

  const msg = provider === "evolution"
    ? parseEvolutionApiMessage(payload)
    : parseGenericMessage(payload);

  if (!msg) {
    // No es un mensaje que sepamos manejar (puede ser un evento de
    // presence, typing, ack, etc). Devolvemos 200 para que el provider
    // no reintente. tenantId: null porque todavía no sabemos qué tenant
    // es — RLS lo filtra automáticamente en SELECT.
    const sb = adminClient();
    await logEvent(sb, {
      tenantId: null,
      kind: "ingest_skipped",
      payload: {
        reason: "unparseable",
        provider,
        raw_preview: JSON.stringify(payload).slice(0, 500),
      },
    });
    return new Response(JSON.stringify({ ok: true, skipped: "unparseable" }), {
      status: 200,
      headers: { ...whatsappCors, "Content-Type": "application/json" },
    });
  }

  const sb = adminClient();

  const group = await findOrCreateGroup(sb, msg);
  if (!group) {
    // Grupo no registrado o inactivo. Lo logueamos sin tenant — el admin
    // lo verá en el panel (vía service_role o vista expuesta) y decidirá
    // si registrar el grupo y activar bot_enabled.
    await logEvent(sb, {
      tenantId: null,
      kind: "ingest_skipped",
      payload: {
        reason: "group_not_registered",
        external_id: msg.groupExternalId,
        group_name: msg.groupName,
        sender: msg.senderDisplayName ?? msg.senderExternalId,
        msg_type: msg.msgType,
        body_preview: (msg.body ?? "").slice(0, 100),
      },
    });
    const body: IngestResponse = { ok: true, skipped: "group_not_registered" };
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { ...whatsappCors, "Content-Type": "application/json" },
    });
  }

  const memberId = await upsertMember(sb, group, msg);

  let messageId: string;
  let inserted: boolean;
  try {
    const r = await insertMessage(sb, group, memberId, msg);
    messageId = r.id;
    inserted = r.inserted;
  } catch (e) {
    const errMsg = (e as Error).message;
    await logEvent(sb, {
      tenantId: group.tenant_id,
      groupId: group.id,
      kind: "error",
      payload: { stage: "insert_message", error: errMsg, external_id: msg.externalId },
    });
    return new Response(JSON.stringify({ ok: false, error: errMsg }), {
      status: 500,
      headers: { ...whatsappCors, "Content-Type": "application/json" },
    });
  }

  await logEvent(sb, {
    tenantId: group.tenant_id,
    groupId: group.id,
    kind: inserted ? "message_in" : "message_duplicate",
    payload: {
      message_id: messageId,
      msg_type: msg.msgType,
      sender: msg.senderDisplayName,
      is_from_bot: msg.isFromBot,
    },
  });

  // Si es mensaje del bot, no corremos nada (no detectamos compromisos
  // en lo que nosotros mismos pedimos).
  if (inserted && !msg.isFromBot) {
    if (msg.msgType === "audio" && msg.mediaUrl) {
      // Audios: primero transcribir (con prioridad alta porque el
      // media_url caduca rápido), después la transcripción dispara
      // el extractor.
      fireTranscribeAudio(messageId);
    } else if (msg.msgType === "image" && msg.mediaUrl) {
      // Imágenes: analyze-image con Gemini 2.5 vision. Idem urgencia
      // por caducidad del media_url. La function guarda el análisis
      // (descripción + OCR + mentions) en transcribed_text y después
      // dispara el extractor.
      fireAnalyzeImage(messageId);
    } else if (msg.body && msg.body.length > 10) {
      // Texto (o caption de imagen/video que cumple el min): directo
      // al extractor.
      fireExtractCommitments(messageId);
      // Menciones al bot SOLO en texto — en audios/imágenes primero
      // hay que tener el análisis para saber si nos mencionaron.
      // whatsapp-transcribe-audio y whatsapp-analyze-image se ocupan
      // de invocar al agente si detectan la mención.
      if (shouldInvokeAgent(msg.body)) {
        fireAgent(messageId, group.id);
      }
    }
  }

  const body: IngestResponse = { ok: true, message_id: messageId };
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...whatsappCors, "Content-Type": "application/json" },
  });
});
