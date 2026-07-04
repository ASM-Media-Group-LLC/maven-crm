import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// tg-inbox-open (S3.3/S4) — abre (o reutiliza) una conversación de Telegram con el
// CREADOR/CONTACTO/LEAD y devuelve conversation_id para el deep-link /telegram/bandeja?c=<id>.
//
// IMPORTANTE (pedido del owner): se contacta por el TELÉFONO PERSONAL (whatsapp_number/
// phone_e164/phone), igual que WhatsApp — NO por creators.telegram_handle, que es el canal
// de PROMO (eso es solo para Promolog). El gateway resuelve el teléfono vía
// contacts.importContacts (única vía en Telegram; además lo guarda como contacto). Si el
// número no está en Telegram → aviso claro.
//
// Destinos soportados (paridad con wa-inbox-open):
//   - telegram_username: @username explícito (contacto personal real).
//   - phone: E.164 directo (leadgen / fallback).
//   - creator_id: creators (módulo Creadoras), sin gating de dueño.
//   - contact_id: closers_contacts (módulo Contactos), sin gating de dueño.
//   - closer_creator_id: closer_creators (tabla de leads de Closers) → resuelve el teléfono
//     vía source_contact_id (closers_contacts.country_code+phone, fuente confiable) y APLICA
//     el gating por dueño del lead (el closer solo abre los suyos; supervisor+ abre cualquiera).

