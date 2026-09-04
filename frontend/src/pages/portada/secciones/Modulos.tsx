import {
  BarChart3, Mail, MessageCircle, MessagesSquare, Phone, Layers, UserRound, Video,
} from "lucide-react";

// EL MAPA DE MÓDULOS.
//
// El conteo de pantallas por área es un dato del producto, no de nadie que lo
// use. Y no dice "incluidas": va a haber niveles de suscripción, así que la
// portada cuenta lo que la plataforma TIENE, no lo que entra en el precio.

const AREAS = [
  {
    Icono: Mail, color: "#b9bfcd", fondo: "rgba(255,255,255,.08)",
    tinte: "rgba(255,255,255,.06)", borde: "var(--line-strong)",
    titulo: "Correo", cuenta: "4 pantallas",
    items: ["Tu propio dominio", "Carpetas plegables", "Compositor con formato", "Listas por rol", "Tickets desde un correo"],
  },
  {
    Icono: MessageCircle, color: "#4fa8ff", fondo: "rgba(10,132,255,.16)",
    tinte: "rgba(10,132,255,.13)", borde: "rgba(10,132,255,.45)",
    titulo: "Messenger", cuenta: "6 pantallas",
    items: ["Grupos con permisos", "Hilos", "Borradores", "Confirmación de lectura", "Álbumes", "Ficha de perfil"],
  },
  {
    Icono: Video, color: "#4fa8ff", fondo: "rgba(79,168,255,.16)",
    tinte: "rgba(79,168,255,.12)", borde: "rgba(79,168,255,.45)",
    titulo: "Cowork, Meet y llamadas", cuenta: "6 pantallas",
    items: ["Salas con supervisor", "Invitados por enlace", "Grabaciones", "Encuadre de cámara", "Cancelación de ruido", "Fondos virtuales"],
  },
  {
    Icono: BarChart3, color: "#a78bfa", fondo: "rgba(139,92,246,.14)",
    tinte: "rgba(139,92,246,.1)", borde: "rgba(139,92,246,.4)",
    titulo: "Personas y finanzas", cuenta: "31 pantallas",
    items: ["Horarios y turnos", "Asistencia", "Vacaciones y permisos", "Organigrama", "Nómina y costo", "Facturación"],
  },
  {
    Icono: Phone, color: "#f43f7e", fondo: "rgba(244,63,126,.16)",
    tinte: "rgba(244,63,126,.12)", borde: "rgba(244,63,126,.45)",
    titulo: "Ventas y pipeline", cuenta: "7 pantallas",
    items: ["Etapas del embudo", "Cadencia de contacto", "Base de leads", "Calidad de llamadas", "Líneas telefónicas", "Ruteo por dueño"],
  },
  {
    Icono: MessagesSquare, color: "#a78bfa", fondo: "rgba(139,92,246,.16)",
    tinte: "rgba(139,92,246,.13)", borde: "rgba(139,92,246,.45)",
    titulo: "Mensajería externa", cuenta: "12 pantallas",
    items: ["Bandeja compartida", "Multi-línea", "Agentes por grupo", "Canales de mensajería", "Analítica", "Visibilidad por dueño"],
  },
  {
    Icono: Layers, color: "#f59e0b", fondo: "rgba(245,158,11,.16)",
    tinte: "rgba(245,158,11,.12)", borde: "rgba(245,158,11,.45)",
    titulo: "Desempeño del equipo", cuenta: "8 pantallas",
    items: ["Rendimiento diario", "Evaluación de conversaciones", "Feedback del líder", "Tablero propio por persona", "Capacitación"],
  },
  {
    Icono: UserRound, color: "#10b981", fondo: "rgba(16,185,129,.16)",
    tinte: "rgba(16,185,129,.12)", borde: "rgba(16,185,129,.45)",
    titulo: "Cartera y clientes", cuenta: "9 pantallas",
    items: ["Alta y baja", "Ficha y lineamientos", "Calendario de contenido", "Pedidos a medida", "Hitos", "Ingresos por cuenta"],
  },
] as const;

export default function Modulos() {
  return (
    <section className="bloque" id="modulos">
      <div className="wrap">
        <div className="cabeza">
          <span className="eyebrow">el mapa completo</span>
          <h2>8 áreas, 74 pantallas, 1 sola sesión.</h2>
          <p>
            Sin pestañas de otras diez herramientas. Las cuatro primeras áreas son las que
            reemplazan a tu suite de oficina; las otras cuatro son operación de verdad, con la
            profundidad de un sistema hecho adentro de una empresa que lo usa todos los días.
            Cada área se abre o se cierra por rol, sección por sección.
          </p>
        </div>

        <div className="mapa">
          {AREAS.map(({ Icono, color, fondo, tinte, borde, titulo, cuenta, items }) => (
            <div
              className="area"
              key={titulo}
              style={{ "--tinte": tinte, "--borde": borde } as React.CSSProperties}
            >
              <div className="area-top">
                <span className="ico" style={{ background: fondo }}>
                  <Icono strokeWidth={2.2} stroke={color} aria-hidden="true" />
                </span>
                <h3>{titulo}</h3>
                <span className="cuenta">{cuenta}</span>
              </div>
              <ul>{items.map((i) => <li key={i}>{i}</li>)}</ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
