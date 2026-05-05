import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// qa-transcribe — relay de audio a Groq Whisper.
// Pattern path-based: el frontend YA subió el audio a qa-audio Storage
// (con su JWT, vía RLS), y nos pasa solamente { audio_path } en JSON.
// Esta función baja el archivo con service role, lo manda a Groq y
// devuelve el texto. Sin almacenar nada extra.
//
// Por qué path en vez de multipart upload directo:
//  - Body chico en el fetch browser→edge (KB en vez de MB) → no choca
//    con límites del gateway que se manifestaban como "Failed to fetch"
//    cuando el mp3 comprimido pesaba ~8MB.
//  - Storage está dimensionado para archivos grandes, Edge Functions no.
//  - El audio ya queda persistido para auditoría desde el primer momento.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MAX_AUDIO_BYTES = 25 * 1024 * 1024; // 25MB — límite de Groq Whisper
const GROQ_TIMEOUT_MS = 120_000; // 2 min — debajo de los 150s de wall-clock del edge

interface TranscribeRequest {
  audio_path?: string;
  language?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");
    if (!GROQ_API_KEY) {
      return new Response(
        JSON.stringify({ error: "GROQ_API_KEY no configurada en los secrets de Supabase." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      return new Response(
        JSON.stringify({ error: "Supabase env (URL/service role) no configurado." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    // Whisper-large-v3 es el modelo más preciso. v3-turbo es 2-3x más
    // rápido y barato pero con leve drop de calidad — para QA queremos
    // calidad porque el análisis IA depende del transcript.
    const GROQ_WHISPER_MODEL =
      Deno.env.get("GROQ_WHISPER_MODEL") || "whisper-large-v3";
    const GROQ_TRANSCRIBE_URL =
      Deno.env.get("GROQ_TRANSCRIBE_URL") ||
      "https://api.groq.com/openai/v1/audio/transcriptions";

    let body: TranscribeRequest;
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: "JSON inválido. Esperado { audio_path, language? }." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const audioPath = body.audio_path?.trim();
    if (!audioPath) {
      return new Response(
        JSON.stringify({ error: "Falta audio_path." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const lang = body.language?.trim() || "es";

    // Service role bypass-ea RLS — confiamos en el caller autenticado
    // (verify_jwt está en true por default para qa-transcribe) y que su
    // path apunta a un objeto que él mismo subió.
    const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });
    const { data: blob, error: dlErr } = await sb.storage
      .from("qa-audio")
      .download(audioPath);
    if (dlErr || !blob) {
      console.error("Storage download error", dlErr);
      return new Response(
        JSON.stringify({ error: `No se pudo bajar el audio de Storage: ${dlErr?.message ?? "desconocido"}` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (blob.size === 0) {
      return new Response(
        JSON.stringify({ error: "El archivo de audio en Storage está vacío." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (blob.size > MAX_AUDIO_BYTES) {
      return new Response(
        JSON.stringify({
          error: `Audio demasiado grande. Máx ${(MAX_AUDIO_BYTES / 1024 / 1024).toFixed(0)}MB.`,
        }),
        { status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Inferir nombre razonable del path para que Groq vea la extensión.
    const inferredName = audioPath.split("/").pop() || "audio.mp3";

    const groqForm = new FormData();
    groqForm.append("file", blob, inferredName);
    groqForm.append("model", GROQ_WHISPER_MODEL);
    groqForm.append("response_format", "json");
    // language hint mejora precisión cuando sabemos qué idioma esperamos.
    // Para Maven el caso de uso es 99% español rioplatense.
    groqForm.append("language", lang);

    // AbortController para que si Groq se cuelga, devolvamos un 504 limpio
    // antes de que el wall-clock del edge function (150s) nos mate y el
    // browser vea "Failed to fetch" sin razón clara.
    const ac = new AbortController();
    const timeoutId = setTimeout(() => ac.abort(), GROQ_TIMEOUT_MS);
    let groqRes: Response;
    try {
      groqRes = await fetch(GROQ_TRANSCRIBE_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${GROQ_API_KEY}` },
        body: groqForm,
        signal: ac.signal,
      });
    } catch (fetchErr) {
      clearTimeout(timeoutId);
      const aborted = (fetchErr as Error).name === "AbortError";
      console.error("Groq fetch failed", fetchErr);
      return new Response(
        JSON.stringify({
          error: aborted
            ? `Groq Whisper tardó más de ${GROQ_TIMEOUT_MS / 1000}s. Probá de nuevo.`
            : `Error al contactar Groq: ${(fetchErr as Error).message}`,
        }),
        { status: 504, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    clearTimeout(timeoutId);

    if (!groqRes.ok) {
      const status = groqRes.status;
      const errText = await groqRes.text().catch(() => "");
      console.error("Groq Whisper error", status, errText.slice(0, 500));
      if (status === 429) {
        return new Response(
          JSON.stringify({ error: "Groq: rate limit en Whisper. Probá en unos segundos." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (status === 401 || status === 402) {
        return new Response(
          JSON.stringify({ error: "Groq: cuota agotada o key inválida." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (status === 413 || status === 415) {
        return new Response(
          JSON.stringify({ error: "Formato de audio no soportado o demasiado grande." }),
          { status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      return new Response(
        JSON.stringify({ error: `Groq Whisper error ${status}` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const groqData = await groqRes.json();
    const flatText = (groqData?.text ?? "").trim();
    if (!flatText) {
      return new Response(
        JSON.stringify({ error: "Whisper devolvió transcripción vacía. ¿El audio tiene voz?" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Post-hoc diarización con LLM. Whisper no diariza; le pedimos a un
    // LLM en Groq que lea el transcript plano y lo divida en turnos
    // etiquetando "Hablante 1:" / "Hablante 2:". El prompt de qa-analyze
    // ya está preparado para aprovechar esas etiquetas (regla 40/60,
    // closer_speaker_label, atribución de quotes).
    //
    // Si la diarización falla por cualquier motivo (timeout, JSON
    // malformado, output sin sentido) caemos al transcript plano sin
    // bloquear el flujo — la QA igual queda guardada y analizable.
    let finalText = flatText;
    let diarized = false;
    try {
      finalText = await diarizeWithLlm(GROQ_API_KEY, flatText);
      diarized = true;
    } catch (diarizeErr) {
      console.warn("Diarización falló, fallback a transcript plano:", (diarizeErr as Error).message);
    }

    return new Response(
      JSON.stringify({
        ok: true,
        text: finalText,
        diarized,
        language: groqData?.language ?? lang,
        duration: groqData?.duration ?? null,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("qa-transcribe error:", e);
    return new Response(
      JSON.stringify({ error: (e as Error).message ?? "Error interno." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

// ─── Diarización post-hoc con LLM (Groq chat completions) ────────────
// Le pasamos el transcript plano y nos devuelve un JSON con turnos.
// Reformateamos a "Hablante N: texto\n\nHablante M: texto..." que es
// el shape que qa-analyze entiende.
//
// Por qué JSON en vez de texto-libre:
//  - Determinístico de parsear.
//  - response_format: json_object fuerza al modelo a no agregar prosa.
//  - Validamos shape sin regex frágil.
async function diarizeWithLlm(apiKey: string, flatText: string): Promise<string> {
  const url =
    Deno.env.get("GROQ_BASE_URL") ||
    "https://api.groq.com/openai/v1/chat/completions";
  const model =
    Deno.env.get("GROQ_DIARIZE_MODEL") || "llama-3.3-70b-versatile";

  const systemPrompt = `Sos experto en post-procesar transcripts de llamadas de venta entre dos personas. Recibís un transcript plano (sin etiquetas de hablante) y tu trabajo es DIVIDIRLO EN TURNOS asignando "Hablante 1" o "Hablante 2" a cada uno.

CONTEXTO DE LA LLAMADA:
La llamada es entre un CLOSER (vendedor de una agencia de OnlyFans) y una MODELO (creadora de contenido). El closer típicamente PREGUNTA y guía la conversación; la modelo RESPONDE sobre su situación, números, contenido y dudas. Hablante 1 = el primer hablante que aparece (usualmente el closer si abre con saludo/preguntas, pero si la modelo arranca, ella es Hablante 1).

REGLAS ESTRICTAS:
- Devolvé EXCLUSIVAMENTE un objeto JSON con esta forma: {"turns":[{"speaker":1,"text":"..."},{"speaker":2,"text":"..."}]}
- NO modifiques el texto. Cada "text" debe ser una porción LITERAL y consecutiva del transcript original.
- NO inventes palabras, NO traduzcas, NO corrijas, NO agregues comentarios.
- NO uses markdown, backticks, ni nada fuera del JSON.
- Concatenando todos los "text" en orden con espacios debe reconstruir (casi) el transcript original.
- Mantené consistencia: la misma persona = el mismo número durante toda la llamada.
- Si dudás en un turno corto, asigná el más probable y seguí (no devuelvas "speaker": 0 ni nulls).
- speaker SOLO puede ser 1 o 2.`;

  const ac = new AbortController();
  const timeoutId = setTimeout(() => ac.abort(), 60_000);
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      signal: ac.signal,
      body: JSON.stringify({
        model,
        // Temperature baja porque queremos copiar el transcript, no creatividad.
        temperature: 0.1,
        // response_format JSON garantiza shape parseable.
        response_format: { type: "json_object" },
        // Output max ~8000 — alcanza para llamadas de hasta ~45 min.
        // Llamadas más largas pueden cortar; en ese caso el catch maneja
        // y caemos al transcript plano.
        max_tokens: 8000,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: flatText },
        ],
      }),
    });
  } catch (e) {
    clearTimeout(timeoutId);
    throw new Error(
      (e as Error).name === "AbortError"
        ? "LLM diarización: timeout 60s."
        : `LLM diarización: ${(e as Error).message}`,
    );
  }
  clearTimeout(timeoutId);

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`LLM diarización HTTP ${res.status}: ${errText.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content ?? "";
  if (!content) throw new Error("LLM diarización: respuesta vacía.");

  let parsed: { turns?: Array<{ speaker?: number; text?: string }> };
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("LLM diarización: JSON inválido.");
  }

  const turns = Array.isArray(parsed.turns) ? parsed.turns : [];
  if (turns.length === 0) throw new Error("LLM diarización: sin turnos.");

  // Sanity check: la suma de longitudes de texto debe ser comparable
  // al original — si el LLM se comió la mitad del transcript, mejor
  // descartar y devolver el plano que tener un transcript falsamente
  // diarizado pero incompleto.
  const totalChars = turns.reduce((acc, t) => acc + (t.text?.length ?? 0), 0);
  if (totalChars < flatText.length * 0.7) {
    throw new Error(
      `LLM diarización: output muy corto (${totalChars} chars vs ${flatText.length} originales).`,
    );
  }

  // Agrupamos turnos consecutivos del mismo speaker — si el LLM hizo
  // splits muy finos, los unimos en un bloque por turno completo.
  const blocks: string[] = [];
  let lastSpeaker = -1;
  let buffer = "";
  for (const t of turns) {
    const speaker = t.speaker;
    const text = (t.text ?? "").trim();
    if (!text) continue;
    if (speaker !== 1 && speaker !== 2) continue;
    if (speaker !== lastSpeaker) {
      if (buffer) blocks.push(buffer);
      buffer = `Hablante ${speaker}: ${text}`;
      lastSpeaker = speaker;
    } else {
      buffer += ` ${text}`;
    }
  }
  if (buffer) blocks.push(buffer);

  if (blocks.length === 0) throw new Error("LLM diarización: ningún turno válido.");
  // Si quedó solo un bloque, no es realmente diarización (el LLM puso
  // todo a un solo speaker) — preferible el plano.
  if (blocks.length === 1) throw new Error("LLM diarización: un solo speaker detectado.");

  return blocks.join("\n\n");
}
