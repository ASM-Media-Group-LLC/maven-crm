import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// CORS inline (antes venía de ../_shared/whatsapp.ts). Se inlinea para que esta función sea
// self-contained y se pueda desplegar como archivo único (idéntico comportamiento).
// Maven vive en más de un dominio (el propio y el histórico, que sigue sirviendo
// los links públicos ya enviados), así que el origen se elige por request contra
// esta lista. Se mantiene inline y en el mismo orden que `_shared/cors.ts`.
const ORIGENES_PERMITIDOS = [
  "https://maven.asmtech.ai",
  "https://maven.asmtech.me",
  "https://www.maven-ai.me",
  "https://maven-ai.me",
  "http://localhost:5173",
  "http://localhost:4173",
];
const CORS_ALLOW_ORIGIN = Deno.env.get("CORS_ALLOW_ORIGIN") ?? ORIGENES_PERMITIDOS[0];
const corsPara = (req: Request) => {
  const origin = req.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ORIGENES_PERMITIDOS.includes(origin) ? origin : CORS_ALLOW_ORIGIN,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-cron-token, x-evolution-token",
    "Vary": "Origin",
  };
};

// wa-inbox-open — Closers: abre (o crea) la conversación del inbox con un lead en
// un canal dado, para que el closer le escriba desde Maven. Devuelve conversation_id
// para que el front haga deep-link a /inbox?c=<id>.
//
// Auth: JWT del usuario + permiso WhatsApp/Bandeja + ser MIEMBRO del canal
// (wa_channel_members). El número del destino se resuelve SERVER-SIDE desde
// closer_creators (+ closers_contacts) cuando viene closer_creator_id; para leads
// de leadgen (sin fila en closer_creators) cae al `phone` E.164 que manda el front
// (validado). find-or-create de wa_contacts (por jid) + wa_conversations (contact+canal).


function toJid(e164: string): string | null {
  const digits = String(e164).replace(/[^0-9]/g, "");
  return digits.length >= 7 ? `${digits}@s.whatsapp.net` : null;
}

const onlyDigits = (s: unknown) => String(s ?? "").replace(/[^0-9]/g, "");

// Normaliza a +E.164 limpiando los errores de formato que rompían el envío
// (espejo de la función SQL public.normalize_wa_e164). Quita basura, deshace el
// doble código de país y el "0" troncal de Venezuela. NO inventa país (10 dígitos
// sin código quedan sin tocar → fallan visiblemente, no le pegan a otra persona).
function cleanE164(raw: unknown): string | null {
  let d = onlyDigits(raw);
  if (d.length < 8) return null;
  if (/^521[0-9]{10}$/.test(d)) d = "52" + d.slice(3);                       // MX legacy 521+10 → 52+10
  if (d.length >= 13 && d.slice(0, 2) === d.slice(2, 4)
      && ["52", "57", "58", "51", "56", "54", "55", "34"].includes(d.slice(0, 2))) d = d.slice(2); // doble CC pegado
  if (d.length >= 13 && d.slice(0, 2) === "57" && /^(593|595|591|58|54|52|51|56)/.test(d.slice(2))) d = d.slice(2); // 57 mal prepended
  if (/^580/.test(d)) d = "58" + d.slice(3);                                 // VE troncal 0
  return "+" + d;
}

// Une código de país + teléfono SIN duplicar: si el teléfono ya trae el código
// (o un "+"), no se vuelve a anteponer. Esto evita el "+57(+57 …)" / "+57+593…".
function joinCc(cc: unknown, phone: unknown): string | null {
  const c = onlyDigits(cc), p = onlyDigits(phone);
  if (!p) return null;
  const merged = (c && !p.startsWith(c)) ? c + p : p;
  return cleanE164(merged);
}

