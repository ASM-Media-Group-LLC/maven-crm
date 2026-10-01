import { corsFor } from "../_shared/cors.ts";
import { assertCanManage } from "../_shared/user-hierarchy.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = (req: Request) => corsFor(req, { "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version" });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(req) });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      console.error("[manage-user-roles] Missing or malformed Authorization header");
      return new Response(JSON.stringify({ error: "Unauthorized", reason: "missing_auth_header" }), {
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
      console.error("[manage-user-roles] getUser failed:", userError?.message ?? "no user");
      return new Response(JSON.stringify({ error: "Unauthorized", reason: "invalid_token" }), {
        status: 401,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const callerId = user.id;

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Gate de ENTRADA: permiso de GESTIONAR USUARIOS (can_use_module_function),
    // ya no el literal role='admin'. La jerarquía por acción se chequea abajo con
    // assertCanManage → public.can_manage_user.
    const { data: canManage, error: gateErr } = await adminClient
      .rpc("can_manage_users", { _user_id: callerId });

    if (gateErr || !canManage) {
      return new Response(JSON.stringify({ error: "Forbidden: sin permiso de gestión de usuarios" }), {
        status: 403,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const { action, user_id, role } = await req.json();

    if (!user_id || !action) {
      return new Response(JSON.stringify({ error: "user_id and action are required" }), {
        status: 400,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    if (action === "assign_role") {
      if (!role) {
        return new Response(JSON.stringify({ error: "role is required" }), {
          status: 400,
          headers: { ...corsHeaders(req), "Content-Type": "application/json" },
        });
      }

      // El rol tiene que existir y estar activo EN LA AGENCIA de la persona: desde
      // 20261001190000_roles_por_agencia cada agencia tiene sus roles y el mismo
      // nombre puede estar en varias (con .maybeSingle() eso daba error). select("*")
      // y filtrar aquí: antes de aplicar la migración no hay tenant_id y se acepta
      // el único que hay; después, solo el de su agencia.
      const { data: agenciaDe } = await adminClient
        .from("tenant_members").select("tenant_id").eq("user_id", user_id).maybeSingle();
      const { data: rolesConEseNombre } = await adminClient
        .from("roles_config")
        .select("*")
        .eq("name", role)
        .eq("is_active", true);
      const validRole = (rolesConEseNombre ?? []).find((r: Record<string, unknown>) =>
        !("tenant_id" in r) || r.tenant_id === (agenciaDe as { tenant_id?: string } | null)?.tenant_id);

      if (!validRole) {
        return new Response(JSON.stringify({ error: `Invalid or inactive role: ${role}` }), {
          status: 400,
          headers: { ...corsHeaders(req), "Content-Type": "application/json" },
        });
      }

      // JERARQUÍA: no se puede asignar un rol de nivel >= al propio (estricto).
      const gAssign = await assertCanManage(adminClient, callerId, user_id, "assign_role", role);
      if (!gAssign.ok) {
        return new Response(JSON.stringify(gAssign.body), {
          status: gAssign.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Delete existing roles for this user then insert new one (one role per user)
      await adminClient.from("user_roles").delete().eq("user_id", user_id);
      const { error: insertError } = await adminClient
        .from("user_roles")
        .insert({ user_id, role });

      if (insertError) {
        return new Response(JSON.stringify({ error: insertError.message }), {
          status: 500,
          headers: { ...corsHeaders(req), "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true, user_id, role }), {
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    if (action === "remove_role") {
      // Prevent admin from removing their own admin role
      if (user_id === callerId) {
        return new Response(
          JSON.stringify({ error: "No puedes removerte tu propio rol de admin" }),
          {
            status: 400,
            headers: { ...corsHeaders(req), "Content-Type": "application/json" },
          }
        );
      }

      // JERARQUÍA: no se le puede quitar el rol a alguien de nivel >= al propio.
      const gRemove = await assertCanManage(adminClient, callerId, user_id, "remove_role");
      if (!gRemove.ok) {
        return new Response(JSON.stringify(gRemove.body), {
          status: gRemove.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { error: deleteError } = await adminClient
        .from("user_roles")
        .delete()
        .eq("user_id", user_id);

      if (deleteError) {
        return new Response(JSON.stringify({ error: deleteError.message }), {
          status: 500,
          headers: { ...corsHeaders(req), "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true, user_id }), {
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400,
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    console.error("[manage-user-roles] Internal error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
