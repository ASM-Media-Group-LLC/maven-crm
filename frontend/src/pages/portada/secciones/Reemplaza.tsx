// LO QUE REEMPLAZA.
//
// Antes era una tabla de texto ("antes → después"): informaba, no vendía. Ahora
// vende de dos maneras. Arriba, el golpe económico —siete suscripciones se
// vuelven una—. Abajo, una tarjeta por módulo que MUESTRA cómo se ve en Maven:
// una maqueta chica hecha en HTML, no una captura, sin datos de nadie. Las
// maquetas grandes de cada módulo siguen más abajo en la página; estas son el
// adelanto que engancha.

import type { Publico } from "../guiones";

type Cambio = { clave: string; antes: string; despues: string; detalle: string };

const CAMBIOS: Cambio[] = [
  {
    clave: "correo",
    antes: "Correo de la suite de oficina",
    despues: "Correo propio",
    detalle:
      "Tu dominio, carpetas plegables, compositor con formato y adjuntos, listas por rol y tickets que nacen de un correo.",
  },
  {
    clave: "messenger",
    antes: "Chat de equipo por suscripción",
    despues: "Messenger interno",
    detalle:
      "Grupos con permisos de administrador, hilos, borradores que no se pierden, confirmación de lectura y ficha de perfil de cada compañero.",
  },
  {
    clave: "meet",
    antes: "Videollamadas de terceros",
    despues: "Meet y llamadas propias",
    detalle:
      "Servidor de video propio, invitados por enlace que caduca, grabación con retención automática y ventana flotante que sobrevive al cambio de pestaña.",
  },
  {
    clave: "cowork",
    antes: "Nada equivalente",
    despues: "Cowork",
    detalle:
      "Oficina virtual con salas, presencia honesta, cancelación de ruido, detector de encuadre y un tablero donde el supervisor ve todas las salas a la vez.",
  },
];

/** Las últimas filas cambian con el público: a una agencia el dolor no es la
 *  planilla de turnos, son las de promoción e ingresos por cuenta. */
const CIERRE: Record<Publico, Cambio[]> = {
  empresas: [
    {
      clave: "horarios",
      antes: "Planilla de horarios y turnos",
      despues: "Horarios, asistencia y nómina",
      detalle:
        "Turnos y descansos por semana, banco de horas, vacaciones y permisos, organigrama y costo por persona — conectado con lo que cada uno produjo.",
    },
  ],
  agencias: [
    {
      clave: "horarios",
      antes: "Planilla de turnos de chatters",
      despues: "Horarios, rendimiento y nómina",
      detalle:
        "Turnos y descansos por semana, la nota diaria de cada chatter con su objetivo, banco de horas y costo por persona — cruzado con lo que produjo.",
    },
    {
      clave: "promolog",
      antes: "Planilla de promoción y capturas en el chat",
      despues: "Promolog",
      detalle:
        "Cada cuenta revisada sola, con la evidencia guardada y los ingresos del día de la promoción al lado. Sin perseguir a nadie por una captura.",
    },
    {
      clave: "ingresos",
      antes: "Hoja de cálculo de ingresos por cuenta",
      despues: "Ingresos y cartera",
      detalle:
        "Lo que factura cada cuenta, por día y por responsable, importado solo. Y la ficha de la creadora con sus lineamientos, sus pedidos y sus hitos.",
    },
  ],
};

// Las siete suscripciones que se vuelven una. Son categorías, no marcas: la
// portada no nombra a ningún proveedor, ni el nuestro ni el de nadie.
const HERRAMIENTAS = ["Correo", "Chat", "Video", "Oficina virtual", "Tickets", "Personas", "Ventas"];

const DIAS = ["L", "M", "X", "J", "V", "S", "D"];

/** La maqueta chica de cada tarjeta: un vistazo de cómo se ve el módulo en
 *  Maven, reconstruido con `<div>` y sin un solo dato real. */