// Multi-asignado: al auto-asignar una conversación (setear assigned_to = el
// "principal") hay que reflejarlo TAMBIÉN en la tabla N:N wa_conversation_assignees,
// que es la fuente de verdad del multi-asignado. Sin esto el principal quedaba
// como dueño pero fuera de la lista de asignados. Idempotente (mismo patrón que
// whatsapp-ingest al crear conversaciones nuevas). Best-effort: si falla, no
// tumba el open (la RLS/UI ya toleran el fallback por assigned_to).
async function syncAssigneeJoin(sb: any, conversationId: string, userId: string | null) {
  if (!userId) return;
  const { error } = await sb.from("wa_conversation_assignees").upsert(
    { conversation_id: conversationId, user_id: userId },
    { onConflict: "conversation_id,user_id", ignoreDuplicates: true },
  );
  if (error) console.warn("wa-inbox-open assignee join sync:", error.message);
}

Deno.serve(async (req) => {
  // `json` vive DENTRO del handler para resolver el CORS por request.
  const json = (body: unknown, status = 200): Response =>
    new Response(JSON.stringify(body), {
      status, headers: { ...corsPara(req), "Content-Type": "application/json" },
    });

  if (req.method === "OPTIONS") return new Response(null, { headers: corsPara(req) });

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
  let payload: { channel_id?: string; closer_creator_id?: string; contact_id?: string; creator_id?: string; phone?: string; name?: string } = {};
  try { payload = await req.json(); } catch { /* */ }
  const channelId = payload.channel_id;
  const leadId = payload.closer_creator_id || null;
  if (!channelId || (!leadId && !payload.contact_id && !payload.creator_id && !payload.phone)) return json({ ok: false, error: "missing_channel_or_target" }, 400);

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
      e164 = lead.phone ? cleanE164(lead.phone) : null;
      // El contacto origen (closers_contacts) es la FUENTE CONFIABLE: tiene el país EXPLÍCITO
      // (country_code) + el teléfono ya normalizado. closer_creators.phone suele venir como número
      // NACIONAL sin país → cleanE164 le pega un "+" y queda mal (p.ej. brasileño "11948566396" →
      // "+11948566396", leído como +1 EEUU). Por eso, si el contacto origen tiene país+teléfono,
      // SIEMPRE preferimos su join (país+número). Solo si le falta el país explícito caemos al del lead.
      if (lead.source_contact_id) {
        const { data: sc } = await (sb as any)
          .from("closers_contacts").select("country_code, phone").eq("id", lead.source_contact_id).maybeSingle();
        if (sc?.country_code && sc?.phone) {
          const fromContact = joinCc(sc.country_code, sc.phone);
          if (fromContact && onlyDigits(fromContact).length >= 10) e164 = fromContact;
        } else if (sc?.phone && (!e164 || onlyDigits(e164).length <= 10)) {
          // contacto sin país explícito: solo si el del lead falta o viene corto.
          const fromContact = cleanE164(sc.phone);
          if (fromContact && onlyDigits(fromContact).length > 10) e164 = fromContact;
        }
      }
      displayName = lead.name || lead.full_name || lead.creator_name || lead.display_name || lead.instagram_handle || lead.handle || null;
    }
  }

  // ── Gating por dueño del lead ──────────────────────────────────────────────
  // El closer solo abre conversaciones de leads asignados a ÉL. Supervisores/
  // managers/admin pueden abrir cualquiera (triaje/supervisión). Si el lead no es
  // suyo, no se abre y le decimos por qué.
  //
  // OJO: estos rechazos devuelven HTTP 200 con { ok:false, error } a propósito (no 4xx).
  // supabase.functions.invoke NO expone el body de respuestas no-2xx (deja data=null y
  // un error genérico "Edge Function returned a non-2xx status code"), así que el front
  // no podría mostrar este mensaje. Con 200 lo lee de data.error (que es lo que ya hacen
  // WaChatButton y LeadWhatsappButton: chequean !data.ok y muestran data.error).
  if (leadExists) {
    const { data: isSup } = await sb.rpc("is_in_role_group", { _user_id: userId, _group: "supervisor_or_above" });
    if (!isSup) {
      if (!leadOwner) {
        return json({ ok: false, error: "Este lead no está asignado a ti. Tómalo desde Closers para poder abrir su chat." });
      }
      if (leadOwner !== userId) {
        const { data: owner } = await (sb as any).from("profiles").select("full_name").eq("id", leadOwner).maybeSingle();
        const who = owner?.full_name || "otra persona";
        return json({ ok: false, error: `Este lead ya está asignado a ${who}. No puedes abrir su chat.` });
      }
    }
  }

  // Contacto directo (módulo Contactos): resolvemos el teléfono SERVER-SIDE desde
  // closers_contacts por contact_id, sin gating de dueño (paridad con el botón actual
  // de Contactos, que no gateaba). Así el closer mensajea sin que el número viaje al
  // browser (closers_contacts.phone está revocado para authenticated).
  if (!e164 && payload.contact_id) {
    const { data: sc } = await (sb as any)
      .from("closers_contacts").select("country_code, phone, name, handle").eq("id", payload.contact_id).maybeSingle();
    if (sc) {
      if (sc.country_code && sc.phone) e164 = joinCc(sc.country_code, sc.phone);
      else if (sc.phone) e164 = cleanE164(sc.phone);
      displayName = displayName || sc.name || sc.handle || null;
    }
  }

  // Auto-tomar (desde Contactos): si el contacto YA es un lead del pipeline SIN dueño, se te
  // asigna (como "Tomar") y queda ligado (wa_contacts.closer_creator_id) para registrar el
  // contacto. Si ya es tuyo, se liga. Si es de otro closer, no se toca. Si no hay lead, no se
  // crea (queda como contacto suelto). leadOwner=tú hace que la conversación quede tuya.
  if (!leadIdForContact && payload.contact_id) {
    const { data: leadRows } = await (sb as any)
      .from("closer_creators").select("id, assigned_to").eq("source_contact_id", payload.contact_id).limit(1);
    const lead = leadRows && leadRows[0];
    if (lead) {
      if (!lead.assigned_to) {
        // NO auto-reclamar si quien abre es admin/supervisor: abren la bandeja para
        // TRIAJE/supervisión, no para quedarse el lead. Solo un closer regular "toma"
        // el lead al abrir. (Bug: un admin viendo conversaciones se auto-asignaba modelos
        // sin haberlo hecho — p.ej. Jhon terminó con kloe/andreaesoto asignadas.)
        const { data: isSupOrAbove } = await sb.rpc("is_in_role_group", { _user_id: userId, _group: "supervisor_or_above" });
        if (isSupOrAbove) {
          leadIdForContact = lead.id;   // ligar para ver la conversación, SIN reclamar
        } else {
          const today = new Date().toISOString().slice(0, 10);
          const { data: claimed } = await (sb as any).from("closer_creators")
            .update({ assigned_to: userId, stage: "Asignada", passed_date: today })
            .eq("id", lead.id).is("assigned_to", null).select("id").maybeSingle();
          if (claimed) { leadIdForContact = lead.id; leadOwner = userId; }
        }
      } else if (lead.assigned_to === userId) {
        leadIdForContact = lead.id; leadOwner = userId;
      }
      // de otro closer → no tocar
    }
  }

  // Creadora (módulo Creadoras): resolvemos el teléfono SERVER-SIDE desde creators por
  // creator_id, sin gating de dueño (paridad con el botón actual de Creadoras). Así se
  // mensajea sin que el número viaje al browser (creators.whatsapp_number/phone_e164/phone
  // están enmascarados/revocados para authenticated). Preferimos whatsapp_number > phone_e164 > phone.
  if (!e164 && payload.creator_id) {
    const { data: cr } = await (sb as any)
      .from("creators").select("whatsapp_number, phone_e164, phone, name, artistic_name, instagram_handle").eq("id", payload.creator_id).maybeSingle();
    if (cr) {
      e164 = cleanE164(cr.whatsapp_number) || cleanE164(cr.phone_e164) || cleanE164(cr.phone);
      displayName = displayName || cr.name || cr.artistic_name || cr.instagram_handle || null;
    }
  }

  if (!e164 && payload.phone) {
    e164 = cleanE164(payload.phone);              // fallback leadgen / sin fila de closer
    displayName = displayName || payload.name || null;
  }
  const jid = e164 ? toJid(e164) : null;
  // 200 + ok:false (no 422): con 4xx supabase-js devuelve "Edge Function returned a
  // non-2xx status code" SIN el cuerpo, así que el front mostraba ese texto crudo en
  // un toast rojo en vez del motivo. Mismo patrón que los rechazos de gating de arriba.
  if (!jid) return json({ ok: false, error: "Este contacto no tiene teléfono cargado, así que no se puede abrir un chat de WhatsApp. Agrégale el número desde Editar." });

  // ── find-or-create wa_contact (por tenant + jid) ───────────────────────────
  let contactId: string;
  const { data: existingContact } = await (sb as any)
    .from("wa_contacts").select("id, closer_creator_id, display_name")
    .eq("tenant_id", channel.tenant_id).eq("wa_jid", jid).maybeSingle();
  if (existingContact) {
    contactId = existingContact.id;
    // Backfill: linkear el lead si falta, y completar el nombre si el contacto
    // estaba "sin nombre" (p.ej. se creó antes por teléfono desde Creadoras/Contactos).
    const patch: Record<string, unknown> = {};
    if (!existingContact.closer_creator_id && leadIdForContact) patch.closer_creator_id = leadIdForContact;
    if (!existingContact.display_name && displayName) patch.display_name = displayName;
    if (Object.keys(patch).length > 0) {
      await (sb as any).from("wa_contacts").update(patch).eq("id", contactId);
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
    const assignedTo = (existingConv.assigned_to as string | null) ?? null;
    if (!assignedTo) {
      // SIN asignar → la tomamos para el dueño del lead, o para QUIEN LA ABRE cuando es
      // un contacto sin lead. Antes solo se asignaba si había leadOwner → al abrir un
      // contacto, la conversación (creada por un inbound previo) quedaba sin asignar y la
      // RLS estricta del closer NO se la mostraba → el deep-link caía en panel vacío.
      await (sb as any).from("wa_conversations").update({ assigned_to: ownerForConv }).eq("id", convId);
      await syncAssigneeJoin(sb, convId, ownerForConv);
    } else if (assignedTo !== ownerForConv) {
      // Asignada a OTRA persona: el closer solo ve lo suyo (RLS), así que mandarlo al
      // chat sería un panel en blanco. Si no puede ver todo (no es supervisor+/admin),
      // le avisamos con un rechazo suave (200 + ok:false) en vez de abrir vacío.
      const { data: canSeeAll } = await sb.rpc("is_in_role_group", {
        _user_id: userId, _group: "supervisor_or_above",
      });
      if (!canSeeAll) {
        const { data: owner } = await (sb as any)
          .from("profiles").select("full_name").eq("id", assignedTo).maybeSingle();
        const who = owner?.full_name || "otra persona";
        return json({ ok: false, error: `Esta conversación ya está asignada a ${who}. No puedes abrirla.` });
      }
    }
  } else {
    const { data: newConv, error: vErr } = await (sb as any).from("wa_conversations").insert({
      tenant_id: channel.tenant_id, contact_id: contactId, channel_id: channelId,
      channel_jid: channel.evolution_instance, department: dept, assigned_to: ownerForConv, status: "open",
    }).select("id").single();
    if (vErr) return json({ ok: false, error: "conversation_create_failed: " + vErr.message }, 500);
    convId = newConv.id;
    await syncAssigneeJoin(sb, convId, ownerForConv);
  }

  return json({ ok: true, conversation_id: convId });
});
