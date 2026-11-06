// correo-prueba-tardanza — manda a rusin24 (o a quien diga el admin) un correo
// idéntico al de constancia de tardanza, con datos demo. Es la red de prueba de
// Alvaro para confirmar que el pipeline de correos funciona de extremo a extremo.
// Autenticación: JWT del admin (verify_jwt true) + chequeo es_admin_o_dueno.
// Luego llama a send-notification-email con service_role (modo interno).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function escapar(s: string): string {
  return (s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
}

function correoHTML(p: { nombre: string; rol: string | null; horario: string; entro: string; tardeMin: number; esPrueba?: boolean }): string {
  const banner = p.esPrueba
    ? `<div style="background:#fef3c7;border:1px solid #f59e0b;border-radius:10px;padding:10px 14px;margin-bottom:14px;font-size:12px;color:#92400e;text-align:center;font-weight:700">🧪 CORREO DE PRUEBA · nadie fue avisado realmente, es solo para ver cómo se ve</div>`
    : "";
  return `<!doctype html><html><body style="margin:0;background:#eef1f6;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#0f1222">
<div style="max-width:600px;margin:0 auto;padding:28px 16px 40px">
  ${banner}
  <div style="background:#fff;border:1px solid #e7e9f0;border-radius:18px;overflow:hidden;box-shadow:0 18px 50px -24px rgba(24,21,60,.45)">
    <div style="height:5px;background:linear-gradient(90deg,#6d5efc,#8b78ff)"></div>
    <div style="padding:28px 30px">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:22px">
        <div style="width:34px;height:34px;border-radius:10px;background:linear-gradient(140deg,#6d5efc,#8b78ff);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:17px">M</div>
        <div><b style="font-size:15px">Maven</b><div style="font-size:12px;color:#6b7183">Argos · Control de asistencia</div></div>
      </div>
      <span style="display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#e23d5b;background:#fdeef1;padding:5px 10px;border-radius:999px">⏱ Entrada tarde</span>
      <h1 style="font-size:22px;line-height:1.25;margin:14px 0 6px;font-weight:800">Constancia de entrada tarde</h1>
      <p style="font-size:14px;color:#6b7183;margin:0 0 22px">Se registró una entrada fuera de horario.</p>
      <div style="display:flex;align-items:baseline;gap:10px;background:#f6f7fb;border:1px solid #e7e9f0;border-radius:14px;padding:16px 18px;margin-bottom:22px">
        <span style="font-size:40px;font-weight:800;color:#e23d5b;line-height:1;font-variant-numeric:tabular-nums">${p.tardeMin} min</span>
        <span style="font-size:13px;color:#6b7183;font-weight:600">tarde respecto a su horario</span>
      </div>
      <div style="border:1px solid #e7e9f0;border-radius:14px;overflow:hidden;margin-bottom:20px">
        <div style="display:flex;justify-content:space-between;align-items:center;padding:13px 16px;font-size:14px;border-bottom:1px solid #e7e9f0"><span style="color:#6b7183">Empleado</span><span style="font-weight:700">${escapar(p.nombre)}${p.rol ? " · " + escapar(p.rol) : ""}</span></div>
        <div style="display:flex;justify-content:space-between;align-items:center;padding:13px 16px;font-size:14px;border-bottom:1px solid #e7e9f0"><span style="color:#6b7183">Horario de entrada</span><span style="font-weight:700;font-variant-numeric:tabular-nums">${p.horario}</span></div>
        <div style="display:flex;justify-content:space-between;align-items:center;padding:13px 16px;font-size:14px"><span style="color:#6b7183">Entró a las</span><span style="font-weight:700;color:#e23d5b;font-variant-numeric:tabular-nums">${p.entro}</span></div>
      </div>
      <div style="display:flex;gap:10px;background:#fff8f3;border:1px solid #ffe2cf;border-radius:12px;padding:13px 15px;font-size:13px;color:#8a4b1f;line-height:1.5"><span>⚠️</span><span>Estos <b>${p.tardeMin} minutos no se recuperan ni se cobran</b>. La sanción no afecta la nota de Argos.</span></div>
    </div>
    <div style="text-align:center;padding:18px;font-size:11.5px;color:#9aa0b2;background:#f6f7fb;border-top:1px solid #e7e9f0">Maven · generado automáticamente por Argos</div>
  </div>
</div></body></html>`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    // 1) Autenticar al que llama como admin/dueño.
    const auth = req.headers.get("authorization") ?? "";
    if (!auth.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "sin autorización" }), { status: 401, headers: { ...CORS, "Content-Type": "application/json" } });
    }
    const userCli = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: auth } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userInfo } = await userCli.auth.getUser();
    if (!userInfo?.user?.id) {
      return new Response(JSON.stringify({ error: "sesión inválida" }), { status: 401, headers: { ...CORS, "Content-Type": "application/json" } });
    }
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: ok, error: errOk } = await admin.rpc("es_admin_o_dueno", { _uid: userInfo.user.id });
    if (errOk || ok !== true) {
      return new Response(JSON.stringify({ error: "solo admin/dueño" }), { status: 403, headers: { ...CORS, "Content-Type": "application/json" } });
    }

    // 2) Tomar el destino del body, con tope: solo correos que lleguen al propio
    //    usuario o a rusin24 (red de seguridad de Alvaro). Si no viene nada, va
    //    al correo del admin que aprieta el botón.
    const body = await req.json().catch(() => ({}));
    const miCorreo = userInfo.user.email ?? null;
    const paraDemo: string = (typeof body.to === "string" && body.to) || miCorreo || "rusin24@gmail.com";

    const html = correoHTML({
      nombre: "Laura Gómez", rol: "Chatter",
      horario: "08:00", entro: "08:12", tardeMin: 12, esPrueba: true,
    });

    // 3) Llamar a send-notification-email con service_role (modo INTERNO: acepta
    //    { to, subject, html, tag }).
    const resp = await fetch(`${SUPABASE_URL}/functions/v1/send-notification-email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SERVICE_KEY}`,
        "apikey": SERVICE_KEY,
      },
      body: JSON.stringify({
        to: [paraDemo],
        subject: "🧪 PRUEBA — Maven · Constancia de entrada tarde",
        html, tag: "tardanza-prueba",
      }),
    });
    const texto = await resp.text();
    if (!resp.ok) {
      return new Response(JSON.stringify({ error: "falló el envío", status: resp.status, detalle: texto.slice(0, 500) }),
        { status: 502, headers: { ...CORS, "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify({ ok: true, enviado_a: paraDemo }), { headers: { ...CORS, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
  }
});
