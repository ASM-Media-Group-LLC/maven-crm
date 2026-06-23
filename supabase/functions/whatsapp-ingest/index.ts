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
): Promise<{ id: string; tenant_id: string; bot_enabled: boolean; bot_mode: string } | null> {
  // Buscar por external_id. Si no existe, NO lo creamos automáticamente
  // — esto evita que cualquier grupo random que agreguen al bot empiece
  // a quemar tokens de Claude sin que un admin lo apruebe. Sí lo
  // logueamos para que el admin lo vea en el panel y lo active.
  const { data, error } = await sb
    .from("whatsapp_groups")
    .select("id, tenant_id, bot_enabled, active, bot_mode")
    .eq("external_id", msg.groupExternalId)
    .maybeSingle();

  if (error) {
    console.warn("findGroup error:", error.message);
    return null;
  }
  if (!data || !data.active) return null;
  return data;
}

// Match con un user de Maven en orden de confiabilidad:
//   1. LID — el más confiable. Se popula cuando el user verifica via DM.
//      Es estable per-user y aparece igual en DMs y grupos.
//   2. Phone — para legacy (@s.whatsapp.net). Casi no aplica en grupos modernos.
//   3. PushName — último recurso si nadie matchea por LID.
async function resolveMavenUser(
  sb: SupabaseClient,
  jid: string,
  pushName: string | null | undefined,
): Promise<string | null> {
  if (jid.endsWith("@lid")) {
    try {
      const { data } = await sb.rpc("whatsapp_resolve_user_by_lid", { p_lid: jid });
      if (data) return data as string;
    } catch (_e) { /* fallthrough */ }
  }
  if (jid.endsWith("@s.whatsapp.net")) {
    try {
      const { data } = await sb.rpc("whatsapp_resolve_user_by_phone", { p_jid_or_phone: jid });
      if (data) return data as string;
    } catch (_e) { /* fallthrough */ }
  }
  if (pushName) {
    try {
      const { data } = await sb.rpc("whatsapp_resolve_user_by_push_name", { p_push_name: pushName });
      if (data) return data as string;
    } catch (_e) { /* fallthrough */ }
  }
  return null;
}

async function upsertMember(
  sb: SupabaseClient,
  group: { id: string; tenant_id: string },
  msg: IncomingMessage,
): Promise<string | null> {
  if (!msg.senderExternalId) return null;

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
    if (!existing.user_id) {
      const resolved = await resolveMavenUser(sb, msg.senderExternalId, msg.senderDisplayName);
      if (resolved) patch.user_id = resolved;
    }
    await sb.from("whatsapp_members").update(patch).eq("id", existing.id);
    return existing.id;
  }

  const resolvedUserId = await resolveMavenUser(sb, msg.senderExternalId, msg.senderDisplayName);

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

// ----------------------------------------------------------------------------
// DM handler — procesa mensajes privados al bot.
// ----------------------------------------------------------------------------
// El user responde al DM con un código de verificación que le mandamos
// (ej. "AB3CDE"). Buscamos el código en whatsapp_verification_codes via
// RPC `claim_whatsapp_verification_code` que atómicamente:
//   - Valida que el código exista, no esté usado y no haya expirado.
//   - Marca el código como usado.
//   - Guarda el LID + pushName + verified_at en el profile.
// Si el match falla, ignoramos (el user puede haber respondido cualquier
// cosa). No le respondemos automáticamente al bot privado para evitar
// loops y para no spamear.

// Regex del código: 6 chars del alphabet de send-verification-dm.
const CODE_REGEX = /\b([ACDEFGHJKLMNPQRTUVWXY3479]{6})\b/i;

function extractCode(body: string | null): string | null {
  if (!body) return null;
  const upper = body.toUpperCase();
  const m = upper.match(CODE_REGEX);
  return m ? m[1] : null;
}

