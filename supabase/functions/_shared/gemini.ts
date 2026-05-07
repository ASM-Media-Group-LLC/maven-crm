// Helpers para Gemini 1.5 Flash compartidos por las edge functions
// que migramos de Groq → Gemini (clari-help, qa-chat-mike).
//
// Por qué Gemini Flash:
//  - Free tier generoso (15 RPM, 1500 req/día, 1M tokens contexto).
//  - Mejor instruction-following que llama-3.1-8b para asistentes.
//  - Multimodal (vision/audio) — abre puertas a features futuros.
//
// Dos helpers:
//  - callGeminiOnce(): non-streaming, devuelve { text, usage } estilo OpenAI.
//    Se usa en qa-chat-mike (que después inserta el assistant message en DB).
//  - streamGeminiAsOpenAI(): toma una stream SSE de Gemini y devuelve un
//    Response con SSE OpenAI-compatible (data: {choices:[{delta:{content}}]})
//    para que el frontend (ClariAiChat) la consuma sin cambios.

// Modelos actuales de Gemini Flash (mid-2026): el suffix -latest fue
// deprecado, ahora es nombre directo. 2.0-flash tiene free tier amplio
// (15 RPM, 1M tokens contexto) y sigue siendo el más barato/rápido
// para asistentes conversacionales.
// Free tier de Google AI Studio (mid-2026) solo deja entrar a 2.5-flash;
// 1.5/2.0 quedaron en 0/0 RPM (quota 0). 2.5-flash da 5 RPM / 250K TPM —
// suficiente para asistentes conversacionales con tráfico bajo.
const DEFAULT_MODEL = "gemini-2.5-flash";

export interface GeminiMessage {
  role: "user" | "assistant";
  content: string;
}

interface GeminiContent {
  role: "user" | "model";
  parts: Array<{ text: string }>;
}

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    cachedContentTokenCount?: number;
  };
  error?: { message?: string; status?: string };
}

function toGeminiContents(messages: GeminiMessage[]): GeminiContent[] {
  return messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));
}

function geminiUrl(model: string, stream: boolean): string {
  const base = "https://generativelanguage.googleapis.com/v1beta/models";
  const action = stream ? "streamGenerateContent?alt=sse" : "generateContent";
  return `${base}/${encodeURIComponent(model)}:${action}`;
}

interface GeminiCallOptions {
  apiKey: string;
  model?: string;
  systemPrompt: string;
  messages: GeminiMessage[];
  temperature?: number;
  maxOutputTokens?: number;
  timeoutMs?: number;
}

export interface GeminiResult {
  text: string;
  usage: {
    prompt_tokens: number | null;
    completion_tokens: number | null;
    cached_tokens: number | null;
  };
}

// Non-streaming Gemini call. Devuelve text + usage en shape OpenAI-ish
// para que los callers no se enteren de quién está atrás.
export async function callGeminiOnce(opts: GeminiCallOptions): Promise<GeminiResult> {
  const model = opts.model || DEFAULT_MODEL;
  const ac = new AbortController();
  const timeoutId = setTimeout(() => ac.abort(), opts.timeoutMs ?? 60_000);

  let res: Response;
  try {
    res = await fetch(geminiUrl(model, false), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": opts.apiKey,
      },
      signal: ac.signal,
      body: JSON.stringify({
        system_instruction: { parts: [{ text: opts.systemPrompt }] },
        contents: toGeminiContents(opts.messages),
        generationConfig: {
          temperature: opts.temperature ?? 0.7,
          maxOutputTokens: opts.maxOutputTokens ?? 2000,
        },
      }),
    });
  } catch (e) {
    clearTimeout(timeoutId);
    const aborted = (e as Error).name === "AbortError";
    throw new Error(
      aborted ? `Gemini timeout (${opts.timeoutMs ?? 60_000}ms).` : `Gemini fetch: ${(e as Error).message}`,
    );
  }
  clearTimeout(timeoutId);

  if (!res.ok) {
    const status = res.status;
    const errText = await res.text().catch(() => "");
    console.error("Gemini error", status, errText.slice(0, 500));
    if (status === 429) throw new Error("Gemini: rate limit. Probá en unos segundos.");
    if (status === 401 || status === 403) throw new Error("Gemini: API key inválida o sin permisos.");
    throw new Error(`Gemini API error ${status}`);
  }

  const data = (await res.json()) as GeminiResponse;
  if (data.error) throw new Error(`Gemini: ${data.error.message ?? "error"}`);

  const text =
    data.candidates?.[0]?.content?.parts
      ?.map((p) => p.text ?? "")
      .join("") ?? "";

  const u = data.usageMetadata ?? {};
  return {
    text,
    usage: {
      prompt_tokens: typeof u.promptTokenCount === "number" ? u.promptTokenCount : null,
      completion_tokens: typeof u.candidatesTokenCount === "number" ? u.candidatesTokenCount : null,
      cached_tokens: typeof u.cachedContentTokenCount === "number" ? u.cachedContentTokenCount : null,
    },
  };
}

