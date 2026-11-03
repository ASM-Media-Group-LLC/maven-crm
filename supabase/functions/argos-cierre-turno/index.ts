import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// argos-cierre-turno — el correo diario de "cómo cerré mi turno" (Álvaro, 02/11).
//
// Cuando un empleado cierra su día, ~1 h después recibe un correo con su resumen:
// nota del día (pantalla 30 / cámara 30 / atención 30 / horas 10), cuánto compartió
// pantalla, su atención y los bajones del día. Tono DIRECTO. Copia a su supervisor.
//
// DOS MODOS:
//   · Prueba  { prueba_user_id, to }  (JWT del dueño) → arma el resumen de esa
//     persona y lo manda SOLO a `to`, para ver el formato sin tocar a nadie más.
//   · Cron    (X-Cron-Token)          → [pendiente de activar] barre a los que
//     cerraron turno hace ~1 h y aún no recibieron el de hoy.
//
// Envía por send-notification-email (Resend). Solo dueño o cron. Huella en argos_diag.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const CRON_TOKEN = Deno.env.get("CRON_INTERNAL_TOKEN") ?? "";
const META_HORAS = 8;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

function igualesConstante(a: string, b: string): boolean {
  if (a.length !== b.length || a.length === 0) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));

interface Resumen {
  nota: number | null;
  pantallaPct: number | null;
  camaraPct: number | null;
  atencionPct: number | null;
  horas: number;
  bajones: Array<{ tipo: string; hora: string; minutos: number }>;
}

// La nota, igual que en el frontend (notaEmpleado.ts): pesos 30/30/30/10, reparte
// los factores sin dato, tope 50 si no compartió pantalla.
function calcularNota(p: { pantalla?: number; camara?: number; atencion?: number; horas: number }): number | null {
  const subHoras = clamp((p.horas / META_HORAS) * 100);
  const fs = [
    { sub: p.pantalla == null ? null : clamp(p.pantalla * 100), peso: 0.3, esPantalla: true },
    { sub: p.camara == null ? null : clamp(p.camara * 100), peso: 0.3 },
    { sub: p.atencion == null ? null : clamp(p.atencion * 100), peso: 0.3 },
    { sub: subHoras, peso: 0.1 },
  ];
  const pres = fs.filter((f) => f.sub !== null);
  const pt = pres.reduce((a, f) => a + f.peso, 0);
  if (!pres.length || pt === 0) return null;
  let v = Math.round(pres.reduce((a, f) => a + (f.sub as number) * f.peso, 0) / pt);
  if (p.pantalla !== undefined && p.pantalla < 0.05) v = Math.min(v, 50);
  return v;
}

const LBL: Record<string, string> = {
  sin_pantalla: "No compartió pantalla", camara_apagada: "Cámara apagada", camara_tapada: "Cámara tapada",
  fuera_de_lugar: "Fuera de lugar (ocio)", se_fue: "Se fue de cámara", sin_senal: "Sin señal", pausa_de_mas: "Pausa de más",
};

