import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { recipientEmails, eventName, eventDate, eventTime, callLink, inviterName } = await req.json();

    if (!recipientEmails || !Array.isArray(recipientEmails) || recipientEmails.length === 0) {
      return new Response(JSON.stringify({ error: "recipientEmails required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      return new Response(JSON.stringify({ error: "RESEND_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Si el env var viene como email pelado, le anteponemos "Maven CRM"
    // para que el receptor vea el display name en vez de "noreply".
    const rawFrom = Deno.env.get("NOTIFICATION_FROM_EMAIL") || "noreply@mail.maven-ai.me";
    const fromEmail = rawFrom.includes("<") ? rawFrom : `Maven CRM <${rawFrom}>`;

    const results = [];

    for (const email of recipientEmails) {
      const htmlContent = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e5e7eb;">
          <div style="background: linear-gradient(135deg, #6366f1, #8b5cf6); padding: 32px 24px; text-align: center;">
            <h1 style="color: #ffffff; font-size: 24px; margin: 0;">📹 Invitación a Videollamada</h1>
          </div>
          <div style="padding: 32px 24px;">
            <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 16px;">
              <strong>${inviterName || "Un compañero"}</strong> te ha invitado a una videollamada${eventName ? ` para el evento <strong>${eventName}</strong>` : ""}.
            </p>
            ${eventDate ? `<p style="color: #6b7280; font-size: 14px; margin: 0 0 8px;">📅 <strong>Fecha:</strong> ${eventDate}</p>` : ""}
            ${eventTime ? `<p style="color: #6b7280; font-size: 14px; margin: 0 0 24px;">🕐 <strong>Hora:</strong> ${eventTime}</p>` : ""}
            ${callLink ? `
              <div style="text-align: center; margin: 24px 0;">
                <a href="${callLink}" style="display: inline-block; background: #6366f1; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px;">
                  Unirse a la llamada
                </a>
              </div>
              <p style="color: #9ca3af; font-size: 12px; text-align: center; margin-top: 16px;">
                O copia este enlace: <a href="${callLink}" style="color: #6366f1;">${callLink}</a>
              </p>
            ` : ""}
          </div>
          <div style="background: #f9fafb; padding: 16px 24px; text-align: center; border-top: 1px solid #e5e7eb;">
            <p style="color: #9ca3af; font-size: 12px; margin: 0;">Enviado desde Maven</p>
          </div>
        </div>
      `;

      try {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${resendApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: fromEmail,
            to: [email],
            subject: `📹 Invitación a videollamada${eventName ? `: ${eventName}` : ""}`,
            html: htmlContent,
          }),
        });

        const resData = await res.json();
        if (!res.ok) {
          results.push({ email, success: false, error: resData });
        } else {
          results.push({ email, success: true, id: resData.id });
        }
      } catch (sendErr: any) {
        results.push({ email, success: false, error: sendErr.message });
      }
    }

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("send-call-invitation error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
