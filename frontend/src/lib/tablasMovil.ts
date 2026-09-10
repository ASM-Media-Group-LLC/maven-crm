// TABLAS CRUDAS EN EL TELÉFONO (fase 5 del rediseño). La <Table> de shadcn ya se
// vuelve tarjetas sola (components/ui/table.tsx). Los <table> escritos a mano no
// pasan por ese componente, así que llevan la clase `tabla-movil` (el CSS vive en
// index.css) y este instalador les pone a cada <td> el rótulo de su columna en
// data-label, leído del <th> con el mismo índice. Observa el DOM para cubrir las
// tablas que se montan después (pestañas, diálogos, datos que llegan).
const rotular = (raiz: ParentNode) => {
  raiz.querySelectorAll<HTMLTableElement>("table.tabla-movil").forEach((tabla) => {
    const cabeceras = tabla.tHead?.rows[0]?.cells;
    for (const cuerpo of Array.from(tabla.tBodies)) {
      for (const fila of Array.from(cuerpo.rows)) {
        for (const celda of Array.from(fila.cells)) {
          if (celda.colSpan > 1) { celda.removeAttribute("data-label"); continue; }
          const rotulo = cabeceras?.[celda.cellIndex]?.textContent?.trim() ?? "";
          if (rotulo) celda.setAttribute("data-label", rotulo);
          else celda.removeAttribute("data-label");
        }
      }
    }
  });
};

/** Instala el rotulado de tablas crudas en `raiz`; devuelve la función para desinstalarlo. */
export function instalarTablasMovil(raiz: HTMLElement = document.body): () => void {
  rotular(raiz);
  let pendiente: number | null = null;
  const observador = new MutationObserver(() => {
    // Una pasada por frame, no una por mutación.
    if (pendiente != null) return;
    pendiente = window.requestAnimationFrame(() => { pendiente = null; rotular(raiz); });
  });
  observador.observe(raiz, { childList: true, subtree: true, characterData: true });
  return () => {
    observador.disconnect();
    if (pendiente != null) window.cancelAnimationFrame(pendiente);
  };
}
