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
// así solo se gasta IA cuando alguien está mirando, y se analiza lo de AHORITA,
// sin cron ni llaves nuevas. Usa OPENROUTER_API_KEY (la misma stack de visión).
// Nunca analiza admins (no tienen capturas). Si el monitor está apagado o falta
// la llave, no gasta IA.
//
// Auto-diagnóstico: cada paso deja una fila en argos_diag (solo service_role la
// lee) para poder ver desde afuera por qué no juzga, sin acceso a los logs.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY") ?? "";
const LLM_MODEL = Deno.env.get("MONITOR_LLM_MODEL") ?? "openai/gpt-4o-mini";
const LLM_TIMEOUT_MS = 25_000;
const VENTANA_MIN = 7; // solo lo de los últimos minutos
const TOPE_PERSONAS = 10; // techo por ronda; la muralla vuelve a llamar a los 20 s
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
        "HTTP-Referer": "https://app.maven-ai.me",
        "X-Title": "Maven Argos",
      },
      body: JSON.stringify(reqBody),
      signal: ac.signal,
    });
    clearTimeout(t);
    if (!resp.ok) {
      const cuerpo = (await resp.text().catch(() => "")).slice(0, 300);
      return { error: `openrouter ${resp.status}: ${cuerpo}` };
    }
    const data = await resp.json() as { choices?: Array<{ message?: { content?: string } }> };
    const text = data.choices?.[0]?.message?.content ?? "";
    if (!text) return { error: "empty_response" };
    const p = JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, ""));
    return { v: { actividad: String(p.actividad ?? "").trim(), fuera_de_lugar: p.fuera_de_lugar === true } };
  } catch (e) {
    clearTimeout(t);
    return { error: (e as Error).name === "AbortError" ? "timeout" : (e as Error).message };
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

  await diag("llave", { hay: !!OPENROUTER_API_KEY, largo: OPENROUTER_API_KEY.length, modelo: LLM_MODEL });
  if (!OPENROUTER_API_KEY) return json({ ok: false, error: "no-key" }, 503);

  // 2) Monitor apagado → no se gasta IA.
  const { data: cfg } = await admin.from("monitor_config").select("activo").eq("id", 1).maybeSingle();
  if (cfg && cfg.activo === false) { await diag("apagado"); return json({ ok: true, analizadas: 0, skip: "off" }); }

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
  if (qErr) { await diag("query_error", { error: qErr.message }); return json({ ok: false, error: "query", detalle: qErr.message }, 500); }

  const porPersona = new Map<string, Fila>();
  for (const f of (filas ?? []) as Fila[]) {
    if (!porPersona.has(f.user_id)) porPersona.set(f.user_id, f);
  }
  const pendientes = [...porPersona.values()].slice(0, TOPE_PERSONAS);
  await diag("pendientes", { filas: filas?.length ?? 0, personas: porPersona.size, a_analizar: pendientes.length });
  if (pendientes.length === 0) return json({ ok: true, analizadas: 0 });

  // 4) Analizar en paralelo (de a EN_PARALELO) para caber en el tiempo del edge.
  let analizadas = 0;
  const errores: string[] = [];
  const unaPersona = async (f: Fila) => {
    const ruta = f.en_nas ? f.nas_path : f.path;
    if (!ruta) { errores.push("sin-ruta"); return; }
    const dl = await admin.storage.from("monitor-capturas").download(ruta);
    if (dl.error || !dl.data) { errores.push(`bajar: ${dl.error?.message ?? "vacio"}`); await diag("bajar_error", { id: f.id, ruta, error: dl.error?.message ?? null }); return; }
    const bytes = new Uint8Array(await dl.data.arrayBuffer());
    const b64 = encodeBase64(bytes); // nativo: sin bucle char a char (CPU)
    const res = await callVision(`data:image/jpeg;base64,${b64}`);
    if ("error" in res) { errores.push(res.error); await diag("vision_error", { id: f.id, bytes: bytes.length, error: res.error }); return; }
    const { error: upErr } = await admin
      .from("monitor_capturas")
      .update({ veredicto: res.v.actividad || "en su puesto", fuera_de_lugar: res.v.fuera_de_lugar, analizado: true })
      .eq("id", f.id);
    if (upErr) { errores.push(`update: ${upErr.message}`); await diag("update_error", { id: f.id, error: upErr.message }); return; }
    analizadas++;
    await diag("ok", { id: f.id, user: f.user_id, bytes: bytes.length, actividad: res.v.actividad, fuera: res.v.fuera_de_lugar });
  };
  for (let i = 0; i < pendientes.length; i += EN_PARALELO) {
    await Promise.all(pendientes.slice(i, i + EN_PARALELO).map(unaPersona));
  }

  await diag("fin", { analizadas, errores: errores.slice(0, 10) });
  return json({ ok: true, analizadas, errores: errores.slice(0, 10) });
});
