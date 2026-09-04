import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import "./portada.css";

import PulsoCanvas from "./PulsoCanvas";
import Consola from "./Consola";
import Cifras from "./Cifras";
import { useRevelar } from "./useRevelar";
import { Pila } from "./gente";
import { PIES, type Publico } from "./guiones";
import { SKINS, tokensDe } from "./skins";

import Reemplaza from "./secciones/Reemplaza";
import Messenger from "./secciones/Messenger";
import Simulador from "./secciones/Simulador";
import Cowork from "./secciones/Cowork";
import UnDia from "./secciones/UnDia";
import Modulos from "./secciones/Modulos";
import CapaDeIA from "./secciones/CapaDeIA";
import MarcaBlanca from "./secciones/MarcaBlanca";
import PedirDemo from "./secciones/PedirDemo";

// LA PORTADA DE MAVEN · ruta pública `/`.
//
// Reemplaza a la portada de la v1, que prometía "12 módulos" y mostraba
// cifras de la agencia. Ahora está posicionada como sustituto de la suite de
// oficina —correo propio, chat interno, oficina virtual, reuniones— y se le
// habla tanto a empresas como a agencias, con un selector que cambia el
// guión de la cinta del hero en vez de prometer dos productos distintos.
//
// TRES REGLAS DE CONTENIDO que no son opinión, son pedido explícito:
//  1. Ni una cifra de la agencia (montos, cantidad de personas, uso real).
//  2. Ni un nombre de cliente ni de marca de la casa — tampoco en los
//     comentarios del código, que se leen.
//  3. Ni el nombre de un proveedor nuestro. Se dice "servidor propio",
//     "alojado por nosotros", nunca de quién es la pieza.
// Y nada de prometer que las 74 pantallas "están incluidas": van a haber
// niveles de suscripción.
//
// OJO CON EL BOTÓN PRINCIPAL: la portada NO invita a registrarse. Hoy el
// trigger `handle_new_user` le da rol `employee` y membresía del tenant real
// a cualquiera que pase por /register, así que una portada pública que diga
// "crear cuenta" es una puerta a la operación de la empresa. El botón pide
// una demo, que cae en la casilla de ventas.
//
// El CSS vive en `portada.css` y TODO está encerrado bajo `.pt`. Si agregás
// una regla, va con `.pt ` adelante o se le escapa al resto de la app.

const LINKS = [
  ["#reemplaza", "Lo que reemplaza"],
  ["#messenger", "Messenger"],
  ["#simulador", "Simulador"],
  ["#cowork", "Cowork"],
  ["#dia", "El día"],
  ["#modulos", "Módulos"],
  ["#ia", "La capa de IA"],
  ["#marca", "Marca blanca"],
] as const;

/** El logo, dibujado a mano y no con el componente de la app: adentro el logo
 *  cambia con la paleta que eligió cada persona, y la portada tiene que
 *  verse siempre igual para quien todavía no es cliente. */
function Marca({ chico = false }: { chico?: boolean }) {
  const lado = chico ? 22 : 26;
  return (
    <span className="marca" style={chico ? { fontSize: 15 } : undefined}>
      <i style={{ width: lado, height: lado }}>
        <svg width={chico ? 12 : 14} height={chico ? 12 : 14} viewBox="0 0 24 24" fill="none"
          stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 19V7l8 7 8-7v12" />
        </svg>
      </i>
      Maven
    </span>
  );
}

export default function Portada() {
  const raiz = useRef<HTMLDivElement>(null);
  const [publico, setPublico] = useState<Publico>("empresas");
  const [pegado, setPegado] = useState(false);
  // La paleta con la que se está viendo la portada. Vive SOLO en memoria: al
  // refrescar vuelve al azul de Maven, porque es una demostración de marca
  // blanca y no una preferencia del visitante.
  const [skin, setSkin] = useState(SKINS[0].id);
  const paleta = SKINS.find((s) => s.id === skin) ?? SKINS[0];

  useRevelar(raiz);

  useEffect(() => {
    const alScrollear = () => setPegado(window.scrollY > 12);
    alScrollear();
    window.addEventListener("scroll", alScrollear, { passive: true });
    return () => window.removeEventListener("scroll", alScrollear);
  }, []);

  // La portada es la única pantalla pública, y va en oscuro sí o sí: el
  // `data-theme` del visitante no debe poder dejarla ilegible.
  return (
    <div className="pt" ref={raiz} style={tokensDe(paleta)} data-skin={paleta.id}>
      <nav className={`nav${pegado ? " pegado" : ""}`}>
        <div className="wrap nav-in">
          <Marca />
          <div className="nav-links">
            {LINKS.map(([href, texto]) => <a href={href} key={href}>{texto}</a>)}
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <Link className="btn btn-fantasma" to="/login">Entrar</Link>
            <a className="btn btn-primario" href="#demo">Pedir una demo</a>
          </div>
        </div>
      </nav>

      {/* ── HERO ── La tesis a la izquierda y la operación en vivo a la
          derecha. El movimiento del lienzo es infinito por construcción: cada
          punto nace en el centro y muere en el borde, donde renace con otro
          ángulo. Nada se invierte, así que no se percibe el "va y vuelve". */}
      <section className="hero">
        <PulsoCanvas skin={paleta.id} />
        <div className="wrap hero-grid">
          <div>
            <span className="chip-vivo">
              <span className="punto" />
              <Pila cuantas={5} />
              Una sola sesión para todo el equipo
            </span>
            <h1>
              Reemplaza siete suscripciones<br />
              <span className="resalte">por una sola sesión.</span>
            </h1>
            <p className="bajada">
              Correo con tu dominio, chat interno, oficina virtual, reuniones con grabación,
              tickets, recursos humanos y finanzas. Con una <b>capa de IA que supervisa,
              califica y avisa</b> sin que nadie tenga que estar mirando.
            </p>

            <div className="publico" role="tablist" aria-label="Elegir público">
              <button
                role="tab" id="tab-empresas" type="button"
                aria-selected={publico === "empresas"} aria-controls="cinta"
                onClick={() => setPublico("empresas")}
              >
                Para empresas
              </button>
              <button
                role="tab" id="tab-agencias" type="button"
                aria-selected={publico === "agencias"} aria-controls="cinta"
                onClick={() => setPublico("agencias")}
              >
                Para agencias de creadoras
              </button>
            </div>

            <div className="acciones">
              <a className="btn btn-primario btn-lg" href="#demo">Pedir una demo</a>
              <a className="btn btn-fantasma btn-lg" href="#reemplaza">Ver lo que reemplaza</a>
            </div>
            <p className="pie-hero">{PIES[publico]}</p>
          </div>

          <Consola publico={publico} idPestana={`tab-${publico}`} />
        </div>
      </section>

      <Cifras />
      <Reemplaza />
      <Messenger />
      <Simulador />
      <Cowork />
      <UnDia />
      <Modulos />
      <CapaDeIA />
      <MarcaBlanca skin={skin} onElegir={setSkin} />

      <PedirDemo publico={publico} />

      <footer>
        <div className="wrap foot">
          <Marca chico />
          <span>Correo, chat, oficina virtual y operación, en una sola sesión.</span>
        </div>
      </footer>
    </div>
  );
}
