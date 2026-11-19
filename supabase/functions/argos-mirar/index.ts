import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { encodeBase64 } from "jsr:@std/encoding@1/base64";
import {
  camposArgos,
  type Chica,
  configEmbudo,
  despuesDeChica,
  type FiltroFoto,
  type Paso,
  parsearChica,
  pasoInicial,
  presupuestoDe,
  type Salto,
  saltoSinPresupuesto,
} from "./embudo.ts";

// argos-mirar — el CEREBRO de la muralla en vivo de Argos (Álvaro, 01/11).
//
// Mira el PANTALLAZO de pantalla más reciente de cada persona y dice QUÉ SISTEMA
// está usando y si es una herramienta de trabajo de SU EMPRESA o algo ajeno.
// Escribe el veredicto en monitor_capturas (veredicto, fuera_de_lugar, analizado).
//
// LA REGLA (Alvaro, 02/11): Argos juzga el SISTEMA, nunca el contenido. Lo que
// haya en la pantalla (fotos, videos, textos, personas) es irrelevante: no se
// juzga ni se describe. Solo: ¿la aplicación o sitio que se ve es de trabajo
// para esta empresa, o es algo ajeno (ocio/personal)?
//
// POR EMPRESA: el contexto vive en argos_contexto (por tenant): qué hace la
// empresa, qué sistemas son trabajo y cuáles son fuera de lugar. Hoy: Kash
// Agency (contenido adulto → la bóveda y las plataformas de creadoras son
// trabajo). Mañana otra empresa tendrá sus propias reglas, editables en Ajustes
// de Argos por el admin, sin tocar código.
//
// DOS PUERTAS: cron (X-Cron-Token, cada 2 min — el motor) y supervisor con sesión.
// PROVEEDORES: Gemini primero (llave PAGADA nivel 1 desde el 02/11 → todo el
// equipo por ronda, pausa corta entre fotos, reintento en 429, pensamiento
// apagado, veredicto fresco cada REJUZGAR_MIN); OpenRouter y Anthropic de
// respaldo (muertas desde el 01/10; reviven solas con llave nueva). Huella en
// argos_diag. Costo estimado del ritmo por defecto: ~$1–2/día con ~20 personas.
//
// EL EMBUDO (Alvaro, 19/11/2026: «prender ya así»; detalle en embudo.ts y en la
// migración 20261119083000_argos_embudo_prendido). Antes de pagar la mirada
// detallada, cada foto pasa por: 1) ¿cambió la pantalla? (huella) → copia;
// 2) app de la lista aprobada → trabajo; 3) IA chica (Flash-Lite, resolución
// baja) sí/no/no sé → «sí» es trabajo; 4) Argos detallado para «no», «no sé» y
// una revisión al azar (10 %). Cada fila dice quién decidió (juzgada_por).
// TOPE: monitor_config.argos_tope_dia_usd (USD 1,50/día) nunca se pasa.
// Interruptor: monitor_config.argos_filtros_activos=false → todo a Argos detallado.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const CRON_TOKEN = Deno.env.get("CRON_INTERNAL_TOKEN") ?? "";
const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY") ?? "";
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? Deno.env.get("GOOGLE_AI_API_KEY") ?? "";
const MODELO_OPENROUTER = Deno.env.get("MONITOR_LLM_MODEL") ?? "openai/gpt-4o-mini";
const MODELO_ANTHROPIC = Deno.env.get("ARGOS_ANTHROPIC_MODEL") ?? "claude-haiku-4-5";
// gemini-2.5-flash quedó cerrado para cuentas nuevas (404 el 02/11): va el 3.8.
const MODELO_GEMINI = Deno.env.get("ARGOS_GEMINI_MODEL") ?? "gemini-3.8-flash";
// La IA chica del embudo: el mismo Flash-Lite que ya usa la cámara (monitor-vision).
const MODELO_CHICA = Deno.env.get("ARGOS_GEMINI_CHICA") ?? Deno.env.get("MONITOR_GEMINI_MODEL") ?? "gemini-3.1-flash-lite";
const LLM_TIMEOUT_MS = 20_000;
const VENTANA_MIN = 7;
// Ritmo (Alvaro, 13/11/2026): fotos cada ~1 min y la IA revisa 1 de cada 2 → a
// cada persona se la vuelve a juzgar a los ~2 min (antes 6). El cron corre cada
// 2 min; con todo el equipo eso son ~30–40 fotos por ronda, así que se juzgan EN
// PARALELO (CONCURRENCIA a la vez) para que la ronda quepa en sus 2 minutos.
const TOPE_PERSONAS = Number(Deno.env.get("ARGOS_TOPE") ?? 60);
const ESPACIO_MS = Number(Deno.env.get("ARGOS_ESPACIO_MS") ?? 600);
const REJUZGAR_MIN = Number(Deno.env.get("ARGOS_REJUZGAR_MIN") ?? 1.5);
const CONCURRENCIA = Math.max(1, Number(Deno.env.get("ARGOS_CONCURRENCIA") ?? 4));
const REINTENTO_MS = 2_500;

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

