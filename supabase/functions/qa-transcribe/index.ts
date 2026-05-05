import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// qa-transcribe — relay multipart de audio a Groq Whisper.
// El frontend manda un archivo de audio directo (FormData con campo
// "file"), esta función lo relayea al endpoint de transcripciones de
// Groq y devuelve el texto plano. Sin almacenar nada — sirve solo para
// llenar el textarea del transcript en Nueva QA.
//
// Próxima slice posible:
//  - Persistir el archivo en Supabase Storage para auditoría.
//  - Audio metrics (WPM, fillers, monólogo) — kash usa ffmpeg server-side.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MAX_AUDIO_BYTES = 25 * 1024 * 1024; // 25MB — límite de Groq Whisper

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
    // Whisper-large-v3 es el modelo más preciso. v3-turbo es 2-3x más
    // rápido y barato pero con leve drop de calidad — para QA queremos
    // calidad porque el análisis IA depende del transcript.
    const GROQ_WHISPER_MODEL =
      Deno.env.get("GROQ_WHISPER_MODEL") || "whisper-large-v3";
    const GROQ_TRANSCRIBE_URL =
      Deno.env.get("GROQ_TRANSCRIBE_URL") ||
      "https://api.groq.com/openai/v1/audio/transcriptions";

    const contentType = req.headers.get("content-type") || "";
    if (!contentType.includes("multipart/form-data")) {
      return new Response(
        JSON.stringify({ error: "Content-Type debe ser multipart/form-data." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const incoming = await req.formData();
    const audio = incoming.get("file");
    if (!(audio instanceof File)) {
      return new Response(
        JSON.stringify({ error: "Falta el campo 'file' con el audio." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (audio.size === 0) {
      return new Response(
        JSON.stringify({ error: "El archivo de audio está vacío." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (audio.size > MAX_AUDIO_BYTES) {
      return new Response(
        JSON.stringify({
          error: `Audio demasiado grande. Máx ${(MAX_AUDIO_BYTES / 1024 / 1024).toFixed(0)}MB.`,
        }),
        { status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Re-empaquetamos el form-data para Groq. No basta con relay del
    // body raw porque el boundary del multipart se invalida si el
    // navegador y deno usan boundaries distintos (y lo hacen).
    const groqForm = new FormData();
    groqForm.append("file", audio, audio.name || "audio");
    groqForm.append("model", GROQ_WHISPER_MODEL);
    groqForm.append("response_format", "json");
    // language hint mejora precisión cuando sabemos qué idioma esperamos.
    // Para Maven el caso de uso es 99% español rioplatense.
    const lang = (incoming.get("language") as string) || "es";
    if (lang) groqForm.append("language", lang);

    const groqRes = await fetch(GROQ_TRANSCRIBE_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${GROQ_API_KEY}` },
      body: groqForm,
    });

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
    const text = (groqData?.text ?? "").trim();
    if (!text) {
      return new Response(
        JSON.stringify({ error: "Whisper devolvió transcripción vacía. ¿El audio tiene voz?" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({
        ok: true,
        text,
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
