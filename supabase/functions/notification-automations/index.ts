import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
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
          headers: { ...corsHeaders, "Content-Type": "application/json" },
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
          headers: { ...corsHeaders, "Content-Type": "application/json" },
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
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const results = {
      overdue_tasks: 0,
      stale_tasks: 0,
      upcoming_events: 0,
    };

    // ─── 1. Overdue Tasks ──────────────────────────────────────────
    {
      const { data: tasks } = await supabase
        .from("tasks")
        .select("id, title, assigned_to, due_at")
        .lt("due_at", new Date().toISOString())
        .not("status", "eq", "completed")
        .not("assigned_to", "is", null);

      if (tasks && tasks.length > 0) {
        const notifications = [];
        for (const task of tasks) {
          const automationKey = `overdue_task_${task.id}`;
          // Check if already notified
          const { data: existing } = await supabase
            .from("notifications")
            .select("id")
            .eq("automation_key", automationKey)
            .maybeSingle();

          if (!existing) {
            notifications.push({
              user_id: task.assigned_to,
              type: "task_overdue",
              title: "Tarea vencida",
              message: `La tarea "${task.title}" ha superado su fecha límite.`,
              reference_id: task.id,
              reference_type: "task",
              module_origin: "tareas",
              priority: "high",
              status: "new",
              deep_link_url: `/tareas?taskId=${task.id}`,
              required_permission_module: "Tareas",
              automation_key: automationKey,
            });
          }
        }

        if (notifications.length > 0) {
          const { error } = await supabase
            .from("notifications")
            .insert(notifications);
          if (error) console.error("Error inserting overdue task notifications:", error);
          results.overdue_tasks = notifications.length;
        }
      }
    }

    // ─── 2. Stale Tasks (in_progress >7 days without update) ──────
    {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const { data: tasks } = await supabase
        .from("tasks")
        .select("id, title, assigned_to, updated_at")
        .eq("status", "in_progress")
        .lt("updated_at", sevenDaysAgo.toISOString())
        .not("assigned_to", "is", null);

      if (tasks && tasks.length > 0) {
        const notifications = [];
        for (const task of tasks) {
          const automationKey = `stale_task_${task.id}_${new Date().toISOString().slice(0, 10)}`;
          const { data: existing } = await supabase
            .from("notifications")
            .select("id")
            .eq("automation_key", automationKey)
            .maybeSingle();

          if (!existing) {
            notifications.push({
              user_id: task.assigned_to,
              type: "task_stale",
              title: "Tarea sin actividad",
              message: `La tarea "${task.title}" lleva más de 7 días sin actualizarse.`,
              reference_id: task.id,
              reference_type: "task",
              module_origin: "tareas",
              priority: "medium",
              status: "new",
              deep_link_url: `/tareas?taskId=${task.id}`,
              required_permission_module: "Tareas",
              automation_key: automationKey,
            });
          }
        }

        if (notifications.length > 0) {
          await supabase.from("notifications").insert(notifications);
          results.stale_tasks = notifications.length;
        }
      }
    }

    // ─── 3. Upcoming Events (next 24h) ────────────────────────────
    {
      const now = new Date();
      const tomorrow = new Date();
      tomorrow.setHours(tomorrow.getHours() + 24);

      const todayStr = now.toISOString().slice(0, 10);
      const tomorrowStr = tomorrow.toISOString().slice(0, 10);

      const { data: events } = await supabase
        .from("events")
        .select("id, name, date, created_by")
        .gte("date", todayStr)
        .lte("date", tomorrowStr)
        .eq("status", "active");

      if (events && events.length > 0) {
        const notifications = [];
        for (const event of events) {
          const automationKey = `event_reminder_${event.id}_${todayStr}`;
          const { data: existing } = await supabase
            .from("notifications")
            .select("id")
            .eq("automation_key", automationKey)
            .maybeSingle();

          if (!existing && event.created_by) {
            notifications.push({
              user_id: event.created_by,
              type: "event_reminder",
              title: "Recordatorio de evento",
              message: `El evento "${event.name}" es en las próximas 24 horas.`,
              reference_id: event.id,
              reference_type: "event",
              module_origin: "eventos",
              priority: "medium",
              status: "new",
              deep_link_url: `/eventos/${event.id}`,
              required_permission_module: "Eventos",
              automation_key: automationKey,
            });
          }
        }

        if (notifications.length > 0) {
          await supabase.from("notifications").insert(notifications);
          results.upcoming_events = notifications.length;
        }
      }
    }

    // ─── Update automation log ────────────────────────────────────
    await supabase
      .from("notification_automation_log")
      .upsert(
        {
          automation_type: "hourly_check",
          last_run_at: new Date().toISOString(),
          records_processed:
            results.overdue_tasks + results.stale_tasks + results.upcoming_events,
        },
        { onConflict: "automation_type" }
      );

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Automation error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
