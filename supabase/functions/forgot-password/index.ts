// Self-service "forgot password" — el user pide reset desde
// /forgot-password. Esta edge function:
//   1. Genera un recovery link via Supabase admin API
//      (auth.admin.generateLink) con redirectTo a nuestra pantalla
//      /reset-password.
//   2. Envía un email custom Maven-branded via Resend con el link.
//
// Por qué NO usamos supabase.auth.resetPasswordForEmail():
//   · El template default de Supabase manda un link que pasa por
//     supabase.co antes de redirigir — frágil cuando el Site URL del
//     proyecto Auth no está perfectamente alineado.
//   · Email genérico, sin branding, sin opción de customizar copy.
//
// No requiere autenticación — es público porque el user todavía no
// puede loguearse. SI requiere email válido (sino, no hace nada).
//
// Seguridad: nunca revelamos si el email existe o no — siempre
// respondemos 200 ok. Si el email no está registrado, la admin API
// devuelve error y lo logueamos pero NO se lo mostramos al user
// (anti-enumeration).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const RATE_LIMIT_PER_HOUR = 5; // por email — anti-abuse

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email } = (await req.json()) as { email?: string };
    if (!email || typeof email !== "string") {
      return new Response(JSON.stringify({ error: "email required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedEmail)) {
      return new Response(JSON.stringify({ error: "email inválido" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // Rate limit naive: contar últimas N horas de password_recovery
    // events para este email. La tabla auth.audit_log_entries no es
    // pública desde edge, así que usamos un esquema más simple: la
    // misma admin API limita rate por defecto.

    const appUrl = Deno.env.get("APP_URL") || "https://maven.asmtech.ai";
    const redirectTo = `${appUrl}/reset-password`;

    const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
      type: "recovery",
      email: normalizedEmail,
      options: { redirectTo },
    });

    if (linkError) {
      // Anti-enumeration: si el email no existe o cualquier otro error,
      // logueamos pero NO se lo decimos al user. Devolvemos 200 OK
      // siempre (mismo response que si funcionó). El user que SÍ tiene
      // cuenta va a recibir el email; el que no tiene, nunca lo sabrá.
      console.warn(
        `[forgot-password] generateLink failed for ${normalizedEmail}: ${linkError.message}`,
      );
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const actionLink = linkData?.properties?.action_link;
    if (!actionLink) {
      console.error("[forgot-password] no action_link in response");
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Enviar el email Maven-branded via Resend.
    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) {
      console.error("[forgot-password] RESEND_API_KEY no configurada");
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Buscar el nombre del user (si tiene profile) para personalizar.
    let fullName = "";
    try {
      const { data: users } = await adminClient.auth.admin.listUsers({ perPage: 1 });
      const matchUser = users?.users?.find(
        (u) => (u.email ?? "").toLowerCase() === normalizedEmail,
      );
      if (matchUser?.id) {
        const { data: profile } = await adminClient
          .from("profiles")
          .select("full_name")
          .eq("id", matchUser.id)
          .maybeSingle();
        fullName = (profile as { full_name?: string } | null)?.full_name ?? "";
      }
    } catch {
      // No crítico — el email se manda sin nombre.
    }

    const rawFrom =
      Deno.env.get("NOTIFICATION_FROM_EMAIL") || "noreply@mail.maven-ai.me";
    const fromEmail = rawFrom.includes("<") ? rawFrom : `Maven CRM <${rawFrom}>`;

    const html = `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e5e7eb;">
        <div style="background:linear-gradient(135deg,#6d28d9,#4338ca);padding:28px 24px;color:#ffffff;">
          <div style="font-size:11px;font-weight:700;letter-spacing:1.5px;opacity:0.85;text-transform:uppercase;">Maven CRM</div>
          <h1 style="font-size:22px;font-weight:700;margin:6px 0 0;line-height:1.3;">Recuperá tu contraseña</h1>
        </div>
        <div style="padding:24px;">
          <p style="color:#374151;font-size:14px;line-height:1.6;margin:0 0 16px;">
            ${fullName ? `Hola <strong>${fullName}</strong>,` : "Hola,"}
            recibimos una solicitud para restablecer tu contraseña de Maven CRM.
            Hacé click en el botón de abajo para crear una nueva.
          </p>
          <div style="text-align:center;margin:22px 0;">
            <a href="${actionLink}" style="display:inline-block;background:linear-gradient(135deg,#6d28d9,#4338ca);color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;padding:14px 32px;border-radius:9999px;">
              Restablecer contraseña →
            </a>
          </div>
          <p style="color:#6b7280;font-size:12px;line-height:1.55;margin:14px 0 0;">
            Este enlace expira en 1 hora. Si no pediste este cambio, ignorá
            este correo — tu contraseña actual sigue activa.
          </p>
          <p style="color:#9ca3af;font-size:11px;line-height:1.5;margin:18px 0 0;word-break:break-all;">
            ¿No funciona el botón? Copiá y pegá este link en tu navegador:<br/>
            <span style="color:#6366f1;">${actionLink}</span>
          </p>
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
        to: [normalizedEmail],
        subject: "Maven CRM · Recuperá tu contraseña",
        html,
      }),
    });

    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      console.error(`[forgot-password] Resend ${resp.status}: ${body.slice(0, 200)}`);
    }

    // Siempre 200 OK — anti-enumeration.
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[forgot-password] exception:", (e as Error).message);
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
