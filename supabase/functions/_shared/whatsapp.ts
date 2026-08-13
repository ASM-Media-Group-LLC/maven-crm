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
// Deep links que EXISTEN para llevar un teléfono: el número se enmascara ANTES de
// proteger URLs (URL_RE guardaba el link entero y el número salía publicado — fuga
// verificada con wa.me y api.whatsapp.com; t.me/+ es el espejo de Telegram del roadmap).
// Tolera "+", "%2B" (el + urlencodeado) y separadores a mano ("wa.me/57-300-123-4567").
// El link deja de ser clickeable: el número es exactamente el dato a ocultar.
const LINK_TEL_RE = /(\b(?:wa\.me\/|t\.me\/\+|phone=)(?:%2B|\+)?)((?:[-().]*\d){7,})/gi;
// Candidato: dígitos con separadores típicos y "+" opcional. Tres decisiones con historia:
// · (?<![\p{L}@]): dígitos pegados a una letra o a un @ son parte de un IDENTIFICADOR
//   ("@dani2603592" quedó "@dani***3592" cinco veces el 01-04/08). Se excluye la letra
//   pero NO el guion bajo: "_3001234567_" es un teléfono en cursiva de WhatsApp, y el
//   lookbehind (?<![\w@]) de antes lo dejaba FUGAR porque "_" es \w.
// · La clase NO incluye \n: un teléfono no se parte en dos líneas, pero una COLUMNA de
//   montos sí ("20.277\n15.202\n30.100" se puenteaba entera → "***********0100").
// · U+2011 (guion no separable) y U+202A/C (wrappers bidi) vienen en teléfonos pegados
//   desde iOS/fichas de contacto y partían el match dejando el número SIN enmascarar.
// El filtrado fino se hace después, match por match y con contexto, en redactarCandidato().
const TEL_CAND_RE = /(?<![\p{L}@])\+?\(?\d[\d \t ().‑‪‬-]{5,}\d\)?/gu;

