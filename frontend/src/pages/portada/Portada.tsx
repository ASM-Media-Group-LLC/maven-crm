import { useEffect, useRef, useState, type CSSProperties, type MouseEvent } from "react";
import { MarcaMaven } from "@/components/MarcaM";
import {
  ArrowRight, CheckSquare, Eye, FileText, HardDrive, Mail, MessageSquare, MonitorUp, UserCheck, Video,
  type LucideIcon,
} from "lucide-react";
import { Link } from "react-router-dom";
import "./portada.css";
import "./reinventada.css";

import PedirDemo from "./secciones/PedirDemo";

// LA PORTADA DE MAVEN · ruta pública `/`.
//
// «La oficina, reinventada.» (Alvaro, 16/11/2026): el esquema de la portada
// de Lumina, calcado a pedido —video de fondo, tres pasos, qué trae, para
// cualquier equipo, precios y cierre— con la letra de la oficina virtual y
// los colores de Maven. El video muestra un equipo repartido en varias casas
// trabajando como si estuviera en la misma oficina.
//
// Precios de Alvaro (16/11/2026, segunda vuelta): fijo por empresa y todo
// incluido, Argos también — Equipo USD 299 hasta 20 personas, Empresa USD 599
// hasta 50, y Enterprise SIN precio (más de 50 personas: nos contactan), como
// la tarjeta Enterprise de Lumina — más la instalación a la medida desde
// USD 3.000 (pago único) en la nota de abajo. Cambiar un precio es cambiar
// PLANES, nada más.
//
// TRES REGLAS DE CONTENIDO que no son opinión, son pedido explícito:
//  1. Ni una cifra de la agencia (montos, cantidad de personas, uso real).
//  2. Ni un nombre de cliente ni de marca de la casa — tampoco en los
//     comentarios del código, que se leen.
//  3. Ni el nombre de un proveedor nuestro.
//
// OJO CON EL BOTÓN PRINCIPAL: la portada NO invita a registrarse. Hoy el
// trigger `handle_new_user` le da rol `employee` y membresía del tenant real
// a cualquiera que pase por /register. Todos los botones abren el pedido de
// demo (secciones/PedirDemo → edge `demo-request`), que cae en ventas.

/** Los tokens de la base (portada.css) en el azul marino oficial. El
 *  formulario de demo los lee: por eso su botón sale verde (--azul). */
const TOKENS = {
  "--ground": "#101827",
  "--ground-deep": "#0c121d",
  "--surface": "#141d2e",
  "--surface-2": "#172133",
  "--line": "rgba(255,255,255,.07)",
  "--line-strong": "rgba(255,255,255,.14)",
  "--ink": "#ffffff",
  "--ink-soft": "#c9d0dc",
  "--muted": "#8f9ab0",
  "--faint": "#7d889e",
  "--azul": "#bed161",
  "--azul-claro": "#cddc7f",
  "--azul-rgb": "190, 209, 97",
  "--azul-claro-rgb": "107, 255, 171",
  "--sobre-azul": "#1c2108",
} as CSSProperties;

const PASOS: [string, string][] = [
  [
    "Arma tu oficina",
    "Crea una sala por área y suma a tu gente. Cada uno entra desde su casa, en el navegador, sin instalar nada.",
  ],
  [
    "Tu equipo trabaja en vivo",
    "Cámara y pantalla encendidas en Cowork, como en la misma oficina. El chat, el correo y los documentos están a un clic, sin salir de Maven.",
  ],
  [
    "Argos vigila y te reporta",
    "La IA revisa todo el turno quién trabaja de verdad, le pone una nota del 0 al 100 y avisa al momento a la persona y a su jefe. Control total, sin perseguir a nadie.",
  ],
];

