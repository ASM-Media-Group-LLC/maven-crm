import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { BookOpen, Brain, Check, ChevronRight, Clock, Plug, Settings, Star, Zap } from "lucide-react";
import "./portada.css";

import { useRevelar } from "./useRevelar";
import { SKINS, tokensDe } from "./skins";
import { MODULOS, PLUGINS, OBJETIVOS, PLANES } from "./conceptoDatos";

// DOCUMENTO DE CONCEPTO · ruta pública `/concept`.
//
// SOLO CAMBIÓ LA PIEL. El contenido es el de Álvaro, tal cual estaba: el
// resumen ejecutivo, los plugins que se venden aparte, los 19 módulos con
// todas sus sub-funciones, los objetivos comerciales y los tres planes con
// sus precios. Está en `conceptoDatos.ts`, extraído del archivo viejo con un
// script y no a mano, justamente para no cambiarle una línea.
//
// Lo que se rehízo es cómo se ve: los mismos tokens, la misma tipografía y
// las mismas tarjetas que la portada nueva, en vez del look de la v1. Así el
// documento y la web se ven como la misma empresa.
//
// Dos detalles de forma que sí cambiaron, y por qué:
//  · El catálogo de módulos ahora son `<details>` nativos, abiertos por
//    defecto igual que antes. La versión vieja montaba un acordeón de Radix
//    con 17 items para algo que el navegador ya hace, y arrastraba esa
//    librería al chunk de una página pública.
//  · La ficha de videollamadas nombraba al proveedor que usamos. Eso no va
//    en una página pública (pedido explícito), así que dice "nuestro propio
//    servidor de video".

const CHIPS = [
  { Icono: Settings, texto: "19 módulos" },
  { Icono: Clock, texto: "Tiempo real" },
  { Icono: Brain, texto: "IA integrada" },
  { Icono: BookOpen, texto: "100% español" },
] as const;