interface Contexto {
  descripcion: string;
  es_trabajo: string;
  fuera_de_lugar: string;
}

const CONTEXTO_GENERICO: Contexto = {
  descripcion: "una empresa",
  es_trabajo: "las herramientas de trabajo de la empresa: su CRM, correo, chats de trabajo, planillas, documentos y llamadas de trabajo",
  fuera_de_lugar: "redes sociales personales, YouTube u otro streaming de ocio, juegos, series o películas, compras personales, el escritorio o la pantalla de inicio sin actividad, la pantalla apagada o bloqueada",
};

/** El prompt se arma con el contexto de LA EMPRESA de la persona. */
function armarPrompt(c: Contexto): string {
  return `Eres Argos, el monitor de trabajo de ${c.descripcion.trim() || CONTEXTO_GENERICO.descripcion}

TU REGLA: juzgas el SISTEMA que usa la persona, NUNCA el contenido. Lo que haya dentro de la pantalla (fotos, videos, textos, personas, dinero) es IRRELEVANTE: no lo juzgues ni lo describas. Solo determina qué aplicación o sitio se ve y si es una herramienta de trabajo de esta empresa o algo ajeno.

HERRAMIENTAS DE TRABAJO (correcto, nunca fuera de lugar): ${c.es_trabajo.trim() || CONTEXTO_GENERICO.es_trabajo}

FUERA DE LUGAR (sistema equivocado): ${c.fuera_de_lugar.trim() || CONTEXTO_GENERICO.fuera_de_lugar}

Devuelve SOLO este JSON, sin texto antes ni después, sin markdown:
{ "sistema": "nombre de la aplicación o sitio que se ve", "actividad": "frase corta: qué sistema usa y qué tipo de acción hace, SIN describir el contenido", "fuera_de_lugar": true | false }

REGLAS:
- Ante la duda, fuera_de_lugar=false. Solo true si es EVIDENTE que el sistema no es de trabajo.
- Español neutro, sin voseo, máximo una frase en "actividad".`;
}

/** La pregunta de la IA chica: una sola palabra, con el contexto de la empresa. */
function armarPromptChica(c: Contexto): string {
  return `Miras un pantallazo del computador de una persona que trabaja en ${c.descripcion.trim() || CONTEXTO_GENERICO.descripcion}
Juzga SOLO qué aplicación o sitio se ve, nunca el contenido.
Trabajo: ${c.es_trabajo.trim() || CONTEXTO_GENERICO.es_trabajo}
No es trabajo: ${c.fuera_de_lugar.trim() || CONTEXTO_GENERICO.fuera_de_lugar}
¿Lo que se ve es una herramienta de trabajo de esta empresa?
Devuelve SOLO este JSON: { "trabajo": "si" | "no" | "no_se", "sistema": "nombre corto de la app o sitio" }
"si" solo si es evidente que es trabajo; "no" solo si es evidente que no lo es; ante cualquier duda, "no_se".`;
}

