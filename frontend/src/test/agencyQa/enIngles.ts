// Lo que comparten las pruebas "Company QA en inglés": leer TODO lo que se ve de
// una pantalla (texto, title, placeholder, aria-label) y quedarse con lo que suena
// a español. El código (<code>/<pre>) no cuenta: no es prosa (el transcript de una
// llamada va en un <pre> y es dato).
//
// Además del detector del freno (`esEspanol`), cada texto se compara contra el lado
// `es` del diccionario: así se ve un t() que alguien devolvió a texto a mano aunque
// la frase no tenga acento ni una palabra de la lista ("Cerradas", "Jornada larga").
import translations from "@/lib/i18n";
import { esEspanol } from "../i18n/detectarEspanol";

// Radix (Select, Popover) y cmdk miden con APIs que jsdom no trae.
export function polyfillsDeRadix(): void {
  const proto = Element.prototype as unknown as Record<string, unknown>;
  proto.hasPointerCapture ??= () => false;
  proto.releasePointerCapture ??= () => {};
  proto.setPointerCapture ??= () => {};
  const g = globalThis as unknown as { ResizeObserver?: unknown };
  g.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

export function textosVisibles(raiz: HTMLElement): string[] {
  const out: string[] = [];
  const walker = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.parentElement?.closest("code, pre, script, style")) continue;
    const t = (n.textContent ?? "").trim();
    if (t) out.push(t);
  }
  for (const el of Array.from(raiz.querySelectorAll("[title], [placeholder], [aria-label]"))) {
    for (const a of ["title", "placeholder", "aria-label"]) {
      const v = el.getAttribute(a);
      if (v) out.push(v);
    }
  }
  return out;
}

/** El texto entero de cada elemento que solo tiene texto adentro: una frase
 *  armada con {variables} en el JSX llega partida en varios nodos de texto. */
function frasesEnteras(raiz: HTMLElement): string[] {
  return Array.from(raiz.querySelectorAll("*"))
    .filter((el) => el.children.length === 0 && !el.closest("code, pre, style, script"))
    .map((el) => (el.textContent ?? "").replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

// El lado `es` del diccionario que en inglés dice otra cosa. Se descarta lo que
// también es el `en` de alguna clave (eso puede estar bien en pantalla) y lo que
// no tiene al menos 3 letras propias.
const EN_DE_ALGUNA_CLAVE = new Set(Object.values(translations).map((v) => v.en.trim()));
const VARIABLE = /\{\w+\}/;
const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const ES_EXACTO = new Set<string>();
const esPlantillas: string[] = [];
for (const { es, en } of Object.values(translations)) {
  const s = es.trim().replace(/\*\*/g, "");
  if (s === en.trim().replace(/\*\*/g, "") || EN_DE_ALGUNA_CLAVE.has(s)) continue;
  const partes = s.split(VARIABLE);
  if (partes.join("").replace(/[^\p{L}]/gu, "").length < 3) continue;
  if (partes.length > 1) esPlantillas.push(partes.map(escapar).join(".+?"));
  else ES_EXACTO.add(s);
}
const ES_PLANTILLA = new RegExp(`^(?:${esPlantillas.join("|")})$`, "su");
const esDelDiccionario = (t: string) => ES_EXACTO.has(t) || ES_PLANTILLA.test(t);

// `esEspanol` (el del freno) evita a propósito palabras que no están en su lista
// para no dar falsas alarmas en toda la app. Acá, que solo se mira Company QA, se
// suman las de este módulo que no existen en inglés.
const PALABRAS_QA = new RegExp(
  "\\b(?:" +
    "llamadas?|modelos?|analisis|reportes?|veredicto|masivos?|borrador|historial|asistencia|anomalias?|" +
    "productividad|jornadas?|turno|tardanzas?|puntual|impuntual|cierres?|cerradas|mejora|resumen|" +
    "hallazgo|observaciones|recomendaciones|dictado|conversacion(?:es)?|destinatarios|" +
    "disparos|subir|categoria|pais|evaluador|soporte|guardado|guardada|listo|lista|fallo|rinde|" +
    "horas|semanal|ventana|promedio|activas|ultima|ultimos|recaudado|vistos|enviados|objeciones|" +
    "complicidad|interes|puntos|fuertes|debiles|ficha|rapida|motivo|ubicacion|audio de|metricas" +
  ")\\b",
  "i",
);
const sinAcentos = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");

/** ¿Suena a español? El detector del freno, más las palabras de Company QA. */
export const pareceEspanol = (s: string): boolean => esEspanol(s) || PALABRAS_QA.test(sinAcentos(s));

/** Lo que se ve en español. `datos` = textos que vienen de la base o de la IA y
 *  se muestran tal cual (un país, un nombre): esos no cuentan. */
export function enEspanol(raiz: HTMLElement = document.body, datos: ReadonlySet<string> = new Set()): string[] {
  const esDato = (t: string) => datos.has(t);
  return [
    ...textosVisibles(raiz).filter((t) => !esDato(t) && (pareceEspanol(t) || esDelDiccionario(t))),
    ...frasesEnteras(raiz).filter((t) => !esDato(t) && esDelDiccionario(t)),
  ];
}

/** Los avisos (toast) que se dispararon, título y descripción. */
export function textosDeAvisos(llamadas: unknown[][]): string[] {
  const out: string[] = [];
  for (const args of llamadas) {
    const [titulo, opciones] = args as [unknown, { description?: unknown } | undefined];
    if (typeof titulo === "string") out.push(titulo);
    if (opciones && typeof opciones.description === "string") out.push(opciones.description);
  }
  return out;
}
