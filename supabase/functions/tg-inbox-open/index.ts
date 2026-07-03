import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// tg-inbox-open (S3.3/S4) — abre (o reutiliza) una conversación de Telegram con el
// CREADOR/CONTACTO y devuelve conversation_id para el deep-link /telegram/bandeja?c=<id>.
//
// IMPORTANTE (pedido del owner): se contacta por el TELÉFONO PERSONAL del creador
// (creators.whatsapp_number/phone_e164/phone), igual que WhatsApp — NO por
// creators.telegram_handle, que es el canal de PROMO (eso es solo para Promolog).
// El gateway resuelve el teléfono vía contacts.importContacts (única vía en Telegram;
// además lo guarda como contacto). Si el número no está en Telegram → aviso claro.
// Flujo: JWT → permiso Telegram/Bandeja → teléfono del destino → gateway /resolve
// (en la línea elegida) → find-or-create tg_conversations(account_id, peer_id).

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

  let payload: { creator_id?: string; contact_id?: string; phone?: string; telegram_username?: string; name?: string; account_id?: string } = {};
  try { payload = await req.json(); } catch { /* */ }
  const creatorId = payload.creator_id ?? null;
  const contactId = payload.contact_id ?? null;
  const reqAccountId = payload.account_id ?? null; // línea desde la que se abre (opcional)
  let displayName = payload.name ?? null;

  // ── Destino: contactar al CREADOR por su TELÉFONO PERSONAL (como WhatsApp), NO por
  //    creators.telegram_handle (eso es el canal de PROMO → solo Promolog). Se acepta un
  //    @username explícito solo si viene en el payload (contacto personal real). ──
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
      .from("closers_contacts").select("country_code, phone").eq("id", contactId).maybeSingle();
    const cc = (ct?.country_code || "").toString().trim();
    const ph = (ct?.phone || "").toString().trim();
    to = ph.startsWith("+") ? ph
      : (cc && ph ? (cc.startsWith("+") ? cc : "+" + cc.replace(/\D/g, "")) + ph.replace(/\D/g, "") : ph);
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
    .select("id, assigned_to, creator_id")
    .eq("account_id", accountId)
    .eq("peer_id", peerId)
    .maybeSingle();

  if (existing) {
    const patch: Record<string, unknown> = {};
    if (creatorId && !existing.creator_id) patch.creator_id = creatorId;
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
      assigned_to: userId,
      status: "open",
    })
    .select("id")
    .single();
  if (iErr) return json({ ok: false, error: "conversation_create_failed: " + iErr.message }, 500);

  return json({ ok: true, conversation_id: created.id });
});