const FUNCIONES: { Icono: LucideIcon; nombre: string; texto: string }[] = [
  { Icono: Video, nombre: "Cowork en vivo", texto: "Las cámaras y pantallas de todo tu equipo, sala por sala. Ves quién está y en qué anda." },
  { Icono: MonitorUp, nombre: "Reuniones", texto: "Videollamadas con pantalla compartida en servidor propio, sin pagar otra herramienta." },
  { Icono: Eye, nombre: "Argos, la IA que vigila", texto: "Revisa cámaras y pantallas, le pone nota a cada persona y te avisa apenas algo falla." },
  { Icono: MessageSquare, nombre: "Mensajería interna", texto: "El chat de tu equipo, con grupos por área y bajo tu control." },
  { Icono: Mail, nombre: "Correo de la A a la Z", texto: "Las casillas con tu dominio, controladas de punta a punta desde Maven." },
  { Icono: FileText, nombre: "Documentos", texto: "Hojas, textos y presentaciones que editan juntos, con versiones." },
  { Icono: CheckSquare, nombre: "Tareas", texto: "Cada pendiente con dueño, fecha y estado. Nada se pierde en un chat." },
  { Icono: HardDrive, nombre: "Almacenamiento", texto: "Los archivos de tu empresa en tu propio espacio, compartidos por área." },
  { Icono: UserCheck, nombre: "Tú apruebas quién entra", texto: "Nadie entra sin tu permiso, y cada rol ve solo lo suyo." },
];

const EQUIPOS = ["Ventas", "Soporte", "Atención al cliente", "Operaciones", "Diseño", "Agencias", "Lo que tu empresa necesite"];

type Plan = {
  nombre: string;
  precio: string;
  periodo?: string;
  tope: string;
  incluye: string[];
  boton: string;
  destacado?: boolean;
  /** Botón de contorno (el de «Contáctanos»), como el Enterprise de Lumina. */
  contacto?: boolean;
};

const PLANES: Plan[] = [
  {
    nombre: "Equipo",
    precio: "USD 299",
    periodo: "/ mes · por empresa",
    tope: "Hasta 20 personas",
    incluye: [
      "Cowork en vivo, con cámara y pantalla",
      "Argos, la IA que vigila todo el turno",
      "Reuniones, mensajería y correo con tu dominio",
      "Documentos, tareas y almacenamiento",
      "Tú apruebas quién entra",
    ],
    boton: "Pedir una demo",
  },
  {
    nombre: "Empresa",
    precio: "USD 599",
    periodo: "/ mes · por empresa",
    tope: "Hasta 50 personas",
    incluye: [
      "Todo lo de Equipo",
      "Un Cowork por área, cada uno con su supervisor",
      "Nota del 0 al 100 por persona, del día y de la semana",
      "Avisos al momento a la persona y a su jefe",
      "Expediente de cada persona, día por día",
    ],
    boton: "Pedir una demo",
    destacado: true,
  },
  {
    nombre: "Enterprise",
    precio: "A la medida",
    tope: "Más de 50 personas · empresas grandes",
    incluye: [
      "Todo lo de Empresa",
      "Para equipos de más de 50 personas",
      "Tu marca y tus colores en toda la plataforma",
      "Instalación e integraciones a tu medida",
      "Acompañamiento dedicado",
    ],
    boton: "Contáctanos",
    contacto: true,
  },
];

/** El logo de la portada (Alvaro, 16/11/2026): la M de cinta de la marca
 *  (components/MarcaM, la misma de la app y de los iconos) en el verde de los
 *  y «aven» pegado en blanco: la M hace de «M» (Alvaro, 16/11/2026). Sin
 *  «Virtual Office»: «nada que ver». */
function Marca({ chico = false }: { chico?: boolean }) {
  return (
    <MarcaMaven className={`pr-marca${chico ? " chico" : ""}`} />
  );
}

/** El video de fondo del inicio, IGUAL que el de Lumina en todos los tamaños:
 *  un solo video ancho, a pantalla completa y centrado (en el celular se ve
 *  recortado al centro, como el de Lumina). Con «reducir movimiento» queda la
 *  foto fija.
 *
 *  OJO iPhone: Safari solo reproduce solo un video si `muted` está ESCRITO en
 *  la etiqueta (Lumina lo tiene en su HTML). React no escribe ese atributo —
 *  solo cambia la propiedad—, así que en el iPhone el video se quedaba quieto.
 *  Se escribe a mano y se le da play; si el teléfono igual lo frena (modo de
 *  bajo consumo), arranca con el primer toque en la página. */
