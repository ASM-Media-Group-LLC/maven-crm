// CONEXIONES EN VIVO, SOLO EL DUEÑO (Alvaro, 11/11/2026): "una parte para
// saber que todo está conectado". Prueba cada servicio externo de verdad (no
// mira solo si la llave existe) y dice en palabras qué pasa. Llamadas de solo
// lectura y gratis: listar modelos, dominios, la suscripción, etc. Lo que vive
// en la base (crons, correo del equipo, Backstage, llamadas, subidas) lo da la
// RPC conexiones_estado(). La página: /oficina/costos (pestaña Conexiones).
//
// Con { accion: "zoho_casillas" } (pestaña Costos › ficha de Zoho › «Ver en
// vivo»): las licencias de Zoho y cada casilla cruzada con Maven (en uso, sin
// uso, de gente que salió, sin cuenta en Maven). Solo correos y estados: nunca
// tokens ni contraseñas. Solo lee; no cambia nada en Zoho.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { pickAllowedOrigin } from "../_shared/cors.ts";
import { licenciasDeZoho, listAccounts, zohoConfigured } from "../_shared/zoho.ts";
import {
  type Chequeo, type CuentaDeMaven, clasificarCasillas, httpDeWs, miles, sinConfigurar, veredicto,
} from "./logica.ts";

const env = (k: string) => Deno.env.get(k) ?? "";
const SUPABASE_URL = env("SUPABASE_URL");
const admin = createClient(SUPABASE_URL, env("SUPABASE_SERVICE_ROLE_KEY"));

// Los orígenes son los de TODA la app (_shared/cors.ts). Esta función tenía su
// propia lista corta (sin www, sin los dominios históricos ni el preview local
// de :4173): desde un origen fuera de esa lista el navegador hacía el preflight,
// recibía otro origen permitido y NUNCA mandaba el POST. La tarjeta «Servicios
// externos» decía «No se pudo cargar esta parte» sin que la función se enterara
// (13/11: los logs solo tenían OPTIONS 204, ningún POST).
function cors(req: Request): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": pickAllowedOrigin(req),
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}
const json = (b: unknown, s: number, c: Record<string, string>) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...c, "Content-Type": "application/json" } });

interface Golpe { status: number | null; ms: number | null; error?: string; cuerpo?: unknown }
async function golpe(url: string, init: RequestInit = {}): Promise<Golpe> {
  const t0 = Date.now();
  try {
    const r = await fetch(url, { ...init, signal: AbortSignal.timeout(6_000) });
    const cuerpo = (r.headers.get("content-type") ?? "").includes("json") ? await r.json().catch(() => null) : await r.text().then(() => null).catch(() => null);
    return { status: r.status, ms: Date.now() - t0, cuerpo };
  } catch (e) {
    return { status: null, ms: Date.now() - t0, error: (e as Error).name === "TimeoutError" ? "no contestó en 6 s" : String((e as Error).message ?? e).slice(0, 120) };
  }
}

