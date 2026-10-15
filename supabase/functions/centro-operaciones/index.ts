import { corsFor } from "../_shared/cors.ts";
import { type ClienteParaRoles, esAdmin } from "../_shared/es-admin.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// EL CENTRO DE OPERACIONES (solo admin).
//
// Devuelve en una sola respuesta lo que está VIVO en la plataforma: cuánta
// gente hay en salas ahora (segmentos de tiempo abiertos con latido fresco),
// reuniones en curso, volumen de la última hora, y un semáforo de servicios
// (la base contesta por el hecho de responder; frontend y LiveKit se pingean
// con timeout corto para que un servicio caído no cuelgue el tablero).
//
// SOLO LEE. El gate es esAdmin (el mismo de admin-user-actions): la pantalla
// es del administrador, no del equipo.

const corsHeaders = (req: Request) =>
  corsFor(req, { "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" });

type Servicio = { nombre: string; ok: boolean; ms: number | null };

/** GET con timeout de 4 s. `ok` si respondió con lo que sea < 500: acá se mide
 *  que el servicio esté VIVO, no que la ruta exista (un 404 también es vida). */
async function ping(nombre: string, url: string): Promise<Servicio> {
  const t0 = Date.now();
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4000);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);
    return { nombre, ok: res.status < 500, ms: Date.now() - t0 };
  } catch {
    return { nombre, ok: false, ms: null };
  }
}

Deno.serve(async (req) => {
  const headers = { ...corsHeaders(req), "Content-Type": "application/json" };
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "No autorizado" }), { status: 401, headers });
    }
    const token = authHeader.replace("Bearer ", "");
    const authClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: userError } = await authClient.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "No autorizado" }), { status: 401, headers });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    if (!(await esAdmin(admin as unknown as ClienteParaRoles, user.id))) {
      return new Response(JSON.stringify({ error: "Solo administradores" }), { status: 403, headers });
    }

    const hace2min = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    const hace1h = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    // "En salas ahora" = segmento abierto con latido en los últimos 2 minutos:
    // un segmento sin ended_at pero con last_seen viejo es alguien que se fue
    // sin cerrar (se cayó el navegador), no alguien presente.
    const [seg, meets, sesiones, msgs, notis, cortes, pings] = await Promise.all([
      admin.from("cowork_tiempo_segmentos").select("user_id, room_id")
        .is("ended_at", null).gte("last_seen_at", hace2min),
      admin.from("cowork_meets").select("id", { count: "exact", head: true }).is("ended_at", null),
      admin.from("cowork_sessions").select("id", { count: "exact", head: true }).is("ended_at", null),
      admin.from("chat_messages").select("id", { count: "exact", head: true }).gte("created_at", hace1h),
      admin.from("notifications").select("id", { count: "exact", head: true }).gte("created_at", hace1h),
      // Cortes de llamada: parpadeos (reconexión interna) + caídas de verdad.
      admin.from("llamada_cortes").select("id", { count: "exact", head: true })
        .gte("creado", hace1h).in("fase", ["caida", "parpadeo"]),
      Promise.all([
        ping("frontend", "https://app.maven-ai.me/"),
        // LIVEKIT_URL viene como wss://; el server de LiveKit contesta en https.
        ping("livekit", (Deno.env.get("LIVEKIT_URL") ?? "").replace(/^wss:/, "https:").replace(/^ws:/, "http:")),
      ]),
    ]);
    if (seg.error) throw new Error(`segmentos: ${seg.error.message}`);

    const filas = seg.data ?? [];
    const servicios: Servicio[] = [
      // Si la base no contestara, esta función ya habría tirado 500.
      { nombre: "base", ok: true, ms: 0 },
      ...pings,
    ];

    return new Response(JSON.stringify({
      ahora: new Date().toISOString(),
      personas_en_salas: new Set(filas.map((f) => f.user_id)).size,
      salas_con_gente: new Set(filas.map((f) => f.room_id)).size,
      sesiones_abiertas: sesiones.count ?? 0,
      reuniones_activas: meets.count ?? 0,
      mensajes_ultima_hora: msgs.count ?? 0,
      notificaciones_ultima_hora: notis.count ?? 0,
      cortes_llamada_ultima_hora: cortes.count ?? 0,
      servicios,
    }), { headers });
  } catch (e) {
    const detalle = e instanceof Error ? e.message : String(e);
    console.error("[centro-operaciones]", detalle);
    return new Response(JSON.stringify({ error: detalle }), { status: 500, headers });
  }
});
