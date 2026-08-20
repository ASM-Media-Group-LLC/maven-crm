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

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function err(msg: string, status = 400) {
  return json({ error: msg }, status);
}

// La gente pega el código como le llega: minúsculas, espacios, guiones.
// El front normaliza igual (lib/coworkRoomCode.ts), pero no confiamos en eso.
function normalizeCode(raw: unknown): string {
  return String(raw ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return err("Unauthorized", 401);

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: userData, error: authErr } = await supabase.auth.getUser();
    if (authErr || !userData?.user) return err("Unauthorized", 401);
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
      if (permErr) return err(permErr.message, 500);
      if (!canCreate) return err("Tu rol no permite crear reuniones", 403);

      // Tope por persona para que nadie acumule reuniones abiertas para siempre.
      const { count: activeCount } = await admin.from("meet_rooms")
        .select("*", { count: "exact", head: true })
        .eq("created_by", userId).eq("status", "active");
      if (activeCount !== null && activeCount >= 10) {
        return err("Tenés 10 reuniones abiertas. Terminá alguna para crear otra.");
      }

      const rawName = String(body.name ?? "").trim();
      const name = (rawName || "Reunión").slice(0, 80);
      const livekitRoom = `meet_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;

      const { data: room, error: insErr } = await admin.from("meet_rooms")
        .insert({ name, livekit_room_name: livekitRoom, created_by: userId })
        .select("id, code, name, livekit_room_name, created_at")
        .single();
      if (insErr) return err(insErr.message, 500);

      return json({ room });
    }

    // ═══════════════════════════════════════════════════════════════
    // JOIN BY CODE — canjea el código por los datos de la reunión
    // ═══════════════════════════════════════════════════════════════
    if (action === "joinByCode") {
      const code = normalizeCode(body.code);
      if (code.length !== 6) return err("El código debe tener 6 caracteres");

      const { data: room } = await admin.from("meet_rooms")
        .select("id, code, name, livekit_room_name, status, created_by")
        .eq("code", code).maybeSingle();
      if (!room) return err("Código inválido", 404);
      if (room.status !== "active") return err("Esa reunión ya terminó", 410);

      return json({
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
      if (!livekitRoom.startsWith("meet_")) return err("No es una sala de Meet");

      const { data: room } = await admin.from("meet_rooms")
        .select("id, code, name, livekit_room_name, status, created_by")
        .eq("livekit_room_name", livekitRoom).maybeSingle();
      if (!room) return err("Reunión no encontrada", 404);
      if (room.status !== "active") return err("Esa reunión ya terminó", 410);

      return json({
        room: {
          id: room.id, code: room.code, name: room.name,
          livekit_room_name: room.livekit_room_name,
          isHost: room.created_by === userId,
        },
      });
    }

    // ═══════════════════════════════════════════════════════════════
    // END — solo el anfitrión
    // ═══════════════════════════════════════════════════════════════
    if (action === "end") {
      const id = String(body.id ?? "");
      if (!id) return err("id required");

      const { data: room } = await admin.from("meet_rooms")
        .select("id, created_by").eq("id", id).maybeSingle();
      if (!room) return err("Reunión no encontrada", 404);
      if (room.created_by !== userId) return err("Solo el anfitrión puede terminar la reunión", 403);

      const { error: upErr } = await admin.from("meet_rooms")
        .update({ status: "ended", ended_at: new Date().toISOString() })
        .eq("id", id);
      if (upErr) return err(upErr.message, 500);

      return json({ ok: true });
    }

    return err("Unknown action: " + action);
  } catch (e) {
    console.error("meet-room error:", e);
    return err("Internal server error", 500);
  }
});
