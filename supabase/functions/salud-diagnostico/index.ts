// Diagnóstico EN VIVO de un chequeo del bloque Salud (Alvaro, 09/11). Al tocar
// una caja del home, el front llama a este edge con `{ tipo: 'nas'|'correo'|
// 'mensajeria'|'argos' }` y devuelve una lista de pruebas con su veredicto
// (✅/❌/⚠️), para que veas uno a uno qué sirve y qué no.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const NAS = (Deno.env.get("DRIVE_NAS_URL") ?? "").replace(/\/+$/, "");
const GEMINI_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
const GEMINI_MODEL = Deno.env.get("ARGOS_GEMINI_MODEL") ?? "gemini-3.8-flash";

const ALLOWED_ORIGINS = [
  "https://app.maven-ai.me","https://maven-ai.me",
  "http://localhost:8080","http://127.0.0.1:8080",
];
function cors(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}
const json = (b: unknown, s: number, c: Record<string, string>) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...c, "Content-Type": "application/json" } });

const admin = createClient(SUPABASE_URL, SERVICE_KEY);

type Prueba = { nombre: string; estado: "ok" | "mal" | "duda"; detalle: string };

async function pruebasArgos(): Promise<Prueba[]> {
  const out: Prueba[] = [];
  // 1) Llave de Gemini — llamada DIRECTA a Google (no vía edge) para que el
  // error que devuelve sea el real: cuota agotada, llave rota, modelo apagado.
  if (!GEMINI_KEY) {
    out.push({ nombre: "Llave de Gemini", estado: "mal", detalle: "Falta GEMINI_API_KEY en Supabase" });
  } else {
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: "ping" }] }], generationConfig: { maxOutputTokens: 5, thinkingConfig: { thinkingBudget: 0 } } }),
        signal: AbortSignal.timeout(10000),
      });
      const txt = await r.text().catch(() => "");
      if (r.ok) out.push({ nombre: "Llave de Gemini", estado: "ok", detalle: `Google respondió 200 al modelo ${GEMINI_MODEL}` });
      else out.push({ nombre: "Llave de Gemini", estado: "mal", detalle: `Google dice ${r.status}: ${txt.slice(0, 200)}` });
    } catch (e) {
      out.push({ nombre: "Llave de Gemini", estado: "mal", detalle: (e as Error).message });
    }
  }

  // 2) Edge argos-mirar responde (que es el que juzga pantallazos de verdad).
  try {
    const r = await fetch(`${SUPABASE_URL}/functions/v1/argos-mirar`, {
      method: "POST", headers: {
        "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY}`,
      }, body: JSON.stringify({}), signal: AbortSignal.timeout(8000),
    });
    out.push({
      nombre: "Edge argos-mirar responde",
      estado: r.status >= 400 && r.status < 500 ? "ok" : r.status === 200 ? "ok" : "mal",
      detalle: `http ${r.status}`,
    });
  } catch (e) {
    out.push({ nombre: "Edge argos-mirar responde", estado: "mal", detalle: (e as Error).message });
  }

  // 3) Captura reciente del equipo (hay pantallazos nuevos → el cliente manda; si 0, nadie en Cowork).
  const hace1h = new Date(Date.now() - 60 * 60_000).toISOString();
  const { count: fotos } = await admin.from("monitor_capturas").select("id", { count: "exact", head: true }).gte("created_at", hace1h);
  out.push({
    nombre: "Capturas recientes del equipo",
    estado: (fotos ?? 0) > 0 ? "ok" : "duda",
    detalle: `${fotos ?? 0} fotos en la última hora`,
  });

  // 4) Último veredicto real de la IA (si fotos > 0 y veredictos = 0 por 15+ min, la IA está muerta).
  const { count: juzgadas } = await admin.from("monitor_capturas").select("id", { count: "exact", head: true })
    .not("veredicto", "is", null).gte("created_at", hace1h);
  out.push({
    nombre: "IA juzgando",
    estado: (juzgadas ?? 0) > 0 ? "ok" : ((fotos ?? 0) > 0 ? "mal" : "duda"),
    detalle: `${juzgadas ?? 0} pantallazos juzgados en la última hora`,
  });

  return out;
}

