import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TEST_PASSWORD = "MavenTest2025!";

const TEST_USERS = [
  { email: "test-admin@maven.app", role: "admin", name: "Test Admin" },
  { email: "test-manager@maven.app", role: "manager", name: "Test Manager" },
  { email: "test-supervisor@maven.app", role: "supervisor", name: "Test Supervisor" },
  { email: "test-agent@maven.app", role: "agent", name: "Test Agent" },
  { email: "test-closer@maven.app", role: "closer", name: "Test Closer" },
  { email: "test-employee@maven.app", role: "employee", name: "Test Employee" },
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const results = [];

    for (const user of TEST_USERS) {
      // Check if user already exists
      const { data: existing } = await supabaseAdmin.auth.admin.listUsers();
      const found = existing?.users?.find((u: any) => u.email === user.email);

      if (found) {
        // Ensure role exists
        const { data: roleExists } = await supabaseAdmin
          .from("user_roles")
          .select("id")
          .eq("user_id", found.id)
          .maybeSingle();

        if (!roleExists) {
          await supabaseAdmin.from("user_roles").insert({
            user_id: found.id,
            role: user.role,
          });
        }

        // Ensure profile exists
        const { data: profileExists } = await supabaseAdmin
          .from("profiles")
          .select("id")
          .eq("id", found.id)
          .maybeSingle();

        if (!profileExists) {
          await supabaseAdmin.from("profiles").insert({
            id: found.id,
            full_name: user.name,
          });
        }

        results.push({ email: user.email, status: "already_exists", id: found.id });
        continue;
      }

      // Create new user
      const { data: newUser, error } = await supabaseAdmin.auth.admin.createUser({
        email: user.email,
        password: TEST_PASSWORD,
        email_confirm: true,
        user_metadata: { full_name: user.name },
      });

      if (error) {
        results.push({ email: user.email, status: "error", error: error.message });
        continue;
      }

      // The handle_new_user trigger should create profile and assign 'employee' role
      // But we need the correct role, so update if not admin
      if (user.role !== "employee" && newUser.user) {
        await supabaseAdmin
          .from("user_roles")
          .update({ role: user.role })
          .eq("user_id", newUser.user.id);
      }

      results.push({ email: user.email, status: "created", id: newUser.user?.id });
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