function VideoDeFondo() {
  const [quieto] = useState(
    () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
  );
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    v.muted = true;
    v.defaultMuted = true;
    v.setAttribute("muted", "");
    v.setAttribute("playsinline", "");
    v.setAttribute("webkit-playsinline", "");
    const arrancar = () => {
      if (v.paused) v.play().catch(() => {});
    };
    arrancar();
    document.addEventListener("touchstart", arrancar, { once: true, passive: true });
    return () => document.removeEventListener("touchstart", arrancar);
  }, []);
  return (
    <div className="pr-video" aria-hidden="true">
      {quieto ? (
        <img src="/portada/hero-poster.jpg" alt="" />
      ) : (
        <video
          ref={ref}
          src="/portada/hero.mp4"
          poster="/portada/hero-poster.jpg"
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
        />
      )}
    </div>
  );
}

export default function Portada() {
  const raiz = useRef<HTMLDivElement>(null);
  // El formulario de demo queda guardado hasta que alguien lo pide: así la
  // página cierra limpia, como la de referencia, y no con un formulario largo.
  const [demoAbierta, setDemoAbierta] = useState(
    () => typeof window !== "undefined" && window.location.hash === "#demo",
  );

  useEffect(() => {
    document.title = "Maven — La oficina, reinventada";
  }, []);

  // Si se entra con /#demo, el formulario ya está abierto: se lleva la vista.
  useEffect(() => {
    if (!demoAbierta || window.location.hash !== "#demo") return;
    requestAnimationFrame(() => document.getElementById("demo")?.scrollIntoView());
    // Solo al montar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Aparición al bajar: un solo observador para toda la página.
  useEffect(() => {
    const nodo = raiz.current;
    if (!nodo || typeof IntersectionObserver === "undefined") {
      nodo?.querySelectorAll(".pr-aparece").forEach((el) => el.classList.add("visible"));
      return;
    }
    const ojo = new IntersectionObserver(
      (entradas) => {
        for (const e of entradas) {
          if (!e.isIntersecting) continue;
          e.target.classList.add("visible");
          ojo.unobserve(e.target);
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" },
    );
    nodo.querySelectorAll(".pr-aparece").forEach((el) => ojo.observe(el));
    return () => ojo.disconnect();
  }, []);

  const abrirDemo = (e?: MouseEvent) => {
    e?.preventDefault();
    setDemoAbierta(true);
    window.history.replaceState(null, "", "#demo");
    requestAnimationFrame(() => document.getElementById("demo")?.scrollIntoView({ behavior: "smooth" }));
  };

  // La portada es la única pantalla pública y va en oscuro sí o sí: el
  // `data-theme` del visitante no debe poder dejarla ilegible.
  return (
    <div className="pt pr" style={TOKENS} ref={raiz}>
      <header className="pr-nav">
        <div className="pr-caja pr-nav-in">
          <Link to="/" aria-label="Maven" style={{ textDecoration: "none" }}><Marca /></Link>
          <nav className="pr-nav-links" aria-label="Secciones">
            <a href="#como-funciona">Cómo funciona</a>
            <a href="#empresas">Para empresas</a>
            <a href="#precios">Precios</a>
          </nav>
          <div className="pr-nav-cta">
            <Link className="pr-btn pr-btn-fantasma" to="/login">Entrar</Link>
            <a className="pr-btn pr-btn-neon" href="#demo" onClick={abrirDemo}>Pedir una demo</a>
          </div>
        </div>
      </header>

      <section className="pr-hero">
        <VideoDeFondo />
        <div className="pr-caja">
          <h1>
            <span>La oficina,</span>
            <span className="pr-linea-acento">reinventada.</span>
          </h1>
          <p className="pr-bajada">
            La plataforma donde tu equipo trabaja junto desde cualquier casa: cámaras en vivo, una IA que vigila y
            todo tu negocio en un solo lugar — sin pagar oficina.
          </p>
          <div className="pr-hero-cta">
            <a className="pr-btn pr-btn-neon pr-btn-lg" href="#demo" onClick={abrirDemo}>
              Pedir una demo <ArrowRight aria-hidden="true" />
            </a>
            <a className="pr-btn pr-btn-fantasma pr-btn-lg" href="#como-funciona">Ver cómo funciona</a>
          </div>
        </div>
      </section>

      <section className="pr-sec" id="como-funciona">
        <div className="pr-caja">
          <div className="pr-cabeza pr-aparece">
            <p className="pr-ceja">Cómo funciona</p>
            <h2>Tres pasos. Cero oficina.</h2>
            <p>Desde que armas tus salas hasta el reporte del día, todo pasa dentro de Maven.</p>
          </div>
          <div className="pr-pasos">
            {PASOS.map(([titulo, texto], i) => (
              <article className="pr-tarjeta pr-paso pr-aparece" key={titulo}>
                <div className="pr-paso-num">{String(i + 1).padStart(2, "0")}</div>
                <h3>{titulo}</h3>
                <p>{texto}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="pr-sec" id="funciones">
        <div className="pr-caja">
          <div className="pr-cabeza pr-aparece">
            <p className="pr-ceja">Qué trae</p>
            <h2>Todo lo que necesitas para trabajar de verdad</h2>
          </div>
          <div className="pr-funciones">
            {FUNCIONES.map(({ Icono, nombre, texto }) => (
              <article className="pr-tarjeta pr-funcion pr-aparece" key={nombre}>
                <span className="pr-icono"><Icono strokeWidth={1.6} aria-hidden="true" /></span>
                <h3>{nombre}</h3>
                <p>{texto}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="pr-sec pr-equipos" id="empresas">
        <div className="pr-caja">
          <div className="pr-cabeza pr-aparece">
            <p className="pr-ceja">Para empresas</p>
            <h2>Para cualquier equipo remoto</h2>
            <p>Maven no es de un solo rubro. Si tu gente trabaja desde casa, aquí trabaja junta.</p>
          </div>
          <ul className="pr-chips pr-aparece">
            {EQUIPOS.map((e) => <li className="pr-chip" key={e}>{e}</li>)}
          </ul>
        </div>
      </section>

      <section className="pr-sec" id="precios">
        <div className="pr-caja">
          <div className="pr-cabeza pr-aparece">
            <p className="pr-ceja">Precios</p>
            <h2>Un precio fijo por empresa. Sin sorpresas.</h2>
            <p>Te dejamos la oficina armada y lista para tu equipo. Todos entran, dentro del tope de tu plan.</p>
          </div>
          <div className="pr-precios">
            {PLANES.map((p) => (
              <article className={`pr-plan pr-aparece${p.destacado ? " destacado" : ""}`} key={p.nombre}>
                {p.destacado ? <span className="pr-plan-sello">Recomendado</span> : null}
                <h3 className="pr-plan-nombre">{p.nombre}</h3>
                <p className="pr-plan-precio">
                  {p.precio}
                  {p.periodo ? <small> {p.periodo}</small> : null}
                </p>
                <p className="pr-plan-tope">{p.tope}</p>
                <ul>
                  {p.incluye.map((linea) => <li key={linea}>{linea}</li>)}
                </ul>
                <a
                  className={`pr-btn ${p.contacto ? "pr-btn-fantasma" : "pr-btn-neon"}`}
                  href="#demo"
                  onClick={abrirDemo}
                >
                  {p.boton}
                </a>
              </article>
            ))}
          </div>
          <p className="pr-precios-nota">
            Precio fijo por empresa, no por persona.{" "}
            <b>Instalación e integraciones a la medida para tu empresa: desde USD&nbsp;3.000, pago único.</b>
          </p>
        </div>
      </section>

      <section className="pr-sec pr-cierre">
        <div className="pr-caja pr-aparece">
          <h2>Tu equipo, <em>trabajando de verdad.</em></h2>
          <p>Pide tu demo, arma tus salas y deja que Maven haga el resto.</p>
          {demoAbierta ? null : (
            <a className="pr-btn pr-btn-neon pr-btn-lg" href="#demo" onClick={abrirDemo}>Pedir una demo</a>
          )}
        </div>
      </section>

      {demoAbierta ? <PedirDemo publico="empresas" /> : null}

      <footer className="pr-pie">
        <div className="pr-caja pr-pie-in">
          <div className="pr-pie-marca">
            <Marca chico />
            <span className="pr-pie-lema">La oficina, reinventada.</span>
          </div>
          <nav className="pr-pie-links" aria-label="Enlaces del pie">
            <Link to="/login">Entrar</Link>
            <a href="#demo" onClick={abrirDemo}>Pedir una demo</a>
            <Link to="/privacidad">Privacidad</Link>
          </nav>
          <span className="pr-pie-copia">© {new Date().getFullYear()} Maven</span>
        </div>
      </footer>
    </div>
  );
}
