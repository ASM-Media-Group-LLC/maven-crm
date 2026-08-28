import { describe, it, expect } from "vitest";
import { useCallback, useState } from "react";
import { render, act } from "@testing-library/react";

// ¿En qué momento React llama ref(null): antes o después de sacar el nodo del
// documento? De eso depende si se puede preguntar `document.contains(nodo)`
// dentro de la baja para saber si el hueco de la llamada sigue vivo.

describe("orden del callback ref al desmontar", () => {
  it("ref(null) llega con el nodo TODAVIA en el documento", () => {
    const visto: Array<{ el: boolean; enDoc: boolean }> = [];
    let ocultar: () => void = () => {};

    function Hueco() {
      const ref = useCallback((el: HTMLDivElement | null) => {
        visto.push({ el: !!el, enDoc: nodo ? document.contains(nodo) : false });
        if (el) nodo = el;
      }, []);
      let nodo: HTMLDivElement | null = null;
      return <div ref={ref} />;
    }

    function Pagina() {
      const [mostrar, setMostrar] = useState(true);
      ocultar = () => setMostrar(false);
      return <div>{mostrar ? <Hueco /> : null}</div>;
    }

    render(<Pagina />);
    act(() => ocultar());

    // El primero es el alta; el segundo la baja.
    expect(visto.length).toBe(2);
    expect(visto[0].el).toBe(true);
    expect(visto[1].el).toBe(false);
    // Lo que importa: en la baja, ¿el nodo seguia en el documento?
    expect(visto[1].enDoc).toBe(true);
  });
});