const LINKS = [
  ["#modulos", "Módulos"],
  ["#marketing", "Marketing"],
  ["#pricing", "Pricing"],
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
            {LINKS.map(([href, texto]) => <a href={href} key={href}>{texto}</a>)}
          </div>
          <Link className="btn btn-fantasma" to="/">← Inicio</Link>
        </div>
      </nav>

      <section className="hero" style={{ paddingBottom: 56 }}>
        <div className="wrap">
          <span className="chip-vivo">Concept Document — Confidencial</span>
          <h1 style={{ maxWidth: "26ch" }}>
            La plataforma operativa para{" "}
            <span className="resalte">agencias de creadores</span>
          </h1>
          <p className="bajada">
            Maven centraliza gestión de creadores, ventas, HR, finanzas, comunicación y más en un
            solo ecosistema diseñado específicamente para la industria de creadores digitales.
          </p>
          <div className="gracias">
            {CHIPS.map(({ Icono, texto }) => (
              <span className="gracia" key={texto}>
                <Icono strokeWidth={2.2} aria-hidden="true" />
                {texto}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── Resumen ejecutivo ── */}
      <section className="bloque" id="resumen" style={{ borderTop: "1px solid var(--line)" }}>
        <div className="wrap">
          <div className="cabeza">
            <h2>Resumen ejecutivo</h2>
          </div>
          <div className="resumen">
            <p>
              <strong>Maven</strong> es un ecosistema SaaS diseñado exclusivamente para agencias
              que gestionan creadores de contenido digital. A diferencia de herramientas genéricas
              como Notion, Slack o hojas de cálculo, Maven integra todos los procesos operativos
              en una sola plataforma.
            </p>
            <p>
              Desde la prospección y cierre de nuevos creadores, pasando por la gestión diaria de
              contenido y ventas, hasta la nómina, facturación y recursos humanos del equipo —
              Maven elimina la fragmentación y reduce el tiempo operativo significativamente.
            </p>
            <p>
              La plataforma está construida con{" "}
              <strong>inteligencia artificial integrada</strong>, mensajería en tiempo real,
              videollamadas, y un sistema de permisos granular que permite a cada miembro del
              equipo ver exactamente lo que necesita.
            </p>
          </div>
        </div>
      </section>

      {/* ── Plugins ── */}
      <section className="bloque" id="plugins" style={{ background: "rgba(255,255,255,.014)", borderBlock: "1px solid var(--line)" }}>
        <div className="wrap">
          <div className="cabeza">
            <span className="eyebrow">
              <Plug width={12} height={12} strokeWidth={2.4} aria-hidden="true" style={{ marginRight: 2 }} />
              también vendidos por separado
            </span>
            <h2>Plugins disponibles.</h2>
            <p>
              Módulos que se integran a la plataforma o pueden adquirirse de forma independiente.
            </p>
          </div>

          <div className="mapa">
            {PLUGINS.map(({ icon: Icono, name, description }) => (
              <div className="area" key={name} style={{ "--tinte": "rgba(var(--violeta-rgb), .1)", "--borde": "rgba(var(--violeta-rgb), .4)" } as React.CSSProperties}>
                <div className="area-top">
                  <span className="ico" style={{ background: "rgba(var(--violeta-rgb), .16)" }}>
                    <Icono strokeWidth={2.2} stroke="var(--violeta)" aria-hidden="true" />
                  </span>
                  <h3>{name}</h3>
                </div>
                <p style={{ margin: "13px 0 0", fontSize: 13.5, lineHeight: 1.6, color: "var(--muted)" }}>
                  {description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── El catálogo de módulos ── */}
      <section className="bloque" id="modulos">
        <div className="wrap">
          <div className="cabeza">
            <span className="eyebrow">plataforma completa</span>
            <h2>19 módulos integrados.</h2>
            <p>
              Cada módulo está diseñado para resolver una necesidad específica de las agencias de
              creadores, con sub-funciones detalladas y flujos optimizados.
            </p>
          </div>

          <div className="catalogo">
            {MODULOS.map(({ icon: Icono, name, description, features }) => (
              <details className="mod" key={name} open>
                <summary>
                  <span className="ico"><Icono strokeWidth={2.2} aria-hidden="true" /></span>
                  <span className="quien">
                    <b>{name}</b>
                    <span>{description}</span>
                  </span>
                  <ChevronRight className="flechita" width={16} height={16} aria-hidden="true" />
                </summary>
                <ul>
                  {features.map((f) => (
                    <li key={f}>
                      <Check width={13} height={13} strokeWidth={3} aria-hidden="true" />
                      {f}
                    </li>
                  ))}
                </ul>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ── Objetivos de marketing ── */}
      <section className="bloque ia" id="marketing" style={{ borderTop: "1px solid var(--line)" }}>
        <div className="wrap">
          <div className="cabeza">
            <span className="eyebrow">estrategia comercial</span>
            <h2>Objetivos de marketing.</h2>
          </div>
          <div className="ia-grid">
            {OBJETIVOS.map(({ icon: Icono, title, description }) => (
              <div className="agente" key={title}>
                <span className="ico"><Icono strokeWidth={2.2} stroke="var(--violeta)" aria-hidden="true" /></span>
                <h3>{title}</h3>
                <p>{description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section className="bloque" id="pricing" style={{ background: "rgba(255,255,255,.014)", borderBlock: "1px solid var(--line)" }}>
        <div className="wrap">
          <div className="cabeza">
            <span className="eyebrow">planes y precios</span>
            <h2>Pricing para agencias.</h2>
            <p>Planes flexibles que crecen con tu agencia. Todos incluyen actualizaciones y soporte.</p>
          </div>

          <div className="planes">
            {PLANES.map((plan) => (
              <div className={`plan${plan.highlight ? " destacado" : ""}`} key={plan.name}>
                {plan.highlight ? (
                  <span className="etiqueta">
                    <Star width={10} height={10} fill="currentColor" aria-hidden="true" /> más popular
                  </span>
                ) : null}
                <h3>{plan.name}</h3>
                <p className="precio">
                  {plan.price}
                  {plan.period ? <span className="periodo">{plan.period}</span> : null}
                </p>
                <p className="para">{plan.description}</p>
                <ul>
                  {plan.features.map((f) => (
                    <li key={f}>
                      <Check width={13} height={13} strokeWidth={3} aria-hidden="true" />
                      {f}
                    </li>
                  ))}
                </ul>
                <Link className={`btn ${plan.highlight ? "btn-primario" : "btn-fantasma"}`} to="/#demo">
                  {plan.cta}
                  <ChevronRight width={15} height={15} aria-hidden="true" />
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Cierre ── */}
      <section className="cierre" id="cierre">
        <div className="wrap">
          <span className="tic-grande" style={{ margin: "0 auto 18px", position: "relative", background: "rgba(var(--azul-rgb), .14)", borderColor: "rgba(var(--azul-rgb), .4)" }}>
            <Zap width={24} height={24} strokeWidth={2.2} stroke="var(--azul-claro)" aria-hidden="true" />
          </span>
          <h2>¿Listo para transformar tu agencia?</h2>
          <p>
            Agenda una demo personalizada y descubre cómo Maven puede optimizar cada proceso de tu
            operación.
          </p>
          <div className="acciones">
            <Link className="btn btn-primario btn-lg" to="/#demo">Solicitar demo</Link>
            <Link className="btn btn-fantasma btn-lg" to="/">Volver al inicio</Link>
          </div>
        </div>
      </section>

      <footer>
        <div className="wrap foot" style={{ justifyContent: "center", textAlign: "center" }}>
          <span>
            © {new Date().getFullYear()} Maven — Documento de concepto. Todos los precios son
            referenciales y sujetos a cambios.
          </span>
        </div>
      </footer>
    </div>
  );
}
