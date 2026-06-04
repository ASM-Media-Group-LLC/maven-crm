import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { whatsappCors } from "../_shared/whatsapp.ts";

// wa-inbox-send — Slice 3 del inbox propio: envía un mensaje SALIENTE desde la
// bandeja (responder a una conversación) y lo persiste como
// wa_conversation_messages(direction='out', sender_user_id=<el que envía>).
//
// Flujo: valida el JWT del usuario → chequea permiso → resuelve la conversación
// y el wa_jid del contacto → manda por Evolution → guarda el saliente + actualiza
// la metadata de la conversación.
//
// Autorización (v1, lanzamiento oscuro): SOLO admin (la ruta /inbox es admin-only
// hasta validar). Cuando se abra el inbox a closers/supervisores, se cambia por
// un permiso granular (has_permission(Inbox/...)).
//
// Escribe con service_role (bypassa RLS). El destino es el wa_jid del contacto
// (su parte local) — funciona tanto para @s.whatsapp.net como para @lid (igual
// que la respuesta del flujo de verificación).

const EVOLUTION_URL = Deno.env.get("WHATSAPP_EVOLUTION_URL") ?? "";
const EVOLUTION_API_KEY = Deno.env.get("WHATSAPP_EVOLUTION_API_KEY") ?? "";
const EVOLUTION_INSTANCE = Deno.env.get("WHATSAPP_EVOLUTION_INSTANCE") ?? "maven-bot";
// v1 (default): payload con textMessage wrapper; v2: payload plano. Ver whatsapp-send.
const EVOLUTION_API_VERSION = Deno.env.get("WHATSAPP_EVOLUTION_API_VERSION") ?? "v1";
const TENANT_ID = "30869615-f579-4981-8a1f-dbebc61eae2d"; // ASM Tech (inbox v1 mono-tenant)

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...whatsappCors, "Content-Type": "application/json" },
  });
}

