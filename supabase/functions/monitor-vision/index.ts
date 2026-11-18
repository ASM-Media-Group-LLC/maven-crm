import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// monitor-vision — el "ojo de IA" del monitor de cámara de Cowork (Álvaro, 30/10).
//
// Recibe un frame (JPEG) de la webcam de la persona que está en Cowork y lo
// manda a un modelo de visión para juzgar SOLO lo fino: ¿está en el celular?,
// ¿distraída?, ¿mirando la pantalla? Lo grueso (cámara apagada/tapada, se fue,
// cara incompleta) ya lo detecta gratis el navegador (useFaceWatch) y no pasa
// por acá.
//
// Usa GEMINI_API_KEY (la misma llave pagada que ya usa Argos) con Gemini
// Flash-Lite (Alvaro, 11/11/2026: la más barata, ~USD 0,0005 por foto; antes
// era OpenRouter con una llave que venció y fallaba ~12.700 veces al día). El
// navegador solo llama cuando las señales gratis ven algo raro (useMonitorCamara
// / useArgosEscaleraClip), así que el gasto esperado es de unos USD 20 al mes.
//
// Si hay falta, registra la fila en monitor_eventos (service_role, salta RLS) y
// guarda la captura en el bucket privado monitor-capturas. Nunca monitorea
// admins (el cliente ya los excluye; acá se vuelve a validar). Si el monitor
// está apagado (monitor_config.activo=false) o falta la llave, no gasta IA.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
const LLM_MODEL = Deno.env.get("MONITOR_GEMINI_MODEL") ?? "gemini-3.1-flash-lite";
const LLM_TIMEOUT_MS = 25_000;
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

const VISION_PROMPT =
  `Eres un monitor de RRHH. En la foto hay (o debería haber) un trabajador en su puesto, atendiendo una pantalla de trabajo.
Juzga SOLO su atención y si usa el teléfono. NO juzgues iluminación ni encuadre (eso ya se mide aparte).

Devuelve JSON estricto con esta forma exacta:
{
  "presente": true | false,            // hay una persona visible
  "mirando_pantalla": true | false,    // mira al frente/pantalla, no a los lados ni abajo
  "usando_celular": true | false,      // tiene un teléfono en la mano o lo está mirando
  "distraido": true | false,           // claramente distraído (hablando con otros, comiendo, dormido, de espaldas)
  "detalle": "una frase corta y neutral de qué se ve"
}

REGLAS:
- Ante la duda, marca lo MENOS acusatorio (usando_celular=false, distraido=false). Solo true si es evidente.
- Mirar hacia abajo, a un lado o a otro monitor NO es estar distraído: la gente trabaja con teclado y varias pantallas.
- "distraido" = true SOLO si se ve claramente: dormido, de espaldas, hablando con otra persona, comiendo o fuera de su puesto.
- "usando_celular" = true SOLO si se ve el teléfono en la mano o frente a la cara.
- "detalle" en español neutro, máximo una frase.
- OUTPUT: solo JSON. Sin markdown, sin explicaciones.`;

interface Veredicto {
  presente: boolean;
  mirando_pantalla: boolean;
  usando_celular: boolean;
  distraido: boolean;
  detalle: string;
}

// Del veredicto a una falta registrable. Solo lo fino (la IA); null = todo bien.
function faltaDe(v: Veredicto): { tipo: string; detalle: string } | null {
  if (!v.presente) return null; // "se fue" lo cubre el detector gratis del navegador
  if (v.usando_celular) return { tipo: "celular", detalle: v.detalle || "parece estar en el celular" };
  if (v.distraido) return { tipo: "distraido", detalle: v.detalle || "se ve distraído" };
  // «No mira la pantalla» YA NO es falta (11/11/2026): con Flash-Lite salían
  // 57 faltas en 15 minutos, casi todas de gente mirando su segundo monitor o
  // el teclado. Solo cuentan el celular y la distracción evidente.
  return null;
}

