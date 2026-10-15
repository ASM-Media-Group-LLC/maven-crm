import { useEffect } from "react";
import { Link } from "react-router-dom";
import {
  MessageSquare, Users, Video, Mail, FolderOpen, Clock,
  Target, Sparkles, DollarSign, UserCog, ArrowLeft,
} from "lucide-react";
import "./documentacion.css";

// DOCUMENTACIÓN PÚBLICA DEL PRODUCTO.
//
// Página pública (ruta /documentation), sin login y SIN NADA INTERNO: explica qué
// es Maven y cómo funciona cada módulo, para clientes y curiosos. Es distinta de la
// documentación interna de la transformación (esa vive en un link privado) y del
// /docs de adentro de la app. Vive bajo pages/portada/ a propósito: es contenido
// público, igual que la portada, y por eso queda fuera del freno de español.

type Modulo = {
  Icono: typeof Users;
  nombre: string;
  que: string;
  como: string;
};

const MODULOS: Modulo[] = [
  {
    Icono: Users, nombre: "Cowork",
    que: "Salas de trabajo abiertas donde cada turno trabaja acompañado, y quien supervisa las ve todas a la vez.",
    como: "Abre una sala, comparte su código y la gente entra directo. Escucha una sala sin entrar, habla a una o a todas, o entra cuando haga falta. Si cambias de sección, la llamada te sigue en una ventana siempre al frente.",
  },
  {
    Icono: MessageSquare, nombre: "Messenger",
    que: "El chat interno del equipo: directos, grupos, archivos, stickers y una ventana flotante que no te saca de lo que haces.",
    como: "Busca a alguien y escríbele desde cualquier pantalla. Los grupos se arman por equipo y las notificaciones llegan al instante.",
  },
  {
    Icono: Video, nombre: "Reuniones",
    que: "Videollamadas con grabación y transcripción, sin instalar nada.",
    como: "Crea una reunión y comparte el enlace (puede caducar). Queda grabada con retención automática: las viejas se borran solas.",
  },
  {
    Icono: Mail, nombre: "Correo",
    que: "Buzón profesional con tu propio dominio, dentro de Maven.",
    como: "Escribe y recibe sin salir de la plataforma. Un correo entrante se puede volver ticket y asignarse solo.",
  },
  {
    Icono: FolderOpen, nombre: "Oficina",
    que: "Documentos, calendario y almacenamiento de archivos del equipo en un solo lugar.",
    como: "Guarda y comparte archivos, agenda eventos y abre documentos sin salir de la sesión.",
  },
  {
    Icono: Clock, nombre: "Turnos",
    que: "Cobertura del equipo sin huecos: quién entra, quién descansa y quién cubre.",
    como: "Arma los turnos y Maven avisa los cambios y cuida que los descansos se respeten.",
  },
  {
    Icono: Target, nombre: "Seguimiento",
    que: "El trabajo que no se empuja solo —compromisos, cuentas en silencio, pendientes que vencen— vigilado y avisado a tiempo.",
    como: "Define lo que importa y recibe el aviso antes de que algo se pase, en el grupo o directo al responsable.",
  },
  {
    Icono: Sparkles, nombre: "Capa de IA",
    que: "Una capa que supervisa la actividad, califica el trabajo y avisa, sin que nadie tenga que estar mirando.",
    como: "Transcribe y puntúa llamadas con la rúbrica del equipo, resume el día por responsable y marca lo que necesita atención.",
  },
  {
    Icono: DollarSign, nombre: "Finanzas",
    que: "Ingresos y pagos del equipo, por cuenta y por período.",
    como: "Revisa los números del día ya conciliados y listos para la mañana.",
  },
  {
    Icono: UserCog, nombre: "Personas",
    que: "Altas, roles y permisos del equipo (RRHH).",
    como: "Da de alta a alguien con su rol y la lista por rol se actualiza sola.",
  },
];

const PASOS: [string, string][] = [
  ["Pide una demo", "Te mostramos Maven con tu caso y te damos acceso. La portada no abre registro: el acceso lo da el equipo."],
  ["Entra con tu cuenta", "Tu dominio, tus equipos y tus permisos quedan listos. Cada quien ve solo lo suyo."],
  ["Trabaja en un solo lugar", "Chat, salas, correo, documentos y seguimiento, sin saltar entre diez herramientas."],
];

export default function Documentacion() {
  useEffect(() => {
    document.title = "Maven — Documentación: cómo funciona";
  }, []);

  return (
    <div className="doc">
      <nav className="doc-nav">
        <div className="doc-wrap doc-nav-in">
          <Link to="/" className="doc-marca">Maven</Link>
          <div className="doc-nav-acc">
            <Link to="/" className="doc-btn doc-btn-fantasma"><ArrowLeft width={15} height={15} aria-hidden="true" /> Inicio</Link>
            <Link to="/login" className="doc-btn doc-btn-fantasma">Entrar</Link>
            <a href="/#demo" className="doc-btn doc-btn-primario">Pedir una demo</a>
          </div>
        </div>
      </nav>

      <header className="doc-hero">
        <div className="doc-wrap">
          <p className="doc-eyebrow">Documentación</p>
          <h1>Cómo funciona Maven</h1>
          <p className="doc-lead">
            Maven reúne el trabajo de tu equipo en una sola oficina virtual —chat, reuniones, correo
            y documentos— con una capa de inteligencia que supervisa la actividad y te mantiene al
            tanto. Aquí te explicamos cada parte, en simple.
          </p>
        </div>
      </header>

      <main className="doc-wrap doc-main">
        <section>
          <h2 className="doc-h2">Los módulos</h2>
          <div className="doc-grid">
            {MODULOS.map(({ Icono, nombre, que, como }) => (
              <article className="doc-card" key={nombre}>
                <span className="doc-ico"><Icono width={20} height={20} strokeWidth={2} aria-hidden="true" /></span>
                <h3>{nombre}</h3>
                <p className="doc-que">{que}</p>
                <p className="doc-como"><b>Cómo se usa.</b> {como}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="doc-pasos-sec">
          <h2 className="doc-h2">Primeros pasos</h2>
          <ol className="doc-pasos">
            {PASOS.map(([titulo, detalle], i) => (
              <li key={titulo}>
                <span className="doc-num">{i + 1}</span>
                <div>
                  <h3>{titulo}</h3>
                  <p>{detalle}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="doc-cta">
          <h2>¿Listo para verlo con tu equipo?</h2>
          <p>Te mostramos Maven con tu caso real. Sin compromiso.</p>
          <a href="/#demo" className="doc-btn doc-btn-primario doc-btn-lg">Pedir una demo</a>
        </section>
      </main>

      <footer className="doc-foot">
        <div className="doc-wrap">
          <span>Maven — tu equipo en una sola oficina.</span>
          <Link to="/">Volver al inicio</Link>
        </div>
      </footer>
    </div>
  );
}
