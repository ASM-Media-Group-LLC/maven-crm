import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { whatsappCors } from "../_shared/whatsapp.ts";

// wa-inbox-open — Closers: abre (o crea) la conversación del inbox con un lead en
// un canal dado, para que el closer le escriba desde Maven. Devuelve conversation_id
// para que el front haga deep-link a /inbox?c=<id>.
//
// Auth: JWT del usuario + permiso WhatsApp/Bandeja + ser MIEMBRO del canal
// (wa_channel_members). El número del destino se resuelve SERVER-SIDE desde
// closer_creators (+ closers_contacts) cuando viene closer_creator_id; para leads
// de leadgen (sin fila en closer_creators) cae al `phone` E.164 que manda el front
// (validado). find-or-create de wa_contacts (por jid) + wa_conversations (contact+canal).

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...whatsappCors, "Content-Type": "application/json" },
  });
}

function toJid(e164: string): string | null {
  const digits = String(e164).replace(/[^0-9]/g, "");
  return digits.length >= 7 ? `${digits}@s.whatsapp.net` : null;
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

  // ── Input ────────────────────────────────────────────────────────────────
  let payload: { channel_id?: string; closer_creator_id?: string; phone?: string; name?: string } = {};
  try { payload = await req.json(); } catch { /* */ }
  const channelId = payload.channel_id;
  const leadId = payload.closer_creator_id || null;
  if (!channelId || (!leadId && !payload.phone)) return json({ ok: false, error: "missing_channel_or_target" }, 400);

  // ── Canal + verificar membresía del usuario ───────────────────────────────
  const { data: channel } = await (sb as any)
    .from("wa_channels")
    .select("id, tenant_id, evolution_instance, department")
    .eq("id", channelId).maybeSingle();
  if (!channel) return json({ ok: false, error: "channel_not_found" }, 404);

  const { data: membership } = await (sb as any)
    .from("wa_channel_members")
    .select("channel_id")
    .eq("channel_id", channelId).eq("user_id", userId).maybeSingle();
  if (!membership) {
    // Los admins ven/usan TODOS los canales (igual que la RLS de wa_channels) y no
    // figuran como members → si no es member, recién ahí chequeamos admin.
    const { data: isAdmin } = await sb.rpc("is_in_role_group", { _user_id: userId, _group: "admin" });
    if (!isAdmin) return json({ ok: false, error: "not_channel_member" }, 403);
  }

  // ── Resolver teléfono del destino ──────────────────────────────────────────
  let e164: string | null = null;
  let displayName: string | null = null;
  let leadIdForContact: string | null = null;
  let leadOwner: string | null = null;   // closer_creators.assigned_to (dueño del lead)
  let leadExists = false;
  if (leadId) {
    const { data: lead } = await (sb as any).from("closer_creators").select("*").eq("id", leadId).maybeSingle();
    if (lead) {
      leadExists = true;
      leadOwner = lead.assigned_to ?? null;
      leadIdForContact = leadId;
      e164 = (lead.phone && String(lead.phone).startsWith("+")) ? String(lead.phone) : null;
      if (!e164 && lead.source_contact_id) {
        const { data: sc } = await (sb as any)
          .from("closers_contacts").select("country_code, phone").eq("id", lead.source_contact_id).maybeSingle();
        if (sc) {
          if (sc.country_code && sc.phone) e164 = `${sc.country_code}${sc.phone}`;
          else if (sc.phone && String(sc.phone).startsWith("+")) e164 = String(sc.phone);
        }
      }
      displayName = lead.name || lead.full_name || lead.creator_name || lead.display_name || lead.instagram_handle || lead.handle || null;
    }
  }

  // ── Gating por dueño del lead ──────────────────────────────────────────────
  // El closer solo abre conversaciones de leads asignados a ÉL. Supervisores/
  // managers/admin pueden abrir cualquiera (triaje/supervisión). Si el lead no es
  // suyo, no se abre y le decimos por qué.
  if (leadExists) {
    const { data: isSup } = await sb.rpc("is_in_role_group", { _user_id: userId, _group: "supervisor_or_above" });
    if (!isSup) {
      if (!leadOwner) {
        return json({ ok: false, error: "Este lead no está asignado a vos. Tomalo desde Closers para poder abrir su chat." }, 403);
      }
      if (leadOwner !== userId) {
        const { data: owner } = await (sb as any).from("profiles").select("full_name").eq("id", leadOwner).maybeSingle();
        const who = owner?.full_name || "otra persona";
        return json({ ok: false, error: `Este lead ya está asignado a ${who}. No podés abrir su chat.` }, 403);
      }
    }
  }

  if (!e164 && payload.phone && String(payload.phone).startsWith("+")) {
    e164 = String(payload.phone);                 // fallback leadgen / sin fila de closer
    displayName = displayName || payload.name || null;
  }
  const jid = e164 ? toJid(e164) : null;
  if (!jid) return json({ ok: false, error: "target_no_phone" }, 422);

  // ── find-or-create wa_contact (por tenant + jid) ───────────────────────────
  let contactId: string;
  const { data: existingContact } = await (sb as any)
    .from("wa_contacts").select("id, closer_creator_id")
    .eq("tenant_id", channel.tenant_id).eq("wa_jid", jid).maybeSingle();
  if (existingContact) {
    contactId = existingContact.id;
    if (!existingContact.closer_creator_id && leadIdForContact) {
      await (sb as any).from("wa_contacts").update({ closer_creator_id: leadIdForContact, display_name: displayName }).eq("id", contactId);
    }
  } else {
    const { data: newContact, error: cErr } = await (sb as any).from("wa_contacts").insert({
      tenant_id: channel.tenant_id, wa_jid: jid, phone_e164: e164, display_name: displayName, closer_creator_id: leadIdForContact,
    }).select("id").single();
    if (cErr) return json({ ok: false, error: "contact_create_failed: " + cErr.message }, 500);
    contactId = newContact.id;
  }

  // ── find-or-create wa_conversation (por contact + canal) ───────────────────
  const dept = ["closer", "manager", "recruitment"].includes(channel.department) ? channel.department : "closer";
  let convId: string;
  // La conversación sigue al dueño del lead: si el lead tiene dueño se asigna a él;
  // si no (leadgen/sin fila de closer), al que la abre.
  const ownerForConv = leadOwner ?? userId;
  const { data: existingConv } = await (sb as any)
    .from("wa_conversations").select("id, assigned_to").eq("contact_id", contactId).eq("channel_id", channelId).maybeSingle();
  if (existingConv) {
    convId = existingConv.id;
    // Si está SIN asignar, la tomamos para el dueño del lead (p.ej. un inbound que
    // entró antes de que el closer la abriera). No pisamos una asignación ya hecha.
    if (leadOwner && !existingConv.assigned_to) {
      await (sb as any).from("wa_conversations").update({ assigned_to: leadOwner }).eq("id", convId);
    }
  } else {
    const { data: newConv, error: vErr } = await (sb as any).from("wa_conversations").insert({
      tenant_id: channel.tenant_id, contact_id: contactId, channel_id: channelId,
      channel_jid: channel.evolution_instance, department: dept, assigned_to: ownerForConv, status: "open",
    }).select("id").single();
    if (vErr) return json({ ok: false, error: "conversation_create_failed: " + vErr.message }, 500);
    convId = newConv.id;
  }

  return json({ ok: true, conversation_id: convId });
});