async function app(): Promise<Chequeo> {
  return veredicto("app", await golpe("https://app.maven-ai.me/"), "La app abre.");
}
async function livekit(): Promise<Chequeo> {
  const url = env("LIVEKIT_URL");
  if (!url) return sinConfigurar("livekit", "LIVEKIT_URL");
  return veredicto("livekit", await golpe(httpDeWs(url)), "El servidor de llamadas contesta.", (s) => s < 500);
}
async function nas(): Promise<Chequeo> {
  const url = env("DRIVE_NAS_URL").replace(/\/+$/, "");
  if (!url) return sinConfigurar("nas", "DRIVE_NAS_URL");
  return veredicto("nas", await golpe(`${url}/salud`), "El NAS contesta.");
}
async function google(): Promise<Chequeo> {
  const key = env("GEMINI_API_KEY") || env("GOOGLE_AI_API_KEY");
  if (!key) return sinConfigurar("google_ia", "GEMINI_API_KEY");
  const modelo = env("ARGOS_GEMINI_MODEL") || "gemini-3.8-flash";
  return veredicto("google_ia", await golpe(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}?key=${encodeURIComponent(key)}`),
    `Llave viva; el modelo de Argos (${modelo}) está disponible.`);
}
async function resend(): Promise<Chequeo> {
  const key = env("RESEND_API_KEY");
  if (!key) return sinConfigurar("resend", "RESEND_API_KEY");
  const g = await golpe("https://api.resend.com/domains", { headers: { Authorization: `Bearer ${key}` } });
  const dominios = ((g.cuerpo as { data?: Array<{ name: string; status: string }> } | null)?.data ?? []);
  const remitente = (env("NOTIFICATION_FROM_EMAIL").split("@")[1] ?? "").replace(/>.*$/, "");
  const d = dominios.find((x) => x.name === remitente);
  const c = veredicto("resend", g, d ? `Llave viva; ${d.name} está ${d.status === "verified" ? "verificado" : d.status}.` : "Llave viva.");
  if (c.estado === "ok" && d && d.status !== "verified") return { ...c, estado: "mal", detalle: `El dominio de envío ${d.name} no está verificado (${d.status}): los correos pueden no salir.` };
  return c;
}
async function elevenlabs(): Promise<Chequeo> {
  const key = env("ELEVENLABS_API_KEY");
  if (!key) return sinConfigurar("elevenlabs", "ELEVENLABS_API_KEY");
  const g = await golpe("https://api.elevenlabs.io/v1/user/subscription", { headers: { "xi-api-key": key } });
  const s = g.cuerpo as { tier?: string; character_count?: number; character_limit?: number } | null;
  const uso = s && typeof s.character_count === "number" && typeof s.character_limit === "number"
    ? ` Este mes: ${miles(s.character_count)} de ${miles(s.character_limit)} créditos (plan ${s.tier ?? "?"}).` : "";
  return veredicto("elevenlabs", g, `Llave viva.${uso}`);
}
/** El cliente de Zoho no trae tope de tiempo: sin esto, un Zoho colgado deja
 *  esperando a TODA la tarjeta (los chequeos van juntos en un Promise.all). */
function conTope<T>(p: Promise<T>, ms: number, siNoContesta: T): Promise<T> {
  let reloj: number | undefined;
  const espera = new Promise<T>((listo) => { reloj = setTimeout(() => listo(siNoContesta), ms); });
  return Promise.race([p, espera]).finally(() => clearTimeout(reloj));
}

async function zoho(): Promise<Chequeo> {
  if (!zohoConfigured()) return sinConfigurar("zoho", "ZOHO_CLIENT_ID / ZOHO_REFRESH_TOKEN");
  const t0 = Date.now();
  const r = await conTope(
    licenciasDeZoho().catch((e) => ({ ok: false as const, error: String(e) })),
    8_000,
    { ok: false as const, error: "no contestó en 8 s" },
  );
  const ms = Date.now() - t0;
  if (r.ok && "data" in r && r.data) return { id: "zoho", estado: "ok", ms, detalle: `Conectado: ${r.data.usadas} de ${r.data.compradas} licencias en uso.` };
  const err = String((r as { error?: unknown }).error ?? "");
  // Sin el permiso de leer la suscripción, la conexión igual sirve para crear casillas.
  if (err.includes("SCOPE")) return { id: "zoho", estado: "ok", ms, detalle: "Conectado (sin permiso para leer las licencias)." };
  return { id: "zoho", estado: "mal", ms, detalle: `No conecta: ${err.slice(0, 140) || "sin detalle"}` };
}
async function whatsapp(): Promise<Chequeo> {
  const url = env("WHATSAPP_EVOLUTION_URL");
  if (!url) return sinConfigurar("whatsapp", "WHATSAPP_EVOLUTION_URL");
  return veredicto("whatsapp", await golpe(url), "El puente de WhatsApp contesta.", (s) => s < 500);
}
async function telegram(): Promise<Chequeo> {
  const url = env("TELEGRAM_GW_URL");
  if (!url) return sinConfigurar("telegram", "TELEGRAM_GW_URL");
  return veredicto("telegram", await golpe(url), "El puente de Telegram contesta.", (s) => s < 500);
}
async function openrouter(): Promise<Chequeo> {
  const key = env("OPENROUTER_API_KEY");
  if (!key) return sinConfigurar("openrouter", "OPENROUTER_API_KEY");
  const g = await golpe("https://openrouter.ai/api/v1/key", { headers: { Authorization: `Bearer ${key}` } });
  const d = (g.cuerpo as { data?: { usage?: number; limit?: number | null } } | null)?.data;
  const uso = d && typeof d.usage === "number" ? ` Gastado: USD ${d.usage.toFixed(2)}${typeof d.limit === "number" ? ` de USD ${d.limit.toFixed(2)}` : ""}.` : "";
  return veredicto("openrouter", g, `Llave viva.${uso}`);
}
async function anthropic(): Promise<Chequeo> {
  const key = env("ANTHROPIC_API_KEY");
  if (!key) return sinConfigurar("anthropic", "ANTHROPIC_API_KEY");
  return veredicto("anthropic", await golpe("https://api.anthropic.com/v1/models?limit=1", {
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01" },
  }), "Llave viva.");
}

/** Las casillas de Zoho cruzadas con Maven (ficha de Zoho › «Ver en vivo»).
 *  Lo de Maven sale de costos_casillas_de_maven() (solo service_role): si la
 *  cuenta está viva y cuándo entró por última vez (inicio de sesión, sesión
 *  renovada o correo usado). Un fallo se dice como fallo, nunca como «vacío». */
async function zohoCasillas(c: Record<string, string>): Promise<Response> {
  if (!zohoConfigured()) return json({ ok: false, error: "Zoho no está configurado en Supabase." }, 200, c);
  const [lic, cuentas, maven] = await Promise.all([
    licenciasDeZoho().catch((e) => ({ ok: false as const, error: String(e), data: undefined })),
    listAccounts().catch((e) => ({ ok: false as const, error: String(e), data: undefined })),
    admin.rpc("costos_casillas_de_maven"),
  ]);
  if (!cuentas.ok) return json({ ok: false, error: `Zoho no dio la lista de casillas: ${String(cuentas.error ?? "").slice(0, 140)}` }, 200, c);
  if (maven.error) return json({ ok: false, error: `Maven no dio sus casillas: ${maven.error.message}` }, 200, c);
  const zoho = (cuentas.data ?? []).map((a) => ({ email: a.primaryEmailAddress ?? "", nombre: a.displayName ?? null }));
  const deMaven: CuentaDeMaven[] = ((maven.data ?? []) as { email: string; viva: boolean; ultima: string | null }[])
    .map((r) => ({ email: r.email, viva: r.viva, ultimaActividad: r.ultima }));
  const { casillas, resumen } = clasificarCasillas(zoho, deMaven, Date.now());
  return json({
    ok: true,
    en: new Date().toISOString(),
    licencias: lic.ok && lic.data ? lic.data : null,
    licencias_error: lic.ok ? null : String(lic.error ?? "").slice(0, 140),
    resumen,
    casillas,
  }, 200, c);
}

Deno.serve(async (req) => {
  const c = cors(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: c });
  if (req.method !== "POST") return json({ ok: false, error: "method" }, 405, c);

  const auth = req.headers.get("Authorization") ?? "";
  if (!auth) return json({ ok: false, error: "sin-sesion" }, 401, c);
  const sb = createClient(SUPABASE_URL, env("SUPABASE_ANON_KEY"), { global: { headers: { Authorization: auth } } });
  const { data: u } = await sb.auth.getUser();
  if (!u?.user) return json({ ok: false, error: "sin-sesion" }, 401, c);
  const { data: dueno } = await admin.rpc("es_dueno", { _user_id: u.user.id });
  if (dueno !== true) return json({ ok: false, error: "solo-dueno" }, 403, c);

  let cuerpo: { accion?: unknown } = {};
  try { cuerpo = await req.json(); } catch { /* sin cuerpo: los chequeos de siempre */ }
  if (cuerpo?.accion === "zoho_casillas") return await zohoCasillas(c);

  const chequeos = await Promise.all([app(), livekit(), nas(), google(), resend(), zoho(), elevenlabs(), whatsapp(), telegram(), openrouter(), anthropic()]);
  return json({ ok: true, en: new Date().toISOString(), chequeos }, 200, c);
});
