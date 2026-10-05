import { useEffect, useRef, useState } from "react";

// Dibujar de a tramos: hay carpetas importadas de Google con miles de archivos
// (3.000 y más) y dibujarlos todos de una congela la pestaña, sobre todo con
// miniaturas. Se dibujan los primeros `paso` y, cuando la persona se acerca al
// final (un «centinela» invisible entra en pantalla), los siguientes.

export function usePorTramos(clave: string, total: number, paso = 120) {
  const [estado, setEstado] = useState({ clave, limite: paso });
  // Otro lugar u otra vista: se empieza de nuevo (sin un efecto que lo borre).
  const limite = estado.clave === clave ? estado.limite : paso;
  const centinela = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (limite >= total) return;
    // Sin IntersectionObserver (navegadores muy viejos, jsdom): todo de una.
    if (typeof IntersectionObserver === "undefined") {
      setEstado({ clave, limite: total });
      return;
    }
    const el = centinela.current;
    if (!el) return;
    const io = new IntersectionObserver((entradas) => {
      if (entradas.some((e) => e.isIntersecting)) setEstado({ clave, limite: limite + paso });
    }, { rootMargin: "800px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [clave, limite, total, paso]);

  return { limite: Math.min(limite, total), centinela, hayMas: limite < total };
}