const GW_URL = (Deno.env.get("TELEGRAM_GW_URL") || "http://telegram-gw.147.93.3.97.nip.io").replace(/\/+$/, "");
const GW_API_KEY = Deno.env.get("TELEGRAM_GW_API_KEY") || "";
const TENANT_ID = "30869615-f579-4981-8a1f-dbebc61eae2d"; // ASM Tech (inbox v1 mono-tenant)

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}
const cleanHandle = (s: string) =>
  s.trim().replace(/^https?:\/\/(t\.me|telegram\.me)\//i, "").replace(/^@/, "").trim();

// ── Normalización de teléfono (mismo criterio que wa-inbox-open) ──
const onlyDigits = (s: unknown) => String(s ?? "").replace(/\D/g, "");
const cleanE164 = (s: unknown): string | null => {
  const d = onlyDigits(s);
  return d ? "+" + d : null;
};
const joinCc = (cc: unknown, phone: unknown): string | null => {
  const c = onlyDigits(cc), p = onlyDigits(phone);
  if (!p) return null;
  return "+" + c + p;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!jwt) return json({ ok: false, error: "missing_auth" }, 401);

  const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: uErr } = await sb.auth.getUser(jwt);
  if (uErr || !userData?.user) return json({ ok: false, error: "invalid_token" }, 401);
  const userId = userData.user.id;

  const { data: allowed, error: pErr } = await sb.rpc("has_permission", {
    _user_id: userId, _module: "Telegram", _submodule: "Bandeja",
  });
  if (pErr || !allowed) return json({ ok: false, error: "forbidden" }, 403);

  let payload: {
    creator_id?: string; contact_id?: string; closer_creator_id?: string;
    phone?: string; telegram_username?: string; name?: string; account_id?: string;
  } = {};
  try { payload = await req.json(); } catch { /* */ }
  const creatorId = payload.creator_id ?? null;
  const contactId = payload.contact_id ?? null;
  const closerCreatorId = payload.closer_creator_id ?? null;
  const reqAccountId = payload.account_id ?? null; // línea desde la que se abre (opcional)
  let displayName = payload.name ?? null;
  // Lead del pipeline a ligar en la conversación (para el auto-registro de contacto).
  // Desde la tabla de Closers viene explícito; desde Contactos se resuelve/auto-toma abajo.
  let leadIdForConv: string | null = closerCreatorId;

  // ── Destino: contactar por TELÉFONO PERSONAL (como WhatsApp), NO por telegram_handle. ──
  let to = payload.telegram_username ? cleanHandle(payload.telegram_username) : "";
  if (!to && payload.phone) to = String(payload.phone).trim();

  if (!to && creatorId) {
    const { data: cr } = await (sb as any)
      .from("creators").select("whatsapp_number, phone_e164, phone, name").eq("id", creatorId).maybeSingle();
    to = (cr?.whatsapp_number || cr?.phone_e164 || cr?.phone || "").toString().trim();
    if (!displayName) displayName = cr?.name ?? null;
  }

  if (!to && contactId) {
    const { data: ct } = await (sb as any)
      .from("closers_contacts").select("country_code, phone, name, handle").eq("id", contactId).maybeSingle();
    if (ct) {
      to = (ct.country_code && ct.phone) ? (joinCc(ct.country_code, ct.phone) || "")
         : (ct.phone ? (cleanE164(ct.phone) || "") : "");
      if (!displayName) displayName = ct.name || ct.handle || null;
    }
  }

  // ── Lead de Closers (closer_creators) → teléfono server-side + GATING por dueño ──
  // Paridad con wa-inbox-open: el número no viaja al browser; el closer solo abre SUS leads.
  if (!to && closerCreatorId) {
    const { data: lead } = await (sb as any)
      .from("closer_creators").select("*").eq("id", closerCreatorId).maybeSingle();
    if (lead) {
      // Gating: closer abre solo lo asignado a él; supervisor/manager/admin abren cualquiera.
      const { data: isSup } = await sb.rpc("is_in_role_group", { _user_id: userId, _group: "supervisor_or_above" });
      if (!isSup) {
        const leadOwner = lead.assigned_to ?? null;
        if (!leadOwner) {
          return json({ ok: false, error: "Este lead no está asignado a vos. Tomalo desde Closers para poder abrir su chat." });
        }
        if (leadOwner !== userId) {
          const { data: owner } = await (sb as any).from("profiles").select("full_name").eq("id", leadOwner).maybeSingle();
          const who = owner?.full_name || "otra persona";
          return json({ ok: false, error: `Este lead ya está asignado a ${who}. No podés abrir su chat.` });
        }
      }
      // El contacto origen (closers_contacts) es la FUENTE CONFIABLE: país EXPLÍCITO (country_code)
      // + teléfono normalizado. closer_creators.phone suele venir NACIONAL sin país → quedaría mal
      // (p.ej. brasileño "11948566396" → "+11948566396", leído como +1). Por eso, si el contacto
      // origen tiene país+teléfono, SIEMPRE preferimos su join. Solo si le falta el país caemos al lead.
      let e164 = lead.phone ? cleanE164(lead.phone) : null;
      if (lead.source_contact_id) {
        const { data: sc } = await (sb as any)
          .from("closers_contacts").select("country_code, phone").eq("id", lead.source_contact_id).maybeSingle();
        if (sc?.country_code && sc?.phone) {
          const fromContact = joinCc(sc.country_code, sc.phone);
          if (fromContact && onlyDigits(fromContact).length >= 10) e164 = fromContact;
        } else if (sc?.phone && (!e164 || onlyDigits(e164).length <= 10)) {
          const fromContact = cleanE164(sc.phone);
          if (fromContact && onlyDigits(fromContact).length > 10) e164 = fromContact;
        }
      }
      to = e164 || "";
      if (!displayName) {
        displayName = lead.name || lead.full_name || lead.creator_name || lead.display_name || lead.instagram_handle || lead.handle || null;
      }
    }
  }

  // ── Auto-tomar (desde Contactos): si el contacto YA es un lead del pipeline SIN dueño, se
  //    te asigna (como "Tomar") y queda ligado para registrar el contacto. Si ya es tuyo, se
  //    liga. Si es de otro closer, no se toca. Si no hay lead, no se crea (contacto suelto). ──
  if (!leadIdForConv && contactId) {
    const { data: leadRows } = await (sb as any)
      .from("closer_creators").select("id, assigned_to").eq("source_contact_id", contactId).limit(1);
    const lead = leadRows && leadRows[0];
    if (lead) {
      if (!lead.assigned_to) {
        const today = new Date().toISOString().slice(0, 10);
        const { data: claimed } = await (sb as any).from("closer_creators")
          .update({ assigned_to: userId, stage: "Asignada", passed_date: today })
          .eq("id", lead.id).is("assigned_to", null).select("id").maybeSingle();
        if (claimed) leadIdForConv = lead.id;          // lo tomaste vos
      } else if (lead.assigned_to === userId) {
        leadIdForConv = lead.id;                        // ya es tuyo → ligar para registrar
      }
      // de otro closer → no tocar (no ligar, no reclamar)
    }
  }

  if (!to) {
    return json({ ok: false, error: "Este contacto no tiene teléfono (ni usuario de Telegram) cargado." }, 200);
  }

  // ── Resolver el peer nativo vía el gateway (teléfono→importContacts o @username→getEntity) ──
  if (!GW_API_KEY) return json({ ok: false, error: "gateway_not_configured" }, 500);
  let resolved: any = null;
  try {
    const r = await fetch(`${GW_URL}/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: GW_API_KEY },
      body: JSON.stringify({ to, name: displayName, accountId: reqAccountId }),
    });
    resolved = await r.json().catch(() => ({}));
    if (resolved?.error === "not_on_telegram") {
      return json({ ok: false, error: "Este número no está en Telegram (o su privacidad no permite contactarlo)." }, 200);
    }
    if (!r.ok || !resolved?.ok || !resolved?.peer_id) {
      return json({ ok: false, error: "No pude abrir el chat de Telegram con este contacto." }, 200);
    }
  } catch (e) {
    return json({ ok: false, error: "gateway_unreachable: " + (e as Error).message }, 200);
  }

  const accountId = String(resolved.account_id);
  const peerId = String(resolved.peer_id);
  const peerUsername = resolved.username ?? null;
  const peerName = resolved.name ?? displayName;

  // ── find-or-create tg_conversations (account_id, peer_id) ───────────────────────
  const { data: existing } = await (sb as any)
    .from("tg_conversations")
    .select("id, assigned_to, creator_id, closer_creator_id")
    .eq("account_id", accountId)
    .eq("peer_id", peerId)
    .maybeSingle();

  if (existing) {
    const patch: Record<string, unknown> = {};
    if (creatorId && !existing.creator_id) patch.creator_id = creatorId;
    if (leadIdForConv && !existing.closer_creator_id) patch.closer_creator_id = leadIdForConv; // liga el lead → habilita auto-registro
    if (!existing.assigned_to) patch.assigned_to = userId; // asignar al que abre → la ve por RLS
    if (peerName) patch.peer_name = peerName;
    if (peerUsername) patch.peer_username = peerUsername;
    if (Object.keys(patch).length) await sb.from("tg_conversations").update(patch).eq("id", existing.id);
    return json({ ok: true, conversation_id: existing.id });
  }

  const { data: created, error: iErr } = await sb
    .from("tg_conversations")
    .insert({
      tenant_id: TENANT_ID,
      account_id: accountId,
      peer_id: peerId,
      peer_username: peerUsername,
      peer_name: peerName,
      peer_phone: resolved.phone ?? null,
      creator_id: creatorId,
      contact_id: contactId,
      closer_creator_id: leadIdForConv,
      assigned_to: userId,
      status: "open",
    })
    .select("id")
    .single();
  if (iErr) return json({ ok: false, error: "conversation_create_failed: " + iErr.message }, 500);

  return json({ ok: true, conversation_id: created.id });
});