interface Veredicto {
  sistema: string;
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

async function pedirGemini(prompt: string, b64: string): Promise<Respuesta> {
  if (!GEMINI_API_KEY) return { error: "sin-llave" };
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODELO_GEMINI}:generateContent?key=${GEMINI_API_KEY}`;
    const resp = await conTimeout(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: "image/jpeg", data: b64 } }] }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 600,
          responseMimeType: "application/json",
          // gemini flash piensa antes de responder y se come el tope → JSON
          // truncado. Para nombrar un sistema no hace falta pensar: se apaga.
          thinkingConfig: { thinkingBudget: 0 },
        },
        // Pantallazos de trabajo con contenido adulto: que el filtro no bloquee
        // la respuesta (si bloquea, la persona queda sin veredicto).
        safetySettings: [
          { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
        ],
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

// La IA chica pide la imagen en resolución baja (menos tokens = más barata). Si
// el modelo no acepta el campo, se vuelve a pedir sin él y no se insiste.
let chicaSinResolucionBaja = false;

async function pedirChica(prompt: string, b64: string): Promise<Respuesta> {
  if (!GEMINI_API_KEY) return { error: "sin-llave" };
  const pedir = async (baja: boolean) => {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(MODELO_CHICA)}:generateContent?key=${GEMINI_API_KEY}`;
    return await conTimeout(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: "image/jpeg", data: b64 } }] }],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 60,
          responseMimeType: "application/json",
          thinkingConfig: { thinkingBudget: 0 },
          ...(baja ? { mediaResolution: "MEDIA_RESOLUTION_LOW" } : {}),
        },
        safetySettings: [
          { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
        ],
      }),
    });
  };
  try {
    let resp = await pedir(!chicaSinResolucionBaja);
    if (resp.status === 400 && !chicaSinResolucionBaja) {
      const cuerpo = await resp.text().catch(() => "");
      if (!/media.?resolution/i.test(cuerpo)) return { error: `400: ${cuerpo.slice(0, 200)}` };
      chicaSinResolucionBaja = true;
      resp = await pedir(false);
    }
    if (!resp.ok) return { error: await cuerpoError(resp) };
    const data = await resp.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }> };
    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    return text ? { text } : { error: `vacio (${data.candidates?.[0]?.finishReason ?? "?"})` };
  } catch (e) {
    return { error: (e as Error).name === "AbortError" ? "timeout" : (e as Error).message };
  }
}

