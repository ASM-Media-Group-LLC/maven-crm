import { corsFor } from "../_shared/cors.ts";
// PEDIDOS DE DEMO DESDE LA PORTADA.
//
// Es la segunda puerta PÚBLICA de Maven (la otra es meet-guest), así que acá
// vive la misma desconfianza:
//
//   1. SE GUARDA PRIMERO, SE MANDA DESPUÉS. Un pedido de demo perdido es
//      plata perdida: si Resend está caído, la fila ya está en la base y el
//      correo se puede reenviar. Al revés no se puede.
//   2. RATE LIMIT por hash de IP y por correo. Sin esto, un formulario
//      público es una manguera para llenarle la casilla a alguien.
//   3. CAMPO TRAMPA. Los bots llenan todos los inputs que encuentran; uno
//      escondido que ninguna persona ve delata al robot. Cuando cae, se
//      responde 200 como si todo hubiera salido bien: decirle "sos un bot"
//      solo le enseña a esquivar.
//   4. La IP se guarda HASHEADA con un salt del servidor. Alcanza para
//      contar abuso y no es un registro de direcciones de gente que
//      todavía no es cliente.
//
// El correo sale por Resend desde el remitente de notificaciones (dominio
// verificado) y va con `reply_to` del prospecto: responder desde la casilla
// le contesta directo a él.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = (req: Request) =>
  corsFor(req, {
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  });

const json = (req: Request, data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });

/** A dónde llegan los pedidos. Se puede cambiar por env sin tocar código. */
const DESTINO = Deno.env.get("DEMO_REQUEST_TO") || "alvaro@maven-ai.me";

const TOPE_POR_IP_HORA = 5;
const TOPE_POR_CORREO_DIA = 3;

// Cortes de largo: nada de guardar un "mensaje" de dos megas.
const LIMITES = {
  nombre: 80, empresa: 120, email: 160, telefono: 40,
  tamano_equipo: 40, mensaje: 2000, publico: 20, interes: 60,
} as const;

const texto = (v: unknown, max: number) =>
  String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

/** Validación deliberadamente laxa: la regla estricta de RFC rechaza correos
 *  válidos y raros, y acá el costo de un falso rechazo es perder un cliente
 *  potencial. Que tenga forma de correo alcanza; si está mal escrito, el
 *  rebote lo dice. */
const pareceCorreo = (s: string) => /^[^\s@]+@[^\s@.]+\.[^\s@]{2,}$/.test(s);

const bytes = (s: string) => new TextEncoder().encode(s);

async function hashIp(ip: string, salt: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes(`${salt}:${ip}`));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("cf-connecting-ip") || "unknown";
}

const escapar = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** El correo que le llega a la casilla. Tabla y colores puestos a mano: los
 *  clientes de correo no entienden flexbox ni variables CSS. */
