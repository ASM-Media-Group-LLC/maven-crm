import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    if (req.method === "GET") {
      const url = new URL(req.url);
      const token = url.searchParams.get("token");
      if (!token) {
        return new Response(JSON.stringify({ error: "Token requerido" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Find event by external token
      const { data: event, error: eventErr } = await supabase
        .from("events")
        .select("id, name, date, end_date, start_time, end_time, location, event_type, description, project_type, status, external_link_expires_at")
        .eq("external_token", token)
        .single();

      if (eventErr || !event) {
        return new Response(JSON.stringify({ error: "Enlace no válido" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Check expiration
      if (event.external_link_expires_at && new Date(event.external_link_expires_at) < new Date()) {
        return new Response(JSON.stringify({ error: "Este enlace ha expirado" }), {
          status: 410,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Get guests (only public info)
      const { data: guests } = await supabase
        .from("event_guests")
        .select("id, guest_name, guest_type, status, creator_id, creators(name, artistic_name, instagram_handle)")
        .eq("event_id", event.id);

      const guestList = (guests ?? []).map((g: any) => ({
        id: g.id,
        name: g.creators?.artistic_name || g.creators?.name || g.guest_name || "Invitado",
        type: g.guest_type,
        status: g.status,
        instagram_handle: g.creators?.instagram_handle ?? null,
      }));

      return new Response(
        JSON.stringify({
          event: {
            name: event.name,
            date: event.date,
            end_date: event.end_date,
            start_time: event.start_time,
            end_time: event.end_time,
            location: event.location,
            event_type: event.event_type,
            description: event.description,
            project_type: event.project_type,
            status: event.status,
          },
          guests: guestList,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (req.method === "POST") {
      const body = await req.json();
      const { token, guest_id, action, cancellation_reason } = body;

      if (!token || !guest_id || !action) {
        return new Response(JSON.stringify({ error: "Campos requeridos: token, guest_id, action" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (!["confirm", "cancel"].includes(action)) {
        return new Response(JSON.stringify({ error: "Acción no válida" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Validate token
      const { data: event, error: eventErr } = await supabase
        .from("events")
        .select("id, external_link_expires_at")
        .eq("external_token", token)
        .single();

      if (eventErr || !event) {
        return new Response(JSON.stringify({ error: "Enlace no válido" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (event.external_link_expires_at && new Date(event.external_link_expires_at) < new Date()) {
        return new Response(JSON.stringify({ error: "Este enlace ha expirado" }), {
          status: 410,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Verify guest belongs to this event
      const { data: guest } = await supabase
        .from("event_guests")
        .select("id, event_id")
        .eq("id", guest_id)
        .eq("event_id", event.id)
        .single();

      if (!guest) {
        return new Response(JSON.stringify({ error: "Invitado no encontrado en este evento" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const newStatus = action === "confirm" ? "confirmed" : "cancelled";
      const updateData: Record<string, any> = {
        status: newStatus,
        status_changed_by: "external",
      };
      if (action === "cancel" && cancellation_reason) {
        updateData.cancellation_reason = cancellation_reason;
      }

      const { error: updateErr } = await supabase
        .from("event_guests")
        .update(updateData)
        .eq("id", guest_id);

      if (updateErr) {
        return new Response(JSON.stringify({ error: "Error al actualizar estado" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(
        JSON.stringify({ success: true, status: newStatus }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ error: "Método no permitido" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Error interno del servidor" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