function Mini({ clave }: { clave: string }) {
  switch (clave) {
    case "correo":
      return (
        <div className="mini mini-correo">
          <div className="mc-top"><i aria-hidden="true" /> tu-empresa.com</div>
          {[0, 1, 2].map((n) => (
            <div className="mc-row" key={n}>
              <span className={`dot${n === 0 ? " on" : ""}`} />
              <div className="mc-lines"><i /><i /></div>
            </div>
          ))}
        </div>
      );
    case "messenger":
      return (
        <div className="mini mini-msg">
          <div className="fila">
            <span className="cara" />
            <div className="bb"><span className="nom" /><span className="l" /><span className="l corta" /></div>
          </div>
          <div className="bb mia"><span className="l" /><span className="pie">10:42 ✓✓</span></div>
        </div>
      );
    case "meet":
      return (
        <div className="mini mini-meet">
          <span className="rec">● REC</span>
          <div className="meet-grid">
            {[0, 1, 2, 3].map((n) => (
              <span className={`t${n === 0 ? " habla" : ""}`} key={n}>
                <span className="cara" />
                {n === 0 ? <span className="ondas" aria-hidden="true"><i /><i /><i /></span> : null}
              </span>
            ))}
          </div>
        </div>
      );
    case "cowork":
      return (
        <div className="mini mini-cowork">
          <div className="sala viva">
            <span className="tope"><b /><span className="ondas" aria-hidden="true"><i /><i /><i /></span></span>
            <span className="gente"><span className="cara" /><span className="cara" /></span>
          </div>
          <div className="sala">
            <span className="tope"><b /></span>
            <span className="gente"><span className="cara" /><span className="cara" /></span>
          </div>
        </div>
      );
    case "horarios":
      return (
        <div className="mini mini-hor">
          {DIAS.map((d, i) => (
            <div className="col" key={i}><i className="bar" /><span className="dia">{d}</span></div>
          ))}
        </div>
      );
    default:
      return (
        <div className="mini mini-gen">
          {[0, 1, 2].map((n) => <div className="g-row" key={n}><span className="cara" /><i /></div>)}
        </div>
      );
  }
}

export default function Reemplaza({ publico }: { publico: Publico }) {
  const items = [...CAMBIOS, ...CIERRE[publico]];
  return (
    <section className="bloque" id="reemplaza">
      <div className="wrap">
        <div className="cabeza">
          <span className="eyebrow">una cuenta en lugar de siete</span>
          <h2>El correo, el chat y las reuniones dejan de ser tres facturas.</h2>
          <p>
            Maven no se conecta a tu suite de oficina: la reemplaza. El correo corre sobre tu
            propio dominio, el chat es interno, y las reuniones y la oficina virtual están
            alojadas por nosotros — sin pagar por asiento a nadie más.
          </p>
        </div>

        {/* El golpe del ahorro: siete suscripciones se vuelven una. */}
        <div className="ahorro">
          <div className="ahorro-caja ahorro-viejo">
            <span className="ahorro-rotulo">Hoy · siete suscripciones</span>
            <ul className="ahorro-chips">
              {HERRAMIENTAS.map((h) => <li key={h}>{h}</li>)}
            </ul>
          </div>
          <div className="ahorro-flecha" aria-hidden="true">→</div>
          <div className="ahorro-caja ahorro-nuevo">
            <span className="ahorro-rotulo">Con Maven</span>
            <p className="uno"><b>1</b> cuenta</p>
            <p className="sub">Una sola factura, una sola contraseña. Sin pagar por asiento a nadie más.</p>
          </div>
        </div>

        {/* Una tarjeta por módulo: muestra el producto, no lo describe. */}
        <div className="reempla-grid">
          {items.map((c) => (
            <article className="reempla-card" key={c.despues}>
              <div className="reempla-mini"><Mini clave={c.clave} /></div>
              <div className="reempla-cuerpo">
                <span className="reempla-tag">Reemplaza <s>{c.antes}</s></span>
                <h3>{c.despues}</h3>
                <p>{c.detalle}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
