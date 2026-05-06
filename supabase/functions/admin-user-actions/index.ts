import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function generateTempPassword(): string {
  // Solo letras+números (sin I/O/0/l/1 para evitar confusiones), sin
  // símbolos. Algunos clientes de email/chat re-codifican `!@#$%` o se
  // pierden en copy/paste manual (caracter invisible, autocorrect).
  // 14 chars de [A-HJ-NP-Z][a-hj-km-z][2-9] = ~83 bits de entropía,
  // suficiente para una contraseña temporal que el usuario cambia al
  // primer login.
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const buf = new Uint32Array(14);
  crypto.getRandomValues(buf);
  let result = "";
  for (let i = 0; i < 14; i++) {
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
      // Generamos un password temporal para que el usuario pueda
      // entrar al primer login sin esperar magic link. Mismo alfabeto
      // (sin símbolos) que reset_password — fácil de copy-paste.
      const tempPassword = generateTempPassword();

      const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
        email,
        password: tempPassword,
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

      // Email de bienvenida con el password temporal — vía Resend en
      // background (waitUntil), igual que reset_password. Si la key no
      // está configurada, devolvemos email_sent=false y el admin
      // tiene que comunicar el password manualmente desde la UI.
      const resendKey = Deno.env.get("RESEND_API_KEY");
      let emailSent = false;
      let emailError: string | null = null;

      if (!resendKey) {
        emailError = "RESEND_API_KEY no configurada";
      } else {
        emailSent = true; // optimistic
        const sendWelcome = async () => {
          try {
            const fromEmail =
              Deno.env.get("NOTIFICATION_FROM_EMAIL") ||
              "Maven CRM <noreply@mail.maven-ai.me>";
            const appUrl = Deno.env.get("APP_URL") || "https://v3.test.maven-ai.me";

            const html = `
              <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e5e7eb;">
                <div style="background:linear-gradient(135deg,#6d28d9,#4338ca);padding:28px 24px;color:#ffffff;">
                  <div style="font-size:11px;font-weight:700;letter-spacing:1.5px;opacity:0.85;text-transform:uppercase;">Maven CRM</div>
                  <h1 style="font-size:22px;font-weight:700;margin:6px 0 0;line-height:1.3;">Bienvenido/a a Maven</h1>
                </div>
                <div style="padding:24px;">
                  <p style="color:#374151;font-size:14px;line-height:1.6;margin:0 0 16px;">
                    Hola <strong>${fullName}</strong>,
                    se creó tu cuenta en Maven CRM. Esta es tu contraseña
                    temporal para iniciar sesión:
                  </p>
                  <div style="margin:18px 0;padding:14px;background:#f3f4f6;border:1px solid #e5e7eb;border-radius:10px;text-align:center;">
                    <code style="font-family:'SF Mono',Menlo,Consolas,monospace;font-size:18px;font-weight:700;letter-spacing:2px;color:#111827;">${tempPassword}</code>
                  </div>
                  <p style="color:#6b7280;font-size:13px;line-height:1.55;margin:0 0 16px;">
                    Iniciá sesión con tu correo (<strong>${email}</strong>)
                    y esta contraseña, después cambiala desde
                    Settings → Cuenta. Si no esperabas este correo,
                    ignoralo o avisale al admin.
                  </p>
                  <div style="text-align:center;margin:20px 0 0;">
                    <a href="${appUrl}" style="display:inline-block;background:linear-gradient(135deg,#6d28d9,#4338ca);color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;padding:12px 28px;border-radius:9999px;">
                      Entrar a Maven →
                    </a>
                  </div>
                </div>
                <div style="background:#f9fafb;padding:14px 24px;text-align:center;border-top:1px solid #e5e7eb;">
                  <p style="color:#9ca3af;font-size:11px;margin:0;">Enviado por Maven CRM · No respondas a este correo.</p>
                </div>
              </div>
            `;

            const resp = await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${resendKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                from: fromEmail,
                to: [email],
                subject: "Maven CRM · Bienvenido/a — tu contraseña temporal",
                html,
              }),
            });
            if (!resp.ok) {
              const body = await resp.text().catch(() => "");
              console.error(
                "[create_user] Resend failed",
                resp.status,
                body.slice(0, 300),
              );
            }
          } catch (e) {
            console.error("[create_user] email exception", e);
          }
        };

        const er = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
        if (er?.waitUntil) er.waitUntil(sendWelcome());
        else void sendWelcome();
      }

      return new Response(
        JSON.stringify({
          success: true,
          user_id: newUser?.user?.id,
          temp_password: tempPassword,
          email_sent: emailSent,
          email_error: emailError,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
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

      // El email viaja en background (Resend tarda 1-3s y no queremos
      // bloquear la respuesta del modal). Devolvemos email_sent=true
      // optimistamente cuando hay key configurada — si Resend falla
      // queda en los logs del edge function. Si la key falta, sí
      // bloqueamos amber para que el admin sepa que tiene que
      // comunicar el password a mano.
      const resendKey = Deno.env.get("RESEND_API_KEY");
      let emailSent = false;
      let emailError: string | null = null;

      if (!resendKey) {
        emailError = "RESEND_API_KEY no configurada";
      } else {
        emailSent = true; // optimistic — el send corre en waitUntil
        const sendEmail = async () => {
          try {
            const { data: targetUser } = await adminClient.auth.admin.getUserById(user_id);
            const targetEmail = targetUser?.user?.email;
            if (!targetEmail) {
              console.error("[reset_password] usuario sin email", user_id);
              return;
            }
            const { data: profile } = await adminClient
              .from("profiles")
              .select("full_name")
              .eq("id", user_id)
              .maybeSingle();
            const fullName = (profile as { full_name?: string } | null)?.full_name ?? "";
            const fromEmail =
              Deno.env.get("NOTIFICATION_FROM_EMAIL") ||
              "Maven CRM <noreply@mail.maven-ai.me>";
            const appUrl = Deno.env.get("APP_URL") || "https://v3.test.maven-ai.me";

            const html = `
              <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e5e7eb;">
                <div style="background:linear-gradient(135deg,#6d28d9,#4338ca);padding:28px 24px;color:#ffffff;">
                  <div style="font-size:11px;font-weight:700;letter-spacing:1.5px;opacity:0.85;text-transform:uppercase;">Maven CRM</div>
                  <h1 style="font-size:22px;font-weight:700;margin:6px 0 0;line-height:1.3;">Tu contraseña fue restablecida</h1>
                </div>
                <div style="padding:24px;">
                  <p style="color:#374151;font-size:14px;line-height:1.6;margin:0 0 16px;">
                    ${fullName ? `Hola <strong>${fullName}</strong>,` : "Hola,"}
                    un administrador de Maven restableció tu contraseña.
                    Esta es tu nueva contraseña temporal:
                  </p>
                  <div style="margin:18px 0;padding:14px;background:#f3f4f6;border:1px solid #e5e7eb;border-radius:10px;text-align:center;">
                    <code style="font-family:'SF Mono',Menlo,Consolas,monospace;font-size:18px;font-weight:700;letter-spacing:2px;color:#111827;">${tempPassword}</code>
                  </div>
                  <p style="color:#6b7280;font-size:13px;line-height:1.55;margin:0 0 16px;">
                    Iniciá sesión con esta contraseña y cambiala inmediatamente
                    desde Settings → Cuenta. Si vos no pediste este reset,
                    avisale al admin lo antes posible.
                  </p>
                  <div style="text-align:center;margin:20px 0 0;">
                    <a href="${appUrl}" style="display:inline-block;background:linear-gradient(135deg,#6d28d9,#4338ca);color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;padding:12px 28px;border-radius:9999px;">
                      Entrar a Maven →
                    </a>
                  </div>
                </div>
                <div style="background:#f9fafb;padding:14px 24px;text-align:center;border-top:1px solid #e5e7eb;">
                  <p style="color:#9ca3af;font-size:11px;margin:0;">Enviado por Maven CRM · No respondas a este correo.</p>
                </div>
              </div>
            `;

            const resp = await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${resendKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                from: fromEmail,
                to: [targetEmail],
                subject: "Maven CRM · Tu contraseña fue restablecida",
                html,
              }),
            });
            if (!resp.ok) {
              const body = await resp.text().catch(() => "");
              console.error(
                "[reset_password] Resend failed",
                resp.status,
                body.slice(0, 300),
              );
            }
          } catch (e) {
            console.error("[reset_password] email exception", e);
          }
        };

        // EdgeRuntime.waitUntil mantiene la function viva hasta que el
        // promise resuelva, sin retener la respuesta HTTP. Si el runtime
        // no expone la API (entornos viejos), caemos a un fire-and-forget
        // estándar — el isolate se mata al final del request y el send
        // puede cortarse, pero eso lo veremos en los logs.
        const er = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
        if (er?.waitUntil) er.waitUntil(sendEmail());
        else void sendEmail();
      }

      return new Response(
        JSON.stringify({
          success: true,
          temp_password: tempPassword,
          email_sent: emailSent,
          email_error: emailError,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
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
