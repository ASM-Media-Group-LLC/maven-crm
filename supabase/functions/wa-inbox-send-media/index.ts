import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { whatsappCors } from "../_shared/whatsapp.ts";

// wa-inbox-send-media — envía un saliente con MEDIA (imagen/audio/video/documento)
// desde la bandeja. El front sube el archivo a Storage y nos pasa la URL (firmada);
// resolvemos la instancia del CANAL de la conversación (no el bot) y mandamos por
// el gateway /message/sendMedia. Persiste como wa_conversation_messages(out).
//
// Auth propia: JWT (getUser) + permiso WhatsApp/Bandeja. Escribe con service_role.

const EVOLUTION_URL = Deno.env.get("WHATSAPP_EVOLUTION_URL") ?? "";
const EVOLUTION_API_KEY = Deno.env.get("WHATSAPP_EVOLUTION_API_KEY") ?? "";
const EVOLUTION_INSTANCE = Deno.env.get("WHATSAPP_EVOLUTION_INSTANCE") ?? "maven-bot";
const TENANT_ID = "30869615-f579-4981-8a1f-dbebc61eae2d"; // ASM Tech (inbox v1 mono-tenant)

const VALID_TYPES = ["image", "audio", "video", "document", "gif", "sticker"];

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...whatsappCors, "Content-Type": "application/json" },
  });
}

async function sendMediaViaEvolution(
  instance: string,
  toNumber: string,
  mediatype: string,
  url: string,
  opts: { caption?: string; filename?: string; mimetype?: string; ptt?: boolean },
): Promise<{ ok: boolean; externalId?: string; error?: string }> {
  if (!EVOLUTION_URL || !EVOLUTION_API_KEY) return { ok: false, error: "evolution_not_configured" };
  const endpoint = `${EVOLUTION_URL.replace(/\/$/, "")}/message/sendMedia/${instance}`;
  try {
    const resp = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "apikey": EVOLUTION_API_KEY },
      body: JSON.stringify({
        number: toNumber,
        mediatype,
        url,
        caption: opts.caption,
        filename: opts.filename,
        mimetype: opts.mimetype,
        ptt: opts.ptt ?? false,
      }),
    });
    if (!resp.ok) {
      const t = await resp.text();
      return { ok: false, error: `evolution ${resp.status}: ${t.slice(0, 200)}` };
    }
    const data = await resp.json() as { key?: { id?: string } };
    return { ok: true, externalId: data?.key?.id };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: whatsappCors });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // ── Auth ─────────────────────────────────────────────────────────────────
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) return json({ ok: false, error: "missing_auth" }, 401);

  const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: uErr } = await sb.auth.getUser(token);
  if (uErr || !userData?.user) return json({ ok: false, error: "invalid_token" }, 401);
  const userId = userData.user.id;

  const { data: allowed, error: pErr } = await sb.rpc("has_permission", {
    _user_id: userId, _module: "WhatsApp", _submodule: "Bandeja",
  });
  if (pErr || !allowed) return json({ ok: false, error: "forbidden" }, 403);

  // ── Input ──────────────────────────────────────────────────────────────────
  let payload: {
    conversation_id?: string; media_url?: string; media_type?: string;
    mimetype?: string; filename?: string; caption?: string; ptt?: boolean;
  } = {};
  try { payload = await req.json(); } catch { /* */ }
  const conversationId = payload.conversation_id;
  const mediaUrl = payload.media_url;
  const mediaType = (payload.media_type ?? "").toLowerCase();
  if (!conversationId || !mediaUrl || !VALID_TYPES.includes(mediaType)) {
    return json({ ok: false, error: "missing_or_invalid", valid: VALID_TYPES }, 400);
  }

  // ── Resolver conversación → wa_jid + instancia del canal ────────────────────
  const { data: conv } = await (sb as any)
    .from("wa_conversations")
    .select("id, contact_id, channel_id, channel_jid, wa_contacts(wa_jid)")
    .eq("id", conversationId)
    .maybeSingle();
  if (!conv) return json({ ok: false, error: "conversation_not_found" }, 404);
  const waJid = conv.wa_contacts?.wa_jid as string | undefined;
  if (!waJid) return json({ ok: false, error: "contact_jid_missing" }, 422);

  // Instancia de SALIDA = el número del CANAL de la conversación (no el bot).
  let instance = (conv.channel_jid as string | null) || EVOLUTION_INSTANCE;
  if (conv.channel_id) {
    const { data: ch } = await (sb as any)
      .from("wa_channels").select("evolution_instance").eq("id", conv.channel_id).maybeSingle();
    if (ch?.evolution_instance) instance = ch.evolution_instance as string;
  }

  // ── Enviar la media ─────────────────────────────────────────────────────────
  const sent = await sendMediaViaEvolution(instance, waJid, mediaType, mediaUrl, {
    caption: payload.caption,
    filename: payload.filename,
    mimetype: payload.mimetype,
    ptt: payload.ptt,
  });
  if (!sent.ok) {
    // Número no registrado en WhatsApp: registramos el intento como FALLIDO
    // (queda en rojo en el chat) y avisamos al front con reason.
    if ((sent.error ?? "").includes("not_on_whatsapp")) {
      const nowIso = new Date().toISOString();
      const preview = payload.caption?.trim() || `[${mediaType}]`;
      await sb.from("wa_conversation_messages").insert({
        tenant_id: TENANT_ID, conversation_id: conversationId, direction: "out",
        sender_user_id: userId, external_id: null, body: payload.caption?.trim() || null,
        msg_type: mediaType === "gif" ? "video" : mediaType, media_url: mediaUrl,
        status: "failed", sent_at: nowIso,
      });
      await sb.from("wa_conversations")
        .update({ last_message_at: nowIso, last_message_preview: preview.slice(0, 120) })
        .eq("id", conversationId);
      return json({ ok: false, reason: "not_on_whatsapp", target: waJid }, 200);
    }
    return json({ ok: false, error: sent.error, target: waJid }, 502);
  }

  // ── Persistir el saliente + metadata ────────────────────────────────────────
  const nowIso = new Date().toISOString();
  const preview = payload.caption?.trim() || `[${mediaType}]`;
  // UPSERT por (conversation_id, external_id): si el eco fromMe de este envío ya entró por el
  // ingest como 'external', lo corregimos a 'maven' + sender (evita la carrera → 500).
  const { data: msg, error: mErr } = await sb
    .from("wa_conversation_messages")
    .upsert({
      tenant_id: TENANT_ID,
      conversation_id: conversationId,
      direction: "out",
      sender_user_id: userId,
      external_id: sent.externalId ?? null,
      body: payload.caption?.trim() || null,
      msg_type: mediaType === "gif" ? "video" : mediaType, // gif se renderiza como video
      media_url: mediaUrl,
      status: "sent",
      source: "maven",
      sent_at: nowIso,
    }, { onConflict: "conversation_id,external_id" })
    .select("id")
    .single();
  if (mErr) return json({ ok: false, error: "persist_failed: " + mErr.message }, 500);

  await sb
    .from("wa_conversations")
    .update({ last_message_at: nowIso, last_message_preview: preview.slice(0, 120) })
    .eq("id", conversationId);

  return json({ ok: true, message_id: msg?.id, external_id: sent.externalId ?? null });
});
