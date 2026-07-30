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
  // JIDs/LIDs mencionados (menciones REALES vía "@" picker), normalizados al
  // id numérico (sin sufijo @s.whatsapp.net / @lid). Vacío si no hay menciones.
  mentions?: string[];
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
  // Aceptamos:
  //   - Grupos: @g.us
  //   - DMs con teléfono real: @s.whatsapp.net (WhatsApp viejo)
  //   - DMs con LID anónimo: @lid (WhatsApp moderno, post-2025-ish — anonimiza
  //     incluso DMs 1-a-1 a un bot que no está agendado como contacto)
  // Las status updates (@broadcast) y otros tipos los ignoramos.
  const isGroup = remoteJid.endsWith("@g.us");
  const isDirect = remoteJid.endsWith("@s.whatsapp.net") || remoteJid.endsWith("@lid");
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
    // DM: el sender es el otro lado. WhatsApp moderno (Baileys 7.x) direcciona
    // por @lid (anónimo) aunque sea 1-a-1, PERO trae el teléfono REAL en
    // key.remoteJidAlt. Preferimos el número real para que el MISMO usuario no
    // se duplique como dos contactos: el @lid de su mensaje ENTRANTE vs el
    // número con el que el closer le abrió el chat (SALIENTE). Sin esto, un
    // lead que responde aparece como un contacto nuevo (su @lid) en vez de su
    // conversación real. Fallback al remoteJid si no hay alt numérico.
    const altJid = String((key.remoteJidAlt as string | undefined) ?? "");
    participant = remoteJid.endsWith("@lid") && altJid.endsWith("@s.whatsapp.net")
      ? altJid
      : remoteJid;
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

  // contextInfo lleva el quote (reply) Y las menciones reales (mentionedJid).
  // Puede venir en extendedTextMessage (texto) o en captions (image/video).
  const ctxOf = (m: unknown) =>
    (m as Record<string, unknown> | undefined)?.contextInfo as Record<string, unknown> | undefined;
  const ctx = ctxOf(message.extendedTextMessage) ?? ctxOf(message.imageMessage) ?? ctxOf(message.videoMessage);
  const replyToExternalId = ctx?.stanzaId as string | undefined ?? null;
  // Menciones REALES: cuando alguien etiqueta con el "@" picker, WhatsApp mete
  // el JID/LID del mencionado (no el texto del nombre) en mentionedJid.
  // Normalizamos al id numérico para comparar fácil (ver isBotAddressed).
  const mentionedJid = ctx?.mentionedJid;
  const mentions = Array.isArray(mentionedJid)
    ? (mentionedJid as unknown[]).map((j) => String(j).split("@")[0].trim()).filter(Boolean)
    : [];

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
    mentions,
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
// Origin permitido para CORS. Por defecto el frontend de prod; configurable con la
// env var CORS_ALLOW_ORIGIN (p.ej. "*" o "http://localhost:8080" si en dev llamás
// las edges desde localhost). Antes era "*" (abierto a cualquier sitio).
const CORS_ALLOW_ORIGIN = Deno.env.get("CORS_ALLOW_ORIGIN") ?? "https://maven.asmtech.ai";
export const whatsappCors = {
  "Access-Control-Allow-Origin": CORS_ALLOW_ORIGIN,
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-token, x-evolution-token",
  "Vary": "Origin",
};

