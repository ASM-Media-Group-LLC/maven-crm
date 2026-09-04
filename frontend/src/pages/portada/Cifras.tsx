import { useEffect, useRef, useState } from "react";

// LA FRANJA DE NÚMEROS.
//
// Son datos de la PLATAFORMA, nunca de una empresa que la use: lo que se
// compra es esto. Y hablan de lo que el comprador se AHORRA — suscripciones
// que deja de pagar, licencias por asiento que no paga — no de ficha técnica.
// Todos en cifras: mezclar "Cero" con "74" se lee descuidado.
//
// Qué números van depende del público: a una agencia se le cuentan las
// planillas que deja de pegar, no solo las suscripciones. Vienen del guión.



/** Un número que cuenta hacia arriba la primera vez que entra en pantalla.
 *  Con `prefers-reduced-motion` aparece directamente en su valor final: la
 *  cifra es el dato, la animación es el adorno. */
function Numero({ hasta, prefijo }: { hasta: number; prefijo: string }) {
  const [valor, setValor] = useState(0);
  const ref = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const nodo = ref.current;
    if (!nodo) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setValor(hasta);
      return;
    }
    let manija = 0;
    const ojo = new IntersectionObserver(
      (entradas) => {
        if (!entradas.some((e) => e.isIntersecting)) return;
        ojo.disconnect();
        const DURACION = 1500;
        const t0 = performance.now();
        const paso = (t: number) => {
          const p = Math.min(1, (t - t0) / DURACION);
          // Frena al final, como un contador de verdad.
          setValor(hasta * (1 - Math.pow(1 - p, 3)));
          if (p < 1) manija = requestAnimationFrame(paso);
        };
        manija = requestAnimationFrame(paso);
      },
      { threshold: 0.6 },
    );
    ojo.observe(nodo);
    return () => { ojo.disconnect(); cancelAnimationFrame(manija); };
  }, [hasta]);

  return (
    <p className="n" ref={ref} key={hasta}>
      {prefijo}
      {Math.round(valor).toLocaleString("es-CO")}
    </p>
  );
}

export default function Cifras({ cifras }: { cifras: { hasta: number; prefijo: string; pie: string }[] }) {
  return (
    <section className="cifras">
      <div className="wrap">
        <div className="cifras-grid">
          {cifras.map((c) => (
            <div className="cifra" key={c.pie}>
              <Numero hasta={c.hasta} prefijo={c.prefijo} />
              <p className="q">{c.pie}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
