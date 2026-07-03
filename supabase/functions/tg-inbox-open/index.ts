import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// tg-inbox-open (S3.3) — abre (o reutiliza) una conversación de Telegram desde un
// contacto/creadora y devuelve su conversation_id para el deep-link
// /telegram/bandeja?c=<id>. Espejo de wa-inbox-open, pero:
//   - Telegram NO resuelve teléfono→usuario en frío → SOLO por @username/link/id.
//   - resuelve el peer nativo vía el gateway (POST /resolve) sobre la cuenta default.
//
// Flujo: JWT del usuario → permiso Telegram/Bandeja → username del destino
// (payload | creators.telegram_handle) → gateway /resolve → find-or-create
// tg_conversations(account_id, peer_id) asignada al que abre.

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

  let payload: { creator_id?: string; contact_id?: string; telegram_username?: string; name?: string; account_id?: string } = {};
  try { payload = await req.json(); } catch { /* */ }
  const creatorId = payload.creator_id ?? null;
  const contactId = payload.contact_id ?? null;
  const reqAccountId = payload.account_id ?? null; // línea desde la que se abre (opcional)
  let displayName = payload.name ?? null;

  // ── Resolver el @username del destino (payload directo o creators.telegram_handle) ──
  let handle = payload.telegram_username ? cleanHandle(payload.telegram_username) : "";
  if (!handle && creatorId) {
    const { data: cr } = await (sb as any)
      .from("creators").select("telegram_handle, name").eq("id", creatorId).maybeSingle();
    if (cr?.telegram_handle) handle = cleanHandle(String(cr.telegram_handle));
    if (!displayName) displayName = cr?.name ?? null;
  }
  if (!handle) {
    return json({ ok: false, error: "Este contacto no tiene usuario de Telegram cargado." }, 200);
  }

  // ── Resolver el peer nativo vía el gateway (username → peer_id + account_id) ─────
  if (!GW_API_KEY) return json({ ok: false, error: "gateway_not_configured" }, 500);
  let resolved: any = null;
  try {
    const r = await fetch(`${GW_URL}/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: GW_API_KEY },
      body: JSON.stringify({ to: handle, accountId: reqAccountId }),
    });
    resolved = await r.json().catch(() => ({}));
    if (!r.ok || !resolved?.ok || !resolved?.peer_id) {
      return json({ ok: false, error: `No pude resolver @${handle} en Telegram (¿usuario correcto?).` }, 200);
    }
  } catch (e) {
    return json({ ok: false, error: "gateway_unreachable: " + (e as Error).message }, 200);
  }

  const accountId = String(resolved.account_id);
  const peerId = String(resolved.peer_id);
  const peerUsername = resolved.username ?? handle;
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