function pareceTelefono(s: string): boolean {
  // (el viejo check de coma era código muerto: la coma no está en TEL_CAND_RE, así que
  // ningún match puede traerla — "$3,443" se salva porque la coma CORTA el match)
  const digitos = s.replace(/\D/g, "");
  if (digitos.length < 7 || digitos.length > 15) return false;
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
 * Decide qué hacer con UN candidato mirando su contexto inmediato: `antes` es el carácter
 * pegado a la izquierda del match, `despues` lo que sigue pegado a la derecha.
 *
 * El porqué: el bot escribe la plata en formato es-CO ("$10.478", "1.234.567") y las
 * caídas como "(-48%)". Como "(", "-", "." y el espacio son también separadores válidos
 * de teléfono, el candidato saltaba del monto al porcentaje ("10.478 (-48" = 7 dígitos)
 * y se enmascaraba: el 31/07 destruyó dos cifras del pedido de escalada en Managers
 * ("$10.478 (-48%)" → "$***7848%)"). Un umbral por cantidad de dígitos no alcanza — la
 * diferencia confiable está en lo que hay PEGADO al match. Los vetos son quirúrgicos a
 * propósito: fuga de PII pesa más que falso positivo de plata, así que un teléfono cerca
 * de un "$" (pero no pegado) se sigue enmascarando.
 */
function redactarCandidato(m: string, antes: string, despues: string): string {
  // ── Veto 0: paréntesis envolvente ───────────────────────────────────────────
  // "(1.234.567)" contable o "(+573001234567)" de roster: se evalúa el interior con
  // los mismos vetos y se re-envuelve. Así el monto entre paréntesis queda vivo y el
  // teléfono entre paréntesis se enmascara igual.
  if (m.length > 2 && m.startsWith("(") && m.endsWith(")") && !m.slice(1, -1).includes("(")) {
    return "(" + redactarCandidato(m.slice(1, -1), "(", ")") + ")";
  }

  // ── Veto 1: cola porcentual ─────────────────────────────────────────────────
  // El match muere justo donde arranca un "%": "10.478 (-48" + "%". Tolera el espacio
  // de la RAE ("-48 %"), "( -48" y el decimal con coma o punto ("-48,5%"). Se recorta
  // la cola y se re-evalúa SOLO la cabeza: si un teléfono real quedara puenteado con
  // un porcentaje, la cabeza se enmascara igual.
  if (/^[\s ]?%|^[.,]\d{1,2}[\s ]?%/.test(despues)) {
    const cola = m.match(/(?:[\s ]*\([\s ]*|[\s ])-?\d{1,4}(?:[.,]\d{1,2})?$/);
    if (cola && cola[0].length < m.length) {
      const cabeza = m.slice(0, m.length - cola[0].length);
      return redactarCandidato(cabeza, antes, cola[0]) + cola[0];
    }
    // Sin cola recortable: decide la lógica clásica — "3001234567%" se enmascara,
    // un porcentaje suelto no llega a los 7 dígitos y queda intacto.
    return pareceTelefono(m) ? enmascarar(m) : m;
  }

  // ── Veto 2: fecha al inicio (ISO o latam, guion ASCII o U+2011) ─────────────
  // "2026-07-31 20:25" matcheaba "2026-07-31 20" y se publicaba "******3120:25". Se
  // recorta la fecha y se re-evalúa el resto, por si detrás viniera un teléfono real.
  const fecha = m.match(/^(?:\d{4}[-‑]\d{2}[-‑]\d{2}|\d{2}[-‑]\d{2}[-‑]\d{4})(?=\D|$)/);
  if (fecha) {
    const resto = m.slice(fecha[0].length);
    return fecha[0] + (resto ? redactarCandidato(resto, "-", despues) : "");
  }

  // ── Veto 3: rango de meta/ingreso ("10.000-15.000", "8.000 - 12.000") ───────
  // Ambos lados con puntos de miles, o ambos pelados de 4-6 dígitos. Es la forma
  // estándar de escribir metas; ningún teléfono de la base parte sus dígitos así.
  if (/^\d{1,3}(?:\.\d{3})+[\s ]?[-‑][\s ]?\d{1,3}(?:\.\d{3})+$/.test(m)) return m;
  if (/^\d{4,6}[\s ]?[-‑][\s ]?\d{4,6}$/.test(m)) return m;

  // ── Veto 4: importe con puntos de miles ─────────────────────────────────────
  // "1.234.567" (grupos de EXACTAMENTE 3, 7-8 dígitos) es un monto es-CO: los
  // teléfonos con puntos reales de la base terminan en grupo de 4 ("300.123.4567") y
  // no calzan acá. Con "$" pegado se aceptan también 9+ dígitos ("$115.702.919",
  // nómina COP); SIN "$", un 9 dígitos con puntos puede ser un móvil español
  // ("612.345.678") y ante la duda se enmascara — PII primero.
  if (/^\d{1,2}(?:\.\d{3}){2}$/.test(m)) return m;
  if (antes.endsWith("$") && /^\d{1,3}(?:\.\d{3}){2,}$/.test(m)) return m;

  // ── Veto 5: "$" pegado adelante ─────────────────────────────────────────────
  // "$1234567" es plata sin separadores. Deliberadamente estrecho: con espacio en el
  // medio no aplica ("mandale $50 al 3001234567" enmascara el teléfono igual), y si
  // la corrida trae separadores tampoco ("$500 3001234567" se enmascara entero antes
  // que arriesgar la fuga del número).
  if (antes.endsWith("$") && /^\d+$/.test(m)) return m;

  // ── Sin contexto que lo vete: decide la lógica clásica ──────────────────────
  return pareceTelefono(m) ? enmascarar(m) : m;
}

/**
 * Enmascara telefonos dejando visibles solo los ULTIMOS 4 digitos (ej "******6868"), asi el
 * equipo puede identificar de cual numero se habla sin que el numero quede publicado.
 * Preserva URLs y menciones: llevan digitos y no son telefonos.
 */
// ─────────────────────────────────────────────────────────────────────────────
// Voseo → tuteo neutro en el borde de salida. La purga de #1138 sacó el voseo de
// las INSTRUCCIONES, pero el modelo igual escupe un "probá"/"venís" suelto de vez
// en cuando (corte 17:00 del 04/08, tercera queja del día) — y la doctrina de la
// casa es guarda determinística > regla de prompt. SOLO formas INEQUÍVOCAS:
// nada de -í finales (seguí/subí/escribí = pasado 1ª persona válido) ni "dale".
// ─────────────────────────────────────────────────────────────────────────────
const VOSEO_A_NEUTRO: ReadonlyArray<[string, string]> = [
  ["probá", "prueba"], ["probalo", "pruébalo"], ["mandá", "manda"], ["mandalo", "mándalo"],
  ["mandale", "mándale"], ["decí", "di"], ["decilo", "dilo"], ["decile", "dile"], ["decime", "dime"],
  ["tomá", "toma"], ["tomalo", "tómalo"], ["mirá", "mira"], ["miralo", "míralo"],
  ["escuchá", "escucha"], ["andá", "anda"], ["vení", "ven"], ["poné", "pon"], ["ponelo", "ponlo"],
  ["hacé", "haz"], ["hacelo", "hazlo"], ["hacele", "hazle"], ["sacá", "saca"], ["sacale", "sácale"],
  ["pasá", "pasa"], ["pasale", "pásale"], ["pasalo", "pásalo"], ["pasame", "pásame"],
  ["contá", "cuenta"], ["contale", "cuéntale"], ["contame", "cuéntame"],
  ["avisá", "avisa"], ["avisame", "avísame"], ["avisale", "avísale"],
  ["esperá", "espera"], ["esperame", "espérame"], ["llamá", "llama"], ["llamalo", "llámalo"],
  ["llamame", "llámame"], ["arrancá", "arranca"], ["arrancale", "arráncale"],
  ["fijate", "fíjate"], ["acordate", "acuérdate"], ["quedate", "quédate"], ["olvidate", "olvídate"],
  ["sumá", "suma"], ["sumale", "súmale"], ["metele", "métele"], ["buscá", "busca"], ["buscale", "búscale"],
  ["agarrá", "agarra"], ["cargá", "carga"], ["cargale", "cárgale"], ["tirá", "tira"], ["tirale", "tírale"],
  ["usá", "usa"], ["usalo", "úsalo"], ["tené", "ten"], ["tenés", "tienes"], ["podés", "puedes"],
  ["querés", "quieres"], ["sabés", "sabes"], ["hacés", "haces"], ["decís", "dices"], ["venís", "vienes"],
  ["sos", "eres"], ["retomá", "retoma"], ["checá", "checa"], ["mostrá", "muestra"], ["marcá", "marca"],
  // 05/08: "Vos ganás comisión" y "pa que vos solo pienses" se fugaron TRES veces en
  // pitches para creadoras — el mapa cubría verbos pero no el PRONOMBRE ni estas
  // conjugaciones. "VOS" todo-mayúsculas sigue protegido por el check de siglas.
  ["vos", "tú"], ["ganás", "ganas"], ["seguís", "sigues"], ["cobrás", "cobras"],
  ["facturás", "facturas"], ["entrás", "entras"], ["vendés", "vendes"], ["llevás", "llevas"],
  ["pensás", "piensas"], ["necesitás", "necesitas"], ["trabajás", "trabajas"],
  ["manejás", "manejas"], ["respondés", "respondes"], ["escribís", "escribes"],
  ["subís", "subes"], ["quedás", "quedas"], ["apurate", "apúrate"], ["dejá", "deja"],
  // AUDITORÍA 10-12/08: 23 de 115 mensajes de Marketing/Ventas salieron con voseo (20%).
  // El caso que muestra el agujero: "Miguel, coordiná con Michelle antes de las 5PM:
  // revisá cómo está funcionando el CP, y pasá el reporte acá" — el mapa corrigió
  // "pasá" y dejó "coordiná" y "revisá" EN LA MISMA ORACIÓN. Un mapa incompleto es
  // peor que ninguno: el mensaje sale medio corregido y parece descuido, no dialecto.
  // Las formas de los nudges hardcodeados del cron van acá también (avanzás, asignás,
  // arrancales), aunque la plantilla se corrige aparte: si mañana alguien escribe otra
  // plantilla en voseo, el borde la tapa igual.
  ["coordiná", "coordina"], ["revisá", "revisa"], ["revisalo", "revísalo"],
  ["chequeá", "chequea"], ["confirmá", "confirma"], ["cerrá", "cierra"], ["cerrás", "cierras"],
  ["anotá", "anota"], ["anotalo", "anótalo"], ["armá", "arma"], ["armale", "ármale"],
  ["preguntá", "pregunta"], ["preguntale", "pregúntale"], ["respondé", "responde"],
  ["respondele", "respóndele"], ["avanzá", "avanza"], ["avanzás", "avanzas"],
  ["asigná", "asigna"], ["asignás", "asignas"], ["arrancales", "arráncales"],
  ["perdés", "pierdes"], ["metés", "metes"], ["enfocate", "enfócate"], ["sumate", "súmate"],
  ["dejame", "déjame"], ["dejalo", "déjalo"], ["ponete", "ponte"], ["jugá", "juega"],
  // Formas en -me que faltaban al lado de sus hermanas -le/-lo ya mapeadas.
  // "mandame" lo encontró el test nuevo: estaban mandale y mandalo, no mandame.
  ["mandame", "mándame"], ["tirame", "tírame"], ["buscame", "búscame"], ["armame", "ármame"],
  ["mostrame", "muéstrame"], ["contestame", "contéstame"], ["confirmame", "confírmame"],
  // "che" no es un verbo pero es la marca rioplatense más obvia que existe.
  ["che", "oye"],
];
const VOSEO_RE = new RegExp(
  "(?<![\\p{L}@])(" + VOSEO_A_NEUTRO.map(([v]) => v).join("|") + ")(?![\\p{L}])",
  "giu",
);
const VOSEO_MAP = new Map(VOSEO_A_NEUTRO);
export function neutralizarVoseo(texto: string): string {
  if (!texto) return texto;
  return texto.replace(VOSEO_RE, (m) => {
    // "SOS" (todo mayúsculas) es una sigla, no voseo.
    if (m === m.toUpperCase() && m.length >= 3) return m;
    const neutro = VOSEO_MAP.get(m.toLowerCase());
    if (!neutro) return m;
    // Respeta mayúscula inicial ("Probá" → "Prueba").
    return m[0] === m[0].toUpperCase() ? neutro[0].toUpperCase() + neutro.slice(1) : neutro;
  });
}

export function redactPhones(texto: string): string {
  if (!texto) return texto;
  const guardados: string[] = [];
  const guardar = (s: string): string => {
    guardados.push(s);
    // Token sin digitos pegados, para que TEL_CAND_RE no lo confunda con un telefono.
    return `⟦${guardados.length - 1}⟧`;
  };
  const conPlaceholders = texto
    // Primero el número dentro de los deep links telefónicos; recién después se
    // protegen las URLs — al revés, el link se guarda y restaura con el número intacto.
    .replace(LINK_TEL_RE, (_m, pre: string, num: string) => pre + enmascarar(num))
    .replace(URL_RE, guardar)
    .replace(MENCION_RE, guardar);
  const limpio = conPlaceholders.replace(
    TEL_CAND_RE,
    (m, offset: number, full: string) =>
      redactarCandidato(
        m,
        full.slice(Math.max(0, offset - 1), offset),
        full.slice(offset + m.length, offset + m.length + 6),
      ),
  );
  return limpio.replace(/⟦(\d+)⟧/g, (_x, i) => guardados[Number(i)]);
}

// ─────────────────────────────────────────────────────────────────────────────
// UTF-16: cortar sin partir emojis, y limpiar sustitutos sueltos
// ─────────────────────────────────────────────────────────────────────────────
// INCIDENTE 31/07: el bot le prometió a Miguel una estrategia scrapeada ("dame ~1
// min, ya vuelvo 🔍") y nunca volvió. El scrape había funcionado; lo que murió fue
// la llamada a Anthropic con un 400:
//   "The request body is not valid JSON: no low surrogate in string"
// Causa: `String(caption).slice(0, 180)` sobre un caption de Instagram. `.slice()`
// cuenta unidades UTF-16 y un emoji ocupa DOS, así que el corte cayó en la mitad de
// un par sustituto y dejó medio carácter. Uno de los 19 captions de la creadora medía
// 179 code points pero 183 unidades UTF-16 (4 emojis) — bastó ese.
// El fallo era invisible: el request explota ANTES de que el loop pueda loguear nada.

/** Trunca a `max` CARACTERES REALES (code points), nunca parte un emoji por la mitad. */
export function cortarSeguro(s: string, max: number): string {
  if (typeof s !== "string" || max <= 0) return "";
  const cps = [...s]; // itera por code point, no por unidad UTF-16
  return cps.length <= max ? s : cps.slice(0, max).join("");
}

/**
 * Elimina sustitutos SUELTOS (mitades de emoji sin su par). Guarda de último recurso
 * para el borde de salida hacia cualquier API JSON: un solo punto protege todos los
 * `.slice()` del código, presentes y futuros — mismo patrón que redactPhones en
 * whatsapp-send. No toca los pares bien formados.
 */
export function limpiarSustitutosSueltos(s: string): string {
  return s.replace(
    /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g,
    "",
  );
}

// ── Recurrencia de recordatorios ─────────────────────────────────────────────
// AUDITORÍA 10-12/08: la serie de reportes de Grace murió el lunes 10:20 y nadie
// se enteró (49h de silencio). No fue una caída: attempt_count=0, error=null, la
// corrida cerró sana. Murió porque NADIE RE-AGENDA — create_reminder es one-shot y
// el único eslabón capaz de crear la siguiente ocurrencia era el modelo. Las 6
// filas se crearon todas el 07/08 en cinco minutos: la serie nació con fecha de
// defunción.
//
// Bogotá es UTC-5 FIJO (sin horario de verano), así que sumar días enteros en UTC
// preserva la hora local sin conversiones. Si algún día hubiera DST, esto hay que
// rehacerlo con una librería de zonas.
export type Recurrencia = "daily" | "weekdays" | "weekends" | "weekly";

const DIA_MS = 86_400_000;
// Día de la semana en Bogotá (0=dom … 6=sáb) de un instante UTC.
const dowBogota = (d: Date): number => new Date(d.getTime() - 5 * 3600_000).getUTCDay();

/**
 * Próxima ocurrencia ESTRICTAMENTE posterior a `desde`, respetando la hora local
 * del disparo original. Devuelve null si la recurrencia no se reconoce — mejor una
 * serie que se termina visiblemente que una que salta a una hora inventada.
 */
export function proximaOcurrencia(triggerAt: string | Date, recurrence: string | null): Date | null {
  if (!recurrence) return null;
  const base = triggerAt instanceof Date ? triggerAt : new Date(triggerAt);
  if (isNaN(base.getTime())) return null;
  const modo = recurrence.trim().toLowerCase() as Recurrencia;
  if (!["daily", "weekdays", "weekends", "weekly"].includes(modo)) return null;

  if (modo === "weekly") return new Date(base.getTime() + 7 * DIA_MS);

  // Avanza de a un día hasta caer en un día admitido. Tope de 8 vueltas: con
  // cualquiera de los modos se encuentra en ≤3, y el tope evita un bucle infinito
  // si alguien agrega un modo sin días válidos.
  for (let i = 1; i <= 8; i++) {
    const cand = new Date(base.getTime() + i * DIA_MS);
    const dow = dowBogota(cand);
    const esFinde = dow === 0 || dow === 6;
    if (modo === "daily") return cand;
    if (modo === "weekdays" && !esFinde) return cand;
    if (modo === "weekends" && esFinde) return cand;
  }
  return null;
}

// ── Quick commands (@maven presentate/help/audita/cierre del día) ──────────────
// Vivía dentro de whatsapp-ingest (intesteable: importar ese módulo ejecuta
// serve()). Se movió acá tras el incidente del 13/08 09:49:
//
//   Brayan posteó su plan de agencias (@mencionando al bot) que terminaba en
//   "…y cierre a demo de 15 min". El patrón viejo /\bcierre(…)?\b/ tenía el
//   calificador OPCIONAL — cualquier "cierre" suelto disparaba el modo EOD.
//   El agente, invocado como "generá el reporte de fin de turno" a las 9:49 AM,
//   respondió "no es hora de cierre de jornada" — un delirio frente al plan que
//   Brayan había presentado. Y como el camino de quick command RETORNA temprano,
//   el mensaje real de Brayan nunca llegó al agente: plan sólido, cero acuse.
//
// Dos capas de arreglo:
//   1. "cierre" exige su calificador (del día/jornada/turno). Sin excepciones.
//   2. UN COMANDO TIENE QUE PARECER UN COMANDO: si el texto (sin la @mención)
//      pasa de 80 caracteres, es una conversación — jamás un quick command.
//      Esto mata la clase entera del bug para los cuatro comandos: un plan que
//      diga "auditoría" o "sincroniza" en el medio tampoco secuestra nada.
export type QuickCommand = "presentate" | "help" | "audit" | "eod" | null;

export function detectQuickCommand(body: string | null): QuickCommand {
  if (!body) return null;
  // La @mención cruda (@<lid numérico>) no cuenta como largo del comando.
  const limpio = body.replace(/@\d{8,}/g, " ").replace(/\s+/g, " ").trim();
  if (limpio.length > 80) return null;

  const presentate = [
    /\bpres[eé]ntate\b/i,
    /\bqui[eé]n\s+sos\b/i,
    /\bqu[eé]\s+sos\b/i,
    /\bqu[eé]\s+hac[eé]s\b/i,
    /\bqu[eé]\s+sab[eé]s\s+hacer\b/i,
    /\bqu[eé]\s+pod[eé]s\s+hacer\b/i,
    /\bpara\s+qu[eé]\s+serv[ií]s\b/i,
  ];
  if (presentate.some((p) => p.test(limpio))) return "presentate";

  const help = [
    /^\s*[@/]?maven\s+\/?(help|ayuda|comandos)\b/i,
    /^\s*\/(help|ayuda|comandos)\b/i,
    /\bqu[eé]\s+comandos\b/i,
  ];
  if (help.some((p) => p.test(limpio))) return "help";

  const audit = [
    /\baudita(?:r|ndo)?\b/i,
    /\bauditor[ií]a\b/i,
    /\bsync\s+(?:el\s+)?historial\b/i,
    /\bsincroniza\b/i,
    /\bescanea(?:r)?\s+(?:el\s+)?historial\b/i,
    /\brevisa\s+(?:el\s+)?historial\b/i,
  ];
  if (audit.some((p) => p.test(limpio))) return "audit";

  const eod = [
    // El calificador es OBLIGATORIO: "cierre a demo", "cierre de ventas", "el
    // cierre con la agencia" son negocio, no un pedido de reporte.
    /\bcierre\s+(?:del?\s+)?(?:d[ií]a|jornada|turno)\b/i,
    /\bresumen\s+(?:del|de)\s+(?:d[ií]a|hoy|jornada|turno)\b/i,
    /\bc[oó]mo\s+va\s+(?:el\s+)?(?:d[ií]a|equipo|jornada|turno)\b/i,
    /\beod\b/i,
  ];
  if (eod.some((p) => p.test(limpio))) return "eod";

  return null;
}
