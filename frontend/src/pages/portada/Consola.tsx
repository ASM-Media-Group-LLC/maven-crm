import { useEffect, useState } from "react";
import { GENTE, Cara } from "./gente";
import { GUIONES, ICONOS, TITULOS, type Evento, type Publico } from "./guiones";

// LA CINTA DE OPERACIÓN.
//
// El hero abre con esto y no con una captura, a propósito: lo característico
// de Maven no es una pantalla, es que el trabajo sigue andando solo. La cinta
// sube sin parar y se detiene al pasarle el mouse por encima, para poder leer
// una fila.
//
// La lista se pinta DOS VECES y la animación mueve la pista exactamente un
// 50%: al terminar, el primer duplicado está justo donde arrancó el original,
// así el bucle no tiene salto. Si algún día se cambia el `translateY(-50%)`
// del keyframe `subir`, hay que cambiar también esta duplicación.

function Fila({ e, i }: { e: Evento; i: number }) {
  const { color, fondo, Icono } = ICONOS[e.tipo];
  // Los eventos que hablan de una persona llevan cara en vez de ícono, como
  // en el producto: una fila que menciona a alguien muestra su muñequito.
  const dePersona = e.tipo === "turno" || e.tipo === "nota";
  return (
    <div className="evento">
      <span className="hora">{e.hora}</span>
      {dePersona ? (
        <Cara seed={GENTE[i % GENTE.length].seed} className="cara" />
      ) : (
        <span className="ico" style={{ background: fondo }}>
          <Icono strokeWidth={2.2} stroke={color} aria-hidden="true" />
        </span>
      )}
      <span className="txt">{e.texto}</span>
    </div>
  );
}

export default function Consola({ publico, idPestana }: { publico: Publico; idPestana: string }) {
  const [hora, setHora] = useState("--:--:--");

  useEffect(() => {
    const tic = () => {
      const d = new Date();
      setHora([d.getHours(), d.getMinutes(), d.getSeconds()]
        .map((n) => String(n).padStart(2, "0")).join(":"));
    };
    tic();
    const t = window.setInterval(tic, 1000);
    return () => window.clearInterval(t);
  }, []);

  const guion = GUIONES[publico];

  return (
    <div className="consola">
      <div className="consola-barra">
        <span className="semaforo"><i /><i /><i /></span>
        <span className="consola-titulo">{TITULOS[publico]}</span>
        <span className="consola-reloj mono">{hora}</span>
      </div>
      <div className="cinta" id="cinta" role="tabpanel" aria-labelledby={idPestana}>
        {/* El `key` por público remonta la pista y reinicia la animación: sin
            eso, el guión nuevo aparecía a mitad de camino y se veía el salto. */}
        <div className="cinta-pista" key={publico}>
          {guion.map((e, i) => <Fila e={e} i={i} key={`a-${e.hora}`} />)}
          {guion.map((e, i) => <Fila e={e} i={i} key={`b-${e.hora}`} />)}
        </div>
      </div>
    </div>
  );
}
