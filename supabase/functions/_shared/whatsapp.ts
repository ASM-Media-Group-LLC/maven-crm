// Helpers compartidos para las edge functions de WhatsApp.
//
// El bot puede recibir mensajes de varios providers (Evolution API,
// Baileys self-host, futuro WhatsApp Business API oficial). En vez de
// atar el código a un provider concreto, definimos un formato canónico
// IncomingMessage y un adapter por provider que convierte su payload
// crudo a IncomingMessage.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface IncomingMessage {
  // ID del mensaje según el provider — usado para idempotencia.
  externalId: string;
  // JID del grupo (cuando es de grupo). Para DMs queda como "" — el flag
  // isDirect te dice cuál de los dos casos es.
  groupExternalId: string;
  groupName?: string;
  // Para grupos: el JID/LID del participante real (key.participant).
  // Para DMs: el JID del user (remoteJid = "<phone>@s.whatsapp.net").
  senderExternalId: string;
  senderDisplayName?: string;
  body: string | null;
  msgType: "text" | "audio" | "image" | "video" | "document" | "sticker" | "system";
  mediaUrl?: string | null;
  replyToExternalId?: string | null;
  sentAt: string;
  isFromBot?: boolean;
  // True si es un DM privado al bot (no de grupo). En DMs el remoteJid
  // es el teléfono real del user → podemos resolver phone_e164 directo.
  isDirect?: boolean;
  raw: unknown;
}

// ----------------------------------------------------------------------------
// Adapter: Evolution API
// ----------------------------------------------------------------------------
// Evolution manda webhooks con shape:
//   {
//     event: "messages.upsert",
//     instance: "<instance-name>",
//     data: {
//       key: { remoteJid: "120363xxx@g.us", id: "ABC123", fromMe: false },
//       pushName: "Miguel",
//       message: { conversation: "Hola" } | { extendedTextMessage: { text } },
//       messageTimestamp: 1716700000,
//       participant: "549xxx@s.whatsapp.net"
//     }
//   }
//
// Soporta los message types más comunes. Para tipos no manejados devuelve
// null y la edge function lo loggea como skipped.
export function parseEvolutionApiMessage(payload: unknown): IncomingMessage | null {
  const p = payload as Record<string, unknown> | null;
  if (!p || typeof p !== "object") return null;
  const data = p.data as Record<string, unknown> | undefined;
  if (!data) return null;

  const key = data.key as Record<string, unknown> | undefined;
  if (!key) return null;

  const remoteJid = String(key.remoteJid ?? "");
  // Aceptamos tanto grupos (@g.us) como DMs privados (@s.whatsapp.net).
  // Las status updates (@broadcast) y otros tipos los ignoramos.
  const isGroup = remoteJid.endsWith("@g.us");
  const isDirect = remoteJid.endsWith("@s.whatsapp.net");
  if (!isGroup && !isDirect) return null;

  const externalId = String(key.id ?? "");
  if (!externalId) return null;

  const fromMe = key.fromMe === true;
  // Identificador del sender:
  // - Para grupos: key.participant (LID anónimo en WhatsApp moderno).
  //   Fallback a data.participant para versiones viejas de Evolution.
  // - Para DMs: el remoteJid mismo (que es "<phone>@s.whatsapp.net" — el
  //   teléfono real del user, sin anonimizar porque WhatsApp lo expone
  //   cuando es 1-a-1).
  let participant: string;
  if (isGroup) {
    participant = String(
      (key.participant as string | undefined) ??
      (data.participant as string | undefined) ??
      remoteJid ??
      ""
    );
  } else {
    // DM: el sender es el otro lado de la conversación.
    participant = remoteJid;
  }

  const message = (data.message ?? {}) as Record<string, unknown>;
  let body: string | null = null;
  let msgType: IncomingMessage["msgType"] = "text";
  let mediaUrl: string | null = null;

  if (typeof message.conversation === "string") {
    body = message.conversation;
  } else if (message.extendedTextMessage && typeof (message.extendedTextMessage as Record<string, unknown>).text === "string") {
    body = String((message.extendedTextMessage as Record<string, unknown>).text);
  } else if (message.audioMessage) {
    msgType = "audio";
    body = "[audio]";
    mediaUrl = (message.audioMessage as Record<string, unknown>).url as string | null ?? null;
  } else if (message.imageMessage) {
    msgType = "image";
    body = ((message.imageMessage as Record<string, unknown>).caption as string) ?? "[imagen]";
    mediaUrl = (message.imageMessage as Record<string, unknown>).url as string | null ?? null;
  } else if (message.videoMessage) {
    msgType = "video";
    body = ((message.videoMessage as Record<string, unknown>).caption as string) ?? "[video]";
    mediaUrl = (message.videoMessage as Record<string, unknown>).url as string | null ?? null;
  } else if (message.documentMessage) {
    msgType = "document";
    body = ((message.documentMessage as Record<string, unknown>).fileName as string) ?? "[documento]";
    mediaUrl = (message.documentMessage as Record<string, unknown>).url as string | null ?? null;
  } else if (message.stickerMessage) {
    msgType = "sticker";
    body = "[sticker]";
  } else {
    // Tipo no soportado (reactions, polls, etc) — lo skipeamos.
    return null;
  }

  const ts = typeof data.messageTimestamp === "number"
    ? data.messageTimestamp
    : (typeof data.messageTimestamp === "string" ? parseInt(data.messageTimestamp, 10) : null);
  const sentAt = ts ? new Date(ts * 1000).toISOString() : new Date().toISOString();

  // Quoted message (reply).
  const ctx = (message.extendedTextMessage as Record<string, unknown> | undefined)?.contextInfo as
    Record<string, unknown> | undefined;
  const replyToExternalId = ctx?.stanzaId as string | undefined ?? null;

  return {
    externalId,
    // Para DMs no hay grupo — dejamos string vacío.
    groupExternalId: isGroup ? remoteJid : "",
    groupName: isGroup ? ((data.groupSubject as string | undefined) ?? undefined) : undefined,
    senderExternalId: participant,
    senderDisplayName: (data.pushName as string | undefined) ?? undefined,
    body,
    msgType,
    mediaUrl,
    replyToExternalId,
    sentAt,
    isFromBot: fromMe,
    isDirect,
    raw: payload,
  };
}

