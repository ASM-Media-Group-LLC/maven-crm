import { useEffect, useRef } from "react";

// EL PULSO DEL HERO.
//
// Movimiento infinito POR CONSTRUCCIÓN: no hay ninguna animación que se
// invierta. Cada punto viaja del centro al borde y, al llegar, renace en el
// centro con otro ángulo; los anillos crecen y se apagan mientras ya viene
// otro atrás; y la rotación global va siempre en el mismo sentido. Se puede
// mirar un minuto seguido sin ver el "va y vuelve" que delata a un keyframe
// con `alternate`.
//
// Tres cuidados que se pagaron caro y conviene no deshacer:
//  · el DPR se acota a 2 — más allá no se nota y sí se escucha el ventilador;
//  · el avance de cada punto se guarda como `t` de 0 a 1 y no en píxeles, así
//    un cambio de tamaño de ventana no lo teletransporta;
//  · se mide con ResizeObserver y no con `resize` de la ventana: el hero
//    cambia de alto cuando termina de cargar la tipografía, y midiendo una
//    sola vez el lienzo quedaba con el tamaño viejo y las partículas
//    dibujadas donde no iban.

const PUNTOS = 150;

type Punto = { ang: number; t: number; vel: number; tam: number; frio: boolean; brillo: number };

const azar = (a: number, b: number) => a + Math.random() * (b - a);

/** `frio` es el acento principal y `calido` el secundario; los guarda como
 *  triplete "r, g, b" porque se usan dentro de rgba(). */
const nacer = (t = azar(0, 1)): Punto => ({
  ang: azar(0, Math.PI * 2),
  t,
  vel: azar(0.021, 0.075), // por segundo
  tam: azar(0.7, 2.3),
  frio: Math.random() < 0.72,
  brillo: azar(0.25, 0.9),
});

