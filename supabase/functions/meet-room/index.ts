import { corsFor } from "../_shared/cors.ts";
// Meet: administración de reuniones ad-hoc (crear, entrar por código, listar, terminar).
//
// NO emite tokens de LiveKit: el front navega a /call/<livekit_room_name> y ahí
// VideoCallPage pide el token a `livekit-token` como en cualquier otra llamada.
// Reusar ese camino evita duplicar la emisión de tokens en dos lugares — el
// anfitrión se resuelve allá mirando meet_rooms.created_by.
//
// Corre con service_role para el canje de código: quien tiene el código NO
// necesita poder leer la tabla (ni enumerarla), igual que el join de Cowork.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { agenciaDePersona, agenciaDeReunion, revisarSala, SIN_AGENCIA } from "../_shared/livekit-agencia.ts";
import { correosDeInvitacion, firmarLink, sirveParaReusar, vencimientoDelLink } from "../_shared/meet-link.ts";

const corsHeaders = (req: Request) => corsFor(req, { "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version" });

function json(req: Request, data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders(req), "Content-Type": "application/json" } });
}

function err(req: Request, msg: string, status = 400) {
  return json(req, { error: msg }, status);
}

// La gente pega el código como le llega: minúsculas, espacios, guiones.
// El front normaliza igual (lib/coworkRoomCode.ts), pero no confiamos en eso.
function normalizeCode(raw: unknown): string {
  return String(raw ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
}

// Sumar la reunión a la lista de alguien. Se llama al crear y al entrar por
// código o link: así una reunión que te pasaron te queda a mano, con el nombre
// que le puso el anfitrión.
async function rememberMembership(admin: any, meetRoomId: string, userId: string) {
  await admin.from("meet_room_members")
    .upsert({ meet_room_id: meetRoomId, user_id: userId }, { onConflict: "meet_room_id,user_id", ignoreDuplicates: true });
}

// Supervisores y arriba (Alvaro, 17/11): crean Meets, reparten links para gente
// de afuera y admiten invitados. Los chatters no. Si la consulta falla NO se
// concluye «no puede»: se corta con error (un fallo no es un «no»).
// deno-lint-ignore no-explicit-any
async function esSupervisorOMas(admin: any, userId: string): Promise<boolean> {
  const { data, error } = await admin.rpc("is_in_role_group", { _user_id: userId, _group: "supervisor_or_above" });
  if (error) throw new Error(`No se pudo revisar tu rol: ${error.message}`);
  return data === true;
}

const SOLO_SUPERVISORES = "Solo supervisores y arriba pueden invitar gente de afuera";

const secretoDeLinks = () =>
  Deno.env.get("MEET_LINK_SECRET") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const urlDeLaApp = () => (Deno.env.get("APP_URL") || "https://app.maven-ai.me").replace(/\/$/, "");

function escapar(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

// El link de invitado de una sala para esta persona: reusa uno vivo suyo (con
// al menos una hora por delante) o crea uno nuevo. Devuelve el texto del link
// (id.firma), que nunca se guarda en la base.
// deno-lint-ignore no-explicit-any
async function linkDeInvitado(admin: any, opts: {
  sala: string; familia: "meet" | "llamada"; agencia: string; userId: string;
  meetRoomId: string | null; agendadaPara: Date | null;
}): Promise<{ link: string; expiresAt: string }> {
  const ahora = new Date();
  const { data: vivos, error: leerErr } = await admin.from("meet_invite_links")
    .select("id, expires_at")
    .eq("livekit_room_name", opts.sala).eq("created_by", opts.userId)
    .is("revoked_at", null).gt("expires_at", ahora.toISOString())
    .order("expires_at", { ascending: false }).limit(1);
  if (leerErr) throw new Error(leerErr.message);
  const vivo = (vivos ?? [])[0];
  if (vivo && sirveParaReusar(vivo.expires_at, ahora)) {
    return { link: await firmarLink(vivo.id, secretoDeLinks()), expiresAt: vivo.expires_at };
  }
  const { data: nuevo, error: insErr } = await admin.from("meet_invite_links")
    .insert({
      livekit_room_name: opts.sala,
      meet_room_id: opts.meetRoomId,
      tenant_id: opts.agencia,
      created_by: opts.userId,
      expires_at: vencimientoDelLink(opts.familia, ahora, opts.agendadaPara).toISOString(),
    })
    .select("id, expires_at").single();
  if (insErr) throw new Error(insErr.message);
  return { link: await firmarLink(nuevo.id, secretoDeLinks()), expiresAt: nuevo.expires_at };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(req) });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return err(req, "Unauthorized", 401);

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: userData, error: authErr } = await supabase.auth.getUser();
    if (authErr || !userData?.user) return err(req, "Unauthorized", 401);
    const userId = userData.user.id;

    const body = await req.json();
    const { action } = body;

    // ── Cada reunión es de una agencia (entrega 3c) ──────────────────────
    // Con service_role esta función veía TODAS las reuniones: con el código o el
    // nombre de sala de otra agencia se entraba (joinByCode, resolve), se le
    // cambiaba el nombre o se terminaba (rename, end), y cualquiera admitía a un
    // invitado en cualquier reunión (decideGuest). Ahora, una reunión de otra
    // agencia contesta igual que una que no existe; quien no es de la agencia
    // entra como invitado, por la sala de espera (MeetGuestPage cae sola al
    // formulario de invitado cuando joinByCode no responde OK).
    const miAgencia = await agenciaDePersona(admin, userId);
    if (!miAgencia) return err(req, SIN_AGENCIA, 403);
    // deno-lint-ignore no-explicit-any
    const esDeMiAgencia = async (reunion: any) => !!reunion && await agenciaDeReunion(admin, reunion) === miAgencia;

    // ═══════════════════════════════════════════════════════════════
    // CREATE
    // ═══════════════════════════════════════════════════════════════
    if (action === "create") {
      // Crear un Meet: supervisores y arriba (Alvaro, 17/11/2026; antes lo
      // podía cualquiera). Es un piso duro: aunque Administración → Roles le
      // marque el permiso a un rol de chatter, no crea. Arriba del piso sigue
      // pasando por can_use_module_function para que un admin se lo pueda quitar
      // a un rol de supervisor.
      if (!(await esSupervisorOMas(admin, userId))) {
        return err(req, "Solo supervisores y arriba pueden crear reuniones", 403);
      }
      const { data: canCreate, error: permErr } = await admin.rpc("can_use_module_function", {
        _user_id: userId,
        _module: "Meet",
        _submodule: "Crear reunión",
        _fallback_group: "supervisor_or_above",
      });
      if (permErr) return err(req, permErr.message, 500);
      if (!canCreate) return err(req, "Tu rol no permite crear reuniones", 403);

      // Tope por persona para que nadie acumule reuniones abiertas para siempre.
      const { count: activeCount } = await admin.from("meet_rooms")
        .select("*", { count: "exact", head: true })
        .eq("created_by", userId).eq("status", "active");
      if (activeCount !== null && activeCount >= 10) {
        return err(req, "Tienes 10 reuniones abiertas. Termina alguna para crear otra.");
      }

      const rawName = String(body.name ?? "").trim();
      const name = (rawName || "Reunión").slice(0, 80);
      const livekitRoom = `meet_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;

      const { data: room, error: insErr } = await admin.from("meet_rooms")
        .insert({ name, livekit_room_name: livekitRoom, created_by: userId })
        .select("id, code, name, livekit_room_name, created_at")
        .single();
      if (insErr) return err(req, insErr.message, 500);

      await rememberMembership(admin, room.id, userId);
      return json(req, { room });
    }

    // ═══════════════════════════════════════════════════════════════
    // JOIN BY CODE — canjea el código por los datos de la reunión
    // ═══════════════════════════════════════════════════════════════
    if (action === "joinByCode") {
      const code = normalizeCode(body.code);
      if (code.length !== 6) return err(req, "El código debe tener 6 caracteres");

      const { data: room } = await admin.from("meet_rooms")
        .select("*")
        .eq("code", code).maybeSingle();
      if (!room || !(await esDeMiAgencia(room))) return err(req, "Código inválido", 404);
      if (room.status !== "active") return err(req, "Esa reunión ya terminó", 410);

      await rememberMembership(admin, room.id, userId);
      return json(req, {
        room: {
          id: room.id, code: room.code, name: room.name,
          livekit_room_name: room.livekit_room_name,
          isHost: room.created_by === userId,
        },
      });
    }

    // ═══════════════════════════════════════════════════════════════
    // RESOLVE — datos de la reunión a partir de su sala de LiveKit
    // (para quien llega por link `/call/meet_xxx` y necesita el nombre)
    // ═══════════════════════════════════════════════════════════════
    if (action === "resolve") {
      const livekitRoom = String(body.livekitRoom ?? "").trim();
      if (!livekitRoom.startsWith("meet_")) return err(req, "No es una sala de Meet");

      const { data: room } = await admin.from("meet_rooms")
        .select("*")
        .eq("livekit_room_name", livekitRoom).maybeSingle();
      if (!room || !(await esDeMiAgencia(room))) return err(req, "Reunión no encontrada", 404);
      if (room.status !== "active") return err(req, "Esa reunión ya terminó", 410);

      await rememberMembership(admin, room.id, userId);
      return json(req, {
        room: {
          id: room.id, code: room.code, name: room.name,
          livekit_room_name: room.livekit_room_name,
          isHost: room.created_by === userId,
        },
      });
    }

    // ═══════════════════════════════════════════════════════════════
    // RENAME — ponerle nombre a la reunión
    // El nombre vive en meet_rooms, así que el cambio lo ven TODOS los que la
    // tienen en su lista, no solo quien lo escribió.
    // ═══════════════════════════════════════════════════════════════
    if (action === "rename") {
      const id = String(body.id ?? "");
      const clean = String(body.name ?? "").trim();
      if (!id) return err(req, "id required");
      if (!clean) return err(req, "Escribe un nombre para la reunión");

      const { data: room } = await admin.from("meet_rooms")
        .select("*").eq("id", id).maybeSingle();
      if (!room || !(await esDeMiAgencia(room))) return err(req, "Reunión no encontrada", 404);

      // Anfitrión, co-anfitrión o admin: la misma regla que para moderar.
      const { data: puede } = await admin.rpc("can_moderate_livekit_room", {
        _user_id: userId, _room: room.livekit_room_name,
      });
      if (!puede) return err(req, "Solo el anfitrión puede cambiarle el nombre", 403);

      const { data: updated, error: upErr } = await admin.from("meet_rooms")
        .update({ name: clean.slice(0, 80) }).eq("id", id)
        .select("id, name").single();
      if (upErr) return err(req, upErr.message, 500);
      return json(req, { room: updated });
    }

    // ═══════════════════════════════════════════════════════════════
    // PIN y ORDEN — preferencias de MI lista, no de la reunión
    // Se escriben solo sobre mis propias filas: nadie reordena la lista ajena.
    // ═══════════════════════════════════════════════════════════════
    if (action === "setPinned") {
      const id = String(body.id ?? "");
      if (!id) return err(req, "id required");
      const { error: upErr } = await admin.from("meet_room_members")
        .update({ pinned: body.pinned === true })
        .eq("meet_room_id", id).eq("user_id", userId);
      if (upErr) return err(req, upErr.message, 500);
      return json(req, { ok: true });
    }

    if (action === "reorder") {
      const ids: string[] = Array.isArray(body.orderedIds) ? body.orderedIds : [];
      if (!ids.length) return err(req, "orderedIds required");
      for (let i = 0; i < ids.length; i++) {
        await admin.from("meet_room_members")
          .update({ sort_order: i })
          .eq("meet_room_id", ids[i]).eq("user_id", userId);
      }
      return json(req, { ok: true });
    }

    // ═══════════════════════════════════════════════════════════════
    // DECIDE GUEST — admitir o rechazar a un invitado sin cuenta
    //
    // Como en Google: a alguien de fuera de la organización solo lo admite
    // alguien de adentro. Acá "de adentro" = tener cuenta en Maven, que es lo
    // que este endpoint ya exige. El invitado NO recibe token al golpear: lo
    // canjea después contra la edge pública, y solo si esto lo admitió.
    // ═══════════════════════════════════════════════════════════════
    if (action === "decideGuest") {
      const requestId = String(body.requestId ?? "");
      const admit = body.admit === true;
      if (!requestId) return err(req, "requestId required");
      // Dejar entrar a alguien de afuera es invitarlo: supervisores y arriba.
      if (!(await esSupervisorOMas(admin, userId))) return err(req, SOLO_SUPERVISORES, 403);

      const { data: request } = await admin.from("meet_guest_requests")
        .select("id, status, meet_room_id").eq("id", requestId).maybeSingle();
      if (!request) return err(req, "Solicitud no encontrada", 404);
      if (request.status !== "pending") return err(req, "Esa solicitud ya fue resuelta", 409);

      const { data: room } = await admin.from("meet_rooms")
        .select("*").eq("id", request.meet_room_id).maybeSingle();
      // A un invitado lo admite alguien de la agencia de la reunión, no cualquier
      // cuenta de Maven (la base también lo exige: meet_invitados_agencia).
      if (!(await esDeMiAgencia(room))) return err(req, "Solicitud no encontrada", 404);
      if (!room || room.status !== "active") return err(req, "Esa reunión ya terminó", 410);

      const { error: upErr } = await admin.from("meet_guest_requests")
        .update({
          status: admit ? "admitted" : "denied",
          decided_at: new Date().toISOString(),
          decided_by: userId,
        })
        .eq("id", requestId);
      if (upErr) return err(req, upErr.message, 500);

      return json(req, { ok: true, status: admit ? "admitted" : "denied" });
    }

    // ═══════════════════════════════════════════════════════════════
    // INVITE LINK — link directo para alguien de afuera (sin cuenta, sin
    // sala de espera). Sirve para un Meet (meet_…) y para una llamada del
    // Messenger (call-<conversación>). Solo supervisores y arriba.
    // ═══════════════════════════════════════════════════════════════
    if (action === "inviteLink") {
      if (!(await esSupervisorOMas(admin, userId))) return err(req, SOLO_SUPERVISORES, 403);
      const sala = await revisarSala(admin, miAgencia, body.livekitRoom);
      if (!sala.ok) return err(req, sala.error, sala.status);
      const livekitRoom = String(body.livekitRoom);

      let meetRoomId: string | null = null;
      let agendadaPara: Date | null = null;
      if (sala.familia === "meet") {
        const { data: room } = await admin.from("meet_rooms").select("*")
          .eq("livekit_room_name", livekitRoom).maybeSingle();
        if (!room || !(await esDeMiAgencia(room))) return err(req, "Reunión no encontrada", 404);
        if (room.status !== "active") return err(req, "Esa reunión ya terminó", 410);
        meetRoomId = room.id;
        agendadaPara = room.scheduled_for ? new Date(room.scheduled_for) : null;
      } else if (sala.familia === "llamada") {
        // Solo quien es de ESA conversación reparte links a su llamada.
        const conversacion = livekitRoom.slice("call-".length);
        const { data: soyParte, error: pErr } = await admin.from("chat_participants")
          .select("user_id").eq("conversation_id", conversacion).eq("user_id", userId).limit(1);
        if (pErr) return err(req, pErr.message, 500);
        if (!soyParte?.length) return err(req, "Sala no encontrada", 404);
      } else {
        return err(req, "Las salas de Cowork no tienen link de invitado", 403);
      }

      const { link, expiresAt } = await linkDeInvitado(admin, {
        sala: livekitRoom, familia: sala.familia, agencia: sala.agencia, userId, meetRoomId, agendadaPara,
      });
      return json(req, { link, expiresAt });
    }

    // ═══════════════════════════════════════════════════════════════
    // REVOKE INVITE LINKS — anular los links de invitado de una sala (si un
    // link se compartió de más). Quien modera la sala anula todos; los demás,
    // solo los suyos. Los que ya están adentro siguen; nadie más entra con esos.
    // ═══════════════════════════════════════════════════════════════
    if (action === "revokeInviteLinks") {
      const sala = await revisarSala(admin, miAgencia, body.livekitRoom);
      if (!sala.ok) return err(req, sala.error, sala.status);
      const livekitRoom = String(body.livekitRoom);
      const { data: modera } = await admin.rpc("can_moderate_livekit_room", { _user_id: userId, _room: livekitRoom });
      let q = admin.from("meet_invite_links")
        .update({ revoked_at: new Date().toISOString(), revoked_by: userId })
        .eq("livekit_room_name", livekitRoom).is("revoked_at", null);
      if (modera !== true) q = q.eq("created_by", userId);
      const { error: upErr } = await q;
      if (upErr) return err(req, upErr.message, 500);
      return json(req, { ok: true });
    }

    // ═══════════════════════════════════════════════════════════════
    // SCHEDULE — agendar un Meet para una hora y mandar la invitación por
    // correo con el link de invitado. Supervisores y arriba.
    //
    // El correo lo arma ESTE servidor (asunto y cuerpo fijos, con el nombre,
    // la hora y el link): el navegador solo manda nombre, hora y direcciones.
    // send-call-invitation se apagó justamente por aceptar HTML del cliente
    // (relevo de phishing). Tope de 25 direcciones por reunión.
    // ═══════════════════════════════════════════════════════════════
    if (action === "schedule") {
      if (!(await esSupervisorOMas(admin, userId))) return err(req, "Solo supervisores y arriba pueden agendar reuniones", 403);
      const { data: canCreate, error: permErr } = await admin.rpc("can_use_module_function", {
        _user_id: userId, _module: "Meet", _submodule: "Crear reunión", _fallback_group: "supervisor_or_above",
      });
      if (permErr) return err(req, permErr.message, 500);
      if (!canCreate) return err(req, "Tu rol no permite crear reuniones", 403);

      const cuando = new Date(String(body.startsAt ?? ""));
      if (isNaN(cuando.getTime())) return err(req, "Elige el día y la hora de la reunión");
      if (cuando.getTime() < Date.now() - 5 * 60 * 1000) return err(req, "Esa hora ya pasó");
      if (cuando.getTime() > Date.now() + 90 * 24 * 60 * 60 * 1000) return err(req, "Agenda con menos de 90 días de anticipación");
      const correos = correosDeInvitacion(body.emails);
      const zona = String(body.timeZone ?? "").slice(0, 60) || "America/Bogota";

      const { count: activeCount } = await admin.from("meet_rooms")
        .select("*", { count: "exact", head: true })
        .eq("created_by", userId).eq("status", "active");
      if (activeCount !== null && activeCount >= 10) {
        return err(req, "Tienes 10 reuniones abiertas. Termina alguna para crear otra.");
      }

      const name = (String(body.name ?? "").trim() || "Reunión").slice(0, 80);
      const livekitRoom = `meet_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
      const { data: room, error: insErr } = await admin.from("meet_rooms")
        .insert({ name, livekit_room_name: livekitRoom, created_by: userId, scheduled_for: cuando.toISOString() })
        .select("*")
        .single();
      if (insErr) return err(req, insErr.message, 500);
      // La base ya la pone en mi agencia (trigger meet_rooms_agencia); se
      // confirma igual antes de repartir un link que la abre a gente de afuera.
      if (!(await esDeMiAgencia(room))) return err(req, "Reunión no encontrada", 404);
      await rememberMembership(admin, room.id, userId);

      const { link, expiresAt } = await linkDeInvitado(admin, {
        sala: livekitRoom, familia: "meet", agencia: miAgencia, userId, meetRoomId: room.id, agendadaPara: cuando,
      });
      const url = `${urlDeLaApp()}/unirse/${link}`;

      // Correo: con Resend si hay llave. Sin llave la reunión igual queda
      // agendada y el link vuelve para copiarlo a mano (la UI lo avisa).
      const llave = Deno.env.get("RESEND_API_KEY");
      let enviados = 0;
      const fallidos: string[] = [];
      if (correos.length && llave) {
        const { data: perfil } = await admin.from("profiles").select("full_name").eq("id", userId).maybeSingle();
        const quien = String(perfil?.full_name || "Maven").slice(0, 80);
        let hora: string;
        try {
          hora = new Intl.DateTimeFormat("es", { dateStyle: "full", timeStyle: "short", timeZone: zona }).format(cuando);
        } catch {
          hora = new Intl.DateTimeFormat("es", { dateStyle: "full", timeStyle: "short", timeZone: "UTC" }).format(cuando) + " (UTC)";
        }
        const remitenteRaw = Deno.env.get("NOTIFICATION_FROM_EMAIL") || "noreply@mail.maven-ai.me";
        const from = remitenteRaw.includes("<") ? remitenteRaw : `Maven <${remitenteRaw}>`;
        const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#0f172a">
  <p style="font-size:14px;color:#64748b;margin:0 0 6px">${escapar(quien)} te invitó a una reunión</p>
  <h1 style="font-size:22px;margin:0 0 12px">${escapar(name)}</h1>
  <p style="font-size:15px;margin:0 0 20px">${escapar(hora)}</p>
  <a href="${escapar(url)}" style="display:inline-block;background:#0f172a;color:#fff;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:600">Entrar a la reunión</a>
  <p style="font-size:12px;color:#64748b;margin:20px 0 0">No necesitas cuenta: abre el link, escribe tu nombre y entras.<br>${escapar(url)}</p>
</div>`;
        for (const para of correos) {
          try {
            const r = await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: { Authorization: `Bearer ${llave}`, "Content-Type": "application/json" },
              body: JSON.stringify({
                from, to: [para],
                subject: `Invitación: ${name} · ${hora}`,
                html,
                tags: [{ name: "type", value: "meet_invitacion" }],
              }),
            });
            if (r.ok) enviados++; else fallidos.push(para);
          } catch {
            fallidos.push(para);
          }
        }
      }

      return json(req, {
        room: {
          id: room.id, code: room.code, name: room.name, livekit_room_name: room.livekit_room_name,
          created_at: room.created_at, scheduled_for: room.scheduled_for,
        },
        link, expiresAt,
        correo: { pedidos: correos.length, enviados, fallidos, configurado: !!llave },
      });
    }

    // ═══════════════════════════════════════════════════════════════
    // END — solo el anfitrión
    // ═══════════════════════════════════════════════════════════════
    if (action === "end") {
      const id = String(body.id ?? "");
      if (!id) return err(req, "id required");

      const { data: room } = await admin.from("meet_rooms")
        .select("*").eq("id", id).maybeSingle();
      if (!room || !(await esDeMiAgencia(room))) return err(req, "Reunión no encontrada", 404);
      if (room.created_by !== userId) return err(req, "Solo el anfitrión puede terminar la reunión", 403);

      const { error: upErr } = await admin.from("meet_rooms")
        .update({ status: "ended", ended_at: new Date().toISOString() })
        .eq("id", id);
      if (upErr) return err(req, upErr.message, 500);

      return json(req, { ok: true });
    }

    return err(req, "Unknown action: " + action);
  } catch (e) {
    console.error("meet-room error:", e);
    return err(req, "Internal server error", 500);
  }
});
