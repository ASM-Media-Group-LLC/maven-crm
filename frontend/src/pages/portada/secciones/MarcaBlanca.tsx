import { RotateCcw } from "lucide-react";
import { SKINS } from "../skins";

// MARCA BLANCA.
//
// Las fichas de paleta son BOTONES: al tocar una, la portada entera se
// repinta —botones, resplandores, la barra del Messenger, las tarjetas de
// Cowork, las partículas del hero—. Mostrar seis colores quietos mientras la
// web sigue azul es justamente lo que no convence a nadie.
//
// Las paletas que se muestran son las genéricas, con nombres de color: las
// que llevan el nombre de una marca de la casa no van acá, porque la portada
// es pública y no delata quién usa la plataforma.

const PIEZAS = [
  ["199", "Permisos por rol", "Cada módulo y cada sección se abre o se cierra. Los roles los creas tú, con su nivel de acceso y sin un cupo."],
  ["48", "Procesos que corren solos", "Todos los días, a su hora, sin que nadie los dispare. Es la diferencia entre un sistema que informa y uno que trabaja."],
  ["12", "Servicios propios", "El video, el correo, la mensajería y la transcripción los alojamos nosotros. No hay una renta por persona escondida."],
  ["0", "Programas que instalar", "Todo pasa en el navegador: las salas, las llamadas, la cancelación de ruido y los fondos. Sin plugins."],
] as const;

export default function MarcaBlanca({
  skin,
  onElegir,
}: {
  skin: string;
  onElegir: (id: string) => void;
}) {
  const cambiado = skin !== SKINS[0].id;

  return (
    <section className="bloque" id="marca" style={{ borderTop: "1px solid var(--line)" }}>
      <div className="wrap">
        <div className="cabeza">
          <span className="eyebrow">marca blanca</span>
          <h2>Tu empresa, con tu cara.</h2>
          <p>
            Seis paletas listas y la de tu marca encima. Cada persona elige la suya y la
            apariencia la sigue entre dispositivos, porque vive en su perfil y no en el
            navegador. <b>Toca una y esta misma página se pinta con ella.</b>
          </p>
        </div>

        <div className="skins" role="group" aria-label="Probar una paleta">
          {SKINS.map((s) => (
            <button
              type="button"
              className="skin"
              key={s.id}
              aria-pressed={skin === s.id}
              onClick={() => onElegir(s.id)}
            >
              <span className="muestras">
                {s.muestras.map((c) => <i style={{ background: c }} key={c} />)}
              </span>
              {s.nombre}
            </button>
          ))}
          <span className="skin quieta" style={{ borderStyle: "dashed", color: "var(--muted)" }}>
            <span className="muestras"><i style={{ background: "var(--surface-2)" }} /></span>
            y la de tu marca
          </span>
        </div>

        {/* Solo aparece cuando hay algo que volver atrás: un botón de reset
            visible con el color original puesto es ruido. */}
        {cambiado ? (
          <button type="button" className="volver-skin" onClick={() => onElegir(SKINS[0].id)}>
            <RotateCcw width={13} height={13} aria-hidden="true" />
            Volver al azul de Maven
          </button>
        ) : null}

        <div className="infra">
          {PIEZAS.map(([n, titulo, texto]) => (
            <div className="pieza" key={titulo}>
              <p className="n mono">{n}</p>
              <h4>{titulo}</h4>
              <p>{texto}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