export default function PulsoCanvas({ skin }: { skin?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  // Los colores vivos, leídos de los tokens. En una ref y no en estado: el
  // bucle de dibujo los mira en cada cuadro y no hay que rearmar la escena
  // cuando cambian de paleta — las partículas siguen su viaje y se repintan.
  const tonos = useRef({ frio: "10, 132, 255", claro: "79, 168, 255", calido: "139, 92, 246" });
  // Con `prefers-reduced-motion` la escena se dibuja una sola vez, así que un
  // cambio de paleta no se vería: el bucle guarda acá cómo pedirle un cuadro.
  const repintar = useRef<(() => void) | null>(null);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const css = getComputedStyle(cv);
    const leer = (v: string, fallback: string) => css.getPropertyValue(v).trim() || fallback;
    tonos.current = {
      frio: leer("--azul-rgb", "10, 132, 255"),
      claro: leer("--azul-claro-rgb", "79, 168, 255"),
      calido: leer("--violeta-rgb", "139, 92, 246"),
    };
    repintar.current?.();
  }, [skin]);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext("2d", { alpha: true });
    if (!ctx) return;

    const quietito = window.matchMedia("(prefers-reduced-motion: reduce)");
    const puntos: Punto[] = Array.from({ length: PUNTOS }, () => nacer());
    const anillos = Array.from({ length: 4 }, (_, i) => ({ t: i / 4 }));

    const tono = (pt: Punto) => (pt.frio ? tonos.current.frio : tonos.current.calido);

    let w = 0, h = 0, cx = 0, cy = 0, maxR = 1, dpr = 1, rot = 0, anterior = 0;
    let manija = 0, andando = false;

    const medir = () => {
      const r = cv.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = r.width; h = r.height;
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // El origen no va al medio: va sobre el panel de la derecha, para que la
      // expansión empuje hacia el texto en vez de alejarse de él.
      cx = w * 0.62; cy = h * 0.42;
      maxR = Math.hypot(Math.max(cx, w - cx), Math.max(cy, h - cy)) * 1.05;
    };

    const dibujar = (ahora: number) => {
      const dt = anterior ? Math.min(Math.max((ahora - anterior) / 1000, 0), 0.05) : 0.016;
      anterior = ahora;
      rot += dt * 0.012; // siempre en el mismo sentido

      ctx.clearRect(0, 0, w, h);

      for (const a of anillos) {
        a.t += dt * 0.055;
        if (a.t >= 1) a.t -= 1;
        const alfa = Math.sin(Math.PI * a.t) * 0.17;
        if (alfa <= 0.002) continue;
        ctx.beginPath();
        ctx.arc(cx, cy, a.t * maxR, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${tonos.current.claro}, ${alfa})`;
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // La velocidad crece con la distancia: cerca del centro se arrastran y
      // en el borde se van rápido. Eso es lo que da profundidad sin dibujar 3D.
      for (const pt of puntos) {
        const avance = dt * pt.vel * (0.35 + pt.t * 1.6);
        pt.t += avance;
        if (pt.t >= 1) Object.assign(pt, nacer(0));
        const r = pt.t * maxR;
        const ang = pt.ang + rot;
        const x = cx + Math.cos(ang) * r;
        const y = cy + Math.sin(ang) * r * 0.72; // achatado: da horizonte
        // Nace y muere desvanecido, así nadie ve aparecer ni desaparecer un punto.
        const vida = Math.min(1, pt.t * 6) * (1 - Math.max(0, (pt.t - 0.82) / 0.18));
        const alfa = pt.brillo * vida * 0.85;
        if (alfa <= 0.004) continue;
        const tam = pt.tam * (0.5 + pt.t * 1.1);

        // La estela apunta al centro: es de dónde VIENE. Se calcula desde el
        // avance de este cuadro, así el largo sale de la velocidad y no hay
        // que guardar posiciones anteriores.
        if (pt.t > 0.18) {
          const rAtras = Math.max(0, pt.t - avance * 7) * maxR;
          ctx.beginPath();
          ctx.moveTo(cx + Math.cos(ang) * rAtras, cy + Math.sin(ang) * rAtras * 0.72);
          ctx.lineTo(x, y);
          ctx.strokeStyle = `rgba(${tono(pt)}, ${alfa * 0.5})`;
          ctx.lineWidth = Math.max(0.6, tam * 0.8);
          ctx.lineCap = "round";
          ctx.stroke();
        }

        ctx.beginPath();
        ctx.arc(x, y, tam, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${tono(pt)}, ${alfa})`;
        ctx.fill();
      }
      if (andando) manija = requestAnimationFrame(dibujar);
    };

    const uncuadro = () => { andando = true; anterior = 0; dibujar(0); andando = false; };
    // Solo hace falta cuando la animación NO está corriendo; si corre, el
    // próximo cuadro ya sale con los colores nuevos.
    repintar.current = () => { if (!andando) uncuadro(); };
    const arrancar = () => {
      if (andando || quietito.matches) return;
      andando = true; anterior = 0;
      manija = requestAnimationFrame(dibujar);
    };
    const parar = () => { andando = false; cancelAnimationFrame(manija); };

    medir();

    const observadores: { disconnect(): void }[] = [];
    if (quietito.matches) {
      uncuadro(); // la escena existe, pero no se mueve
    } else {
      // Solo se anima cuando el hero está a la vista: abajo de la página el
      // lienzo no aporta nada y sí gasta batería.
      const ojo = new IntersectionObserver(
        (es) => { for (const e of es) e.isIntersecting ? arrancar() : parar(); },
        { threshold: 0.02 },
      );
      ojo.observe(cv);
      observadores.push(ojo);
    }

    const tamano = new ResizeObserver(() => {
      medir();
      if (quietito.matches) uncuadro();
    });
    tamano.observe(cv);
    observadores.push(tamano);

    const alCambiar = () => (quietito.matches ? parar() : arrancar());
    quietito.addEventListener("change", alCambiar);

    return () => {
      parar();
      repintar.current = null;
      quietito.removeEventListener("change", alCambiar);
      for (const o of observadores) o.disconnect();
    };
  }, []);

  return <canvas id="pulso" ref={ref} aria-hidden="true" />;
}
