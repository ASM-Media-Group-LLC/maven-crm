import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import "./portada.css";

import { useRevelar } from "./useRevelar";
import { SKINS, tokensDe } from "./skins";
import Reemplaza from "./secciones/Reemplaza";
import Messenger from "./secciones/Messenger";
import Cowork from "./secciones/Cowork";
import Promolog from "./secciones/Promolog";
import Simulador from "./secciones/Simulador";
import Modulos from "./secciones/Modulos";
import CapaDeIA from "./secciones/CapaDeIA";
import MarcaBlanca from "./secciones/MarcaBlanca";
import Planes from "./secciones/Planes";
import PedirDemo from "./secciones/PedirDemo";

// DOCUMENTO COMERCIAL · ruta pública `/concept`.
//
// La versión anterior era de la v1 y publicaba tres cosas que no debía:
//
//   1. TARIFAS que todavía no están decididas ($299 y $799 al mes, con
//      niveles inventados en su momento). Una tarifa publicada es una tarifa
//      que el comprador te cobra en la negociación.
//   2. "12 módulos", cuando hoy hay 74 pantallas.
//   3. El nombre de un PROVEEDOR nuestro, en la ficha de videollamadas. Eso
//      no va en ninguna página pública.
//
// Y arriba de todo decía "Confidencial" — en una URL abierta, que es lo
// contrario de confidencial. Ahora dice lo que es: un documento comercial.
//
// Se arma con las MISMAS secciones que la portada, a propósito: lo que ve el
// comprador acá es lo que ve en la web, y cuando se agrega algo a una pieza
// se agrega en las dos. Lo que esta página tiene de más son las dos preguntas
// que hace quien ya se interesó: cuánto sale y cómo se pone en marcha.

const PASOS = [
  ["1", "Se levanta tu espacio", "Con tu dominio, tu paleta y los roles que definas. Nadie más ve tus datos: cada empresa tiene el suyo."],
  ["2", "Se migra el correo y lo que ya tenías", "Los buzones se sincronizan sin apagar el proveedor viejo, y las planillas que usabas entran importadas."],
  ["3", "Se acompaña la primera semana", "Con el equipo adentro, ajustando permisos y avisos hasta que la operación corre sola."],
  ["4", "Y sigue creciendo con ustedes", "Cada pantalla de Maven existe porque alguien la necesitaba una semana. Lo que le falte a tu operación se construye."],
] as const;

export default function Concepto() {
  const raiz = useRef<HTMLDivElement>(null);
  const [pegado, setPegado] = useState(false);
  useRevelar(raiz, "concepto");

  useEffect(() => {
    const alScrollear = () => setPegado(window.scrollY > 12);
    alScrollear();
    window.addEventListener("scroll", alScrollear, { passive: true });
    return () => window.removeEventListener("scroll", alScrollear);
  }, []);

  return (
    <div className="pt" ref={raiz} style={tokensDe(SKINS[0])} data-skin={SKINS[0].id}>
      <nav className={`nav${pegado ? " pegado" : ""}`}>
        <div className="wrap nav-in">
          <Link to="/" className="marca" style={{ textDecoration: "none" }}>
            <i style={{ width: 26, height: 26 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff"
                strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 19V7l8 7 8-7v12" />
              </svg>
            </i>
            Maven
          </Link>
          <div className="nav-links">
            <a href="#reemplaza">Reemplaza</a>
            <a href="#messenger">Messenger</a>
            <a href="#cowork">Cowork</a>
            <a href="#promolog">Promolog</a>
            <a href="#modulos">Módulos</a>
            <a href="#ia">IA</a>
            <a href="#planes">Planes</a>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <Link className="btn btn-fantasma" to="/">Ver la web</Link>
            <a className="btn btn-primario" href="#demo">Pedir una demo</a>
          </div>
        </div>
      </nav>

      <section className="hero" style={{ paddingBottom: 40 }}>
        <div className="wrap">
          <span className="eyebrow">documento comercial</span>
          <h1 style={{ maxWidth: "22ch" }}>
            Todo lo que hace Maven,<br />
            <span className="resalte">en una sola lectura.</span>
          </h1>
          <p className="bajada">
            Está pensado para una agencia de creadoras, que es donde Maven nació y donde se usa
            todos los días. Adentro: qué reemplaza, cómo se ve cada pieza, qué hace la capa de
            IA, cómo se pone en marcha y cómo se cobra.
          </p>
          <div className="acciones">
            <a className="btn btn-primario btn-lg" href="#demo">Pedir una demo</a>
            <a className="btn btn-fantasma btn-lg" href="#planes">Ver los planes</a>
          </div>
        </div>
      </section>

      <Reemplaza publico="agencias" />
      <Messenger />
      <Cowork />
      <Promolog />
      <Simulador />
      <Modulos publico="agencias" />
      <CapaDeIA />
      <MarcaBlanca skin={SKINS[0].id} onElegir={() => {}} />

      <section className="bloque" id="marcha" style={{ background: "rgba(255,255,255,.014)", borderBlock: "1px solid var(--line)" }}>
        <div className="wrap">
          <div className="cabeza">
            <span className="eyebrow">cómo se pone en marcha</span>
            <h2>Nadie tiene que dejar de trabajar para migrar.</h2>
            <p>
              La plataforma entra por partes y el proveedor viejo se apaga cuando ya no hace
              falta, no antes.
            </p>
          </div>
          <div className="pasos">
            {PASOS.map(([n, titulo, texto]) => (
              <div className="paso" key={n}>
                <span className="n">{n}</span>
                <h4>{titulo}</h4>
                <p>{texto}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Planes />
      <PedirDemo publico="agencias" />

      <footer>
        <div className="wrap foot">
          <Link to="/" className="marca" style={{ fontSize: 15, textDecoration: "none" }}>
            <i style={{ width: 22, height: 22 }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff"
                strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 19V7l8 7 8-7v12" />
              </svg>
            </i>
            Maven
          </Link>
          <span>Documento comercial · las capturas son reconstrucciones con datos de ejemplo.</span>
        </div>
      </footer>
    </div>
  );
}
