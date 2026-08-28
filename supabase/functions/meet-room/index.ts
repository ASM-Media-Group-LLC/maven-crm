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

    // ═══════════════════════════════════════════════════════════════
    // CREATE
    // ═══════════════════════════════════════════════════════════════
    if (action === "create") {
      // Crear un Meet lo puede hacer CUALQUIERA (fallback 'member'), a diferencia
      // de Cowork que exige supervisor+. Igual pasa por can_use_module_function
      // para que un admin pueda quitarle el permiso a un rol desde la UI.
      const { data: canCreate, error: permErr } = await admin.rpc("can_use_module_function", {
        _user_id: userId,
        _module: "Meet",
        _submodule: "Crear reunión",
        _fallback_group: "member",
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
        .select("id, code, name, livekit_room_name, status, created_by")
        .eq("code", code).maybeSingle();
      if (!room) return err(req, "Código inválido", 404);
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
        .select("id, code, name, livekit_room_name, status, created_by")
        .eq("livekit_room_name", livekitRoom).maybeSingle();
      if (!room) return err(req, "Reunión no encontrada", 404);
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
        .select("id, livekit_room_name").eq("id", id).maybeSingle();
      if (!room) return err(req, "Reunión no encontrada", 404);

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

      const { data: request } = await admin.from("meet_guest_requests")
        .select("id, status, meet_room_id").eq("id", requestId).maybeSingle();
      if (!request) return err(req, "Solicitud no encontrada", 404);
      if (request.status !== "pending") return err(req, "Esa solicitud ya fue resuelta", 409);

      const { data: room } = await admin.from("meet_rooms")
        .select("id, status").eq("id", request.meet_room_id).maybeSingle();
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
    // END — solo el anfitrión
    // ═══════════════════════════════════════════════════════════════
    if (action === "end") {
      const id = String(body.id ?? "");
      if (!id) return err(req, "id required");

      const { data: room } = await admin.from("meet_rooms")
        .select("id, created_by").eq("id", id).maybeSingle();
      if (!room) return err(req, "Reunión no encontrada", 404);
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
