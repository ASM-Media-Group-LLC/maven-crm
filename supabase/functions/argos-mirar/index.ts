import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// argos-mirar — el CEREBRO de la muralla en vivo de Argos (Álvaro, 01/11).
//
// Mira los PANTALLAZOS de pantalla más recientes de cada persona y dice, en una
// frase corta, QUÉ está haciendo y si está FUERA DE LUGAR. Escribe el veredicto
// en monitor_capturas (veredicto, fuera_de_lugar, analizado) para que la muralla
// lo pinte bajo cada tarjeta.
//
// Lo dispara el cliente cuando un supervisor abre la muralla (verify_jwt=true):
// así solo se gasta IA cuando alguien está mirando, y se analiza lo de AHORITA,
// sin cron ni llaves nuevas. Usa OPENROUTER_API_KEY (la misma stack de visión).
// Nunca analiza admins. Si el monitor está apagado o falta la llave, no gasta IA.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY") ?? "";
const LLM_MODEL = Deno.env.get("MONITOR_LLM_MODEL") ?? "openai/gpt-4o-mini";
const LLM_TIMEOUT_MS = 25_000;
const VENTANA_MIN = 7; // solo lo de los últimos minutos
const TOPE_PERSONAS = 14; // techo de análisis por ronda (costo/latencia)

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

async function callVision(dataUri: string): Promise<{ v: Veredicto } | { error: string }> {
  if (!OPENROUTER_API_KEY) return { error: "no-key" };
  const reqBody = {
    model: LLM_MODEL,
    messages: [{
      role: "user",
      content: [
        { type: "text", text: PROMPT },
        { type: "image_url", image_url: { url: dataUri } },
      ],
    }],
    response_format: { type: "json_object" },
    temperature: 0.1,
    max_tokens: 300,
  };
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), LLM_TIMEOUT_MS);
  try {
    const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "HTTP-Referer": "https://maven.asmtech.me",
        "X-Title": "Maven Argos",
      },
      body: JSON.stringify(reqBody),
      signal: ac.signal,
    });
    clearTimeout(t);
    if (!resp.ok) return { error: `openrouter ${resp.status}` };
    const data = await resp.json() as { choices?: Array<{ message?: { content?: string } }> };
    const text = data.choices?.[0]?.message?.content ?? "";
    if (!text) return { error: "empty_response" };
    const p = JSON.parse(text);
    return { v: { actividad: String(p.actividad ?? "").trim(), fuera_de_lugar: p.fuera_de_lugar === true } };
  } catch (e) {
    clearTimeout(t);
    return { error: (e as Error).name === "AbortError" ? "timeout" : (e as Error).message };
  }
}

async function aBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
  return btoa(bin);
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

  // 1) Quién llama (el gateway ya validó el JWT). Debe ser supervisor+.
  const authHeader = req.headers.get("Authorization") ?? "";
  const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json({ ok: false, error: "no-auth" }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: puede } = await admin.rpc("is_in_role_group", { _user_id: user.id, _group: "supervisor_or_above" });
  if (puede !== true) return json({ ok: false, error: "forbidden" }, 403);

  if (!OPENROUTER_API_KEY) return json({ ok: false, error: "no-key" }, 503);

  // 2) Monitor apagado → no se gasta IA.
  const { data: cfg } = await admin.from("monitor_config").select("activo").eq("id", 1).maybeSingle();
  if (cfg && cfg.activo === false) return json({ ok: true, analizadas: 0, skip: "off" });

  // 3) Pantallazos de pantalla recientes SIN veredicto. Nos quedamos con el más
  //    reciente de cada persona (vienen de más nuevo a más viejo).
  const desdeISO = new Date(Date.now() - VENTANA_MIN * 60_000).toISOString();
  const { data: filas, error: qErr } = await admin
    .from("monitor_capturas")
    .select("id, user_id, path, nas_path, en_nas, created_at")
    .eq("tipo", "pantalla")
    .is("veredicto", null)
    .gte("created_at", desdeISO)
    .order("created_at", { ascending: false })
    .limit(400);
  if (qErr) return json({ ok: false, error: "query", detalle: qErr.message }, 500);

  const porPersona = new Map<string, Fila>();
  for (const f of (filas ?? []) as Fila[]) {
    if (!porPersona.has(f.user_id)) porPersona.set(f.user_id, f);
  }
  const pendientes = [...porPersona.values()].slice(0, TOPE_PERSONAS);
  if (pendientes.length === 0) return json({ ok: true, analizadas: 0 });

  let analizadas = 0;
  for (const f of pendientes) {
    const ruta = f.en_nas ? f.nas_path : f.path;
    if (!ruta) continue;
    const dl = await admin.storage.from("monitor-capturas").download(ruta);
    if (dl.error || !dl.data) continue;
    const b64 = await aBase64(dl.data);
    const res = await callVision(`data:image/jpeg;base64,${b64}`);
    if ("error" in res) continue;
    const { error: upErr } = await admin
      .from("monitor_capturas")
      .update({ veredicto: res.v.actividad || "en su puesto", fuera_de_lugar: res.v.fuera_de_lugar, analizado: true })
      .eq("id", f.id);
    if (!upErr) analizadas++;
  }

  return json({ ok: true, analizadas });
});