async function pruebasNAS(): Promise<Prueba[]> {
  const out: Prueba[] = [];
  if (!NAS) {
    out.push({ nombre: "NAS configurado", estado: "mal", detalle: "Falta DRIVE_NAS_URL" });
    return out;
  }
  // 1) Ping /salud
  try {
    const r = await fetch(`${NAS}/salud`, { signal: AbortSignal.timeout(6000) });
    if (!r.ok) out.push({ nombre: "Ping al NAS /salud", estado: "mal", detalle: `http ${r.status}` });
    else {
      const body = await r.json().catch(() => null) as { raices?: Array<{ ok: boolean }> } | null;
      const raices = body?.raices?.length ?? 0;
      const okRaices = body?.raices?.filter((x) => x.ok).length ?? 0;
      out.push({
        nombre: "Ping al NAS /salud",
        estado: okRaices > 0 ? "ok" : "mal",
        detalle: `${okRaices}/${raices} raíces respondiendo`,
      });
    }
  } catch (e) {
    out.push({ nombre: "Ping al NAS /salud", estado: "mal", detalle: (e as Error).message });
  }
  // 2) Aportes atascados REALES (>0 bytes, >30 min)
  const hace30 = new Date(Date.now() - 30 * 60_000).toISOString();
  const { count: atascados } = await admin.from("drive_aportes").select("id", { count: "exact", head: true })
    .eq("en_nas", false).gt("size", 0).lt("created_at", hace30);
  out.push({
    nombre: "Aportes fluyendo",
    estado: (atascados ?? 0) === 0 ? "ok" : "mal",
    detalle: (atascados ?? 0) === 0 ? "sin atascos" : `${atascados} atascado(s) +30 min`,
  });
  // 3) Cron de aportes vivo
  const { data: cron } = await admin.rpc("sql_salud_cron_hace", { _jobname: "drive-aporte-nas-ping" }).select().maybeSingle() as unknown as { data: { hace_min: number | null } | null };
  const hm = cron?.hace_min;
  out.push({
    nombre: "Cron drive-aporte-nas",
    estado: hm == null ? "duda" : hm > 10 ? "mal" : "ok",
    detalle: hm == null ? "no se encontró la última corrida" : `última corrida hace ${Math.round(hm)} min`,
  });
  return out;
}

async function pruebasCorreo(): Promise<Prueba[]> {
  const out: Prueba[] = [];
  // 1) RESEND_API_KEY puesto
  out.push({
    nombre: "Llave de correo (Resend)",
    estado: Deno.env.get("RESEND_API_KEY") ? "ok" : "mal",
    detalle: Deno.env.get("RESEND_API_KEY") ? "puesta" : "FALTA RESEND_API_KEY",
  });
  // 2) ¿tardanzas sin enviar hace >10 min?
  const hace10 = new Date(Date.now() - 10 * 60_000).toISOString();
  const { count: atascados } = await admin.from("tardanzas_registro").select("id", { count: "exact", head: true })
    .eq("correo_enviado", false).lt("created_at", hace10);
  out.push({
    nombre: "Correos de tardanza saliendo",
    estado: (atascados ?? 0) === 0 ? "ok" : "mal",
    detalle: (atascados ?? 0) === 0 ? "ninguno atascado" : `${atascados} sin enviar +10 min`,
  });
  // 3) Cron detectar-tardanzas
  const { data: cron } = await admin.rpc("sql_salud_cron_hace", { _jobname: "detectar-tardanzas" }).select().maybeSingle() as unknown as { data: { hace_min: number | null } | null };
  const hm = cron?.hace_min;
  out.push({
    nombre: "Cron detectar-tardanzas",
    estado: hm == null ? "duda" : hm > 10 ? "mal" : "ok",
    detalle: hm == null ? "no encontrado" : `última corrida hace ${Math.round(hm)} min`,
  });
  return out;
}

async function pruebasMensajeria(): Promise<Prueba[]> {
  const out: Prueba[] = [];
  // Mensajes recientes
  const hace1h = new Date(Date.now() - 60 * 60_000).toISOString();
  const { count: msgs } = await admin.from("messages").select("id", { count: "exact", head: true }).gte("created_at", hace1h);
  out.push({
    nombre: "Mensajes fluyendo",
    estado: (msgs ?? 0) > 0 ? "ok" : "duda",
    detalle: `${msgs ?? 0} mensajes en la última hora`,
  });
  // VAPID put
  out.push({
    nombre: "Push configurado (VAPID)",
    estado: Deno.env.get("VAPID_PUBLIC_KEY") ? "ok" : "mal",
    detalle: Deno.env.get("VAPID_PUBLIC_KEY") ? "llaves presentes" : "falta VAPID",
  });
  return out;
}

Deno.serve(async (req) => {
  const c = cors(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: c });
  if (req.method !== "POST") return json({ ok: false, error: "method" }, 405, c);

  const auth = req.headers.get("Authorization") ?? "";
  if (!auth) return json({ ok: false, error: "sin-sesion" }, 401, c);
  const sb = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: auth } } });
  const { data: u } = await sb.auth.getUser();
  if (!u?.user) return json({ ok: false, error: "sin-sesion" }, 401, c);
  // Solo dueño/admin
  const { data: esAdmin } = await admin.rpc("es_admin_o_dueno", { _uid: u.user.id });
  if (esAdmin !== true) return json({ ok: false, error: "solo-admin" }, 403, c);

  const body = await req.json().catch(() => ({})) as { tipo?: string };
  const tipo = String(body.tipo ?? "");
  let pruebas: Prueba[] = [];
  if (tipo === "argos") pruebas = await pruebasArgos();
  else if (tipo === "nas" || tipo === "drive") pruebas = await pruebasNAS();
  else if (tipo === "correo") pruebas = await pruebasCorreo();
  else if (tipo === "mensajeria") pruebas = await pruebasMensajeria();
  else return json({ ok: false, error: "tipo-invalido" }, 400, c);

  return json({ ok: true, tipo, pruebas }, 200, c);
});
