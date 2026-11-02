import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// argos-foto — sirve los pantallazos que ya viven en el NAS (Álvaro, 02/11).
//
// El buzón de Supabase se firma con createSignedUrl; las fotos mudadas al NAS
// (en_nas=true) se sirven por aquí: firma un permiso de BAJADA (op "get") y
// devuelve la URL de la puerta del NAS, que el navegador carga como <img src>.
// Solo el DUEÑO (es_dueno). Recibe una lista y devuelve un mapa { ruta: url }.
//
// Firma incrustada (igual a _shared/drive-firma.ts). También entra por cron
// (X-Cron-Token) para autoprueba. Namespace fijo de Argos para no firmar
// cualquier cosa del NAS.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const CRON_TOKEN = Deno.env.get("CRON_INTERNAL_TOKEN") ?? "";
const NAS = (Deno.env.get("DRIVE_NAS_URL") ?? "").replace(/\/+$/, "");
const SECRETO = Deno.env.get("DRIVE_SECRETO") ?? "";
const VENCE_BAJAR = 6 * 3600;
const ARGOS_NS = "a6905000-0000-4000-8000-000000000001";
const MAX = 200;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}
function igualesConstante(a: string, b: string): boolean {
  if (a.length !== b.length || a.length === 0) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
const enc = new TextEncoder();
function b64u(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}
async function clave(uso: KeyUsage[]) {
  return await crypto.subtle.importKey("raw", enc.encode(SECRETO), { name: "HMAC", hash: "SHA-256" }, false, uso);
}
async function firmar(datos: Record<string, unknown>): Promise<string> {
  const cuerpo = b64u(enc.encode(JSON.stringify(datos)));
  const firma = new Uint8Array(await crypto.subtle.sign("HMAC", await clave(["sign"]), enc.encode(cuerpo)));
  return `${cuerpo}.${b64u(firma)}`;
}
const ahoraMas = (segundos: number) => Math.floor(Date.now() / 1000) + segundos;

const esRutaArgos = (k: unknown): k is string => typeof k === "string" && k.startsWith(`${ARGOS_NS}/`) && k.length < 200;
async function urlGet(nasPath: string): Promise<string> {
  return `${NAS}/o?t=${await firmar({ op: "get", k: nasPath, e: ahoraMas(VENCE_BAJAR) })}`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "method" }, 405);
  if (!NAS || SECRETO.length < 32) return json({ ok: false, error: "sin-config" }, 503);

  const body = await req.json().catch(() => ({})) as { nas_paths?: unknown; probar?: unknown };

  const tokenCron = req.headers.get("X-Cron-Token") ?? "";
  const esCron = !!tokenCron && igualesConstante(tokenCron, CRON_TOKEN);

  // Autoprueba (cron): firma un GET y lo consulta para confirmar que el NAS lo sirve.
  if (esCron && esRutaArgos(body.probar)) {
    const url = await urlGet(body.probar);
    const r = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(8000) }).catch((e) => ({ status: 0, msg: (e as Error).message }));
    return json({ ok: true, probar: body.probar, status: (r as Response).status ?? 0, msg: (r as { msg?: string }).msg ?? null });
  }

  if (!esCron) {
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ ok: false, error: "no-auth" }, 401);
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: puede } = await admin.rpc("es_dueno", { _user_id: user.id });
    if (puede !== true) return json({ ok: false, error: "forbidden" }, 403);
  }

  const rutas = Array.isArray(body.nas_paths) ? body.nas_paths.filter(esRutaArgos).slice(0, MAX) : [];
  const urls: Record<string, string> = {};
  for (const r of rutas) urls[r] = await urlGet(r);
  return json({ ok: true, urls });
});
