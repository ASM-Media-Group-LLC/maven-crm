import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function generateTempPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%";
  const buf = new Uint32Array(12);
  crypto.getRandomValues(buf);
  let result = "";
  for (let i = 0; i < 12; i++) {
    result += chars[buf[i] % chars.length];
  }
  return result;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      console.error("[admin-user-actions] Missing or malformed Authorization header");
      return new Response(JSON.stringify({ error: "Unauthorized", reason: "missing_auth_header" }), {
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
      console.error("[admin-user-actions] getUser failed:", userError?.message ?? "no user");
      return new Response(JSON.stringify({ error: "Unauthorized", reason: "invalid_token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const callerId = user.id;

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Verify caller is admin
    const { data: callerRole } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId)
      .eq("role", "admin")
      .maybeSingle();

    if (!callerRole) {
      return new Response(JSON.stringify({ error: "Forbidden: admin role required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { action, user_id, full_name, email, first_name, last_name, role } = body;

    if (!action) {
      return new Response(JSON.stringify({ error: "action is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // === LIST USERS (returns emails from auth.users) ===
    if (action === "list_users") {
      const { data: { users }, error: listError } = await adminClient.auth.admin.listUsers({ perPage: 1000 });
      if (listError) {
        return new Response(JSON.stringify({ error: listError.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({
        users: (users || []).map((u) => ({ id: u.id, email: u.email })),
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // For actions other than create_user and list_users, user_id is required
    if (action !== "create_user" && !user_id) {
      return new Response(JSON.stringify({ error: "user_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // === CREATE USER ===
    if (action === "create_user") {
      if (!email || !first_name || !last_name) {
        return new Response(JSON.stringify({ error: "email, first_name, and last_name are required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const fullName = `${first_name} ${last_name}`;

      const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: { full_name: fullName },
      });

      if (createError) {
        return new Response(JSON.stringify({ error: createError.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (role && role !== "employee" && newUser?.user?.id) {
        await adminClient
          .from("user_roles")
          .update({ role })
          .eq("user_id", newUser.user.id);
      }

      return new Response(JSON.stringify({ success: true, user_id: newUser?.user?.id }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Prevent self-destructive actions
    if (action === "delete_user" && user_id === callerId) {
      return new Response(JSON.stringify({ error: "No puedes eliminarte a ti mismo" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "reset_password") {
      const tempPassword = generateTempPassword();

      const { error: resetError } = await adminClient.auth.admin.updateUserById(user_id, {
        password: tempPassword,
      });

      if (resetError) {
        return new Response(JSON.stringify({ error: resetError.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true, temp_password: tempPassword }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "remove_role") {
      if (user_id === callerId) {
        return new Response(JSON.stringify({ error: "No puedes quitarte tu propio rol" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { error: removeError } = await adminClient
        .from("user_roles")
        .delete()
        .eq("user_id", user_id);

      if (removeError) {
        return new Response(JSON.stringify({ error: removeError.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "delete_user") {
      console.log(`[delete_user] Starting deletion for user_id=${user_id}`);

      // 1. Unlink employees referencing this profile
      const { error: unlinkEmpErr } = await adminClient
        .from("employees")
        .update({ profile_id: null })
        .eq("profile_id", user_id);
      if (unlinkEmpErr) console.warn("[delete_user] unlink employees:", unlinkEmpErr.message);

      // 2. Delete project memberships
      const { error: pmErr } = await adminClient
        .from("project_members")
        .delete()
        .eq("user_id", user_id);
      if (pmErr) console.warn("[delete_user] delete project_members:", pmErr.message);

      // 3. Delete chat participations
      const { error: cpErr } = await adminClient
        .from("chat_participants")
        .delete()
        .eq("user_id", user_id);
      if (cpErr) console.warn("[delete_user] delete chat_participants:", cpErr.message);

      // 4. Delete user roles
      const { error: rolesErr } = await adminClient
        .from("user_roles")
        .delete()
        .eq("user_id", user_id);
      if (rolesErr) console.warn("[delete_user] delete user_roles:", rolesErr.message);

      // 5. Delete notifications
      const { error: notifErr } = await adminClient
        .from("notifications")
        .delete()
        .eq("user_id", user_id);
      if (notifErr) console.warn("[delete_user] delete notifications:", notifErr.message);

      // 6. Delete profile
      const { error: profileErr } = await adminClient
        .from("profiles")
        .delete()
        .eq("id", user_id);
      if (profileErr) {
        console.error("[delete_user] delete profile failed:", profileErr.message);
        return new Response(JSON.stringify({ error: `Error eliminando perfil: ${profileErr.message}` }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // 7. Delete auth user
      const { error: deleteError } = await adminClient.auth.admin.deleteUser(user_id);
      if (deleteError) {
        console.error("[delete_user] delete auth user failed:", deleteError.message);
        return new Response(JSON.stringify({ error: `Error eliminando usuario: ${deleteError.message}` }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      console.log(`[delete_user] Successfully deleted user_id=${user_id}`);
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "update_profile") {
      const newFullName = first_name && last_name
        ? `${first_name} ${last_name}`
        : full_name;

      if (!newFullName) {
        return new Response(JSON.stringify({ error: "full_name or first_name+last_name is required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { error: updateError } = await adminClient
        .from("profiles")
        .update({ full_name: newFullName })
        .eq("id", user_id);

      if (updateError) {
        return new Response(JSON.stringify({ error: updateError.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (role) {
        const { error: roleError } = await adminClient
          .from("user_roles")
          .update({ role })
          .eq("user_id", user_id);

        if (roleError) {
          return new Response(JSON.stringify({ error: roleError.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    console.error("[admin-user-actions] Internal error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
