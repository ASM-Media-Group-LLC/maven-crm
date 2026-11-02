import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { encodeBase64 } from "jsr:@std/encoding@1/base64";

// argos-mirar — el CEREBRO de la muralla en vivo de Argos (Álvaro, 01/11).
//
// Mira los PANTALLAZOS de pantalla más recientes de cada persona y dice, en una
// frase corta, QUÉ está haciendo y si está FUERA DE LUGAR. Escribe el veredicto
// en monitor_capturas (veredicto, fuera_de_lugar, analizado) para que la muralla
// lo pinte bajo cada tarjeta y el expediente/las notas lo acumulen.
//
// DOS PUERTAS:
//   · Cron (cada 2 min, pg_cron): X-Cron-Token = CRON_INTERNAL_TOKEN, como los
//     demás crons. Argos juzga SOLO, haya o no alguien mirando. Es el motor.
//   · Supervisor con sesión (para pruebas a mano). verify_jwt=true en el gateway
//     cubre las dos (el cron manda la llave pública como Bearer).
//
// PROVEEDORES (02/11): OpenRouter 401 "User not found" y Anthropic 401 "invalid
// x-api-key" → MUERTAS (eran llaves de Jhon). Gemini VIVE pero en nivel gratuito
// (429 por cuota/ritmo). Por eso: Gemini PRIMERO, una llamada a la vez, reintento
// corto en 429, pensamiento apagado (gemini-2.5-flash "piensa" y se come el tope
// de tokens → JSON truncado). Los otros dos quedan de respaldo por si Alvaro pone
// llaves nuevas: reviven solos. Cada paso deja huella en argos_diag.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const CRON_TOKEN = Deno.env.get("CRON_INTERNAL_TOKEN") ?? "";
const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY") ?? "";
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? Deno.env.get("GOOGLE_AI_API_KEY") ?? "";
const MODELO_OPENROUTER = Deno.env.get("MONITOR_LLM_MODEL") ?? "openai/gpt-4o-mini";
const MODELO_ANTHROPIC = Deno.env.get("ARGOS_ANTHROPIC_MODEL") ?? "claude-haiku-4-5";
const MODELO_GEMINI = Deno.env.get("ARGOS_GEMINI_MODEL") ?? "gemini-2.5-flash"; // el que ya usaba Maven (8k llamadas)
const LLM_TIMEOUT_MS = 20_000;
const VENTANA_MIN = 7; // solo lo de los últimos minutos
const TOPE_PERSONAS = 10; // techo por ronda (cada 2 min)
const REINTENTO_MS = 2_500; // pausa antes de reintentar un 429/vacío

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

/** Comparación en tiempo constante (no filtra el token por el reloj). */
function igualesConstante(a: string, b: string): boolean {
  if (a.length !== b.length || a.length === 0) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

const PROMPT =
  `Eres Argos, el monitor de trabajo de una agencia. Te paso un PANTALLAZO de la pantalla de un trabajador.
Di en una frase corta y neutral QUÉ está haciendo en su pantalla, y si está TRABAJANDO o FUERA DE LUGAR.

TRABAJO: chat o mensajería de clientes, el CRM Maven, correo, planillas, documentos, una llamada de trabajo, o navegación relacionada al trabajo.
FUERA DE LUGAR: redes sociales personales, YouTube u otro streaming de ocio, juegos, compras personales, la pantalla de inicio sin actividad, la pantalla apagada, o cualquier cosa ajena al trabajo.

Devuelve SOLO este JSON, sin texto antes ni después, sin markdown:
{ "actividad": "frase corta de qué se ve en la pantalla", "fuera_de_lugar": true | false }

REGLAS:
- Ante la duda, fuera_de_lugar=false. Solo true si es evidente que no es trabajo.
- "actividad" en español neutro, sin voseo, máximo una frase.`;

interface Veredicto {
  actividad: string;
  fuera_de_lugar: boolean;
}

type Proveedor = "gemini" | "openrouter" | "anthropic";
type Respuesta = { text: string } | { error: string; reintentable?: boolean };

async function conTimeout(url: string, init: RequestInit): Promise<Response> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), LLM_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ac.signal });
  } finally {
    clearTimeout(t);
  }
}

async function cuerpoError(resp: Response): Promise<string> {
  return `${resp.status}: ${(await resp.text().catch(() => "")).slice(0, 200)}`;
}

