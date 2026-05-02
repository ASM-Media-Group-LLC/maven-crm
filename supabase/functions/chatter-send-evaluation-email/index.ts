// Maven-branded evaluation email sender.
// Replaces the email-sending half of the legacy Roleplaychatters Google
// Apps Script — the Apps Script can keep handling the Drive doc and the
// Sheet log, but the email branding lives in Maven now.
//
// Triggered by the Maven frontend right after submitting an evaluation.
// Reads chatter_config.notification_emails for the recipient list and
// builds an HTML email with the Maven palette + Chatter Evaluator title.
//
// Required secrets:
//   RESEND_API_KEY            (set via `supabase secrets set` on the project)
//   RESEND_FROM (optional)    fallback: "Maven <onboarding@resend.dev>"

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.105.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface EvaluationPayload {
  evaluationId: string;
  sessionId: string;
  chatterName: string;
  modelName: string;
  examinerName: string;
  verdict: "apto" | "no_apto";
  scorePct: number;
  criteria: { label: string; status: "pass" | "partial" | "fail" }[];
  feedback: string;
  chatHistorySize: number;
  appsScriptDocUrl?: string | null;
}

const STATUS_LABEL = {
  pass: "Cumple",
  partial: "Parcial",
  fail: "No cumple",
} as const;

const STATUS_COLOR = {
  pass: "#22c55e",
  partial: "#f59e0b",
  fail: "#ef4444",
} as const;

const VERDICT_LABEL = (v: "apto" | "no_apto") =>
  v === "apto" ? "APTO" : "NO APTO";

const VERDICT_COLOR = (v: "apto" | "no_apto") =>
  v === "apto" ? "#22c55e" : "#ef4444";

const BADGE = (pct: number) =>
  pct >= 80 ? { text: "APROBADO", color: "#22c55e" } :
  pct >= 50 ? { text: "A CRITERIO", color: "#f59e0b" } :
  { text: "NO APTO", color: "#ef4444" };

const escapeHtml = (s: string): string =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