// Streaming Gemini call. Devuelve un Response con SSE en formato OpenAI
// (cada chunk = `data: {choices:[{delta:{content:""}}]}\\n\\n`) para que
// el frontend que parsea ese formato (ClariAiChat) no necesite cambios.
//
// Usage:
//   return streamGeminiAsOpenAI({ apiKey, systemPrompt, messages, corsHeaders })
export async function streamGeminiAsOpenAI(opts: {
  apiKey: string;
  model?: string;
  systemPrompt: string;
  messages: GeminiMessage[];
  temperature?: number;
  maxOutputTokens?: number;
  corsHeaders: Record<string, string>;
}): Promise<Response> {
  const model = opts.model || DEFAULT_MODEL;
  const upstream = await fetch(geminiUrl(model, true), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": opts.apiKey,
    },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: opts.systemPrompt }] },
      contents: toGeminiContents(opts.messages),
      generationConfig: {
        temperature: opts.temperature ?? 0.7,
        maxOutputTokens: opts.maxOutputTokens ?? 2000,
      },
    }),
  });

  if (!upstream.ok || !upstream.body) {
    const status = upstream.status;
    const errText = await upstream.text().catch(() => "");
    console.error("Gemini stream error", status, errText.slice(0, 500));
    // Surface the real Gemini error for diagnosis (status reason +
    // first 240 chars del body). Sin esto el frontend ve un genérico
    // "saturado" y no podés saber si es quota, modelo inválido,
    // billing, etc.
    let parsedReason = "";
    try {
      const j = JSON.parse(errText) as { error?: { message?: string; status?: string } };
      parsedReason = j.error?.message ?? j.error?.status ?? "";
    } catch {
      parsedReason = errText.slice(0, 240);
    }
    let message = `Gemini error ${status}: ${parsedReason || "sin detalle"}`;
    let outStatus = 502;
    if (status === 429) outStatus = 429;
    else if (status === 401 || status === 403) outStatus = 402;
    return new Response(JSON.stringify({ error: message }), {
      status: outStatus,
      headers: { ...opts.corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Re-emit Gemini's SSE as OpenAI-shaped SSE.
  // Gemini emite: data: {"candidates":[{"content":{"parts":[{"text":"..."}]}}]}
  // OpenAI shape:  data: {"choices":[{"delta":{"content":"..."}}]}
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const reader = upstream.body.getReader();
  let buffer = "";

  const stream = new ReadableStream({
    async pull(controller) {
      try {
        const { value, done } = await reader.read();
        if (done) {
          // OpenAI clients suelen esperar el sentinel [DONE]
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
          return;
        }
        buffer += decoder.decode(value, { stream: true });
        // Process complete SSE events (separated by \n\n)
        let idx: number;
        while ((idx = buffer.indexOf("\n\n")) >= 0) {
          const event = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          for (const line of event.split("\n")) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data:")) continue;
            const payload = trimmed.slice(5).trim();
            if (!payload || payload === "[DONE]") continue;
            try {
              const parsed = JSON.parse(payload) as GeminiResponse;
              const text =
                parsed.candidates?.[0]?.content?.parts
                  ?.map((p) => p.text ?? "")
                  .join("") ?? "";
              if (text) {
                const openAiChunk = {
                  choices: [{ delta: { content: text }, index: 0 }],
                };
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify(openAiChunk)}\n\n`),
                );
              }
            } catch (e) {
              console.warn("gemini chunk parse error", (e as Error).message);
            }
          }
        }
      } catch (e) {
        console.error("gemini stream pump error", e);
        controller.error(e);
      }
    },
    cancel() {
      reader.cancel().catch(() => {});
    },
  });

  return new Response(stream, {
    headers: { ...opts.corsHeaders, "Content-Type": "text/event-stream" },
  });
}