async function pedirGemini(b64: string): Promise<Respuesta> {
  if (!GEMINI_API_KEY) return { error: "sin-llave" };
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODELO_GEMINI}:generateContent?key=${GEMINI_API_KEY}`;
    const resp = await conTimeout(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: PROMPT },
            { inline_data: { mime_type: "image/jpeg", data: b64 } },
          ],
        }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 600,
          responseMimeType: "application/json",
          // gemini-2.5-flash piensa antes de responder y ese pensamiento consume
          // el tope de tokens → llegaba "{" y nada más. Para clasificar un
          // pantallazo no hace falta pensar: se apaga.
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    });
    if (!resp.ok) return { error: await cuerpoError(resp), reintentable: resp.status === 429 || resp.status >= 500 };
    const data = await resp.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }> };
    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    return text ? { text } : { error: `vacio (${data.candidates?.[0]?.finishReason ?? "?"})`, reintentable: true };
  } catch (e) {
    return { error: (e as Error).name === "AbortError" ? "timeout" : (e as Error).message, reintentable: true };
  }
}

async function pedirOpenRouter(b64: string): Promise<Respuesta> {
  if (!OPENROUTER_API_KEY) return { error: "sin-llave" };
  try {
    const resp = await conTimeout("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "HTTP-Referer": "https://app.maven-ai.me",
        "X-Title": "Maven Argos",
      },
      body: JSON.stringify({
        model: MODELO_OPENROUTER,
        messages: [{
          role: "user",
          content: [
            { type: "text", text: PROMPT },
            { type: "image_url", image_url: { url: `data:image/jpeg;base64,${b64}` } },
          ],
        }],
        response_format: { type: "json_object" },
        temperature: 0.1,
        max_tokens: 300,
      }),
    });
    if (!resp.ok) return { error: await cuerpoError(resp), reintentable: resp.status === 429 || resp.status >= 500 };
    const data = await resp.json() as { choices?: Array<{ message?: { content?: string } }> };
    const text = data.choices?.[0]?.message?.content ?? "";
    return text ? { text } : { error: "vacio", reintentable: true };
  } catch (e) {
    return { error: (e as Error).name === "AbortError" ? "timeout" : (e as Error).message, reintentable: true };
  }
}

async function pedirAnthropic(b64: string): Promise<Respuesta> {
  if (!ANTHROPIC_API_KEY) return { error: "sin-llave" };
  try {
    const resp = await conTimeout("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODELO_ANTHROPIC,
        max_tokens: 300,
        temperature: 0.1,
        messages: [{
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: "image/jpeg", data: b64 } },
            { type: "text", text: PROMPT },
          ],
        }],
      }),
    });
    if (!resp.ok) return { error: await cuerpoError(resp), reintentable: resp.status === 429 || resp.status >= 500 };
    const data = await resp.json() as { content?: Array<{ type: string; text?: string }> };
    const text = data.content?.find((c) => c.type === "text")?.text ?? "";
    return text ? { text } : { error: "vacio", reintentable: true };
  } catch (e) {
    return { error: (e as Error).name === "AbortError" ? "timeout" : (e as Error).message, reintentable: true };
  }
}

const PEDIR: Record<Proveedor, (b64: string) => Promise<Respuesta>> = {
  gemini: pedirGemini,
  openrouter: pedirOpenRouter,
  anthropic: pedirAnthropic,
};
// Gemini primero: es la única viva hoy. Los otros reviven solos con llave nueva.
const ORDEN: Proveedor[] = ["gemini", "openrouter", "anthropic"];

/** Saca el primer objeto JSON del texto, aunque venga con prosa o ```json alrededor. */
function parsearVeredicto(text: string): Veredicto | null {
  const i = text.indexOf("{");
  const j = text.lastIndexOf("}");
  if (i < 0 || j <= i) return null;
  try {
    const p = JSON.parse(text.slice(i, j + 1));
    const actividad = String(p.actividad ?? "").trim();
    if (!actividad) return null;
    return { actividad, fuera_de_lugar: p.fuera_de_lugar === true };
  } catch {
    return null;
  }
}