function renderHtml(p: EvaluationPayload): string {
  const badge = BADGE(p.scorePct);
  const verdictText = VERDICT_LABEL(p.verdict);
  const verdictColor = VERDICT_COLOR(p.verdict);
  const criteriaRows = p.criteria
    .map(
      (c) => `
      <tr>
        <td style="padding: 10px 14px; border-bottom: 1px solid #e5e7eb; color: #1f2937; font-size: 14px;">
          ${escapeHtml(c.label)}
        </td>
        <td style="padding: 10px 14px; border-bottom: 1px solid #e5e7eb; text-align: right;">
          <span style="display: inline-block; padding: 3px 10px; border-radius: 9999px; background: ${STATUS_COLOR[c.status]}1a; color: ${STATUS_COLOR[c.status]}; font-size: 12px; font-weight: 600;">
            ${STATUS_LABEL[c.status]}
          </span>
        </td>
      </tr>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Maven Chatter Evaluator — Evaluación recibida</title>
</head>
<body style="margin: 0; padding: 0; background: #f4f4f7; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif; color: #1f2937;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background: #f4f4f7; padding: 24px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width: 600px; width: 100%; background: #ffffff; border-radius: 14px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.04);">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #6d28d9 0%, #4338ca 100%); padding: 28px 32px; color: #ffffff;">
              <div style="font-size: 12px; font-weight: 700; letter-spacing: 1.5px; opacity: 0.85; text-transform: uppercase;">
                Maven CRM · Chatter Evaluator
              </div>
              <div style="font-size: 22px; font-weight: 700; margin-top: 4px; line-height: 1.3;">
                Evaluación recibida
              </div>
              <div style="font-size: 13px; margin-top: 4px; opacity: 0.85;">
                ${escapeHtml(p.chatterName)} — perfil ${escapeHtml(p.modelName)}
              </div>
            </td>
          </tr>

          <!-- Verdict + Score -->
          <tr>
            <td style="padding: 24px 32px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <div style="font-size: 11px; color: #6b7280; text-transform: uppercase; letter-spacing: 1px; font-weight: 600;">Verdict</div>
                    <div style="font-size: 26px; font-weight: 700; color: ${verdictColor}; margin-top: 2px;">${verdictText}</div>
                  </td>
                  <td align="right">
                    <div style="font-size: 11px; color: #6b7280; text-transform: uppercase; letter-spacing: 1px; font-weight: 600;">Puntuación</div>
                    <div style="font-size: 26px; font-weight: 700; color: #1f2937; margin-top: 2px;">${p.scorePct}%</div>
                    <div style="display: inline-block; margin-top: 4px; padding: 3px 10px; border-radius: 9999px; background: ${badge.color}1a; color: ${badge.color}; font-size: 11px; font-weight: 700;">${badge.text}</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Examiner -->
          <tr>
            <td style="padding: 0 32px 8px;">
              <div style="font-size: 13px; color: #4b5563;">
                <strong>Examiner:</strong> ${escapeHtml(p.examinerName)}
              </div>
            </td>
          </tr>

          <!-- Criteria -->
          <tr>
            <td style="padding: 12px 32px;">
              <div style="font-size: 11px; color: #6b7280; text-transform: uppercase; letter-spacing: 1px; font-weight: 600; margin-bottom: 8px;">Criterios</div>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border: 1px solid #e5e7eb; border-radius: 10px; overflow: hidden;">
                ${criteriaRows}
              </table>
            </td>
          </tr>

          ${
            p.feedback
              ? `<tr>
                   <td style="padding: 16px 32px;">
                     <div style="font-size: 11px; color: #6b7280; text-transform: uppercase; letter-spacing: 1px; font-weight: 600; margin-bottom: 6px;">Feedback</div>
                     <div style="font-size: 14px; color: #1f2937; line-height: 1.55; padding: 12px 14px; background: #f9fafb; border-left: 3px solid #6d28d9; border-radius: 4px; white-space: pre-wrap;">${escapeHtml(p.feedback)}</div>
                   </td>
                 </tr>`
              : ""
          }

          <!-- Footer -->
          <tr>
            <td style="padding: 18px 32px 28px;">
              <div style="font-size: 12px; color: #6b7280;">
                ${p.chatHistorySize} mensaje(s) intercambiados durante la sesión.
                ${
                  p.appsScriptDocUrl
                    ? `<a href="${escapeHtml(p.appsScriptDocUrl)}" style="color: #6d28d9; text-decoration: none; font-weight: 600;">Ver chat completo →</a>`
                    : ""
                }
              </div>
              <div style="font-size: 11px; color: #9ca3af; margin-top: 14px; padding-top: 14px; border-top: 1px solid #f3f4f6;">
                Maven CRM — Chatter Evaluator · Notificación automática.
                <br />
                Sesión <code style="background: #f3f4f6; padding: 1px 5px; border-radius: 3px;">${escapeHtml(p.sessionId)}</code> · evaluación
                <code style="background: #f3f4f6; padding: 1px 5px; border-radius: 3px;">${escapeHtml(p.evaluationId)}</code>
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const payload = (await req.json()) as EvaluationPayload;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // Recipients: read from chatter_config
    const { data: cfg, error: cfgErr } = await supabase
      .from("chatter_config")
      .select("notification_emails")
      .eq("id", 1)
      .maybeSingle();
    if (cfgErr) throw cfgErr;
    const recipients = (cfg?.notification_emails ?? []) as string[];

    if (recipients.length === 0) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "no recipients configured (chatter_config.notification_emails is empty)",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) {
      return new Response(
        JSON.stringify({ ok: false, error: "RESEND_API_KEY secret not set" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const FROM = Deno.env.get("RESEND_FROM") ?? "Maven <onboarding@resend.dev>";

    const subject = `Maven Chatter Evaluator — ${VERDICT_LABEL(payload.verdict)}: ${payload.chatterName} (${payload.scorePct}%)`;
    const html = renderHtml(payload);

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM,
        to: recipients,
        subject,
        html,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return new Response(
        JSON.stringify({ ok: false, error: `Resend HTTP ${res.status}: ${errText}` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const resendResult = await res.json();
    return new Response(
      JSON.stringify({ ok: true, messageId: resendResult.id, recipients }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: (e as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
