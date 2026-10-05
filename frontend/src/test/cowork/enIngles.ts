// Lo que comparten las pruebas "Cowork en inglés": leer TODO lo que se ve de una
// pantalla (texto, title, placeholder, aria-label) y quedarse con lo que suena a
// español. El código (<code>/<pre>) no cuenta: no es prosa.
import { esEspanol } from "../i18n/detectarEspanol";

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

// `esEspanol` (el del freno) evita a propósito palabras que no están en su lista
// para no dar falsas alarmas en toda la app, y por eso "Finalizadas recientemente"
// o "Silenciada" le pasan de largo. Acá, que solo se mira Cowork, se suman las
// palabras de este módulo que no existen en inglés.
const PALABRAS_COWORK = new RegExp(
  "\\b(?:" +
    "sala|salas|sesion|sesiones|pausa|pausas|bano|camara|camaras|pantalla|pantallas|llamada|llamadas|" +
    "finaliz\\w*|recientemente|escuch\\w*|habl\\w*|silenci\\w*|entrar|salir|volver|regresar|minutos|" +
    "reglas|aviso|avisos|personas|participantes?|codigo|enlace|solicitud\\w*|conectad\\w*|reloj|" +
    "detenido|corriendo|trabajando|ausente|disponible|listo|atender|unirse|cerrar|colgar|terminar" +
  ")\\b",
  "i",
);
const sinAcentos = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

// Las comillas «» son del español: en inglés un nombre va entre “” (o "").
const COMILLAS_ESPANOLAS = /[«»]/;

/** ¿Suena a español? El detector del freno, más las palabras y las comillas de Cowork. */
export const pareceEspanol = (s: string): boolean =>
  esEspanol(s) || PALABRAS_COWORK.test(sinAcentos(s)) || COMILLAS_ESPANOLAS.test(s);

export const enEspanol = (raiz: HTMLElement) => textosVisibles(raiz).filter((t) => pareceEspanol(t));

/** Los avisos (toast) que se dispararon, título y descripción, para mirarlos igual. */
export function textosDeAvisos(llamadas: unknown[][]): string[] {
  const out: string[] = [];
  for (const args of llamadas) {
    const [titulo, opciones] = args as [unknown, { description?: unknown } | undefined];
    if (typeof titulo === "string") out.push(titulo);
    if (opciones && typeof opciones.description === "string") out.push(opciones.description);
  }
  return out;
}