// ----------------------------------------------------------------------------
// Adapter: payload genérico (para testing / providers custom)
// ----------------------------------------------------------------------------
// Acepta directamente un objeto que ya cumple con IncomingMessage. Útil
// para testing manual y para providers que se integran via un proxy
// interno que ya hace la traducción.
export function parseGenericMessage(payload: unknown): IncomingMessage | null {
  const p = payload as Record<string, unknown> | null;
  if (!p || typeof p !== "object") return null;
  if (typeof p.externalId !== "string" || !p.externalId) return null;
  if (typeof p.groupExternalId !== "string" || !p.groupExternalId) return null;
  if (typeof p.senderExternalId !== "string" || !p.senderExternalId) return null;
  if (!p.sentAt) return null;
  return p as unknown as IncomingMessage;
}

// ----------------------------------------------------------------------------
// adminClient — service-role client (bypass RLS)
// ----------------------------------------------------------------------------
export function adminClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(url, key);
}

// ----------------------------------------------------------------------------
// logEvent — escribe en whatsapp_bot_events sin fallar el caller.
// ----------------------------------------------------------------------------
export async function logEvent(
  sb: SupabaseClient,
  args: {
    // tenant_id es nullable a propósito: eventos huérfanos (webhook de
    // grupo no registrado todavía, payload no parseable) se loguean sin
    // tenant. RLS sigue filtrando por current_tenant_id() en SELECT, así
    // que un usuario normal nunca ve estos huérfanos — solo service_role.
    tenantId: string | null;
    groupId?: string | null;
    kind: string;
    payload?: Record<string, unknown>;
  },
): Promise<void> {
  try {
    // OJO: supabase-js NO tira excepción en FK/check violations — devuelve
    // `{ error }`. Hay que loguearlo a mano si no queremos perderlo.
    const { error } = await sb.from("whatsapp_bot_events").insert({
      tenant_id: args.tenantId,
      group_id: args.groupId ?? null,
      kind: args.kind,
      payload: args.payload ?? {},
    });
    if (error) console.warn("logEvent insert error:", error.message, error.details);
  } catch (e) {
    console.warn("logEvent failed:", (e as Error).message);
  }
}

// ----------------------------------------------------------------------------
// CORS — incluye el header x-cron-token para que el cron interno pueda
// invocar estas functions sin JWT.
// ----------------------------------------------------------------------------
export const whatsappCors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-token, x-evolution-token",
};

// ----------------------------------------------------------------------------
// authorizeCronOrJwt — chequea x-cron-token contra CRON_INTERNAL_TOKEN,
// o cualquier Bearer JWT decente. Igual que en qa-analyze.
// ----------------------------------------------------------------------------
export function authorizeCronOrJwt(req: Request): boolean {
  const cronToken = req.headers.get("X-Cron-Token");
  const expected = Deno.env.get("CRON_INTERNAL_TOKEN") ?? "";
  if (expected && cronToken === expected) return true;
  const auth = req.headers.get("Authorization") ?? "";
  return auth.toLowerCase().startsWith("bearer ") && auth.length > 20;
}
