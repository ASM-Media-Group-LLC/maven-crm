import { corsFor } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = (req: Request) => corsFor(req);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(req) });
  }

  try {
    // Auth: require a shared cron secret
    const cronSecret = Deno.env.get("CRON_SECRET");
    const reqSecret = req.headers.get("x-cron-secret");
    if (!cronSecret || reqSecret !== cronSecret) {
      // Fallback: check for valid JWT bearer token (admin)
      const authHeader = req.headers.get("Authorization");
      if (!authHeader?.startsWith("Bearer ")) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders(req), "Content-Type": "application/json" },
        });
      }
      const token = authHeader.replace("Bearer ", "");
      const authClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } }
      );
      const { data: { user }, error: userError } = await authClient.auth.getUser(token);
      if (userError || !user?.id) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders(req), "Content-Type": "application/json" },
        });
      }
      // Verify caller is admin
      const adminCheck = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );
      const { data: callerRole } = await adminCheck
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "admin")
        .maybeSingle();
      if (!callerRole) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
          headers: { ...corsHeaders(req), "Content-Type": "application/json" },
        });
      }
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Los avisos de Tareas y Eventos se eliminaron junto con esas features
    // (2026-08). Esta función queda como punto de enganche para futuras
    // automatizaciones de notificaciones.
    const results: Record<string, number> = {};

    // ─── Update automation log ────────────────────────────────────
    await supabase
      .from("notification_automation_log")
      .upsert(
        {
          automation_type: "hourly_check",
          last_run_at: new Date().toISOString(),
          records_processed: 0,
        },
        { onConflict: "automation_type" }
      );

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Automation error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
    );
  }
});
