import { useEffect, useState, type CSSProperties } from "react";
import { CheckSquare, Database, Eye, FileText, Mail, MessageSquare, type LucideIcon } from "lucide-react";
import { MarcaM } from "@/components/MarcaM";
import { Link } from "react-router-dom";
import "./portada.css";
import "./oficinaVirtual.css";

import { Cara, nombreDe, type Seed } from "./gente";
import CoworkReal from "./secciones/CoworkReal";
import PedirDemo from "./secciones/PedirDemo";

// LA PORTADA DE MAVEN · ruta pública `/`.
//
// «Oficina virtual» (Alvaro, 16/11/2026, ronda 3 del lienzo de propuestas):
// minimalista, con lo que se vende al frente —lo ves todo, lo controlas todo,
// mejor que una oficina física— y Cowork luciendo con CARAS, nunca letras.
// Azul marino oficial #101827, letra blanca para lo clave y gris para el resto
// (la tensión entre las dos es intencional), verde fluorescente SOLO en el
// título y en el botón de abajo. Los botones de arriba van en blanco.
//
// TRES REGLAS DE CONTENIDO que no son opinión, son pedido explícito:
//  1. Ni una cifra de la agencia (montos, cantidad de personas, uso real).
//  2. Ni un nombre de cliente ni de marca de la casa — tampoco en los
//     comentarios del código, que se leen.
//  3. Ni el nombre de un proveedor nuestro.
// Las caras son personas INVENTADAS (gente.tsx), retratos generados con IA.
//
// OJO CON EL BOTÓN PRINCIPAL: la portada NO invita a registrarse. Hoy el
// trigger `handle_new_user` le da rol `employee` y membresía del tenant real
// a cualquiera que pase por /register. El botón pide una demo, que cae en la
// casilla de ventas (secciones/PedirDemo → edge `demo-request`).
//
// El CSS base vive en `portada.css` y lo propio de esta versión en
// `oficinaVirtual.css`, todo encerrado bajo `.pt`.

/** Los tokens de la portada (portada.css) llevados al azul marino oficial. El
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
  "--azul": "#39ff8e",
  "--azul-claro": "#6bffab",
  "--azul-rgb": "57, 255, 142",
  "--azul-claro-rgb": "107, 255, 171",
  "--sobre-azul": "#04140b",
} as CSSProperties;

/** El logo, dibujado a mano: adentro de la app cambia con la paleta de cada
 *  quien, y la portada tiene que verse siempre igual. */
function Marca({ chico = false }: { chico?: boolean }) {
  const lado = chico ? 22 : 26;
  return (
    <span className="marca" style={chico ? { fontSize: 15 } : undefined}>
      <i style={{ width: lado, height: lado }}>
        <MarcaM alto={chico ? "10px" : "12px"} />
      </i>
      Maven
    </span>
  );
}

/** Una cámara de Cowork: la cara de la persona a sala completa y su nombre. */
function Camara({ seed, habla = false }: { seed: Seed; habla?: boolean }) {
  return (
    <div className="ov-cam">
      <Cara seed={seed} />
      <span className="ov-cam-nombre">
        {habla ? <span className="ov-punto" aria-hidden="true" /> : null}
        {nombreDe(seed)}
      </span>
    </div>
  );
}

type Sala = { nombre: string; estado: string; gente: Seed[]; habla?: boolean };

const SALAS: Sala[] = [
  { nombre: "Ventas", estado: "hablando", gente: ["camilo", "valentina"], habla: true },
  { nombre: "Soporte", estado: "trabajando", gente: ["luciana"] },
  { nombre: "Diseño", estado: "trabajando", gente: ["martina"] },
  { nombre: "Reunión", estado: "grabando", gente: ["joaquin", "sofia"] },
];

const MODULOS: { Icono: LucideIcon; nombre: string; texto: string }[] = [
  { Icono: Eye, nombre: "Argos", texto: "La IA que vigila y te avisa al momento." },
  { Icono: MessageSquare, nombre: "Mensajería", texto: "El chat de tu equipo, bajo tu control." },
  { Icono: Mail, nombre: "Correo", texto: "Las casillas de tu dominio, de la A a la Z." },
  { Icono: FileText, nombre: "Documentos", texto: "Escriben juntos, con versiones y permisos." },
  { Icono: CheckSquare, nombre: "Tareas", texto: "Cada pendiente con dueño y fecha." },
  { Icono: Database, nombre: "Almacenamiento", texto: "Tus archivos, en tu propio espacio." },
];

const MEJOR: [string, string][] = [
  ["Ves quién trabaja de verdad", "Cámara y pantalla de cada persona."],
  ["Sin arriendo ni traslados", "Tu equipo entra desde donde esté."],
  ["Te enteras al momento", "Argos avisa apenas algo falla."],
];

