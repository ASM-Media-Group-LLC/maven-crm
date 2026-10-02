// «Traducir» un correo (Keila, 02/10): el cuerpo, al idioma de la pantalla de
// quien lo lee, con la IA por OpenRouter y un Gemini económico.
//
// Desde el 01/10/2026 Maven no tiene llave de Anthropic: la IA va por
// OpenRouter (como qa-analyze y parrilla-generate). Vive en la carpeta de la
// función y no en _shared/: un cambio en _shared redespliega las ~97 funciones.
//
// Lo de acá es puro (sin red: `fetch` entra por parámetro) para poder probarlo.

export const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
/** El Gemini más barato (01/10/2026: US$0,10 / 0,40 por millón de tokens).
 *  Se cambia sin desplegar con el secret IA_MODELO_OPENROUTER. */
export const MODELO_ECONOMICO = "google/gemini-2.5-flash-lite";

/** Cuánto texto se manda, como mucho. Un correo de 12.000 caracteres son unas
 *  4 páginas; más que eso casi siempre es un boletín o un hilo citado entero, y
 *  traducirlo todo tardaría y costaría por nada. Se avisa que se recortó. */
export const TOPE_CARACTERES = 12_000;

export type Idioma = "es" | "en";

const NOMBRE_IDIOMA: Record<Idioma, string> = { es: "Spanish", en: "English" };

/** Las entidades HTML más comunes, más las numéricas. */
function decodificarEntidades(s: string): string {
  const nombradas: Record<string, string> = {
    nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'",
    laquo: "«", raquo: "»", hellip: "…", ndash: "–", mdash: "—", iexcl: "¡", iquest: "¿",
    aacute: "á", eacute: "é", iacute: "í", oacute: "ó", uacute: "ú", ntilde: "ñ",
    Aacute: "Á", Eacute: "É", Iacute: "Í", Oacute: "Ó", Uacute: "Ú", Ntilde: "Ñ", uuml: "ü",
  };
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (todo, cuerpo: string) => {
    if (cuerpo[0] === "#") {
      const n = cuerpo[1].toLowerCase() === "x" ? parseInt(cuerpo.slice(2), 16) : parseInt(cuerpo.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : todo;
    }
    return nombradas[cuerpo] ?? todo;
  });
}

/** HTML → texto, CONSERVANDO los saltos de línea: un correo traducido en un
 *  solo párrafo no se lee. Los bloques (p, div, li, tr, h1…) y los <br> pasan a
 *  ser saltos; lo que no se ve (style, script, head) se descarta entero. */
export function htmlATexto(html: string): string {
  return decodificarEntidades(
    html
      .replace(/<(style|script|head|title)\b[\s\S]*?<\/\1>/gi, "")
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<li\b[^>]*>/gi, "\n• ")
      // Sin </li>: cada <li> ya abre su renglón con la viñeta.
      .replace(/<\/(p|div|tr|h[1-6]|blockquote|table|ul|ol|section|article|header|footer)>/gi, "\n")
      .replace(/<(p|div|tr|h[1-6]|blockquote|table|ul|ol)\b[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t ]+/g, " ")
    .split("\n").map((l) => l.trim()).join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** El texto que se manda a traducir: el texto plano del correo si lo tiene,
 *  si no, su HTML pasado a texto. Recortado al tope (en un salto de línea si
 *  hay uno cerca, para no partir una frase al medio). */
export function textoParaTraducir(fuente: { text?: string | null; html?: string | null }): {
  texto: string;
  recortado: boolean;
} {
  const plano = (fuente.text ?? "").replace(/\r\n?/g, "\n").trim();
  const texto = plano || (fuente.html ? htmlATexto(fuente.html) : "");
  if (texto.length <= TOPE_CARACTERES) return { texto, recortado: false };
  const corte = texto.lastIndexOf("\n", TOPE_CARACTERES);
  return {
    texto: texto.slice(0, corte > TOPE_CARACTERES * 0.8 ? corte : TOPE_CARACTERES).trimEnd(),
    recortado: true,
  };
}

/** Las instrucciones para la IA. En inglés: los modelos las siguen mejor, y el
 *  idioma de SALIDA lo fija `destino`, no el de las instrucciones. */
export function instrucciones(destino: Idioma): string {
  return [
    `You translate emails into ${NOMBRE_IDIOMA[destino]}.`,
    "Translate the whole email the user sends you.",
    "Keep every line break, blank line, bullet and list exactly where it is.",
    "Keep names, email addresses, links, numbers, dates and amounts unchanged.",
    "Lines that start with \">\" are quoted text: translate them too and keep the \">\".",
    `If a part is already in ${NOMBRE_IDIOMA[destino]}, leave it as it is.`,
    "Reply with the translation only: no notes, no explanations, no quotes around it.",
  ].join("\n");
}

export class ErrorDeTraduccion extends Error {
  constructor(mensaje: string, readonly status: number) {
    super(mensaje);
  }
}

/** Una llamada a OpenRouter: el texto → su traducción. */
export async function pedirTraduccion(
  f: typeof fetch,
  apiKey: string,
  modelo: string,
  texto: string,
  destino: Idioma,
  timeoutMs = 45_000,
): Promise<string> {
  const ac = new AbortController();
  const reloj = setTimeout(() => ac.abort(), timeoutMs);
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
        // Una traducción ocupa más o menos lo mismo que el original; con margen.
        max_tokens: 8000,
        temperature: 0.2,
        messages: [
          { role: "system", content: instrucciones(destino) },
          { role: "user", content: texto },
        ],
      }),
    });
  } catch (e) {
    clearTimeout(reloj);
    const abortado = (e as Error).name === "AbortError";
    throw new ErrorDeTraduccion(
      abortado ? `La IA tardó más de ${timeoutMs / 1000}s. Prueba de nuevo.` : "No se pudo contactar a la IA.",
      504,
    );
  }
  clearTimeout(reloj);

  if (!res.ok) {
    // ⚠️ Se registra el código, NUNCA la llave ni el cuerpo del correo.
    console.error("[mail-fetch] translate: OpenRouter respondió", res.status);
    await res.body?.cancel().catch(() => {});
    if (res.status === 401) throw new ErrorDeTraduccion("La IA rechazó la llave configurada.", 502);
    if (res.status === 402 || res.status === 403) throw new ErrorDeTraduccion("La IA se quedó sin crédito.", 502);
    if (res.status === 429) throw new ErrorDeTraduccion("La IA está ocupada. Prueba en unos segundos.", 503);
    throw new ErrorDeTraduccion(`La IA respondió ${res.status}.`, 502);
  }

  const data = await res.json() as { choices?: Array<{ message?: { content?: string | null } }> };
  const traduccion = (data.choices?.[0]?.message?.content ?? "").trim();
  if (!traduccion) throw new ErrorDeTraduccion("La IA devolvió una traducción vacía.", 502);
  return traduccion;
}
