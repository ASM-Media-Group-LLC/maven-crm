import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { encodeBase64 } from "jsr:@std/encoding@1/base64";

// argos-mirar — el CEREBRO de la muralla en vivo de Argos (Álvaro, 01/11).
//
// Mira los PANTALLAZOS de pantalla más recientes de cada persona y dice, en una
// frase corta, QUÉ está haciendo y si está FUERA DE LUGAR. Escribe el veredicto
// en monitor_capturas (veredicto, fuera_de_lugar, analizado) para que la muralla
// lo pinte bajo cada tarjeta.
//
// Lo dispara el cliente cuando un supervisor abre la muralla (verify_jwt=true):
// así solo se gasta IA cuando alguien está mirando, y se analiza lo de AHORITA.
//
// PROVEEDORES EN CADENA: la llave de OpenRouter apareció muerta (401 "User not
// found", 02/11) y toda la IA dejó de usarse el 01/10 (llaves de Jhon). Por eso
// se intenta OpenRouter → Anthropic → Gemini con las llaves que ya existen; el
// primero que responde se usa para el resto de la ronda. Cada paso deja huella en
// argos_diag (solo service_role) para ver desde afuera qué proveedor vive.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY") ?? "";
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? Deno.env.get("GOOGLE_AI_API_KEY") ?? "";
const MODELO_OPENROUTER = Deno.env.get("MONITOR_LLM_MODEL") ?? "openai/gpt-4o-mini";
const MODELO_ANTHROPIC = Deno.env.get("ARGOS_ANTHROPIC_MODEL") ?? "claude-haiku-4-5"; // el que ya usaba Maven (16k llamadas)
const MODELO_GEMINI = Deno.env.get("ARGOS_GEMINI_MODEL") ?? "gemini-2.5-flash"; // ídem (8k llamadas)
const LLM_TIMEOUT_MS = 20_000;
const VENTANA_MIN = 7; // solo lo de los últimos minutos
const TOPE_PERSONAS = 10; // techo por ronda; la muralla vuelve a llamar
const EN_PARALELO = 4; // cuántas visiones a la vez

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

const PROMPT =
  `Eres Argos, el monitor de trabajo de una agencia. Te paso un PANTALLAZO de la pantalla de un trabajador.
Di en una frase corta y neutral QUÉ está haciendo en su pantalla, y si está TRABAJANDO o FUERA DE LUGAR.

TRABAJO: chat o mensajería de clientes, el CRM Maven, correo, planillas, documentos, una llamada de trabajo, o navegación relacionada al trabajo.
FUERA DE LUGAR: redes sociales personales, YouTube u otro streaming de ocio, juegos, compras personales, la pantalla de inicio sin actividad, la pantalla apagada, o cualquier cosa ajena al trabajo.

Devuelve JSON estricto con esta forma exacta:
{ "actividad": "frase corta de qué se ve en la pantalla", "fuera_de_lugar": true | false }

REGLAS:
- Ante la duda, fuera_de_lugar=false. Solo true si es evidente que no es trabajo.
- "actividad" en español neutro, sin voseo, máximo una frase.
- OUTPUT: solo JSON. Sin markdown, sin explicaciones.`;

interface Veredicto {
  actividad: string;
  fuera_de_lugar: boolean;
}

type Proveedor = "openrouter" | "anthropic" | "gemini";
type Respuesta = { text: string } | { error: string };

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
    if (!resp.ok) return { error: await cuerpoError(resp) };
    const data = await resp.json() as { choices?: Array<{ message?: { content?: string } }> };
    const text = data.choices?.[0]?.message?.content ?? "";
    return text ? { text } : { error: "vacio" };
  } catch (e) {
    return { error: (e as Error).name === "AbortError" ? "timeout" : (e as Error).message };
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
    if (!resp.ok) return { error: await cuerpoError(resp) };
    const data = await resp.json() as { content?: Array<{ type: string; text?: string }> };
    const text = data.content?.find((c) => c.type === "text")?.text ?? "";
    return text ? { text } : { error: "vacio" };
  } catch (e) {
    return { error: (e as Error).name === "AbortError" ? "timeout" : (e as Error).message };
  }
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
        generationConfig: { temperature: 0.1, maxOutputTokens: 300, responseMimeType: "application/json" },
      }),
    });
    if (!resp.ok) return { error: await cuerpoError(resp) };
    const data = await resp.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    return text ? { text } : { error: "vacio" };
  } catch (e) {
    return { error: (e as Error).name === "AbortError" ? "timeout" : (e as Error).message };
  }
}

