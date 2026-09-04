// LO QUE REEMPLAZA.
//
// La fila es el argumento: a la izquierda lo que hoy se paga, tachado y
// apagado; a la derecha lo que lo sustituye, con peso tipográfico. La
// jerarquía cuenta la historia sin tener que escribir "mejor que".

import type { Publico } from "../guiones";

const CAMBIOS = [
  [
    "Correo de la suite de oficina",
    "Correo propio",
    "Tu dominio, carpetas plegables, compositor con formato y adjuntos, listas por rol y tickets que nacen de un correo.",
  ],
  [
    "Chat de equipo por suscripción",
    "Messenger interno",
    "Grupos con permisos de administrador, hilos, borradores que no se pierden, confirmación de lectura, álbumes y ficha de perfil de cada compañero.",
  ],
  [
    "Videollamadas de terceros",
    "Meet y llamadas propias",
    "Servidor de video alojado por nosotros, invitados por enlace que caduca, grabación con retención automática y ventana flotante que sobrevive al cambio de pestaña.",
  ],
  [
    "Nada equivalente",
    "Cowork",
    "Oficina virtual con salas, presencia honesta, cancelación de ruido, fondos virtuales, detector de encuadre y un tablero donde el supervisor ve todas las salas a la vez.",
  ],
] as const;

/** Las dos últimas filas cambian con el público: a una agencia el dolor no es
 *  la planilla de turnos, son las planillas de promoción y de ingresos por
 *  cuenta que hoy se pegan a mano. */
const CIERRE: Record<Publico, readonly (readonly [string, string, string])[]> = {
  empresas: [
    [
      "Planilla de horarios y turnos",
      "Horarios, asistencia y nómina",
      "Turnos y descansos por semana, banco de horas, vacaciones y permisos, organigrama y costo por persona — conectado con lo que cada uno produjo.",
    ],
  ],
  agencias: [
    [
      "Planilla de turnos de chatters",
      "Horarios, rendimiento y nómina",
      "Turnos y descansos por semana, la nota diaria de cada chatter con su objetivo, banco de horas y costo por persona — cruzado con lo que produjo.",
    ],
    [
      "Planilla de promoción y capturas en el chat",
      "Promolog",
      "Cada cuenta revisada sola, con la evidencia guardada y los ingresos del día de la promoción al lado. Sin perseguir a nadie por una captura.",
    ],
    [
      "Hoja de cálculo de ingresos por cuenta",
      "Ingresos y cartera",
      "Lo que factura cada cuenta, por día y por responsable, importado solo. Y la ficha de la creadora con sus lineamientos, sus pedidos y sus hitos.",
    ],
  ],
};

export default function Reemplaza({ publico }: { publico: Publico }) {
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

        <div className="cambio">
          {[...CAMBIOS, ...CIERRE[publico]].map(([antes, despues, detalle]) => (
            <div className="fila-cambio" key={despues}>
              <span className="antes">{antes}</span>
              <span className="flecha" aria-hidden="true">→</span>
              <span className="despues">
                <b>{despues}</b>
                <em>{detalle}</em>
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