async function processDirectMessage(
  sb: SupabaseClient,
  msg: IncomingMessage,
): Promise<{ kind: string; user_id?: string }> {
  if (msg.msgType !== "text" || !msg.body) {
    return { kind: "dm_ignored_non_text" };
  }
  if (msg.isFromBot) {
    return { kind: "dm_ignored_own_message" };
  }

  const code = extractCode(msg.body);
  if (!code) {
    return { kind: "dm_received_no_code" };
  }

  // Claim atómico del código vía RPC. Si el código es válido devuelve
  // el user_id; sino NULL (código no encontrado, ya usado o expirado).
  const lid = msg.senderExternalId;
  const pushName = msg.senderDisplayName ?? null;
  const { data: userId, error } = await sb.rpc("claim_whatsapp_verification_code", {
    p_code: code,
    p_lid: lid,
    p_push_name: pushName,
  });
  if (error) {
    console.warn("claim_whatsapp_verification_code error:", error.message);
    return { kind: "dm_claim_rpc_error" };
  }
  if (!userId) {
    return { kind: "dm_code_invalid_or_expired" };
  }

  // Confirmar al user por el mismo DM.
  const evolutionUrl = Deno.env.get("WHATSAPP_EVOLUTION_URL") ?? "";
  const evolutionKey = Deno.env.get("WHATSAPP_EVOLUTION_API_KEY") ?? "";
  const evolutionInstance = Deno.env.get("WHATSAPP_EVOLUTION_INSTANCE") ?? "maven-bot";
  // v1 (default): payload con textMessage wrapper. v2: payload plano. Ver
  // whatsapp-send/index.ts para el porqué.
  const evolutionApiVersion = Deno.env.get("WHATSAPP_EVOLUTION_API_VERSION") ?? "v1";
  // Para responder en DMs con LID, el destinatario es el LID mismo.
  const replyTarget = lid.replace(/@.*/, "");
  if (evolutionUrl && evolutionKey) {
    const confirmText = "¡Listo! ✅ Quedaste vinculado en Maven.\n\nCuando escribas en los grupos del equipo donde estoy, ya te voy a reconocer.";
    const confirmPayload = evolutionApiVersion === "v2"
      ? { number: replyTarget, text: confirmText }
      : { number: replyTarget, options: { delay: 0 }, textMessage: { text: confirmText } };
    fetch(`${evolutionUrl}/message/sendText/${evolutionInstance}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "apikey": evolutionKey },
      body: JSON.stringify(confirmPayload),
    }).catch(() => {});
  }

  return { kind: "dm_verified", user_id: userId as string };
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

// ── Inbox propio (Slice 2): persistir DMs 1:1 en las tablas wa_* ──────────────
const TENANT_ID = "30869615-f579-4981-8a1f-dbebc61eae2d"; // ASM Tech (inbox v1, mono-tenant)

// persistInboxMessage — guarda un DM 1:1 ENTRANTE en el núcleo de conversación
// del inbox propio (wa_contacts -> wa_conversations -> wa_conversation_messages).
// Corre ALONGSIDE del flujo de verificación, es best-effort (no rompe la ingesta
// si falla) e idempotente (por conversation_id+external_id). Como todavía no hay
// UI que lea estas tablas (Slice 4), no tiene efecto visible: solo puebla datos.
// Escribe con service_role (bypassa RLS). El número crudo (phone_e164) solo se
// deriva si el JID trae teléfono (<phone>@s.whatsapp.net); con @lid queda null.
// Tipos de media → key del sub-mensaje Baileys + extensión por defecto.
const MEDIA_SUBKEY: Record<string, string> = {
  audio: "audioMessage", image: "imageMessage", video: "videoMessage",
  document: "documentMessage", sticker: "stickerMessage",
};
const EXT_FALLBACK: Record<string, string> = {
  audio: "ogg", image: "jpg", video: "mp4", document: "bin", sticker: "webp",
};

// downloadAndStoreInboundMedia — baja la media ENTRANTE desencriptada del gateway
// (/media/download usa la mediaKey del propio mensaje, no la sesión), la sube a
// Storage (creator-files/wa-inbound/...) y devuelve una URL firmada (1 año). La
// "url" que trae WhatsApp está CIFRADA y caduca, por eso no sirve directo; el
// sticker ni siquiera la trae. Best-effort: devuelve null ante cualquier fallo
// (el mensaje queda con el placeholder "[tipo]", la ingesta no se rompe).
async function downloadAndStoreInboundMedia(
  sb: SupabaseClient,
  conversationId: string,
  msg: IncomingMessage,
): Promise<string | null> {
  const type = msg.msgType;
  const subKey = MEDIA_SUBKEY[type];
  if (!subKey) return null;
  const rawObj = (msg.raw && typeof msg.raw === "object") ? (msg.raw as Record<string, unknown>) : {};
  const data = rawObj.data as Record<string, unknown> | undefined;
  const message = data?.message as Record<string, unknown> | undefined;
  const sub = message?.[subKey] as Record<string, unknown> | undefined;
  if (!sub || !sub.mediaKey || !(sub.url || sub.directPath)) return null;

  const GW = Deno.env.get("WHATSAPP_EVOLUTION_URL");
  const KEY = Deno.env.get("WHATSAPP_EVOLUTION_API_KEY");
  if (!GW || !KEY) return null;
  try {
    const resp = await fetch(`${GW.replace(/\/$/, "")}/media/download`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "apikey": KEY },
      body: JSON.stringify({ type, message: sub }),
    });
    if (!resp.ok) { console.warn("inbound media download:", resp.status); return null; }
    const bytes = new Uint8Array(await resp.arrayBuffer());
    if (!bytes.length) return null;
    const mime = resp.headers.get("content-type") ?? undefined;
    const ext = (mime?.split("/")[1]?.split(";")[0]?.replace(/[^a-z0-9]/gi, "")) || EXT_FALLBACK[type] || "bin";
    const safeId = (msg.externalId ?? "m").replace(/[^a-zA-Z0-9]/g, "").slice(0, 40) || "m";
    const path = `wa-inbound/${conversationId}/${safeId}.${ext}`;
    const up = await sb.storage.from("creator-files").upload(path, bytes, { contentType: mime, upsert: true });
    if (up.error) { console.warn("inbound media upload:", up.error.message); return null; }
    const signed = await sb.storage.from("creator-files").createSignedUrl(path, 60 * 60 * 24 * 365);
    return signed.data?.signedUrl ?? null;
  } catch (e) {
    console.warn("inbound media store:", (e as Error).message);
    return null;
  }
}

// MX (+52) y AR (+54) tienen un dígito "legacy" (1 móvil / 9 móvil) que WhatsApp a veces incluye en
// el JID entrante ("521...") pero no en el marcado al enviar ("52...") → el MISMO contacto caía en
// dos wa_jid distintos y el chatter no veía las respuestas (caso Dayana). Solución SIN regresión: al
// ingerir, buscamos el contacto por CUALQUIERA de las dos formas y usamos el que YA exista (prefiriendo
// el que coincide exacto con la forma entrante); si no existe ninguno, creamos en la forma canónica
// (sin el dígito). Así no forzamos una forma sobre hilos ya consolidados en la otra (caso Joselyn=521).
function jidVariants(jid: string): string[] {
  if (!jid.endsWith("@s.whatsapp.net")) return [jid];
  const d = jid.replace(/@.*/, "");
  const set = new Set<string>([d]);
  if (/^521\d{10}$/.test(d)) set.add("52" + d.slice(3)); else if (/^52\d{10}$/.test(d)) set.add("521" + d.slice(2));
  if (/^549\d{10}$/.test(d)) set.add("54" + d.slice(3)); else if (/^54\d{10}$/.test(d)) set.add("549" + d.slice(2));
  return [...set].map((x) => x + "@s.whatsapp.net");
}
function canonicalJid(jid: string): string {
  if (!jid.endsWith("@s.whatsapp.net")) return jid;
  const d = jid.replace(/@.*/, "");
  if (/^521\d{10}$/.test(d)) return "52" + d.slice(3) + "@s.whatsapp.net";
  if (/^549\d{10}$/.test(d)) return "54" + d.slice(3) + "@s.whatsapp.net";
  return jid;
}

async function persistInboxMessage(sb: SupabaseClient, msg: IncomingMessage): Promise<void> {
  if (!msg.isDirect || msg.isFromBot) return;
  const rawJid = msg.senderExternalId;
  if (!rawJid) return;

  const rawObj = (msg.raw && typeof msg.raw === "object") ? (msg.raw as Record<string, unknown>) : {};
  const channelJid = typeof rawObj.instance === "string" ? rawObj.instance : null;

  // 1) Contacto: buscar por cualquiera de las variantes (con/sin "1" MX / "9" AR). Si hay varias
  //    (split previo), preferimos la que coincide EXACTO con la forma entrante; si no existe ninguna,
  //    creamos en la forma canónica (sin el dígito). NO upsert (no pisar phone/display con null).
  let contactId: string | null = null;
  let jid = canonicalJid(rawJid);
  const { data: cands } = await sb
    .from("wa_contacts").select("id, wa_jid")
    .eq("tenant_id", TENANT_ID).in("wa_jid", jidVariants(rawJid));
  const picked = (cands ?? []).find((c: { wa_jid: string }) => c.wa_jid === rawJid) ?? (cands ?? [])[0] ?? null;
  if (picked) { contactId = picked.id; jid = picked.wa_jid; }

  const digits = jid.replace(/@.*/, "").replace(/[^0-9]/g, "");
  const phone = jid.endsWith("@s.whatsapp.net") && digits ? "+" + digits : null;
  const displayName = msg.senderDisplayName ?? (phone ? null : (jid.replace(/@.*/, "") || null));

  if (!contactId) {
    const { data: created, error } = await sb
      .from("wa_contacts")
      .insert({ tenant_id: TENANT_ID, wa_jid: jid, phone_e164: phone, display_name: displayName })
      .select("id").single();
    if (created) {
      contactId = created.id;
    } else {
      // Carrera: otro DM creó el contacto en paralelo (unique violation) -> re-buscar.
      const { data: re } = await sb
        .from("wa_contacts").select("id")
        .eq("tenant_id", TENANT_ID).eq("wa_jid", jid).maybeSingle();
      if (re) contactId = re.id;
      else { console.warn("inbox contact insert:", error?.message); return; }
    }
  }

  // Resolver el canal por la instancia (si está registrado en wa_channels).
  // De ahí deriva la visibilidad por membresía; si la instancia no está
  // registrada todavía, queda null (solo admin lo ve, hasta que se mapee).
  let channelId: string | null = null;
  if (channelJid) {
    const { data: ch } = await sb
      .from("wa_channels").select("id")
      .eq("tenant_id", TENANT_ID).eq("evolution_instance", channelJid).maybeSingle();
    channelId = ch?.id ?? null;
  }

  // 2) Conversación: la del contacto EN ESTA LÍNEA (canal). Antes buscaba por
  //    (contacto + department) SIN canal → un contacto que escribía a 2 líneas
  //    distintas acumulaba todo en la 1ra conversación (un DM entrante por
  //    Closers1 caía en la conversación vieja de maven-bot). Ahora cada línea
  //    tiene su propia conversación.
  let conversationId: string;
  let convQ = sb
    .from("wa_conversations").select("id")
    .eq("contact_id", contactId).eq("department", "closer");
  if (channelId) convQ = convQ.eq("channel_id", channelId);
  else if (channelJid) convQ = convQ.eq("channel_jid", channelJid);
  const { data: convs } = await convQ.order("created_at", { ascending: false }).limit(1);
  if (convs && convs.length > 0) {
    conversationId = convs[0].id;
  } else {
    const { data: created, error } = await sb
      .from("wa_conversations")
      .insert({ tenant_id: TENANT_ID, contact_id: contactId, channel_jid: channelJid, channel_id: channelId, department: "closer", status: "open" })
      .select("id").single();
    if (!created) { console.warn("inbox conversation insert:", error?.message); return; }
    conversationId = created.id;
  }

  // 3) Mensaje: insert idempotente por (conversation_id, external_id).
  const isMedia = ["audio", "image", "video", "document", "sticker"].includes(msg.msgType);
  const preview = (msg.body ?? `[${msg.msgType}]`).slice(0, 120);
  const { data: inserted, error: mErr } = await sb
    .from("wa_conversation_messages")
    .insert({
      tenant_id: TENANT_ID,
      conversation_id: conversationId,
      direction: "in",
      external_id: msg.externalId,
      body: msg.body,
      msg_type: msg.msgType,
      media_url: null, // la media entrante se baja + sube a Storage en 3b
      sent_at: msg.sentAt,
    })
    .select("id")
    .maybeSingle();
  if (mErr) {
    // 23505 = unique_violation -> el mensaje ya estaba guardado (idempotente).
    if (mErr.code !== "23505" && !mErr.message.includes("duplicate")) {
      console.warn("inbox message insert:", mErr.message);
    }
    return;
  }

  // 3b) Media entrante: bajar (desencriptar vía gateway) + subir a Storage +
  //     setear media_url. Best-effort: si falla, queda el placeholder "[tipo]".
  if (inserted?.id && isMedia) {
    const storedUrl = await downloadAndStoreInboundMedia(sb, conversationId, msg);
    if (storedUrl) {
      await sb.from("wa_conversation_messages").update({ media_url: storedUrl }).eq("id", inserted.id);
    }
  }

  // 4) Metadata + no-leídos (+1). Antes solo seteaba last_message_* y el contador
  //    de no-leídos quedaba en 0 (sin bubbles en el inbox). wa_bump_unread lo
  //    incrementa de forma atómica (RPC SECURITY DEFINER).
  await sb.rpc("wa_bump_unread", {
    p_conversation_id: conversationId,
    p_preview: preview,
    p_sent_at: msg.sentAt,
  });
}

// Detecta si el mensaje es un "check-in" del usuario al inicio del turno.
// Patrones: "ya activo", "activa", "dispo", "ingresando", "ya entré", etc.
// Solo aplica al PRIMER mensaje del día del usuario que matchea, así no
// spameamos en cada confirmación.
function isCheckIn(body: string | null): boolean {
  if (!body) return false;
  const lower = body.toLowerCase().trim();
  if (lower.length > 60) return false; // check-ins son cortos
  const patterns = [
    /\bya\s+activ[oa]\b/i,
    /\bactiv[oa]\s+tambi[eé]n\b/i,
    /^\s*activ[oa]\s*[\.\!\,\s]*$/i,
    /^\s*dispo(nible)?\s*[✅☑\!\.\s]*$/i,
    /\bbuen(os)?\s+d[ií]as?[\s\.,!]*(ya\s+)?(activ[oa]|dispo|entré|ingres)/i,
    /\bingresando\b/i,
    /\bya\s+entr[eé]\b/i,
    /\bya\s+empez[eé]\b/i,
    /\bbuen(os)?\s+d[ií]as?\b.{0,30}(activ|dispo|entr|listo|aqui|aquí)/i,
  ];
  return patterns.some((p) => p.test(body));
}

// Registra el check-in del user en whatsapp_supervisor_state con un
// check_kind único por (user, día). No bloqueante.
async function maybeRegisterCheckIn(
  sb: SupabaseClient,
  msg: IncomingMessage,
  memberId: string | null,
): Promise<void> {
  if (!memberId) return;
  if (!isCheckIn(msg.body)) return;
  // Resolver user_id desde member.
  const { data: member } = await sb
    .from("whatsapp_members")
    .select("user_id")
    .eq("id", memberId)
    .maybeSingle();
  if (!member?.user_id) return;
  const today = new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 10);
  try {
    await sb.from("whatsapp_supervisor_state").insert({
      user_id: member.user_id,
      check_kind: "user_active",
      check_date: today,
      payload: {
        message_id: msg.externalId,
        sender_display_name: msg.senderDisplayName,
        body_preview: msg.body?.slice(0, 100) ?? null,
        at: msg.sentAt,
      },
    });
  } catch (_e) { /* duplicate = already checked in today, fine */ }
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

// Quick commands — respuestas hardcodeadas para mensajes muy frecuentes y
// predecibles. Saltea el agent (Sonnet) → 0$, instantáneo, consistente.
//
// La presentación usa un flow especial (multi-mensaje + stats vivas). El
// resto son templates fijos.
type QuickCommand = "presentate" | "help" | "audit" | "eod" | null;

function detectQuickCommand(body: string | null): QuickCommand {
  if (!body) return null;
  const presentate = [
    /\bpres[eé]ntate\b/i,
    /\bqui[eé]n\s+sos\b/i,
    /\bqu[eé]\s+sos\b/i,
    /\bqu[eé]\s+hac[eé]s\b/i,
    /\bqu[eé]\s+sab[eé]s\s+hacer\b/i,
    /\bqu[eé]\s+pod[eé]s\s+hacer\b/i,
    /\bpara\s+qu[eé]\s+serv[ií]s\b/i,
  ];
  if (presentate.some((p) => p.test(body))) return "presentate";

  const help = [
    /^\s*[@/]?maven\s+\/?(help|ayuda|comandos)\b/i,
    /^\s*\/(help|ayuda|comandos)\b/i,
    /\bqu[eé]\s+comandos\b/i,
  ];
  if (help.some((p) => p.test(body))) return "help";

  const audit = [
    /\baudita(?:r|ndo)?\b/i,
    /\bauditor[ií]a\b/i,
    /\bsync\s+(?:el\s+)?historial\b/i,
    /\bsincroniza\b/i,
    /\bescanea(?:r)?\s+(?:el\s+)?historial\b/i,
    /\brevisa\s+(?:el\s+)?historial\b/i,
  ];
  if (audit.some((p) => p.test(body))) return "audit";

  const eod = [
    /\bcierre(?:\s+(?:del|de)\s+(?:d[ií]a|jornada|turno))?\b/i,
    /\bresumen\s+(?:del|de)\s+(?:d[ií]a|hoy|jornada|turno)\b/i,
    /\bc[oó]mo\s+va\s+(?:el\s+)?(?:d[ií]a|equipo|jornada|turno)\b/i,
    /\beod\b/i,
  ];
  if (eod.some((p) => p.test(body))) return "eod";

  return null;
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

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// Stats vivas del grupo para el mensaje de presentación.
async function getGroupStats(sb: SupabaseClient, groupId: string): Promise<{
  commitments: number;
  reports: number;
  ig_mentions: number;
  days_off: number;
}> {
  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
  const sinceDate = since.slice(0, 10);

  const head = (q: { count: number | null }) => q.count ?? 0;

  const [commitments, reports, igMentions, daysOff] = await Promise.all([
    sb.from("whatsapp_commitments").select("id", { count: "exact", head: true })
      .eq("group_id", groupId).gte("created_at", since).then(head),
    sb.from("whatsapp_daily_reports").select("id", { count: "exact", head: true })
      .eq("group_id", groupId).gte("created_at", since).then(head),
    // Mensajes que mencionan algún handle de Instagram (proxy de "modelos analizadas")
    sb.from("whatsapp_messages").select("id", { count: "exact", head: true })
      .eq("group_id", groupId).gte("sent_at", since)
      .or("body.ilike.%instagram.com/%,transcribed_text.ilike.%instagram.com/%")
      .then(head),
    // days_off: si quitamos el filtro de group, contamos todos los del tenant
    // (los time_off no están atados a un grupo). Para el mensaje del grupo
    // mostramos los registrados desde miembros del grupo.
    sb.from("whatsapp_user_time_off").select("id", { count: "exact", head: true })
      .gte("off_date", sinceDate).then(head),
  ]);

  return { commitments, reports, ig_mentions: igMentions, days_off: daysOff };
}

// Flow de presentación: 3 mensajes con sleeps + stats vivas.
//
// Si las stats del grupo son bajas (suma <5), usamos modo "recién llegado"
// — sin mostrar números que harían ver al bot como inactivo. Cuando el
// grupo acumule historial real, automáticamente switchea al mensaje
// completo con stats.
const FRESH_GROUP_THRESHOLD = 5;
const CAPABILITIES_BLOCK =
  "*Mis capacidades:*\n\n" +
  "✅ *Compromisos* — capto promesas, reclamo seguimiento\n" +
  "📊 *Reportes* — guardo métricas de cada jornada\n" +
  "🤖 *Análisis IG* — followers, AI score, monetización estimada\n" +
  "🔍 *Leads* — historial: ¿ya rechazada? ¿quién la trabajó?\n" +
  "🏖️ *Ausencias* — registro días libres anunciados acá\n" +
  "🕐 *Horarios* — sé quién trabaja ahora mismo";

async function firePresentationFlow(sb: SupabaseClient, groupId: string): Promise<void> {
  // 1) Hook inicial (mientras paralelamente queryamos stats)
  const statsPromise = getGroupStats(sb, groupId);
  await sendToGroup(groupId, "👀 *Acá estoy.*");

  // 2) Pausa dramática + stats
  await sleep(1500);
  const stats = await statsPromise;
  const totalActivity = stats.commitments + stats.reports + stats.ig_mentions + stats.days_off;
  const isFreshGroup = totalActivity < FRESH_GROUP_THRESHOLD;

  const body2 = isFreshGroup
    ? (
      "👋 *Soy Maven Asistente.*\n" +
      "_Memoria persistente del equipo, 24/7._\n\n" +
      "_Recién empiezo a operar en este grupo — pero ya puedo hacer todo esto desde el minuto cero:_\n\n" +
      CAPABILITIES_BLOCK
    )
    : (
      "👋 *Soy Maven Asistente.*\n" +
      "_Memoria persistente del equipo, 24/7._\n\n" +
      "*Lo que ya hice en este grupo (últimos 30 días):*\n" +
      `• 📊 *${stats.reports}* reportes de jornada capturados\n` +
      `• ✅ *${stats.commitments}* compromisos trackeados\n` +
      `• 🔍 *${stats.ig_mentions}* menciones de IG cruzadas\n` +
      `• 🏖️ *${stats.days_off}* días libres registrados\n\n` +
      CAPABILITIES_BLOCK
    );

  await sendToGroup(groupId, body2);

  // 3) CTA con 4 comandos demo (cubren las 4 capacidades clave)
  await sleep(1200);
  await sendToGroup(groupId,
    "👇 *Probame con cualquiera:*\n\n" +
    "🕐 `@maven horarios de hoy`\n" +
    "✅ `@maven qué pendientes hay`\n" +
    "🔍 `@maven historial de @<handle>`\n" +
    "📊 `@maven cómo va el equipo`\n\n" +
    "_o cualquier pregunta libre sobre el equipo._"
  );
}

const HELP_REPLY =
  "*Comandos rápidos:*\n\n" +
  "• `@maven preséntate` — explico qué hago\n" +
  "• `@maven horarios` — quién trabaja hoy\n" +
  "• `@maven horario de [nombre]`\n" +
  "• `@maven busca [@handle o teléfono]`\n" +
  "• `@maven historial de [@handle]` — si pasó por la agencia antes\n" +
  "• `@maven qué pendientes tiene [nombre]`\n" +
  "• `@maven audita el grupo` — cruzo los últimos 30 días con Maven\n" +
  "• `@maven cierre del día` — resumen del turno en vivo\n\n" +
  "_Para reportes y anuncios de día libre, escribilo normal — los capto solo._";

function fireAudit(groupId: string, requestedBy: string | null): void {
  const url = `${PROJECT_URL}/functions/v1/whatsapp-audit-history`;
  const token = Deno.env.get("CRON_INTERNAL_TOKEN") ?? "";
  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Cron-Token": token },
    body: JSON.stringify({ group_id: groupId, since_days: 30, requested_by: requestedBy }),
  }).catch((e) => console.warn("fireAudit failed:", (e as Error).message));
}

// Quick command "@maven cierre del día" → invoca al agent en modo
// eod_summary on-demand. El agent lee el día + Maven y postea el reporte.
function fireEodOnDemand(groupId: string): void {
  const url = `${PROJECT_URL}/functions/v1/whatsapp-agent`;
  const token = Deno.env.get("CRON_INTERNAL_TOKEN") ?? "";
  fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!}`,
      "X-Cron-Token": token,
    },
    body: JSON.stringify({
      group_id: groupId,
      report_kind: "eod_summary",
      invoked_by: "quick_command_eod",
    }),
  }).catch((e) => console.warn("fireEodOnDemand failed:", (e as Error).message));
}

