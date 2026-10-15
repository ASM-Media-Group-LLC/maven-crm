import { useEffect, useRef, useState } from "react";
import { MarcaM } from "@/components/MarcaM";
import { Link } from "react-router-dom";
import "./portada.css";

import PulsoCanvas from "./PulsoCanvas";
import Oficina from "./Oficina";
import Cifras from "./Cifras";
import { useRevelar } from "./useRevelar";
import { Pila } from "./gente";
import { PIES, type Publico } from "./guiones";
import { GUION } from "./publico";
import { SKINS, tokensDe } from "./skins";

import Reemplaza from "./secciones/Reemplaza";
import Messenger from "./secciones/Messenger";
import Simulador from "./secciones/Simulador";
import Cowork from "./secciones/Cowork";
import CtaMedio from "./secciones/CtaMedio";
import UnDia from "./secciones/UnDia";
import Modulos from "./secciones/Modulos";
import CapaDeIA from "./secciones/CapaDeIA";
import MarcaBlanca from "./secciones/MarcaBlanca";
import Promolog from "./secciones/Promolog";
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

/** El logo, dibujado a mano y no con el componente de la app: adentro el logo
 *  cambia con la paleta que eligió cada persona, y la portada tiene que
 *  verse siempre igual para quien todavía no es cliente. */
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

export default function Portada() {
  const raiz = useRef<HTMLDivElement>(null);
  const [publico, setPublico] = useState<Publico>("empresas");
  const [pegado, setPegado] = useState(false);
  // La paleta con la que se está viendo la portada. Vive SOLO en memoria: al
  // refrescar vuelve al azul de Maven, porque es una demostración de marca
  // blanca y no una preferencia del visitante.
  const [skin, setSkin] = useState(SKINS[0].id);
  const paleta = SKINS.find((s) => s.id === skin) ?? SKINS[0];
  const guion = GUION[publico];

  useRevelar(raiz, publico);

  useEffect(() => {
    const alScrollear = () => setPegado(window.scrollY > 12);
    alScrollear();
    window.addEventListener("scroll", alScrollear, { passive: true });
    return () => window.removeEventListener("scroll", alScrollear);
  }, []);

  // El título de la pestaña: el mismo que el <title> estático, por si se entra
  // desde adentro de la app, donde la pestaña dice solo "Maven".
  useEffect(() => {
    document.title = "Maven — Tu equipo en una sola oficina, control total en tiempo real";
  }, []);

  // La portada es la única pantalla pública, y va en oscuro sí o sí: el
  // `data-theme` del visitante no debe poder dejarla ilegible.
  return (
    <div className="pt" ref={raiz} style={tokensDe(paleta)} data-skin={paleta.id}>
      <nav className={`nav${pegado ? " pegado" : ""}`}>
        <div className="wrap nav-in">
          <Marca />
          <div className="nav-links">
            {guion.links.map(([href, texto]) => <a href={href} key={href}>{texto}</a>)}
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <Link className="btn btn-fantasma" to="/login">Entrar</Link>
            <a className="btn btn-primario" href="#demo">Pedir una demo</a>
          </div>
        </div>
      </nav>

      {/* ── HERO ── La tesis a la izquierda y la oficina en vivo a la
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
              Oficina virtual con control del equipo
            </span>
            <h1>
              Tu equipo en una sola oficina.<br />
              <span className="resalte">{guion.remate}</span>
            </h1>
            <p className="bajada">{guion.bajada}</p>

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

          <Oficina publico={publico} idPestana={`tab-${publico}`} />
        </div>
      </section>

      <Cifras cifras={guion.cifras} />
      <Reemplaza publico={publico} />
      <Messenger />
      <Cowork />
      <CtaMedio />
      {guion.promolog ? <Promolog /> : null}
      {guion.simulador ? <Simulador /> : null}
      <UnDia />
      <Modulos publico={publico} />
      <CapaDeIA />
      <MarcaBlanca skin={skin} onElegir={setSkin} />

      <PedirDemo publico={publico} />

      <footer>
        <div className="wrap foot">
          <div className="foot-marca">
            <Marca chico />
            <span>Correo, chat, oficina virtual y operación, en una sola sesión.</span>
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