export default function Portada() {
  const [pegado, setPegado] = useState(false);

  useEffect(() => {
    const alScrollear = () => setPegado(window.scrollY > 12);
    alScrollear();
    window.addEventListener("scroll", alScrollear, { passive: true });
    return () => window.removeEventListener("scroll", alScrollear);
  }, []);

  useEffect(() => {
    document.title = "Maven — Oficina virtual: lleva tu negocio al siguiente nivel";
  }, []);

  // La portada es la única pantalla pública y va en oscuro sí o sí: el
  // `data-theme` del visitante no debe poder dejarla ilegible.
  return (
    <div className="pt ov" style={TOKENS}>
      <nav className={`nav${pegado ? " pegado" : ""}`}>
        <div className="wrap nav-in">
          <Marca />
          <div className="ov-links">
            <a href="#cowork">Cowork</a>
            <a href="#control">Control total</a>
            <a href="#mejor">Por qué Maven</a>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <Link className="btn btn-fantasma" to="/login">Entrar</Link>
            <a className="btn ov-btn-blanco" href="#demo">Pedir una demo</a>
          </div>
        </div>
      </nav>

      <section className="ov-hero">
        <div className="wrap ov-hero-grid">
          <div>
            <span className="ov-pastilla"><span className="ov-punto" aria-hidden="true" />Tu equipo, en vivo</span>
            <h1 className="ov-titulo">Oficina virtual</h1>
            <p className="ov-remate">Lleva tu negocio al <span className="ov-gris">siguiente nivel.</span></p>
            <p className="ov-bajada">
              Lo ves todo. <b>Lo controlas todo.</b> Y trabaja mejor que una oficina física.
            </p>
            <div className="ov-acciones">
              <a className="btn btn-lg ov-btn-blanco" href="#demo">Pedir una demo</a>
              <a className="btn btn-lg btn-fantasma" href="#cowork">Ver cómo funciona</a>
            </div>
          </div>

          <div className="ov-consola" aria-hidden="true">
            <div className="ov-barra">
              <i /><i /><i />
              <span className="ov-barra-nombre">cowork</span>
              <span className="ov-barra-vivo"><span className="ov-punto" />en vivo</span>
            </div>
            <div className="ov-salas">
              {SALAS.map((s) => (
                <div className={`ov-sala${s.habla ? " habla" : ""}`} key={s.nombre}>
                  <div className="ov-sala-cab">
                    <b>{s.nombre}</b>
                    <span>{s.habla ? <span className="ov-punto" /> : null}{s.estado}</span>
                  </div>
                  <div className={`ov-sala-camaras n${s.gente.length}`}>
                    {s.gente.map((g) => <Camara seed={g} key={g} />)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="ov-sec" id="cowork">
        <div className="wrap">
          <span className="ov-etiqueta">Cowork</span>
          <h2 className="ov-h2">Todo tu equipo, <span className="ov-gris">en una sola vista.</span></h2>
          {/* Copia del tablero del supervisor de producción (CoworkReal.tsx). */}
          <CoworkReal />
        </div>
      </section>

      <section className="ov-sec" id="control">
        <div className="wrap">
          <span className="ov-etiqueta">Control total</span>
          <h2 className="ov-h2">Todo tu negocio, <span className="ov-gris">en un solo lugar.</span></h2>
          <div className="ov-g3">
            {MODULOS.map(({ Icono, nombre, texto }) => (
              <article className="ov-modulo" key={nombre}>
                <span className="ov-ico"><Icono width={18} height={18} strokeWidth={1.8} aria-hidden="true" /></span>
                <h3>{nombre}</h3>
                <p>{texto}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="ov-sec" id="mejor">
        <div className="wrap">
          <span className="ov-etiqueta">Por qué Maven</span>
          <h2 className="ov-h2">Mejor que una <span className="ov-gris">oficina física.</span></h2>
          <div className="ov-g3">
            {MEJOR.map(([titulo, texto]) => (
              <div className="ov-razon" key={titulo}>
                <h3>{titulo}</h3>
                <p>{texto}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <PedirDemo publico="empresas" />

      <footer>
        <div className="wrap foot">
          <div className="foot-marca">
            <Marca chico />
            <span>Oficina virtual: Cowork, Argos, mensajería, correo, documentos, tareas y archivos.</span>
          </div>
          <nav className="foot-links" aria-label="Enlaces del pie">
            <Link to="/login">Entrar</Link>
            <a href="#demo">Pedir una demo</a>
            <Link to="/privacidad">Privacidad</Link>
            <a href="mailto:alvaro@maven-ai.me">Contacto</a>
          </nav>
          <div className="foot-legal">
            <span>© {new Date().getFullYear()} Maven · Todos los derechos reservados</span>
            <span>Servidores propios · Datos en tu dominio · Sin instalar nada</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