interface Fila {
  id: string;
  user_id: string;
  path: string | null;
  nas_path: string | null;
  en_nas: boolean;
  created_at: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "method" }, 405);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const ronda = crypto.randomUUID().slice(0, 8);
  // Deja huella de cada paso. Nunca tumba la función si la tabla falla.
  const diag = async (paso: string, detalle: Record<string, unknown> = {}) => {
    await admin.from("argos_diag").insert({ ronda, paso, detalle }).then(() => {}, () => {});
  };

  // 1) ¿Quién llama? Puerta de cron (X-Cron-Token) o supervisor con sesión.
  const tokenCron = req.headers.get("X-Cron-Token") ?? "";
  const esCron = !!tokenCron && igualesConstante(tokenCron, CRON_TOKEN);
  await diag("entrada", { via: esCron ? "cron" : "usuario" });

  if (!esCron) {
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    await diag("auth", { user: user?.id ?? null, error: authErr?.message ?? null });
    if (!user) return json({ ok: false, error: "no-auth" }, 401);

    const { data: puede, error: rolErr } = await admin.rpc("is_in_role_group", { _user_id: user.id, _group: "supervisor_or_above" });
    await diag("rol", { puede, error: rolErr?.message ?? null });
    if (puede !== true) return json({ ok: false, error: "forbidden" }, 403);
  }

  if (!OPENROUTER_API_KEY && !ANTHROPIC_API_KEY && !GEMINI_API_KEY) { await diag("sin_llaves"); return json({ ok: false, error: "no-key" }, 503); }

  // 2) Monitor apagado → no se gasta IA.
  const { data: cfg } = await admin.from("monitor_config").select("activo").eq("id", 1).maybeSingle();
  if (cfg && cfg.activo === false) { await diag("apagado"); return json({ ok: true, analizadas: 0, skip: "off" }); }

  // 3) Pantallazos de pantalla recientes SIN veredicto; el más reciente de cada persona.
  const desdeISO = new Date(Date.now() - VENTANA_MIN * 60_000).toISOString();
  const { data: filas, error: qErr } = await admin
    .from("monitor_capturas")
    .select("id, user_id, path, nas_path, en_nas, created_at")
    .eq("tipo", "pantalla")
    .is("veredicto", null)
    .gte("created_at", desdeISO)
    .order("created_at", { ascending: false })
    .limit(400);
  if (qErr) { await diag("query_error", { error: qErr.message }); return json({ ok: false, error: "query", detalle: qErr.message }, 500); }

  const porPersona = new Map<string, Fila>();
  for (const f of (filas ?? []) as Fila[]) {
    if (!porPersona.has(f.user_id)) porPersona.set(f.user_id, f);
  }
  const pendientes = [...porPersona.values()].slice(0, TOPE_PERSONAS);
  await diag("pendientes", { filas: filas?.length ?? 0, personas: porPersona.size, a_analizar: pendientes.length });
  if (pendientes.length === 0) return json({ ok: true, analizadas: 0 });

  // 4) Juzgar UNA foto a la vez (nivel gratuito de Gemini: ritmo limitado). El
  //    primer proveedor que responde se queda para el resto de la ronda. Un 429 o
  //    vacío se reintenta una vez tras una pausa corta. Si ningún proveedor
  //    responde en la primera foto, se corta la ronda.
  let proveedorVivo: Proveedor | null = null;
  const fallas: Record<string, string> = {};

  const pedirConReintento = async (p: Proveedor, b64: string): Promise<Respuesta> => {
    const r1 = await PEDIR[p](b64);
    if (!("error" in r1) || !r1.reintentable) return r1;
    await dormir(REINTENTO_MS);
    return await PEDIR[p](b64);
  };

  const juzgar = async (b64: string): Promise<{ v: Veredicto; proveedor: Proveedor } | null> => {
    const orden = proveedorVivo ? [proveedorVivo] : ORDEN;
    for (const p of orden) {
      const r = await pedirConReintento(p, b64);
      if ("error" in r) { fallas[p] = r.error; continue; }
      const v = parsearVeredicto(r.text);
      if (!v) { fallas[p] = `json-invalido: ${r.text.slice(0, 160)}`; continue; }
      proveedorVivo = p;
      return { v, proveedor: p };
    }
    return null;
  };

  let analizadas = 0;
  const errores: string[] = [];
  for (const f of pendientes) {
    const ruta = f.en_nas ? f.nas_path : f.path;
    if (!ruta) { errores.push("sin-ruta"); continue; }
    const dl = await admin.storage.from("monitor-capturas").download(ruta);
    if (dl.error || !dl.data) {
      errores.push(`bajar: ${dl.error?.message ?? "vacio"}`);
      await diag("bajar_error", { id: f.id, ruta, error: dl.error?.message ?? null });
      continue;
    }
    const bytes = new Uint8Array(await dl.data.arrayBuffer());
    const res = await juzgar(encodeBase64(bytes)); // base64 nativo: sin bucle char a char
    if (!res) {
      errores.push("sin-proveedor");
      await diag("vision_error", { id: f.id, bytes: bytes.length, fallas });
      if (!proveedorVivo) break; // ninguno respondió: no seguir gastando esta ronda
      continue;
    }
    const { error: upErr } = await admin
      .from("monitor_capturas")
      .update({ veredicto: res.v.actividad, fuera_de_lugar: res.v.fuera_de_lugar, analizado: true })
      .eq("id", f.id);
    if (upErr) { errores.push(`update: ${upErr.message}`); await diag("update_error", { id: f.id, error: upErr.message }); continue; }
    analizadas++;
    await diag("ok", { id: f.id, user: f.user_id, bytes: bytes.length, proveedor: res.proveedor, actividad: res.v.actividad, fuera: res.v.fuera_de_lugar });
  }

  await diag("fin", { via: esCron ? "cron" : "usuario", analizadas, proveedor: proveedorVivo, fallas, errores: errores.slice(0, 5) });
  return json({ ok: true, analizadas, proveedor: proveedorVivo, fallas });
});
