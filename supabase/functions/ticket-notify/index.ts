// Correo de "nuevo ticket creado" para las plantillas de ticket.
//
// POR QUÉ EXISTE: reemplaza al Apps Script de la hoja `ESCALAMIENTO
// QUEJA/SOLICITUD v3`, que tenía los destinatarios HARDCODEADOS en el código
// (línea 7 de Code.gs) y por eso quedaban ex-empleados recibiendo tickets.
// Acá los destinatarios salen de `ticket_forms.notify_emails`, editables desde
// la UI por quien tenga el permiso "Tickets / Gestionar Plantillas".
//
// El HTML vive en el SERVIDOR a propósito: es la única fuente de verdad del
// diseño, y así el correo siempre refleja lo que quedó guardado en la base, no
// lo que el navegador creía tener en pantalla.
//
// No manda el correo por su cuenta: delega en `send-notification-email`, el
// relay de Resend que ya usa el resto de Maven, para no tener dos caminos de
// salida de mail que se desincronicen.
//
// Body: { ticket_id: string }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

/** Escapa el HTML: las respuestas son texto que escribe un usuario. */
function esc(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const PRIORITY_LABELS: Record<string, string> = {
  low: "Baja",
  medium: "Media",
  high: "Alta",
  urgent: "Muy alta",
};

/** Rojo para lo urgente, gris para lo que puede esperar. */
const PRIORITY_COLORS: Record<string, string> = {
  urgent: "#B91C1C",
  high: "#EA580C",
  medium: "#CA8A04",
  low: "#4B5563",
};

interface FormField {
  label: string;
  field_key: string;
  field_type: string;
  options: unknown;
  position: number;
}

function optLabel(options: unknown, value: string): string {
  if (!Array.isArray(options)) return value;
  for (const o of options) {
    if (typeof o === "string") {
      if (o === value) return o;
    } else if (o && typeof o === "object" && (o as any).value === value) {
      return String((o as any).label ?? value);
    }
  }
  return value;
}

/** Un valor de respuesta → HTML, según el tipo de campo. */
function renderValue(f: FormField, raw: unknown, creatorName?: string | null): string {
  // Una pregunta de tipo creadora guarda el UUID. Sin esto el correo mostraba
  // el uuid crudo en vez del nombre.
  if (f.field_type === "creator") {
    return creatorName ? esc(creatorName) : "&mdash;";
  }

  if (raw === null || raw === undefined || raw === "") return "&mdash;";

  switch (f.field_type) {
    case "drive_links": {
      const links = Array.isArray(raw) ? raw : [raw];
      const btns = links
        .map((l) => String(l).trim())
        .filter(Boolean)
        .map(
          (l, i) =>
            `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse; margin-bottom:6px;"><tr><td style="background-color:#EFF6FF; border:1px solid #BFDBFE; border-radius:6px; padding:9px 14px; font-family:Arial,Helvetica,sans-serif; font-size:13px;"><a href="${esc(
              l,
            )}" style="color:#1D4ED8; text-decoration:none; font-weight:bold;">Ver prueba ${
              i + 1
            } &rarr;</a></td></tr></table>`,
        )
        .join("");
      return btns || "&mdash;";
    }

    case "instagram":
    case "url": {
      const u = String(raw).trim();
      return `<a href="${esc(u)}" style="color:#1D4ED8; text-decoration:none;">${esc(u)}</a>`;
    }

    case "email":
      return `<a href="mailto:${esc(raw)}" style="color:#1D4ED8; text-decoration:none;">${esc(raw)}</a>`;

    case "currency":
      return `$${esc(raw)}`;

    case "percent":
      return `${esc(raw)}%`;

    case "checkbox":
      return raw ? "Sí" : "No";

    case "multiselect": {
      const vals = Array.isArray(raw) ? raw : [raw];
      return vals.map((v) => esc(optLabel(f.options, String(v)))).join(", ");
    }

    case "select":
      return esc(optLabel(f.options, String(raw)));

    case "textarea":
      // Se respetan los saltos de línea que escribió la persona.
      return esc(raw).replace(/\n/g, "<br>");

    default:
      return esc(raw);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json(401, { error: "Unauthorized", reason: "missing_auth_header" });
    }

    const { ticket_id } = await req.json();
    if (!ticket_id) return json(400, { error: "ticket_id requerido" });

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: ticket, error: tErr } = await admin
      .from("tickets")
      .select("*, creators(name, artistic_name, instagram_handle)")
      .eq("id", ticket_id)
      .single();
    if (tErr || !ticket) return json(404, { error: "Ticket no encontrado" });

    if (!ticket.form_id) {
      return json(200, { skipped: true, reason: "ticket_sin_plantilla" });
    }

    const { data: form } = await admin
      .from("ticket_forms")
      .select("*")
      .eq("id", ticket.form_id)
      .single();
    if (!form) return json(404, { error: "Plantilla no encontrada" });

    // Silencio explícito: la plantilla puede tener el aviso apagado o sin
    // destinatarios. No es un error, es una configuración.
    const recipients: string[] = (form.notify_emails || []).filter(
      (e: string) => e && e.includes("@"),
    );
    if (!form.notify_enabled || recipients.length === 0) {
      return json(200, { skipped: true, reason: "sin_destinatarios" });
    }

    const { data: fields } = await admin
      .from("ticket_form_fields")
      .select("label, field_key, field_type, options, position")
      .eq("form_id", ticket.form_id)
      .order("position");

    const answers = (ticket.answers || {}) as Record<string, unknown>;
    const creatorName =
      ticket.creators?.artistic_name || ticket.creators?.name || null;
    const prioKey = String(ticket.priority || "medium");
    const prioLabel = PRIORITY_LABELS[prioKey] || prioKey;
    const prioColor = PRIORITY_COLORS[prioKey] || "#4B5563";

    const etqL =
      "padding:8px 0; border-bottom:1px solid #F0F1F3; font-family:Arial,Helvetica,sans-serif; font-size:12px; color:#6B7280; width:44%; vertical-align:top;";
    const etqV =
      "padding:8px 0; border-bottom:1px solid #F0F1F3; font-family:Arial,Helvetica,sans-serif; font-size:14px; color:#1F2933; vertical-align:top;";

    const rows = (fields || [])
      .map((f: FormField) => {
        const v = renderValue(f, answers[f.field_key], creatorName);
        // Los textos largos y las pruebas se leen mejor a lo ancho.
        if (f.field_type === "textarea" || f.field_type === "drive_links") {
          return `<tr><td colspan="2" style="padding:12px 0 4px; font-family:Arial,Helvetica,sans-serif; font-size:11px; letter-spacing:.08em; text-transform:uppercase; color:#9AA5B1; font-weight:bold;">${esc(
            f.label,
          )}</td></tr><tr><td colspan="2" style="padding-bottom:10px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;"><tr><td style="background-color:#F9FAFB; border:1px solid #E5E7EB; border-radius:8px; padding:14px 16px; font-family:Arial,Helvetica,sans-serif; font-size:14px; color:#1F2933; line-height:1.6;">${v}</td></tr></table></td></tr>`;
        }
        return `<tr><td style="${etqL}">${esc(f.label)}</td><td style="${etqV}">${v}</td></tr>`;
      })
      .join("");

    const html = `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse; background-color:#F4F5F7;">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse; width:600px; max-width:100%; background-color:#FFFFFF; border-radius:10px; overflow:hidden;">

  <tr><td style="background-color:#1F2933; padding:22px 24px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
      <tr>
        <td style="font-family:Arial,Helvetica,sans-serif; font-size:11px; letter-spacing:.10em; text-transform:uppercase; color:#9AA5B1; padding-bottom:6px;">${esc(
          form.name,
        )}</td>
        <td align="right" style="padding-bottom:6px;"><span style="display:inline-block; background-color:${prioColor}; color:#FFFFFF; font-family:Arial,Helvetica,sans-serif; font-size:11px; font-weight:bold; letter-spacing:.06em; text-transform:uppercase; padding:5px 11px; border-radius:20px;">${esc(
          prioLabel,
        )}</span></td>
      </tr>
      <tr><td colspan="2" style="font-family:Arial,Helvetica,sans-serif; font-size:26px; font-weight:bold; color:#FFFFFF; line-height:1.2;">${esc(
        ticket.ticket_code,
      )}</td></tr>
      ${
        creatorName
          ? `<tr><td colspan="2" style="font-family:Arial,Helvetica,sans-serif; font-size:15px; color:#CBD2D9; padding-top:4px;">${esc(
              creatorName,
            )}</td></tr>`
          : ""
      }
    </table>
  </td></tr>

  <tr><td style="padding:18px 24px 0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
      ${rows || `<tr><td style="${etqV}">Este ticket no tiene campos.</td></tr>`}
    </table>
  </td></tr>

  <tr><td style="padding:24px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse; border-top:1px solid #E5E7EB;">
      <tr><td style="padding-top:14px; font-family:Arial,Helvetica,sans-serif; font-size:11px; color:#9AA5B1; line-height:1.5;">
        Generado automáticamente por Maven al crearse el ticket. Los destinatarios de este aviso se administran en Tickets &rarr; Plantillas.
      </td></tr>
    </table>
  </td></tr>

</table>
</td></tr>
</table>`.trim();

    const subject = `Nuevo Ticket Creado: ${ticket.ticket_code} - ${
      creatorName || ticket.title || form.name
    }`;

    // Delega en el relay que ya usa el resto de Maven.
    //
    // ⚠️ Authorization EXPLÍCITO. `functions.invoke` NO hereda la credencial del
    // createClient(url, serviceKey) en llamadas edge→edge: llega sin header y
    // send-notification-email (verify_jwt=true) responde 401. Es el mismo pozo
    // en el que cayeron los correos de QA (ver el comentario en qa-analyze), y
    // acá volvió a pasar: el primer ticket de prueba dio 401 → 502.
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const { data: sent, error: sendErr } = await admin.functions.invoke(
      "send-notification-email",
      {
        headers: { Authorization: `Bearer ${serviceKey}` },
        body: { to: recipients, subject, html, tag: "ticket-nuevo" },
      },
    );
    if (sendErr) {
      // supabase-js devuelve "non-2xx status code" sin el motivo, que no sirve
      // para diagnosticar. El detalle real está en el body de la Response.
      let detail = sendErr.message;
      const ctx = (sendErr as { context?: Response }).context;
      if (ctx && typeof ctx.text === "function") {
        try {
          detail += ` | ${(await ctx.text()).slice(0, 500)}`;
        } catch {
          // Si el body ya se consumió, nos quedamos con el mensaje base.
        }
      }
      return json(502, { error: "Falló el envío", detail });
    }

    return json(200, { sent: true, recipients: recipients.length, relay: sent });
  } catch (e) {
    return json(500, { error: (e as Error).message });
  }
});
