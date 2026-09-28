// Lo que ve una persona en pantalla, para los tests "…EnIngles" de Ventas,
// Personalizados, Parrilla, Panel de control y Oportunidades.
//
// Mismo criterio que test/admin/apiKeysEnIngles.test.tsx: todo nodo de texto
// (menos lo que es código: <code>, <pre>) más los atributos que se leen en
// pantalla o en voz alta. `exento` saca los nodos de texto de una zona que está
// en español A PROPÓSITO (la lámina de la Parrilla, que es el documento que se
// imprime); los atributos de esa zona se siguen revisando.
import { esEspanol } from "../i18n/detectarEspanol";

export function textosVisibles(raiz: HTMLElement, exento?: (el: Element) => boolean): string[] {
  const out: string[] = [];
  const walker = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const padre = n.parentElement;
    if (!padre || padre.closest("code, pre, style, script")) continue;
    if (exento && exento(padre)) continue;
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

export const enEspanol = (raiz: HTMLElement, exento?: (el: Element) => boolean) =>
  textosVisibles(raiz, exento).filter((t) => esEspanol(t));

/** Lo que jsdom no trae y usan Radix (Select, Popover) y recharts. */
export function prepararJsdom() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const proto = Element.prototype as any;
  proto.hasPointerCapture ??= () => false;
  proto.setPointerCapture ??= () => {};
  proto.releasePointerCapture ??= () => {};
  proto.scrollIntoView ??= () => {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
}