async function resumenDe(admin: ReturnType<typeof createClient>, userId: string, dia: string): Promise<Resumen> {
  const ini = `${dia}T00:00:00-05:00`, fin = `${dia}T23:59:59-05:00`;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const a = admin as any;
  const [{ data: caps }, { data: tiempo }, { data: eventos }, { data: alertas }] = await Promise.all([
    a.from("monitor_capturas").select("tipo, veredicto, fuera_de_lugar").eq("user_id", userId).gte("created_at", ini).lte("created_at", fin).limit(20000),
    a.rpc("cowork_tiempo_diario", { _desde: dia, _hasta: dia, _user_id: userId, _limit: 10, _offset: 0 }),
    a.from("monitor_eventos").select("tipo").eq("user_id", userId).in("tipo", ["camara_apagada", "camara_tapada", "se_fue"]).neq("estado", "descartado").gte("created_at", ini).lte("created_at", fin),
    a.from("argos_alertas").select("tipo, abierta_at, cerrada_at").eq("user_id", userId).gte("abierta_at", ini).lte("abierta_at", fin).limit(50),
  ]);
  const momCamara = (caps ?? []).filter((c: { tipo: string }) => c.tipo === "camara").length;
  const momPantalla = (caps ?? []).filter((c: { tipo: string }) => c.tipo === "pantalla").length;
  const juzgadas = (caps ?? []).filter((c: { tipo: string; veredicto: string | null }) => c.tipo === "pantalla" && c.veredicto != null);
  const juzOk = juzgadas.filter((c: { fuera_de_lugar: boolean | null }) => c.fuera_de_lugar !== true).length;
  const faltasCam = (eventos ?? []).length;
  const horas = Number((tiempo ?? [])[0]?.seg_activo ?? 0) / 3600;

  const pantalla = momCamara > 0 ? Math.min(1, momPantalla / momCamara) : undefined;
  const camara = momCamara > 0 ? momCamara / (momCamara + faltasCam) : undefined;
  const atencion = juzgadas.length > 0 ? juzOk / juzgadas.length : undefined;
  const nota = calcularNota({ pantalla, camara, atencion, horas });

  const ahora = Date.now();
  const bajones = (alertas ?? [])
    .map((al: { tipo: string; abierta_at: string; cerrada_at: string | null }) => ({
      tipo: al.tipo,
      hora: new Date(al.abierta_at).toLocaleTimeString("es-CO", { timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit" }),
      minutos: Math.max(1, Math.round(((al.cerrada_at ? Date.parse(al.cerrada_at) : ahora) - Date.parse(al.abierta_at)) / 60000)),
    }))
    .sort((x: { minutos: number }, y: { minutos: number }) => y.minutos - x.minutos)
    .slice(0, 6);

  return {
    nota,
    pantallaPct: pantalla == null ? null : Math.round(pantalla * 100),
    camaraPct: camara == null ? null : Math.round(camara * 100),
    atencionPct: atencion == null ? null : Math.round(atencion * 100),
    horas,
    bajones,
  };
}

function colorNota(n: number | null): string {
  if (n == null) return "#93a1c0";
  return n >= 80 ? "#36d399" : n >= 60 ? "#f6b93b" : "#ff6b6b";
}

function armarHTML(nombre: string, dia: string, r: Resumen): string {
  const col = colorNota(r.nota);
  const fila = (etiqueta: string, pct: number | null) =>
    `<tr><td style="padding:6px 0;color:#93a1c0;font-size:14px">${etiqueta}</td><td style="padding:6px 0;text-align:right;font-weight:700;font-size:14px;color:#eaf0ff">${pct == null ? "—" : `${pct}%`}</td></tr>`;
  const bajonesHTML = r.bajones.length
    ? `<p style="margin:18px 0 6px;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#93a1c0">Momentos a corregir</p>` +
      r.bajones.map((b) => `<div style="padding:6px 10px;margin-bottom:4px;background:#1a1030;border-left:3px solid #ff6b6b;border-radius:6px;font-size:13px;color:#eaf0ff">${LBL[b.tipo] ?? b.tipo} · ${b.hora} · ${b.minutos} min</div>`).join("")
    : `<div style="padding:10px;margin-top:14px;background:#0f2a1e;border-radius:8px;font-size:13px;color:#36d399">Sin problemas registrados hoy. Bien.</div>`;
  const fecha = new Date(dia + "T12:00:00").toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" });
  return `<div style="background:#0b1020;padding:28px 0;font-family:-apple-system,Segoe UI,Roboto,sans-serif">
  <div style="max-width:520px;margin:0 auto;background:#121a2e;border-radius:18px;overflow:hidden;border:1px solid #23304d">
    <div style="padding:22px 24px;background:linear-gradient(135deg,#1a2342,#121a2e)">
      <p style="margin:0;font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:#7c83ff">Cierre de turno · Argos</p>
      <h1 style="margin:6px 0 0;font-size:20px;color:#eaf0ff">${nombre}</h1>
      <p style="margin:2px 0 0;font-size:13px;color:#93a1c0;text-transform:capitalize">${fecha}</p>
    </div>
    <div style="padding:24px">
      <div style="text-align:center;padding:12px 0 18px">
        <div style="font-size:52px;font-weight:800;line-height:1;color:${col}">${r.nota ?? "—"}</div>
        <div style="font-size:12px;color:#93a1c0;margin-top:2px">tu nota de hoy · de 100</div>
      </div>
      <table style="width:100%;border-collapse:collapse;border-top:1px solid #23304d">
        ${fila("Compartiste pantalla", r.pantallaPct)}
        ${fila("Estuviste en cámara", r.camaraPct)}
        ${fila("Atención (en lo tuyo)", r.atencionPct)}
        <tr><td style="padding:6px 0;color:#93a1c0;font-size:14px">Horas conectado</td><td style="padding:6px 0;text-align:right;font-weight:700;font-size:14px;color:#eaf0ff">${r.horas.toFixed(1)} h</td></tr>
      </table>
      ${bajonesHTML}
      <p style="margin:20px 0 0;font-size:12px;color:#5b6b8c;line-height:1.5">Lo más importante es compartir pantalla y estar en cámara mientras trabajas. Mañana es otro día — a darle.</p>
    </div>
  </div>
</div>`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "method" }, 405);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const body = await req.json().catch(() => ({})) as { prueba_user_id?: string; to?: string };

  const tokenCron = req.headers.get("X-Cron-Token") ?? "";
  const esCron = !!tokenCron && igualesConstante(tokenCron, CRON_TOKEN);

  // Modo PRUEBA: lo pide el dueño con su sesión, manda UN correo a `to`.
  if (!esCron) {
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ ok: false, error: "no-auth" }, 401);
    const { data: puede } = await admin.rpc("es_dueno", { _user_id: user.id });
    if (puede !== true) return json({ ok: false, error: "forbidden" }, 403);
    if (!body.prueba_user_id || !body.to) return json({ ok: false, error: "faltan prueba_user_id y to" }, 400);

    const dia = new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
    const { data: perfil } = await admin.from("profiles").select("full_name").eq("id", body.prueba_user_id).maybeSingle();
    const nombre = (perfil?.full_name as string | undefined)?.trim() || "Empleado";
    const r = await resumenDe(admin, body.prueba_user_id, dia);
    const html = armarHTML(nombre, dia, r);

    // Enviar por el relé de correos (Resend), como servidor.
    const resp = await fetch(`${SUPABASE_URL}/functions/v1/send-notification-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SERVICE_KEY}`, "apikey": SERVICE_KEY },
      body: JSON.stringify({ to: [body.to], subject: `Cierre de turno — ${nombre} (PRUEBA)`, html, tag: "argos-cierre-prueba" }),
    });
    const envio = await resp.json().catch(() => ({}));
    await admin.from("argos_diag").insert({ ronda: "cierre-prueba", paso: "prueba", detalle: { to: body.to, nota: r.nota, ok: resp.ok, envio } }).then(() => {}, () => {});
    return json({ ok: resp.ok, nota: r.nota, resumen: r, envio });
  }

  // Modo CRON: pendiente de activar (barrido de cierres del día).
  return json({ ok: true, skip: "cron-no-activo" });
});