async function sendViaEvolution(
  toNumber: string,
  text: string,
  instance: string,
  quoted?: { id: string; fromMe: boolean; text: string } | null,
): Promise<{ ok: boolean; externalId?: string; error?: string }> {
  if (!EVOLUTION_URL || !EVOLUTION_API_KEY) return { ok: false, error: "evolution_not_configured" };
  const url = `${EVOLUTION_URL.replace(/\/$/, "")}/message/sendText/${instance}`;
  const base = EVOLUTION_API_VERSION === "v2"
    ? { number: toNumber, text }
    : { number: toNumber, options: { delay: 0, presence: "composing" }, textMessage: { text } };
  // El gateway lee body.quoted aparte del wrapper de texto (v1/v2).
  const payload = quoted ? { ...base, quoted } : base;
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "apikey": EVOLUTION_API_KEY },
      body: JSON.stringify(payload),
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

  // ── Auth: JWT del usuario ──────────────────────────────────────────────────
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) return json({ ok: false, error: "missing_auth" }, 401);

  const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: uErr } = await sb.auth.getUser(token);
  if (uErr || !userData?.user) return json({ ok: false, error: "invalid_token" }, 401);
  const userId = userData.user.id;

  // ── Permiso server-side: módulo WhatsApp / submódulo Bandeja (has_permission
  // ya devuelve true para admin). Abre el envío a los roles habilitados.
  const { data: allowed, error: pErr } = await sb.rpc("has_permission", {
    _user_id: userId, _module: "WhatsApp", _submodule: "Bandeja",
  });
  if (pErr || !allowed) return json({ ok: false, error: "forbidden" }, 403);

  // ── Input ──────────────────────────────────────────────────────────────────
  let payload: { conversation_id?: string; body?: string; reply_to_message_id?: string } = {};
  try { payload = await req.json(); } catch { /* */ }
  const conversationId = payload.conversation_id;
  const text = (payload.body ?? "").trim();
  const replyToId = payload.reply_to_message_id;
  if (!conversationId || !text) return json({ ok: false, error: "missing_conversation_or_body" }, 400);

  // ── Resolver conversación → wa_jid del contacto + instancia del canal ───────
  const { data: conv } = await (sb as any)
    .from("wa_conversations")
    .select("id, contact_id, channel_id, channel_jid, wa_contacts(wa_jid)")
    .eq("id", conversationId)
    .maybeSingle();
  if (!conv) return json({ ok: false, error: "conversation_not_found" }, 404);
  const waJid = conv.wa_contacts?.wa_jid as string | undefined;
  if (!waJid) return json({ ok: false, error: "contact_jid_missing" }, 422);
  // Destino: el wa_jid COMPLETO. Evolution/Baileys rutea por JID (igual que a los
  // grupos @g.us). Para un @lid hay que mandar al "<id>@lid" entero — mandar solo
  // los dígitos NO llega (el lid no es el teléfono real del usuario).
  const toNumber = waJid;

  // Instancia de SALIDA: el número del CANAL de esta conversación (NO el del bot).
  // Sin esto, TODO salía por la instancia fija "maven-bot" (el número del bot)
  // aunque la conversación fuera de otra línea (ej. Closers1 → 3104516401).
  // Preferimos el evolution_instance VIGENTE del canal (por channel_id); si no,
  // el channel_jid que quedó guardado al abrir la conversación; y como último
  // recurso la env var (compat con conversaciones legacy sin canal).
  let instance = (conv.channel_jid as string | null) || EVOLUTION_INSTANCE;
  if (conv.channel_id) {
    const { data: ch } = await (sb as any)
      .from("wa_channels").select("evolution_instance").eq("id", conv.channel_id).maybeSingle();
    if (ch?.evolution_instance) instance = ch.evolution_instance as string;
  }

  // ── Responder/citar: resolver el mensaje original (external_id + autor + texto) ─
  let quoted: { id: string; fromMe: boolean; text: string } | null = null;
  if (replyToId) {
    const { data: orig } = await (sb as any)
      .from("wa_conversation_messages")
      .select("external_id, direction, body, msg_type")
      .eq("id", replyToId)
      .eq("conversation_id", conversationId)
      .maybeSingle();
    if (orig?.external_id) {
      quoted = {
        id: orig.external_id as string,
        fromMe: orig.direction === "out",
        text: (orig.body as string | null) || `[${orig.msg_type}]`,
      };
    }
  }

  // ── Enviar por Evolution (por la instancia del canal de la conversación) ────
  const sent = await sendViaEvolution(toNumber, text, instance, quoted);
  if (!sent.ok) {
    // Número no registrado en WhatsApp: registramos el intento como FALLIDO
    // (queda en rojo en el chat) y avisamos al front con reason.
    if ((sent.error ?? "").includes("not_on_whatsapp")) {
      const nowIso = new Date().toISOString();
      await sb.from("wa_conversation_messages").insert({
        tenant_id: TENANT_ID, conversation_id: conversationId, direction: "out",
        sender_user_id: userId, external_id: null, body: text, msg_type: "text",
        status: "failed", sent_at: nowIso, reply_to_message_id: replyToId ?? null,
      });
      await sb.from("wa_conversations")
        .update({ last_message_at: nowIso, last_message_preview: text.slice(0, 120) })
        .eq("id", conversationId);
      return json({ ok: false, reason: "not_on_whatsapp", target: toNumber }, 200);
    }
    return json({ ok: false, error: sent.error, target: toNumber }, 502);
  }

  // ── Persistir el saliente + actualizar metadata ─────────────────────────────
  const nowIso = new Date().toISOString();
  const { data: msg, error: mErr } = await sb
    .from("wa_conversation_messages")
    .insert({
      tenant_id: TENANT_ID,
      conversation_id: conversationId,
      direction: "out",
      sender_user_id: userId,
      external_id: sent.externalId ?? null,
      body: text,
      msg_type: "text",
      status: "sent",
      sent_at: nowIso,
      reply_to_message_id: replyToId ?? null,
    })
    .select("id")
    .single();
  if (mErr) return json({ ok: false, error: "persist_failed: " + mErr.message }, 500);

  await sb
    .from("wa_conversations")
    .update({ last_message_at: nowIso, last_message_preview: text.slice(0, 120) })
    .eq("id", conversationId);

  return json({ ok: true, message_id: msg?.id, external_id: sent.externalId ?? null });
});
