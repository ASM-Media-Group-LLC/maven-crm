import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// argos-cara — LA IA CONFIRMA ANTES DE ACUSAR (Alvaro, 17/11/2026).
//
// «No se te ve la cara» salía con el detector chico del navegador (BlazeFace
// sobre 192 px), que falla con la persona un poco lejos, con audífonos o con
// luz detrás: le reclamaba a gente que estaba ahí. Ahora ese detector solo
// SOSPECHA; antes de avisar, parar el reloj o reportar, el navegador manda UNA
// foto de su cámara aquí y la IA dice si hay una persona.
//
// Costo: solo se llama cuando hay sospecha (como mucho una vez por minuto por
// persona mientras dure), una foto de 640 px. Fracciones de centavo.
//
// Respuesta: { persona: true | false | null }. null = la IA no pudo contestar
// (sin saldo, caída): el navegador NO acusa.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? Deno.env.get("GOOGLE_AI_API_KEY") ?? "";
// El mismo modelo con el que Argos ya juzga pantallazos (la llave lo tiene).
const MODELO = Deno.env.get("ARGOS_CARA_MODEL") ?? Deno.env.get("ARGOS_GEMINI_MODEL") ?? "gemini-3.8-flash";
const MAX_B64 = 400_000; // ~300 KB de JPEG; una foto de 640 px pesa ~40 KB

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

const PROMPT =
  "Es una foto de la cámara web de un empleado en su puesto de trabajo. " +
  "¿Hay una persona frente a la cámara? Cuenta como SÍ aunque esté de lado, un poco lejos, " +
  "con audífonos, con gorra, con poca luz o con la luz detrás, o con la cara parcialmente cortada. " +
  "Cuenta como NO solo si no hay nadie (silla vacía, pared, techo, cámara tapada o imagen negra). " +
  'Responde solo JSON: {"persona": true} o {"persona": false}.';

/** Lee la respuesta de la IA. Exportado para probarlo. */
export function leerPersona(texto: string): boolean | null {
  try {
    const limpio = texto.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    const v = (JSON.parse(limpio) as { persona?: unknown }).persona;
    return typeof v === "boolean" ? v : null;
  } catch {
    return null;
  }
}

async function preguntar(b64: string): Promise<boolean | null> {
  if (!GEMINI_API_KEY) return null;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15_000);
  try {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODELO}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        signal: ctrl.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: PROMPT }, { inline_data: { mime_type: "image/jpeg", data: b64 } }] }],
          generationConfig: {
            temperature: 0,
            maxOutputTokens: 40,
            responseMimeType: "application/json",
            thinkingConfig: { thinkingBudget: 0 },
          },
        }),
      },
    );
    if (!resp.ok) {
      console.error("[argos-cara] IA respondió", resp.status, (await resp.text().catch(() => "")).slice(0, 200));
      return null;
    }
    const data = await resp.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const texto = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    return leerPersona(texto);
  } catch (e) {
    console.error("[argos-cara] sin respuesta de la IA", (e as Error).message);
    return null;
  } finally {
    clearTimeout(t);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method" }, 405);

  // Solo una persona con sesión, sobre su propia cámara.
  const auth = req.headers.get("Authorization") ?? "";
  const usuario = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: auth } } });
  const { data: { user } } = await usuario.auth.getUser();
  if (!user) return json({ error: "auth" }, 401);

  const body = await req.json().catch(() => null) as { imagen?: unknown } | null;
  const b64 = typeof body?.imagen === "string" ? body.imagen.replace(/^data:image\/jpeg;base64,/, "") : "";
  if (!b64 || b64.length > MAX_B64) return json({ error: "imagen" }, 400);

  return json({ persona: await preguntar(b64) });
});