// LID(s) interno(s) del bot en WhatsApp. Cuando alguien menciona al bot
// usando el "@" picker, WhatsApp inserta el LID numérico en el body
// (formato "@140716701401153") en lugar del display name. Sin detectar
// esto, el bot no veía la mention y respondía con modo 'auto' (que a
// veces decide quedarse callado).
//
// Configurable via env BOT_LIDS (CSV) por si en el futuro el bot cambia
// de número o agregamos más instancias.
const BOT_LIDS: string[] = (Deno.env.get("BOT_LIDS") ?? "140716701401153")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// Detecta si el body menciona al bot. Usado en modo 'mention' (default).
//
// IMPORTANTE: WhatsApp prefija el display name con `~` cuando el contacto
// que se menciona NO está agendado en la lista de contactos del que escribe.
// Por eso el body puede llegar como "@~Maven" en lugar de "@maven" — hay que
// matchear ambos. Tambien soportamos espacios y mayúsculas mixtas.
//
// Además matcheamos el LID del bot directamente (WhatsApp lo inserta así
// cuando el contacto no está agendado por nombre).
function hasMention(body: string | null): boolean {
  if (!body) return false;
  // Regex: @ + opcional ~ + 0..2 spaces + maven (case insensitive)
  if (/@\s*~?\s*maven\b/i.test(body)) return true;
  if (/@\s*~?\s*bot\b/i.test(body)) return true;
  // Match directo del LID del bot: "@140716701401153" o "@140716701401153@lid"
  for (const lid of BOT_LIDS) {
    if (body.includes(`@${lid}`)) return true;
  }
  // Variantes sin @ pero referencia explícita.
  const lower = body.toLowerCase();
  return (
    lower.includes("maven bot") ||
    lower.includes("maven asistente") ||
    lower.includes("@maven_bot")
  );
}

