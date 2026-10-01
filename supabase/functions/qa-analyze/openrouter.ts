// El análisis de QA por OpenRouter, con un Gemini económico. Desde el 01/10/2026
// Maven ya no tiene llave de Anthropic (Jhon la eliminó).
//
// Vive en la carpeta de la función y no en _shared/: un cambio en _shared
// redespliega las ~97 funciones.

export const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
// El Gemini más barato con salida JSON (01/10/2026: US$0,10 / 0,40 por millón).
// Se cambia sin desplegar con el secret IA_MODELO_OPENROUTER (o QA_MODELO_PREMIUM
// solo para las modelos A++ / A+).
export const MODELO_ECONOMICO = "google/gemini-2.5-flash-lite";
const PRECIO_LISTA: Record<string, { in: number; out: number }> = {
  "google/gemini-2.5-flash-lite": { in: 0.10, out: 0.40 },
};

export interface UsoOpenRouter { prompt_tokens?: number; completion_tokens?: number; cost?: number }

/** El costo en US$: el que informa OpenRouter (usage.cost) o, si no vino, el de lista. */
export function costoDeUso(modelo: string, u: UsoOpenRouter | null | undefined): number {
  if (typeof u?.cost === "number") return u.cost;
  const p = PRECIO_LISTA[modelo];
  if (!p) return 0;
  return ((u?.prompt_tokens ?? 0) * p.in + (u?.completion_tokens ?? 0) * p.out) / 1_000_000;
}

/** Saca el ```json … ``` que a veces envuelve la respuesta. */
export function sinCercas(texto: string): string {
  let raw = texto.trim();
  if (raw.startsWith("```json")) raw = raw.slice(7);
  if (raw.startsWith("```")) raw = raw.slice(3);
  if (raw.endsWith("```")) raw = raw.slice(0, -3);
  return raw.trim();
}

/** Una llamada: system + mensaje → el JSON del análisis como texto, y el uso. */
export async function pedirAnalisis(
  f: typeof fetch,
  apiKey: string,
  modelo: string,
  systemPrompt: string,
  userMessage: string,
  timeoutMs: number,
): Promise<{ raw: string; usage: UsoOpenRouter | null }> {
  const ac = new AbortController();
  const timeoutId = setTimeout(() => ac.abort(), timeoutMs);
  let res: Response;
  try {
    res = await f(OPENROUTER_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://app.maven-ai.me",
        "X-Title": "Maven",
      },
      signal: ac.signal,
      body: JSON.stringify({
        model: modelo,
        max_tokens: 16000,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        usage: { include: true },
      }),
    });
  } catch (e) {
    clearTimeout(timeoutId);
    const abortado = (e as Error).name === "AbortError";
    throw new Error(
      abortado
        ? `La IA tardó más de ${timeoutMs / 1000}s. Prueba de nuevo.`
        : `Error al contactar OpenRouter: ${(e as Error).message}`,
    );
  }
  clearTimeout(timeoutId);

  if (!res.ok) {
    const status = res.status;
    const errText = await res.text().catch(() => "");
    console.error("OpenRouter error", status, errText.slice(0, 500));
    if (status === 429) throw new Error("La IA: rate limit. Prueba en unos segundos.");
    if (status === 401) throw new Error("La IA: API key inválida.");
    if (status === 402 || status === 403) throw new Error("La IA: crédito agotado o sin permisos.");
    if (status === 503 || status === 529) throw new Error("La IA está sobrecargada. Prueba en unos segundos.");
    throw new Error(`La IA respondió ${status}`);
  }

  const data = await res.json() as {
    choices?: Array<{ message?: { content?: string | null } }>;
    usage?: UsoOpenRouter;
  };
  const texto = data.choices?.[0]?.message?.content ?? "";
  if (!texto.trim()) throw new Error("La IA devolvió una respuesta vacía.");
  return { raw: sinCercas(texto), usage: data.usage ?? null };
}
