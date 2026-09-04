import { useEffect } from "react";

// APARICIÓN AL HACER SCROLL.
//
// Un solo observador para toda la página, buscando los elementos por clase en
// vez de un hook por componente: son más de cien nodos y cada uno con su
// propio IntersectionObserver es un desperdicio medible en el primer scroll.
//
// El observador se deja de mirar el elemento en cuanto aparece: la animación
// es de entrada, no de ida y vuelta. Un elemento que se desvanece cuando lo
// pasás de largo y reaparece al volver marea.

const SELECTOR = ".tramo, .cabeza, .area, .agente, .skin, .pieza, .fila-cambio, .porque, .marco";

export function useRevelar(raiz: React.RefObject<HTMLElement>, clave?: string) {
  useEffect(() => {
    const nodo = raiz.current;
    if (!nodo) return;

    const ojo = new IntersectionObserver(
      (entradas) => {
        for (const e of entradas) {
          if (!e.isIntersecting) continue;
          e.target.classList.add("visto");
          ojo.unobserve(e.target);
        }
      },
      { threshold: 0.18, rootMargin: "0px 0px -40px 0px" },
    );

    nodo.querySelectorAll<HTMLElement>(SELECTOR).forEach((el, i) => {
      // Ya apareció: no se vuelve a observar ni se le pone `.revelar`, o al
      // cambiar de público la mitad de la página parpadearía de nuevo.
      if (el.classList.contains("visto")) return;
      // Los tramos de la línea de tiempo tienen su propia transición (el nodo
      // del riel se enciende junto con la tarjeta), así que no llevan
      // `.revelar`: se les agrega solo la clase `visto`.
      if (!el.classList.contains("tramo")) el.classList.add("revelar");
      // Escalonado corto: la fila no aparece de golpe, pero tampoco se hace
      // esperar. Se corta en el séptimo para que una grilla larga no tenga
      // media pantalla en blanco.
      el.style.transitionDelay = `${Math.min(i % 8, 6) * 55}ms`;
      ojo.observe(el);
    });

    return () => ojo.disconnect();
    // `clave` cambia cuando aparecen secciones nuevas (cambio de público) y
    // hay que observarlas: sin esto se quedaban sin animar.
  }, [raiz, clave]);
}
