import type { MouseEvent } from "react";

// Clics y teclas del Drive y su visor. Aparte de los componentes para poder
// probarlos sin dibujar la página entera.

/** Un clic abre; el SEGUNDO clic de un doble clic (`detail` 2) no hace nada.
 *
 *  Antes, un doble clic sobre un archivo abría DOS pestañas, y sobre una
 *  carpeta, el segundo clic podía caer en lo que quedara bajo el mouse en la
 *  carpeta nueva. `detail` 0 es el teclado (Enter o espacio): ese sí abre. */
export function soloUnClic(accion: () => void) {
  return (e: MouseEvent) => {
    if (e.detail <= 1) accion();
  };
}

/** Con el foco en un campo o en un reproductor, las flechas son de ELLOS: en
 *  un <video> adelantan, en un texto mueven el cursor. Cambiar de archivo ahí
 *  le quitaría a la persona el video que estaba mirando. Con Alt/Ctrl/⌘/Shift
 *  el atajo es del navegador o del sistema. */
export function lasFlechasSonDeOtro(e: KeyboardEvent): boolean {
  if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return true;
  const el = e.target;
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  return /^(INPUT|TEXTAREA|SELECT|VIDEO|AUDIO)$/.test(el.tagName);
}