// IDs del bot para detectar MENCIONES REALES (cuando alguien lo etiqueta con
// el "@" picker en vez de tipear "@maven"). WhatsApp mete el JID/LID del bot
// en mentionedJid (NO el texto "maven"), así que el regex de hasMention no lo
// veía y el bot quedaba en visto. Incluimos su LID y su número porque WhatsApp
// puede usar cualquiera de los dos. Configurable via env BOT_MENTION_IDS (CSV).
const BOT_MENTION_IDS: string[] = (Deno.env.get("BOT_MENTION_IDS") ?? "140716701401153,573225218180")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function mentionsBotReal(mentions: string[] | undefined): boolean {
  if (!mentions || mentions.length === 0) return false;
  return mentions.some((m) => BOT_MENTION_IDS.includes(m));
}

// ¿El bot está siendo aludido? Por TEXTO ("@maven" tipeado) O por MENCIÓN REAL
// (etiquetado con el "@" picker → mentionedJid). Cubrir ambos es lo que evita
// que un @mention legítimo quede sin respuesta.
function isBotAddressed(body: string | null, mentions: string[] | undefined): boolean {
  return hasMention(body) || mentionsBotReal(mentions);
}

// Decide si invocar al agent y por qué motivo. Devuelve null si no hay que
// invocar. Si devuelve un reason, fireAgent lo manda al edge function para
// que el system prompt decida cómo comportarse.
//
// Para modo 'always' chequeamos también si el grupo está en horario laboral
// vía RPC `whatsapp_group_in_business_hours`. Fuera de horario, el modo
// always degrada efectivamente a mention-only — ahorra tokens en bursts
// nocturnos / fines de semana sin miembros activos.
async function resolveAgentTrigger(
  sb: SupabaseClient,
  group: { id: string; bot_enabled: boolean; bot_mode: string },
  body: string | null,
  isFromBot: boolean,
  mentions?: string[],
): Promise<"mention" | "auto" | null> {
  if (!group.bot_enabled) return null;
  if (isFromBot) return null; // nunca respondemos a nuestros propios mensajes
  if (group.bot_mode === "off") return null;

  if (isBotAddressed(body, mentions)) return "mention";

  // En modo always, el agent se invoca con cualquier mensaje y decide él
  // si vale la pena responder. Filtros baratos en el ingest para no quemar
  // tokens:
  //   1) mensajes muy cortos (saludos, emojis, "ok", "👍") se skipean
  //   2) fuera de horario laboral, no se invoca (solo mention)
  if (group.bot_mode === "always") {
    const trimmed = (body ?? "").trim();
    if (trimmed.length < 4) return null;

    const { data: inHours, error } = await sb.rpc("whatsapp_group_in_business_hours", { p_group_id: group.id });
    if (error) {
      console.warn("business_hours RPC failed, defaulting to active:", error.message);
      return "auto"; // failsafe: si la RPC falla, seguimos auto (no romper el bot)
    }
    if (!inHours) return null; // fuera de horario → bot calla
    return "auto";
  }

  return null;
}