// ----------------------------------------------------------------------------
// sniffMimeFromBytes — detecta el MIME real mirando los magic bytes del
// archivo descargado. Evolution API devuelve `application/octet-stream` en
// el header HTTP para audios/imágenes, lo que rompe Whisper (Groq) y Gemini
// Vision. Esta función inspecciona los primeros bytes y devuelve un MIME
// confiable. Si no matchea ningún formato conocido, devuelve null y el
// caller decide qué hacer (típicamente fallback al header HTTP o un default).
//
// Soporta: PNG, JPEG, GIF, WebP, OGG (Opus en WhatsApp), MP3, WAV, MP4/M4A.
// ----------------------------------------------------------------------------
export function sniffMimeFromBytes(bytes: Uint8Array): string | null {
  if (bytes.length < 12) return null;

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) {
    return "image/png";
  }
  // JPEG: FF D8 FF
  if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) {
    return "image/jpeg";
  }
  // GIF: 47 49 46 38 (GIF8)
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) {
    return "image/gif";
  }
  // RIFF container: bytes 0-3 = "RIFF", bytes 8-11 = format ("WEBP" o "WAVE")
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) {
    if (bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
      return "image/webp";
    }
    if (bytes[8] === 0x57 && bytes[9] === 0x41 && bytes[10] === 0x56 && bytes[11] === 0x45) {
      return "audio/wav";
    }
  }
  // OGG: 4F 67 67 53 (OggS). WhatsApp manda Opus dentro de OGG.
  if (bytes[0] === 0x4F && bytes[1] === 0x67 && bytes[2] === 0x67 && bytes[3] === 0x53) {
    return "audio/ogg";
  }
  // MP3 con ID3 tag: "ID3"
  if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
    return "audio/mpeg";
  }
  // MP3 frame sync: FF Fx (Fx = FB/FA/F3/F2)
  if (bytes[0] === 0xFF && (bytes[1] & 0xE0) === 0xE0) {
    return "audio/mpeg";
  }
  // MP4/M4A: bytes 4-7 = "ftyp"
  if (bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) {
    // Distinguimos audio (M4A) vs video (MP4) por brand bytes 8-11.
    // Brands de audio: "M4A " (4D 34 41 20), "M4B " (...). Default a m4a.
    if (bytes[8] === 0x4D && bytes[9] === 0x34) return "audio/mp4";
    return "video/mp4";
  }
  return null;
}

// Helper combinado: dado un MIME del header HTTP + los bytes, devuelve el
// MIME más confiable. Si el header dice octet-stream o está vacío, sniffea.
export function resolveMimeType(
  headerMime: string | null | undefined,
  bytes: Uint8Array,
  defaultMime: string,
): string {
  const cleaned = (headerMime ?? "").split(";")[0].trim().toLowerCase();
  // Si el header da algo confiable (image/* o audio/* específico), lo usamos.
  if (cleaned && cleaned !== "application/octet-stream" && cleaned !== "binary/octet-stream") {
    return cleaned;
  }
  // Si no, sniffeamos.
  const sniffed = sniffMimeFromBytes(bytes);
  return sniffed ?? defaultMime;
}

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

// ----------------------------------------------------------------------------
// Detección de mención al bot — FUENTE ÚNICA
// ----------------------------------------------------------------------------
// Vivía duplicada: whatsapp-ingest tenía esta versión (LID + "~" + variantes) y
// whatsapp-analyze-image una propia, mucho más pobre, que solo miraba el OCR y
// buscaba los literales "@maven"/"@bot". Por esa divergencia, en un grupo en modo
// `mention` NINGUNA imagen con mención llegaba al agente: WhatsApp serializa la
// mención como el LID numérico ("@140716701401153") y la pone en el CAPTION, no
// adentro de los píxeles. Caso real 30/07: Daniel posteó su primer número obtenido
// del día como screenshot y el bot nunca se enteró — ni siquiera se lo invocó.
// Cualquier consumidor nuevo tiene que usar ESTA función, nunca su propia copia.

// LID(s) interno(s) del bot en WhatsApp. Cuando alguien lo menciona con el picker
// "@", WhatsApp inserta el LID numérico en el body en lugar del display name.
// Configurable via env BOT_LIDS (CSV) por si cambia de número o hay más instancias.
export const BOT_LIDS: string[] = (Deno.env.get("BOT_LIDS") ?? "140716701401153")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// IMPORTANTE: WhatsApp prefija el display name con `~` cuando el contacto que se
// menciona NO está agendado por quien escribe. Por eso el body puede llegar como
// "@~Maven" en vez de "@maven" — hay que matchear ambos, con espacios y mayúsculas
// mixtas. Pasale TODO el texto disponible (caption + OCR + transcripción), no una
// sola fuente.
export function hasBotMention(...textos: Array<string | null | undefined>): boolean {
  const body = textos.filter(Boolean).join("\n");
  if (!body) return false;
  if (/@\s*~?\s*maven\b/i.test(body)) return true;
  if (/@\s*~?\s*bot\b/i.test(body)) return true;
  for (const lid of BOT_LIDS) {
    if (body.includes(`@${lid}`)) return true;
  }
  const lower = body.toLowerCase();
  return (
    lower.includes("maven bot") ||
    lower.includes("maven asistente") ||
    lower.includes("@maven_bot")
  );
}