const PEDIR: Record<Proveedor, (b64: string) => Promise<Respuesta>> = {
  openrouter: pedirOpenRouter,
  anthropic: pedirAnthropic,
  gemini: pedirGemini,
};
const ORDEN: Proveedor[] = ["openrouter", "anthropic", "gemini"];

function parsearVeredicto(text: string): Veredicto | null {
  try {
    const limpio = text.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
    const p = JSON.parse(limpio);
    return { actividad: String(p.actividad ?? "").trim(), fuera_de_lugar: p.fuera_de_lugar === true };
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

  await diag("entrada");

  // 1) Quién llama (el gateway ya validó el JWT). Debe ser supervisor+.
  const authHeader = req.headers.get("Authorization") ?? "";
  const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
  const { data: { user }, error: authErr } = await userClient.auth.getUser();
  await diag("auth", { user: user?.id ?? null, error: authErr?.message ?? null });
  if (!user) return json({ ok: false, error: "no-auth" }, 401);

  const { data: puede, error: rolErr } = await admin.rpc("is_in_role_group", { _user_id: user.id, _group: "supervisor_or_above" });
  await diag("rol", { puede, error: rolErr?.message ?? null });
  if (puede !== true) return json({ ok: false, error: "forbidden" }, 403);

  await diag("llaves", {
    openrouter: OPENROUTER_API_KEY.length,
    anthropic: ANTHROPIC_API_KEY.length,
    gemini: GEMINI_API_KEY.length,
    modelos: { openrouter: MODELO_OPENROUTER, anthropic: MODELO_ANTHROPIC, gemini: MODELO_GEMINI },
  });
  if (!OPENROUTER_API_KEY && !ANTHROPIC_API_KEY && !GEMINI_API_KEY) return json({ ok: false, error: "no-key" }, 503);

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

  // 4) Juzgar. El primer proveedor que responde se queda para el resto de la ronda.
  //    Si TODOS fallan en la primera foto, se corta la ronda (no hay con qué juzgar).
  let proveedorVivo: Proveedor | null = null;
  const fallasProveedor: Record<string, string> = {};
  let sinProveedor = false;

  const juzgar = async (b64: string): Promise<{ v: Veredicto; proveedor: Proveedor } | null> => {
    const orden = proveedorVivo ? [proveedorVivo] : ORDEN;
    for (const p of orden) {
      const r = await PEDIR[p](b64);
      if ("error" in r) { fallasProveedor[p] = r.error; continue; }
      const v = parsearVeredicto(r.text);
      if (!v) { fallasProveedor[p] = `json-invalido: ${r.text.slice(0, 120)}`; continue; }
      proveedorVivo = p;
      return { v, proveedor: p };
    }
    return null;
  };

  let analizadas = 0;
  const errores: string[] = [];
  const unaPersona = async (f: Fila) => {
    if (sinProveedor) return;
    const ruta = f.en_nas ? f.nas_path : f.path;
    if (!ruta) { errores.push("sin-ruta"); return; }
    const dl = await admin.storage.from("monitor-capturas").download(ruta);
    if (dl.error || !dl.data) {
      errores.push(`bajar: ${dl.error?.message ?? "vacio"}`);
      await diag("bajar_error", { id: f.id, ruta, error: dl.error?.message ?? null });
      return;
    }
    const bytes = new Uint8Array(await dl.data.arrayBuffer());
    const res = await juzgar(encodeBase64(bytes)); // base64 nativo: sin bucle char a char
    if (!res) {
      if (!proveedorVivo) sinProveedor = true; // ninguno respondió: no seguir gastando
      errores.push("sin-proveedor");
      await diag("vision_error", { id: f.id, bytes: bytes.length, fallas: fallasProveedor });
      return;
    }
    const { error: upErr } = await admin
      .from("monitor_capturas")
      .update({ veredicto: res.v.actividad || "en su puesto", fuera_de_lugar: res.v.fuera_de_lugar, analizado: true })
      .eq("id", f.id);
    if (upErr) { errores.push(`update: ${upErr.message}`); await diag("update_error", { id: f.id, error: upErr.message }); return; }
    analizadas++;
    await diag("ok", { id: f.id, user: f.user_id, bytes: bytes.length, proveedor: res.proveedor, actividad: res.v.actividad, fuera: res.v.fuera_de_lugar });
  };
  for (let i = 0; i < pendientes.length && !sinProveedor; i += EN_PARALELO) {
    await Promise.all(pendientes.slice(i, i + EN_PARALELO).map(unaPersona));
  }

  await diag("fin", { analizadas, proveedor: proveedorVivo, fallas: fallasProveedor, errores: errores.slice(0, 5) });
  return json({ ok: true, analizadas, proveedor: proveedorVivo, fallas: fallasProveedor });
});