async function pedirOpenRouter(prompt: string, b64: string): Promise<Respuesta> {
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
            { type: "text", text: prompt },
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

async function pedirAnthropic(prompt: string, b64: string): Promise<Respuesta> {
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
            { type: "text", text: prompt },
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

const PEDIR: Record<Proveedor, (prompt: string, b64: string) => Promise<Respuesta>> = {
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
    const sistema = String(p.sistema ?? "").trim();
    if (!actividad && !sistema) return null;
    return { sistema, actividad: actividad || sistema, fuera_de_lugar: p.fuera_de_lugar === true };
  } catch {
    return null;
  }
}

/** Lo que se guarda y se pinta: el sistema por delante si la frase no lo nombra. */
function textoVeredicto(v: Veredicto): string {
  if (!v.sistema) return v.actividad;
  return v.actividad.toLowerCase().includes(v.sistema.toLowerCase()) ? v.actividad : `${v.sistema} · ${v.actividad}`;
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
    // Argos lo ve solo el DUEÑO (tenant_owners), por ahora (Alvaro, 02/11).
    const { data: puede, error: rolErr } = await admin.rpc("es_dueno", { _user_id: user.id });
    await diag("rol", { puede, error: rolErr?.message ?? null });
    if (puede !== true) return json({ ok: false, error: "forbidden" }, 403);
  }

  if (!OPENROUTER_API_KEY && !ANTHROPIC_API_KEY && !GEMINI_API_KEY) { await diag("sin_llaves"); return json({ ok: false, error: "no-key" }, 503); }

  // 2) Monitor apagado → no se gasta IA.
  //    select * a propósito: si la migración del embudo aún no está, no rompe y
  //    el embudo queda apagado (todo a Argos detallado, como antes).
  const { data: cfg } = await admin.from("monitor_config").select("*").eq("id", 1).maybeSingle();
  if (cfg && cfg.activo === false) { await diag("apagado"); return json({ ok: true, analizadas: 0, skip: "off" }); }
  const cfgFila = cfg as Record<string, unknown> | null;
  const embudo = configEmbudo(cfgFila);

  // 3) Pantallazos recientes SIN veredicto; el más reciente de cada persona; se
  //    saltan las personas juzgadas hace menos de REJUZGAR_MIN (cuota).
  const ahora = Date.now();
  const desdeISO = new Date(ahora - VENTANA_MIN * 60_000).toISOString();
  const [{ data: filas, error: qErr }, { data: recientes }] = await Promise.all([
    admin
      .from("monitor_capturas")
      .select("id, user_id, path, nas_path, en_nas, created_at")
      .eq("tipo", "pantalla")
      .is("veredicto", null)
      .gte("created_at", desdeISO)
      .order("created_at", { ascending: false })
      .limit(400),
    admin
      .from("monitor_capturas")
      .select("user_id")
      .not("veredicto", "is", null)
      .gte("created_at", new Date(ahora - REJUZGAR_MIN * 60_000).toISOString())
      .limit(1000),
  ]);
  if (qErr) { await diag("query_error", { error: qErr.message }); return json({ ok: false, error: "query", detalle: qErr.message }, 500); }

  const yaJuzgados = new Set(((recientes ?? []) as Array<{ user_id: string }>).map((r) => r.user_id));
  const porPersona = new Map<string, Fila>();
  for (const f of (filas ?? []) as Fila[]) {
    if (yaJuzgados.has(f.user_id)) continue;
    if (!porPersona.has(f.user_id)) porPersona.set(f.user_id, f);
  }
  const pendientes = [...porPersona.values()].slice(0, TOPE_PERSONAS);
  await diag("pendientes", { filas: filas?.length ?? 0, personas: porPersona.size, ya_juzgadas: yaJuzgados.size, a_analizar: pendientes.length });
  if (pendientes.length === 0) return json({ ok: true, analizadas: 0 });

  // 4) El contexto de LA EMPRESA de cada persona (tenant_members → argos_contexto).
  const ids = pendientes.map((f) => f.user_id);
  const [{ data: miembros }, { data: contextos }] = await Promise.all([
    admin.from("tenant_members").select("user_id, tenant_id").in("user_id", ids),
    admin.from("argos_contexto").select("tenant_id, descripcion, es_trabajo, fuera_de_lugar"),
  ]);
  const tenantDe = new Map<string, string>();
  for (const m of (miembros ?? []) as Array<{ user_id: string; tenant_id: string }>) {
    if (!tenantDe.has(m.user_id)) tenantDe.set(m.user_id, m.tenant_id);
  }
  const contextoDe = new Map<string, Contexto>();
  for (const c of (contextos ?? []) as Array<Contexto & { tenant_id: string }>) contextoDe.set(c.tenant_id, c);
  const contextoDeUsuario = (userId: string): Contexto => {
    const t = tenantDe.get(userId);
    return (t && contextoDe.get(t)) || CONTEXTO_GENERICO;
  };
  const promptDe = (userId: string): string => armarPrompt(contextoDeUsuario(userId));
  await diag("contexto", { empresas: contextoDe.size, con_empresa: ids.filter((id) => tenantDe.has(id)).length, sin_empresa: ids.filter((id) => !tenantDe.has(id)).length });

  // 4b) El embudo: filtros 1 y 2 (gratis) para todas las fotos de la ronda, en
  //     una sola consulta. Si falla, nada se salta (van a la IA chica / Argos).
  const filtros = new Map<string, FiltroFoto>();
  if (embudo.activos) {
    const { data: fs, error: fErr } = await admin.rpc("argos_embudo_filtros", { p_ids: pendientes.map((f) => f.id) });
    if (fErr) await diag("embudo_error", { error: fErr.message });
    for (const r of (fs ?? []) as FiltroFoto[]) filtros.set(r.id, r);
  }
  // 4c) El tope del día: lo gastado hoy (solo con la migración puesta). Si la
  //     consulta falla y hay tope, se toma como alcanzado: no se gasta a ciegas.
  let gastoHoy: Record<string, unknown> | null = null;
  if (embudo.listo) {
    const { data: g, error: gErr } = await admin.rpc("argos_gasto_hoy");
    if (gErr) await diag("tope_error", { error: gErr.message });
    else gastoHoy = g as Record<string, unknown>;
  }
  const { presupuesto, precioFoto, precioChica } = presupuestoDe(gastoHoy, embudo.listo ? cfgFila : null);
  await diag("embudo", { activo: embudo.activos, azar: embudo.azar, filtradas: filtros.size, gasto_hoy: presupuesto.usd, tope: presupuesto.tope, ahorro: presupuesto.ahorro });
  const etapas: Record<string, number> = {};
  const contar = (k: string) => { etapas[k] = (etapas[k] ?? 0) + 1; };

  // 5) Juzgar las fotos una a una con pausa corta. El primer
  //    proveedor que responde se queda para el resto de la ronda. Un 429/vacío se
  //    reintenta una vez. Si ninguno responde en la primera foto, se corta la ronda.
  let proveedorVivo: Proveedor | null = null;
  const fallas: Record<string, string> = {};

  const pedirConReintento = async (p: Proveedor, prompt: string, b64: string): Promise<Respuesta> => {
    const r1 = await PEDIR[p](prompt, b64);
    if (!("error" in r1) || !r1.reintentable) return r1;
    await dormir(REINTENTO_MS);
    return await PEDIR[p](prompt, b64);
  };

  const juzgar = async (prompt: string, b64: string): Promise<{ v: Veredicto; proveedor: Proveedor } | null> => {
    const orden = proveedorVivo ? [proveedorVivo] : ORDEN;
    for (const p of orden) {
      const r = await pedirConReintento(p, prompt, b64);
      if ("error" in r) { fallas[p] = r.error; continue; }
      const v = parsearVeredicto(r.text);
      if (!v) { fallas[p] = `json-invalido: ${r.text.slice(0, 160)}`; continue; }
      proveedorVivo = p;
      return { v, proveedor: p };
    }
    return null;
  };

  /** IA chica: null si no respondió o no se entendió (entonces decide Argos). */
  const juzgarChica = async (c: Contexto, b64: string): Promise<Chica | null> => {
    const r = await pedirChica(armarPromptChica(c), b64);
    if ("error" in r) { fallas.gemini_chica = r.error; return null; }
    const v = parsearChica(r.text);
    if (!v) fallas.gemini_chica = `json-invalido: ${r.text.slice(0, 160)}`;
    return v;
  };

  let analizadas = 0;
  let saltadas = 0;
  let sinJuzgarPorTope = 0;
  const errores: string[] = [];

  /** Escribe el veredicto que decidió el embudo, sin Argos detallado. */
  const guardarSalto = async (f: Fila, s: Salto, extra: Record<string, unknown> = {}): Promise<void> => {
    const { error: upErr } = await admin
      .from("monitor_capturas")
      .update({ veredicto: s.veredicto, fuera_de_lugar: s.fuera_de_lugar, analizado: true, juzgada_por: s.juzgada_por, filtro_decia: s.filtro_decia })
      .eq("id", f.id);
    if (upErr) { errores.push(`update: ${upErr.message}`); await diag("update_error", { id: f.id, error: upErr.message }); return; }
    saltadas++;
    contar(s.juzgada_por);
    // La IA chica es una mirada real de Gemini: cuenta como «ok» (Gemini vivo).
    if (s.juzgada_por === "ia_chica") {
      await diag("ok", { id: f.id, user: f.user_id, proveedor: "gemini", etapa: "ia_chica", modelo: MODELO_CHICA, filtro_decia: s.filtro_decia, veredicto: s.veredicto, fuera: s.fuera_de_lugar, ...extra });
    } else {
      await diag("salto", { id: f.id, user: f.user_id, etapa: s.juzgada_por, fuera: s.fuera_de_lugar, ...extra });
    }
  };
  // Sin fila de diag por foto (se reintenta cada ronda): solo se cuenta en «fin».
  const sinPresupuesto = (etapa: string): void => {
    sinJuzgarPorTope++;
    contar(`tope_${etapa}`);
  };
  // Si en la PRIMERA foto no responde ningún proveedor, se corta la ronda.
  let cortar = false;
  const procesar = async (f: (typeof pendientes)[number]): Promise<void> => {
    // Filtros 1 y 2: sin bajar la foto ni llamar a ninguna IA.
    let paso: Paso = pasoInicial(embudo, filtros.get(f.id), Math.random(), presupuesto.ahorro);
    if (paso.tipo === "saltar") { await guardarSalto(f, paso.salto); return; }
    // La primera mirada se reserva ANTES de bajar la foto: si no cabe en el
    // tope, ni se baja. Si la bajada falla, la reserva se devuelve.
    const reserva = paso.tipo === "ia_chica" ? precioChica : precioFoto;
    if (!presupuesto.reservar(reserva)) {
      const salto = paso.tipo === "argos" ? saltoSinPresupuesto(paso, null) : null;
      if (salto) await guardarSalto(f, salto, { tope: true });
      else sinPresupuesto(paso.tipo);
      return;
    }
    const ruta = f.en_nas ? f.nas_path : f.path;
    if (!ruta) { presupuesto.liberar(reserva); errores.push("sin-ruta"); return; }
    const dl = await admin.storage.from("monitor-capturas").download(ruta);
    if (dl.error || !dl.data) {
      presupuesto.liberar(reserva);
      errores.push(`bajar: ${dl.error?.message ?? "vacio"}`);
      await diag("bajar_error", { id: f.id, ruta, error: dl.error?.message ?? null });
      return;
    }
    const bytes = new Uint8Array(await dl.data.arrayBuffer());
    const b64 = encodeBase64(bytes);
    // Filtro 3: la IA chica (ya reservada). «Sí» → listo; si no, a Argos detallado.
    let chica: Chica | null = null;
    if (paso.tipo === "ia_chica") {
      chica = await juzgarChica(contextoDeUsuario(f.user_id), b64);
      if (!chica) presupuesto.liberar(precioChica);
      paso = despuesDeChica(embudo, chica, Math.random(), presupuesto.ahorro);
      if (paso.tipo === "saltar") { await guardarSalto(f, paso.salto, { bytes: bytes.length }); return; }
      // Filtro 4 después de la chica: Argos detallado solo si cabe en el tope.
      // Si no cabe, queda lo que dijo la chica; si nadie la miró, sin juzgar.
      if (paso.tipo === "argos" && !presupuesto.reservar(precioFoto)) {
        const salto = saltoSinPresupuesto(paso, chica);
        if (salto) await guardarSalto(f, salto, { bytes: bytes.length, tope: true });
        else sinPresupuesto("argos");
        return;
      }
    }
    if (paso.tipo !== "argos") return;
    const res = await juzgar(promptDe(f.user_id), b64);
    if (!res) {
      presupuesto.liberar(precioFoto);
      errores.push("sin-proveedor");
      await diag("vision_error", { id: f.id, bytes: bytes.length, fallas });
      if (!proveedorVivo) cortar = true;
      return;
    }
    const veredicto = textoVeredicto(res.v);
    const { error: upErr } = await admin
      .from("monitor_capturas")
      .update({ veredicto, fuera_de_lugar: res.v.fuera_de_lugar, analizado: true, ...camposArgos(embudo, paso) })
      .eq("id", f.id);
    if (upErr) { errores.push(`update: ${upErr.message}`); await diag("update_error", { id: f.id, error: upErr.message }); return; }
    analizadas++;
    contar(paso.juzgada_por);
    await diag("ok", { id: f.id, user: f.user_id, bytes: bytes.length, proveedor: res.proveedor, etapa: paso.juzgada_por, filtro_decia: paso.filtro_decia, sistema: res.v.sistema, actividad: res.v.actividad, fuera: res.v.fuera_de_lugar });
  };
  if (pendientes.length > 0) {
    // La primera sola: fija el proveedor que responde. El resto, de a CONCURRENCIA.
    await procesar(pendientes[0]);
    const resto = pendientes.slice(1);
    let i = 0;
    const trabajador = async () => {
      while (!cortar && i < resto.length) {
        const f = resto[i++];
        await procesar(f);
        if (ESPACIO_MS > 0) await dormir(ESPACIO_MS);
      }
    };
    if (!cortar) await Promise.all(Array.from({ length: CONCURRENCIA }, trabajador));
  }

  await diag("fin", { via: esCron ? "cron" : "usuario", analizadas, saltadas, sin_juzgar_tope: sinJuzgarPorTope, embudo: embudo.activos, etapas, gasto_hoy: presupuesto.usd, proveedor: proveedorVivo, fallas, errores: errores.slice(0, 5) });
  return json({ ok: true, analizadas, saltadas, sin_juzgar_tope: sinJuzgarPorTope, etapas, proveedor: proveedorVivo, fallas });
});