// ----------------------------------------------------------------------------
// Redacción de teléfonos en mensajes SALIENTES a grupos
// ----------------------------------------------------------------------------
// Maven oculta los teléfonos por permiso (can_see_contact_phone, default-deny) y la UI usa
// WaChatButton justamente para no mostrar dígitos. Pero el bot corre con service_role y
// escribe texto libre: el 30/07, al reconocerle a un LLG su primer número del día, publicó
// el teléfono de la lead en el grupo entero — dos veces. Cualquiera en el grupo, incluida
// gente sin permiso de ver teléfonos, se lo lleva.
//
// Por eso la guarda va en el BORDE de salida y no en el prompt: una instrucción se puede
// ignorar, esto no. Solo aplica a GRUPOS, no a DMs. Ver pii_leak_audit_2026_06: enmascarar
// en la UI no es seguridad, el control tiene que estar donde los datos salen del sistema.
const URL_RE = /https?:\/\/\S+/gi;
// ⚠️ Las MENCIONES son LIDs de ~15 dígitos ("@143250161664036", a veces "@…@lid"). Sin
// protegerlas, el detector las toma por teléfono y las redacta → se rompen todos los pings
// del bot. Se protegen igual que las URLs, antes de buscar teléfonos.
const MENCION_RE = /@\d+(?:@lid)?/g;
// Candidato: dígitos con separadores típicos (espacio, guion, punto, paréntesis) y "+"
// opcional. El filtrado fino se hace después, match por match, en pareceTelefono().
const TEL_CAND_RE = /\+?\(?\d[\d\s().-]{5,}\d\)?/g;

function pareceTelefono(s: string): boolean {
  if (s.includes(",")) return false; // "$3,443" · "1,234 followers"
  const digitos = s.replace(/\D/g, "");
  if (digitos.length < 7 || digitos.length > 15) return false;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s.trim())) return false; // fecha ISO
  // Series cortas separadas ("cadencia 1-3-5-8-15-29"): sin ningún bloque de 3+ dígitos.
  const bloqueMasLargo = Math.max(...(s.match(/\d+/g) ?? [""]).map((b) => b.length));
  return bloqueMasLargo >= 3;
}

// Deja los ultimos 4 digitos y tapa el resto con asteriscos, uno por digito oculto.
function enmascarar(s: string): string {
  const d = s.replace(/\D/g, "");
  return "*".repeat(Math.max(0, d.length - 4)) + d.slice(-4);
}

/**
 * Enmascara telefonos dejando visibles solo los ULTIMOS 4 digitos (ej "******6868"), asi el
 * equipo puede identificar de cual numero se habla sin que el numero quede publicado.
 * Preserva URLs y menciones: llevan digitos y no son telefonos.
 */
export function redactPhones(texto: string): string {
  if (!texto) return texto;
  const guardados: string[] = [];
  const guardar = (s: string): string => {
    guardados.push(s);
    // Token sin digitos pegados, para que TEL_CAND_RE no lo confunda con un telefono.
    return `⟦${guardados.length - 1}⟧`;
  };
  const conPlaceholders = texto
    .replace(URL_RE, guardar)
    .replace(MENCION_RE, guardar);
  const limpio = conPlaceholders.replace(TEL_CAND_RE, (m) => (pareceTelefono(m) ? enmascarar(m) : m));
  return limpio.replace(/⟦(\d+)⟧/g, (_x, i) => guardados[Number(i)]);
}
