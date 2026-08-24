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

// Non-streaming Gemini call con retry/backoff para 503 (model overloaded).
// El free tier de 2.5-flash devuelve 503 con frecuencia cuando hay
// pico de demanda — los reintentos con backoff lineal (1s, 2s, 4s)
// suelen alcanzar para que la siguiente toque un instante de capacidad
// libre. Si al 4to intento sigue 503, tiramos el error real.
export async function callGeminiOnce(opts: GeminiCallOptions): Promise<GeminiResult> {
  // Retry budget separado para 503 (model overload, transitorio rápido)
  // y 429 (rate limit / RESOURCE_EXHAUSTED — gemini-2.5-flash es 5 RPM,
  // o sea 1 request cada ~12s en free tier). El edge function tiene
  // 60s de timeout total, así que limitamos los waits para no excederlo.
  const MAX_503_RETRIES = 3;
  const MAX_429_RETRIES = 2;
  let attempts503 = 0;
  let attempts429 = 0;
  let lastError: Error | null = null;
  while (true) {
    try {
      return await callGeminiOnceInner(opts);
    } catch (e) {
      const msg = (e as Error).message ?? "";
      const is503 = /\b503\b|overload|high demand|UNAVAILABLE/i.test(msg);
      const is429 = /\b429\b|rate limit|quota|RESOURCE_EXHAUSTED/i.test(msg);
      lastError = e as Error;
      if (is503 && attempts503 < MAX_503_RETRIES) {
        const delayMs = 1000 * Math.pow(2, attempts503); // 1s, 2s, 4s
        attempts503 += 1;
        console.warn(`Gemini 503 retry ${attempts503}, sleeping ${delayMs}ms`);
        await new Promise((r) => setTimeout(r, delayMs));
        continue;
      }
      if (is429 && attempts429 < MAX_429_RETRIES) {
        // 13s cubre la ventana de 5 RPM (1 req cada 12s) con margen.
        // 26s en el 2º intento por si el cliente disparó varias seguidas.
        const delayMs = 13_000 + attempts429 * 13_000;
        attempts429 += 1;
        console.warn(`Gemini 429 retry ${attempts429}, sleeping ${delayMs}ms`);
        await new Promise((r) => setTimeout(r, delayMs));
        continue;
      }
      // No es retriable o ya agoté el budget → re-throw con mensaje claro.
      if (is429) {
        throw new Error("Gemini está saturado por rate limit. Espera ~15 segundos y vuelve a intentar.");
      }
      throw e;
    }
  }
  // Inalcanzable — el loop solo sale por return o throw arriba.
  throw lastError ?? new Error("Gemini retry loop terminated unexpectedly");
}

async function callGeminiOnceInner(opts: GeminiCallOptions): Promise<GeminiResult> {
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
          // 2.5-flash hace "thinking" por default — los chunks iniciales
          // del stream son partes con `thought:true` y sin `.text` real,
          // entonces el frontend ve nada llegando hasta que termina el
          // thinking. Para asistentes conversacionales no aporta valor
          // suficiente para justificar el delay; lo desactivamos.
          thinkingConfig: { thinkingBudget: 0 },
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
    if (status === 429) throw new Error("Gemini: rate limit. Prueba en unos segundos.");
    if (status === 401 || status === 403) throw new Error("Gemini: API key inválida o sin permisos.");
    if (status === 503) {
      // Mensaje específico para que el retry loop arriba lo agarre.
      throw new Error(`Gemini 503: ${errText.slice(0, 120) || "model overloaded"}`);
    }
    throw new Error(`Gemini API error ${status}: ${errText.slice(0, 120)}`);
  }

  const data = (await res.json()) as GeminiResponse & {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string; thought?: boolean }> };
      finishReason?: string;
    }>;
  };
  if (data.error) throw new Error(`Gemini: ${data.error.message ?? "error"}`);

  // Filtramos parts marcadas como `thought:true` (chain of thought
  // interno de 2.5-flash) — solo queremos el texto de salida.
  const text =
    data.candidates?.[0]?.content?.parts
      ?.filter((p) => !p.thought)
      ?.map((p) => p.text ?? "")
      .join("") ?? "";

  // Diagnóstico: si Gemini devolvió 200 pero sin texto, dejamos
  // un log estructurado con finishReason + usage para que aparezca
  // en los logs de la edge function. Casos comunes: MAX_TOKENS
  // (thinking se comió el budget), SAFETY (filtros bloquearon),
  // RECITATION, OTHER.
  if (!text) {
    const finishReason = data.candidates?.[0]?.finishReason;
    const partsCount = data.candidates?.[0]?.content?.parts?.length ?? 0;
    console.error(
      "Gemini empty response",
      JSON.stringify({
        finishReason,
        partsCount,
        usage: data.usageMetadata,
        firstPartKeys: Object.keys(
          data.candidates?.[0]?.content?.parts?.[0] ?? {},
        ),
      }),
    );
  }

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
// Estrategia actual: pedimos la respuesta COMPLETA a Gemini (non-stream)
// y después la troceamos en chunks de ~12 chars que emitimos con un
// pequeño delay para que el frontend siga viendo el efecto "tipeando".
// Razón: el SSE nativo de Gemini cambió shape entre versiones (2.5 con
// thinking, parts con `thought:true`, etc.) y mantenerse al día rompía
// más de lo que ayudaba. Una sola call + faux-stream es robusto y la
// latencia extra es marginal para respuestas cortas (clari/mike).
export async function streamGeminiAsOpenAI(opts: {
  apiKey: string;
  model?: string;
  systemPrompt: string;
  messages: GeminiMessage[];
  temperature?: number;
  maxOutputTokens?: number;
  corsHeaders: Record<string, string>;
}): Promise<Response> {
  let result: GeminiResult;
  try {
    result = await callGeminiOnce({
      apiKey: opts.apiKey,
      model: opts.model,
      systemPrompt: opts.systemPrompt,
      messages: opts.messages,
      temperature: opts.temperature,
      maxOutputTokens: opts.maxOutputTokens,
      timeoutMs: 60_000,
    });
  } catch (e) {
    const message = (e as Error).message ?? "Gemini error";
    let outStatus = 502;
    if (/429|rate limit|quota/i.test(message)) outStatus = 429;
    else if (/401|403|key|cuota/i.test(message)) outStatus = 402;
    return new Response(JSON.stringify({ error: message }), {
      status: outStatus,
      headers: { ...opts.corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!result.text) {
    return new Response(
      JSON.stringify({ error: "Gemini devolvió respuesta vacía." }),
      { status: 502, headers: { ...opts.corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const encoder = new TextEncoder();
  const fullText = result.text;
  const CHUNK = 12;
  // No usamos buffer del SSE upstream — generamos los chunks acá.
  let cursor = 0;

  const stream = new ReadableStream({
    async pull(controller) {
      if (cursor >= fullText.length) {
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
        return;
      }
      const piece = fullText.slice(cursor, cursor + CHUNK);
      cursor += CHUNK;
      const openAiChunk = {
        choices: [{ delta: { content: piece }, index: 0 }],
      };
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify(openAiChunk)}\n\n`),
      );
      // Pequeño delay para mantener el efecto "tipeando" visible.
      await new Promise((r) => setTimeout(r, 18));
    },
  });

  return new Response(stream, {
    headers: { ...opts.corsHeaders, "Content-Type": "text/event-stream" },
  });
}