function armarHtml(p: {
  nombre: string; empresa: string; email: string; telefono: string;
  tamano: string; interes: string[]; mensaje: string; publico: string; origen: string;
}) {
  const fila = (k: string, v: string) =>
    v ? `<tr>
      <td style="padding:9px 14px;border-bottom:1px solid #e6e8ee;color:#6b7280;font-size:13px;white-space:nowrap;vertical-align:top">${escapar(k)}</td>
      <td style="padding:9px 14px;border-bottom:1px solid #e6e8ee;color:#111827;font-size:14px">${escapar(v)}</td>
    </tr>` : "";

  return `<!doctype html><html><body style="margin:0;background:#f4f5f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f8;padding:26px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 1px 3px rgba(16,24,40,.1)">
        <tr><td style="background:#0a84ff;padding:18px 22px;color:#fff">
          <div style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;opacity:.85">Portada de Maven</div>
          <div style="font-size:20px;font-weight:700;margin-top:3px">Alguien pidió una demo</div>
        </td></tr>
        <tr><td style="padding:18px 22px 8px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            ${fila("Nombre", p.nombre)}
            ${fila("Empresa", p.empresa)}
            ${fila("Correo", p.email)}
            ${fila("Teléfono", p.telefono)}
            ${fila("Tamaño del equipo", p.tamano)}
            ${fila("Le interesa", p.interes.join(" · "))}
            ${fila("Se ve como", p.publico === "agencias" ? "Agencia de creadoras" : "Empresa")}
            ${fila("Entró por", p.origen)}
          </table>
        </td></tr>
        ${p.mensaje ? `<tr><td style="padding:6px 22px 4px">
          <div style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#6b7280;margin-bottom:6px">Lo que escribió</div>
          <div style="background:#f8f9fb;border:1px solid #e6e8ee;border-radius:10px;padding:13px 15px;color:#111827;font-size:14px;line-height:1.6;white-space:pre-wrap">${escapar(p.mensaje)}</div>
        </td></tr>` : ""}
        <tr><td style="padding:16px 22px 24px">
          <a href="mailto:${escapar(p.email)}?subject=${encodeURIComponent("Demo de Maven")}"
             style="display:inline-block;background:#0a84ff;color:#fff;text-decoration:none;font-size:14px;font-weight:600;padding:11px 20px;border-radius:10px">
            Responderle
          </a>
          <div style="margin-top:12px;color:#9ca3af;font-size:12px">
            Respondiendo este correo también le llega a ${escapar(p.email)}.
          </div>
        </td></tr>
      </table>
    </td></tr>
  </table>
  </body></html>`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);

  try {
    const body = await req.json().catch(() => ({}));

    // Campo trampa: invisible en el formulario, así que si viene lleno no lo
    // llenó una persona. Se responde ok y no se guarda nada.
    if (texto(body.web, 10)) return json(req, { ok: true });

    const nombre = texto(body.nombre, LIMITES.nombre);
    const email = texto(body.email, LIMITES.email).toLowerCase();
    const empresa = texto(body.empresa, LIMITES.empresa);
    const telefono = texto(body.telefono, LIMITES.telefono);
    const tamano = texto(body.tamano_equipo, LIMITES.tamano_equipo);
    const mensaje = String(body.mensaje ?? "").trim().slice(0, LIMITES.mensaje);
    const publico = texto(body.publico, LIMITES.publico);
    const interes = Array.isArray(body.interes)
      ? body.interes.slice(0, 8).map((i: unknown) => texto(i, LIMITES.interes)).filter(Boolean)
      : [];

    if (nombre.length < 2) return json(req, { error: "Escribe tu nombre" }, 400);
    if (!pareceCorreo(email)) return json(req, { error: "Revisa el correo" }, 400);

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const salt = Deno.env.get("DEMO_REQUEST_IP_SALT") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ipHash = await hashIp(clientIp(req), salt);

    const haceUnaHora = new Date(Date.now() - 3600_000).toISOString();
    const haceUnDia = new Date(Date.now() - 86_400_000).toISOString();

    const [porIp, porCorreo] = await Promise.all([
      sb.from("demo_requests").select("id", { count: "exact", head: true })
        .eq("ip_hash", ipHash).gte("created_at", haceUnaHora),
      sb.from("demo_requests").select("id", { count: "exact", head: true })
        .eq("email", email).gte("created_at", haceUnDia),
    ]);

    if ((porIp.count ?? 0) >= TOPE_POR_IP_HORA || (porCorreo.count ?? 0) >= TOPE_POR_CORREO_DIA) {
      return json(req, { error: "Ya recibimos tu pedido. Te escribimos pronto." }, 429);
    }

    const origen = req.headers.get("origin") || req.headers.get("referer") || "";

    const { data: fila, error: errIns } = await sb
      .from("demo_requests")
      .insert({
        nombre, empresa: empresa || null, email, telefono: telefono || null,
        tamano_equipo: tamano || null, interes, mensaje: mensaje || null,
        publico: publico || null, origen: origen.slice(0, 200), ip_hash: ipHash,
      })
      .select("id")
      .single();

    if (errIns) {
      console.error("[demo-request] no se pudo guardar", errIns);
      return json(req, { error: "No se pudo registrar el pedido" }, 500);
    }

    // Desde acá, el pedido YA está a salvo. Si el correo falla se responde
    // ok igual: la persona hizo su parte y la fila queda para reenviar.
    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) {
      console.error("[demo-request] RESEND_API_KEY sin configurar; el pedido quedó solo en la base");
      return json(req, { ok: true, id: fila.id, correo: false });
    }

    const rawFrom = Deno.env.get("NOTIFICATION_FROM_EMAIL") || "noreply@mail.maven-ai.me";
    const from = rawFrom.includes("<") ? rawFrom : `Maven · Portada <${rawFrom}>`;

    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [DESTINO],
        reply_to: email,
        subject: `Demo · ${nombre}${empresa ? ` · ${empresa}` : ""}`,
        html: armarHtml({ nombre, empresa, email, telefono, tamano, interes, mensaje, publico, origen }),
        tags: [{ name: "type", value: "demo_request" }],
      }),
    });

    const enviado = resp.ok;
    if (!enviado) {
      console.error("[demo-request] Resend falló", resp.status, await resp.text().catch(() => ""));
    } else {
      await sb.from("demo_requests").update({ correo_enviado: true }).eq("id", fila.id);
    }

    return json(req, { ok: true, id: fila.id, correo: enviado });
  } catch (err) {
    console.error("[demo-request] error interno", err);
    return json(req, { error: "Internal server error" }, 500);
  }
});