function fireAgent(messageId: string, groupId: string, reason: "mention" | "auto"): void {
  const url = `${PROJECT_URL}/functions/v1/whatsapp-agent`;
  const token = Deno.env.get("CRON_INTERNAL_TOKEN") ?? "";
  fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Cron-Token": token,
    },
    body: JSON.stringify({ message_id: messageId, group_id: groupId, invoked_by: reason }),
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

  // ── ACK / palomitas (estado de entrega) ──────────────────────────────
  // El gateway manda { event:'messages.update', instance, statusUpdates:[{id,status}] }
  // con los recibos de Baileys (server/delivered/read) de NUESTROS salientes.
  // Avanzamos wa_conversation_messages.status (match por external_id = key.id),
  // sin retroceder (sent→delivered→read); 'failed' solo si seguía en 'sent'.
  if (payload && typeof payload === "object" && Array.isArray((payload as { statusUpdates?: unknown }).statusUpdates)) {
    const sb = adminClient();
    const updates = (payload as { statusUpdates: Array<{ id?: string; status?: string }> }).statusUpdates;
    const RANK: Record<string, number> = { sent: 1, delivered: 2, read: 3 };
    let applied = 0;
    for (const u of updates) {
      if (!u?.id || !u?.status) continue;
      const { data: rows } = await (sb as any)
        .from("wa_conversation_messages")
        .select("id, status")
        .eq("external_id", u.id)
        .eq("direction", "out")
        .limit(1);
      const row = rows?.[0] as { id: string; status: string } | undefined;
      if (!row) continue;
      if (u.status === "failed") {
        if (row.status !== "sent") continue; // no pisar delivered/read
      } else {
        const cur = RANK[row.status] ?? 1;
        const next = RANK[u.status];
        if (!next || next <= cur) continue; // solo avanzar el estado
      }
      await (sb as any).from("wa_conversation_messages").update({ status: u.status }).eq("id", row.id);
      applied++;
    }
    return new Response(JSON.stringify({ ok: true, status_applied: applied }), {
      status: 200, headers: { ...whatsappCors, "Content-Type": "application/json" },
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

  // DM al bot (mensaje privado, no de grupo). Lo procesamos por un path
  // distinto — esto es la verificación del phone que mandamos al user
  // cuando carga su número en Settings. No insertamos en whatsapp_messages
  // ni disparamos extractor/agent: los DMs son auth-only por ahora.
  if (msg.isDirect) {
    // Inbox (Slice 2): persistir el DM 1:1 entrante en las tablas wa_* (additive,
    // best-effort — no afecta la verificación ni rompe la ingesta si falla).
    await persistInboxMessage(sb, msg).catch((e) => console.warn("persistInboxMessage:", (e as Error).message));
    const result = await processDirectMessage(sb, msg);
    await logEvent(sb, {
      tenantId: null,
      kind: result.kind,
      payload: {
        sender: msg.senderDisplayName ?? msg.senderExternalId,
        user_id: result.user_id,
        body_preview: (msg.body ?? "").slice(0, 100),
      },
    });
    return new Response(JSON.stringify({ ok: true, kind: result.kind }), {
      status: 200,
      headers: { ...whatsappCors, "Content-Type": "application/json" },
    });
  }

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

  // Si el mensaje es un check-in de inicio de turno ("ya activo", "dispo", etc),
  // registralo en supervisor_state para que la regla de "ausencia no anunciada"
  // sepa que la persona ya entró. Idempotente por (user_id, día).
  maybeRegisterCheckIn(sb, msg, memberId).catch(() => {});

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

      // Quick commands antes que nada: si el mensaje es presentate/help,
      // respondemos hardcodeado y skip al agent. Solo aplica si está
      // mencionado al bot (para no responder presentaciones a mensajes random).
      if (isBotAddressed(msg.body, msg.mentions) && group.bot_enabled) {
        const cmd = detectQuickCommand(msg.body);
        if (cmd === "presentate") {
          // Fire-and-forget el flow multi-mensaje. Awaiteamos para que el
          // edge function no se cierre antes de mandar los 3 mensajes
          // (~3s total). Evolution acepta respuesta hasta 5s.
          await firePresentationFlow(sb, group.id);
          const body: IngestResponse = { ok: true, message_id: messageId };
          return new Response(JSON.stringify(body), {
            status: 200,
            headers: { ...whatsappCors, "Content-Type": "application/json" },
          });
        }
        if (cmd === "help") {
          await sendToGroup(group.id, HELP_REPLY);
          const body: IngestResponse = { ok: true, message_id: messageId };
          return new Response(JSON.stringify(body), {
            status: 200,
            headers: { ...whatsappCors, "Content-Type": "application/json" },
          });
        }
        if (cmd === "eod") {
          // Fire-and-forget al agent en modo eod_summary. El agent investiga
          // mensajes del día + Maven + manda el reporte via reply_to_group.
          fireEodOnDemand(group.id);
          const body: IngestResponse = { ok: true, message_id: messageId };
          return new Response(JSON.stringify(body), {
            status: 200,
            headers: { ...whatsappCors, "Content-Type": "application/json" },
          });
        }
        if (cmd === "audit") {
          // Fire-and-forget el audit (puede tardar 1-2 min). El audit
          // function ya manda mensajes al grupo (inicio + resumen final).
          fireAudit(group.id, msg.senderDisplayName ?? null);
          const body: IngestResponse = { ok: true, message_id: messageId };
          return new Response(JSON.stringify(body), {
            status: 200,
            headers: { ...whatsappCors, "Content-Type": "application/json" },
          });
        }
      }

      // Trigger del agent: mention | auto | null según bot_mode del grupo.
      const trigger = await resolveAgentTrigger(sb, group, msg.body, msg.isFromBot ?? false, msg.mentions);
      if (trigger) {
        // ¿Es la PRIMERA invocación del día tras una pausa larga?
        // (ej. arranca el horario laboral después de la noche, weekend, etc).
        // Si el bot estuvo dormido >6h, primero le mandamos un "night_catchup"
        // para que lea los mensajes nocturnos y procese acciones perdidas
        // (reglas, reportes, decisiones del owner, anuncios de día off).
        // Después fire el trigger normal para responder al mensaje actual.
        try {
          const { data: lastBotMsg } = await sb
            .from("whatsapp_messages")
            .select("sent_at")
            .eq("group_id", group.id)
            .eq("is_from_bot", true)
            .order("sent_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          const hoursSinceLastBot = lastBotMsg?.sent_at
            ? (Date.now() - new Date(lastBotMsg.sent_at).getTime()) / 3_600_000
            : 99;
          if (hoursSinceLastBot > 6) {
            // Claim ATÓMICO: solo la PRIMERA invocación del día dispara el catchup.
            // Sin esto, varios "buenos días" casi simultáneos disparaban night_catchup
            // N veces — la apertura tarda unos segundos en generarse, así que para todos
            // esos mensajes el "último mensaje del bot" seguía siendo el de ayer (>6h) →
            // APERTURA DUPLICADA (pasó el 04/06: 2 aperturas a 20s). El PK
            // (group_id, catchup_date) de whatsapp_catchup_claims garantiza una sola por
            // grupo/día: el primer mensaje gana el INSERT y dispara; los demás chocan con
            // el PK (error) y se saltean.
            const today = new Date().toISOString().slice(0, 10);
            const { error: claimErr } = await sb
              .from("whatsapp_catchup_claims")
              .insert({ group_id: group.id, catchup_date: today });
            if (!claimErr) {
              // Ganamos el claim → fire-and-forget; el agent lee todo lo nocturno
              // antes de responder al mensaje actual.
              fireAgent(messageId, group.id, "night_catchup" as "auto");
            }
          }
        } catch (e) {
          console.warn("night_catchup check failed:", (e as Error).message);
        }
        fireAgent(messageId, group.id, trigger);
      }
    }
  }

  const body: IngestResponse = { ok: true, message_id: messageId };
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...whatsappCors, "Content-Type": "application/json" },
  });
});