async function callVision(dataUri: string): Promise<{ v: Veredicto } | { error: string }> {
  if (!GEMINI_API_KEY) return { error: "no-key" };
  const coma = dataUri.indexOf(",");
  const mime = dataUri.slice(5, dataUri.indexOf(";")) || "image/jpeg";
  const b64 = dataUri.slice(coma + 1);
  const reqBody = {
    contents: [{ parts: [{ text: VISION_PROMPT }, { inline_data: { mime_type: mime, data: b64 } }] }],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 400,
      responseMimeType: "application/json",
      // Sin «pensar» antes de responder: más barato y no se come el tope (igual que Argos).
      thinkingConfig: { thinkingBudget: 0 },
    },
  };
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), LLM_TIMEOUT_MS);
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(LLM_MODEL)}:generateContent?key=${GEMINI_API_KEY}`;
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(reqBody),
      signal: ac.signal,
    });
    clearTimeout(t);
    if (!resp.ok) return { error: `gemini ${resp.status}: ${(await resp.text().catch(() => "")).slice(0, 200)}` };
    const data = await resp.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const text = data.candidates?.[0]?.content?.parts?.map((x) => x.text ?? "").join("") ?? "";
    if (!text) return { error: "empty_response" };
    const p = JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, ""));
    return {
      v: {
        presente: p.presente === true,
        mirando_pantalla: p.mirando_pantalla === true,
        usando_celular: p.usando_celular === true,
        distraido: p.distraido === true,
        detalle: String(p.detalle ?? ""),
      },
    };
  } catch (e) {
    clearTimeout(t);
    return { error: (e as Error).name === "AbortError" ? "timeout" : (e as Error).message };
  }
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "method" }, 405);

  // 1) Usuario autenticado (verify_jwt=true ya lo validó en el gateway; acá lo
  //    revivimos para saber QUIÉN es y resolver su rol).
  const authHeader = req.headers.get("Authorization") ?? "";
  const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json({ ok: false, error: "no-auth" }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

  // 2) Nunca monitoreamos admins (el dueño es admin).
  // Salvo los admins que Argos sí vigila (argos_reglas_persona: Grace y
  // Jackeline, Alvaro 18/11/2026). Si la consulta falla, la regla de rol.
  const { data: vigila, error: errVigila } = await admin.rpc("argos_vigila_a", { _uid: user.id });
  if (errVigila || typeof vigila !== "boolean") {
    const { data: esAdmin } = await admin.rpc("is_in_role_group", { _user_id: user.id, _group: "admin" });
    if (esAdmin === true) return json({ ok: true, skip: "admin" });
  } else if (!vigila) {
    return json({ ok: true, skip: "admin" });
  }

  // 3) Monitor apagado → no se gasta IA.
  const { data: cfg } = await admin.from("monitor_config").select("activo").eq("id", 1).maybeSingle();
  if (cfg && cfg.activo === false) return json({ ok: true, skip: "off" });

  // 4) Frame.
  const body = await req.json().catch(() => ({})) as {
    imagen_base64?: string; mime?: string; room_nombre?: string; session_id?: string;
  };
  const b64 = (body.imagen_base64 ?? "").replace(/^data:[^,]+,/, "");
  if (!b64) return json({ ok: false, error: "no-image" }, 400);
  const bytes = base64ToBytes(b64);
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) return json({ ok: false, error: "bad-size" }, 400);
  const mime = body.mime && /^image\//.test(body.mime) ? body.mime : "image/jpeg";

  // 5) Veredicto de la IA.
  const res = await callVision(`data:${mime};base64,${b64}`);
  if ("error" in res) {
    if (res.error === "no-key") return json({ ok: false, error: "no-key" }, 503);
    return json({ ok: false, error: "vision", detalle: res.error }, 502);
  }
  // Rondín: registra el latido de ESTA ronda (haya falta o no) para el cartel
  // "última ronda · N en sala" del panel. Nunca bloquea: si falla, se ignora.
  const trabajando = res.v.presente && res.v.mirando_pantalla && !res.v.usando_celular && !res.v.distraido;
  await admin.from("monitor_rondas").upsert({
    user_id: user.id,
    room_nombre: body.room_nombre ?? null,
    presente: res.v.presente,
    trabajando,
    resumen: res.v.detalle || null,
    last_at: new Date().toISOString(),
  }).then(() => {}, (e: unknown) => console.warn("monitor-vision: latido", (e as Error)?.message));

  const falta = faltaDe(res.v);
  if (!falta) return json({ ok: true, falta: null });

  // 6) Guardar la captura (evidencia) y registrar la falta.
  const hoy = new Date().toISOString().slice(0, 10);
  const capturaPath = `${user.id}/${hoy}/${Date.now()}.jpg`;
  const { error: upErr } = await admin.storage.from("monitor-capturas")
    .upload(capturaPath, bytes, { contentType: mime, upsert: false });
  if (upErr) console.warn("monitor-vision: no se pudo subir la captura", upErr.message);

  const { error: insErr } = await admin.from("monitor_eventos").insert({
    user_id: user.id,
    room_nombre: body.room_nombre ?? null,
    session_id: body.session_id ?? null,
    tipo: falta.tipo,
    fuente: "ia",
    detalle: falta.detalle,
    captura_path: upErr ? null : capturaPath,
  });
  if (insErr) return json({ ok: false, error: "insert", detalle: insErr.message }, 500);

  return json({ ok: true, falta: { tipo: falta.tipo, detalle: falta.detalle } });
});
