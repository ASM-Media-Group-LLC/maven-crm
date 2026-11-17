import { useEffect, useRef, useState, type CSSProperties, type MouseEvent } from "react";
import { MarcaMaven } from "@/components/MarcaM";
import {
  ArrowRight, Check, CheckSquare, ChevronDown, Eye, FileText, HardDrive, Laptop, Mail, MessageSquare, Monitor, MonitorUp, UserCheck, Video,
  type LucideIcon,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useLanguage } from "@/hooks/useLanguage";
import { type TranslationKey } from "@/lib/i18n";
import { IDIOMAS, NOMBRE_IDIOMA, esIdioma, type Idioma } from "@/lib/idiomas";
import { BanderaIdioma } from "@/components/BanderaIdioma";
import "./portada.css";
import "./reinventada.css";

import PedirDemo from "./secciones/PedirDemo";

// LA PORTADA DE MAVEN · rutas públicas /en, /es, /de, /fr, /it, /pt (y `/`,
// que manda a la del idioma de quien entra). Todo el texto sale del
// diccionario (lib/i18n/portada.ts): se escribe en español e inglés y el
// traductor llena los otros cuatro.
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

type K = TranslationKey;

const PASOS: [K, K][] = [
  ["portada.paso1", "portada.paso1Texto"],
  ["portada.paso2", "portada.paso2Texto"],
  ["portada.paso3", "portada.paso3Texto"],
];

const FUNCIONES: { Icono: LucideIcon; nombre: K; texto: K }[] = [
  { Icono: Video, nombre: "portada.f.cowork", texto: "portada.f.coworkTexto" },
  { Icono: MonitorUp, nombre: "portada.f.reuniones", texto: "portada.f.reunionesTexto" },
  { Icono: Eye, nombre: "portada.f.argos", texto: "portada.f.argosTexto" },
  { Icono: MessageSquare, nombre: "portada.f.mensajeria", texto: "portada.f.mensajeriaTexto" },
  { Icono: Mail, nombre: "portada.f.correo", texto: "portada.f.correoTexto" },
  { Icono: FileText, nombre: "portada.f.documentos", texto: "portada.f.documentosTexto" },
  { Icono: CheckSquare, nombre: "portada.f.tareas", texto: "portada.f.tareasTexto" },
  { Icono: HardDrive, nombre: "portada.f.almacenamiento", texto: "portada.f.almacenamientoTexto" },
  { Icono: UserCheck, nombre: "portada.f.accesos", texto: "portada.f.accesosTexto" },
];

const EQUIPOS: K[] = [
  "portada.equipo.ventas", "portada.equipo.soporte", "portada.equipo.atencion", "portada.equipo.operaciones",
  "portada.equipo.diseno", "portada.equipo.agencias", "portada.equipo.otro",
];

type Plan = {
  id: "equipo" | "empresa" | "enterprise";
  nombre: K;
  /** Precio con su moneda (no se traduce) o la clave de «A la medida». */
  precio: string | { clave: K };
  conPeriodo?: boolean;
  tope: K;
  incluye: K[];
  boton: K;
  destacado?: boolean;
  /** Botón de contorno (el de «Contáctanos»), como el Enterprise de Lumina. */
  contacto?: boolean;
};

const PLANES: Plan[] = [
  {
    id: "equipo",
    nombre: "portada.plan.equipo",
    precio: "USD 299",
    conPeriodo: true,
    tope: "portada.plan.equipoTope",
    incluye: ["portada.plan.equipo1", "portada.plan.equipo2", "portada.plan.equipo3", "portada.plan.equipo4", "portada.plan.equipo5"],
    boton: "portada.cta.demo",
  },
  {
    id: "empresa",
    nombre: "portada.plan.empresa",
    precio: "USD 599",
    conPeriodo: true,
    tope: "portada.plan.empresaTope",
    incluye: ["portada.plan.empresa1", "portada.plan.empresa2", "portada.plan.empresa3", "portada.plan.empresa4", "portada.plan.empresa5"],
    boton: "portada.cta.demo",
    destacado: true,
  },
  {
    id: "enterprise",
    nombre: "portada.plan.enterprise",
    precio: { clave: "portada.precios.aLaMedida" },
    tope: "portada.plan.enterpriseTope",
    incluye: ["portada.plan.enterprise1", "portada.plan.enterprise2", "portada.plan.enterprise3", "portada.plan.enterprise4", "portada.plan.enterprise5"],
    boton: "portada.precios.contactanos",
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

/** El selector de idioma, como el de Lumina: una píldora con el código
 *  («ES ⌄») a la derecha de la barra y la lista con cada idioma escrito en su
 *  propio idioma. Cada idioma tiene su dirección (/en, /es…), así Google
 *  muestra la de quien busca. */
function SelectorIdioma() {
  const { t, language, setLanguage } = useLanguage();
  const ir = useNavigate();
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: PointerEvent) => {
      if (!caja.current?.contains(e.target as Node)) setAbierto(false);
    };
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAbierto(false);
    };
    document.addEventListener("pointerdown", fuera);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("pointerdown", fuera);
      document.removeEventListener("keydown", tecla);
    };
  }, [abierto]);
  const elegir = (lang: Idioma) => {
    setAbierto(false);
    if (lang === language) return;
    setLanguage(lang);
    ir(`/${lang}${window.location.hash}`);
  };
  return (
    <div className={`pr-idioma${abierto ? " abierto" : ""}`} ref={caja}>
      <button
        type="button"
        className="pr-idioma-btn"
        aria-haspopup="listbox"
        aria-expanded={abierto}
        aria-label={t("portada.idioma")}
        onClick={() => setAbierto((a) => !a)}
      >
        <BanderaIdioma idioma={language} className="pr-idioma-bandera" />
        <span className="pr-idioma-codigo">{language.toUpperCase()}</span>
        <ChevronDown aria-hidden="true" />
      </button>
      {abierto && (
        <ul className="pr-idioma-lista" role="listbox" aria-label={t("portada.idioma")}>
          {IDIOMAS.map((l) => (
            <li
              key={l}
              role="option"
              aria-selected={l === language}
              tabIndex={0}
              lang={l}
              onClick={() => elegir(l)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  elegir(l);
                }
              }}
            >
              <BanderaIdioma idioma={l} className="pr-idioma-bandera" />
              <span>{NOMBRE_IDIOMA[l]}</span>
              {l === language && <Check className="pr-idioma-hecho" aria-hidden="true" />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Le dice a Google que la portada existe en los 6 idiomas (hreflang). */
function useEnlacesDeIdioma(actual: Idioma) {
  useEffect(() => {
    const base = window.location.origin;
    const nodos = [
      ...IDIOMAS.map((l) => Object.assign(document.createElement("link"), { rel: "alternate", hreflang: l, href: `${base}/${l}` })),
      Object.assign(document.createElement("link"), { rel: "alternate", hreflang: "x-default", href: `${base}/en` }),
      Object.assign(document.createElement("link"), { rel: "canonical", href: `${base}/${actual}` }),
    ];
    nodos.forEach((n) => document.head.appendChild(n));
    return () => nodos.forEach((n) => n.remove());
  }, [actual]);
}

/** Dónde está la persona en cada toma del video (fracción del ancho, 0 a 1) y
 *  desde qué segundo la cámara va hacia ella. En una pantalla ancha el video se
 *  ve entero y esto no cambia nada; en el celular el video se recorta a una
 *  franja angosta del centro y, sin esto, en dos tomas quedaba un librero o una
 *  pared en vez de la persona. Así se ve como el de Lumina: siempre una cara.
 *  Los segundos son los del montaje (armar.sh): fundidos en 2,0 · 3,9 · 6,0 s. */
const FOCOS = [
  { desde: 0, x: 0.51, dura: 0 }, // la chica en la cocina
  { desde: 2.0, x: 0.49, dura: 0.5 }, // el chico de noche (durante el fundido)
  { desde: 3.9, x: 0.35, dura: 0.5 }, // el hombre en el loft
  { desde: 6.0, x: 0.37, dura: 0.5 }, // el tablero de Cowork en el monitor del dueño
  { desde: 7.6, x: 0.8, dura: 2.6 }, // paneo lento hasta el dueño, que mira a su equipo
] as const;

/** El video de fondo del inicio, como el de Lumina: un solo video ancho, a
 *  pantalla completa, que corre SIEMPRE (también con «reducir movimiento»,
 *  igual que Lumina: con esa opción del iPhone antes quedaba una foto fija y
 *  Alvaro veía el video «sin correr»).
 *
 *  OJO iPhone: Safari solo reproduce solo un video si `muted` está ESCRITO en
 *  la etiqueta (Lumina lo tiene en su HTML). React no escribe ese atributo —
 *  solo cambia la propiedad—, así que se escribe a mano y se le da play; si el
 *  teléfono igual lo frena (modo de bajo consumo), arranca con el primer toque
 *  en la página. */
function VideoDeFondo() {
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
    v.addEventListener("canplay", arrancar);

    // La cámara que sigue a la persona en pantallas angostas.
    let actual = -1;
    const enfocar = () => {
      const t = v.currentTime;
      let i = 0;
      for (let k = 0; k < FOCOS.length; k++) if (t >= FOCOS[k].desde) i = k;
      if (i === actual) return;
      const volvio = i < actual; // el video volvió a empezar: corte seco
      actual = i;
      const ancho = v.clientWidth;
      const alto = v.clientHeight;
      const proporcion = v.videoWidth && v.videoHeight ? v.videoWidth / v.videoHeight : 16 / 9;
      const visible = alto > 0 ? ancho / (alto * proporcion) : 1; // qué parte del ancho se ve
      if (visible >= 0.98) {
        v.style.transition = "";
        v.style.objectPosition = "";
        return;
      }
      const p = Math.min(1, Math.max(0, (FOCOS[i].x - visible / 2) / (1 - visible)));
      v.style.transition = volvio || FOCOS[i].dura === 0 ? "none" : `object-position ${FOCOS[i].dura}s ease-in-out`;
      v.style.objectPosition = `${(p * 100).toFixed(1)}% 50%`;
    };
    const alCambiarTamano = () => {
      actual = -1;
      enfocar();
    };
    enfocar();
    v.addEventListener("timeupdate", enfocar);
    v.addEventListener("loadedmetadata", alCambiarTamano);
    window.addEventListener("resize", alCambiarTamano);
    return () => {
      document.removeEventListener("touchstart", arrancar);
      v.removeEventListener("canplay", arrancar);
      v.removeEventListener("timeupdate", enfocar);
      v.removeEventListener("loadedmetadata", alCambiarTamano);
      window.removeEventListener("resize", alCambiarTamano);
    };
  }, []);
  return (
    <div className="pr-video" aria-hidden="true">
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
    </div>
  );
}

// La app de computador (desktop/): los instaladores los sube el CI
// (.github/workflows/app-escritorio.yml) al balde público `descargas`.
const DESCARGAS = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/descargas`;
const DESCARGA_MAC = `${DESCARGAS}/Maven-Mac.dmg`;
const DESCARGA_WINDOWS = `${DESCARGAS}/Maven-Windows.exe`;

function BajarApp() {
  const { t } = useLanguage();
  return (
    <div className="pr-bajar-app">
      <span>{t("portada.app.titulo")}</span>
      <div className="pr-bajar-app-botones">
        <a className="pr-btn pr-btn-fantasma" href={DESCARGA_MAC} download>
          <Laptop aria-hidden="true" /> {t("portada.app.mac")}
        </a>
        <a className="pr-btn pr-btn-fantasma" href={DESCARGA_WINDOWS} download>
          <Monitor aria-hidden="true" /> {t("portada.app.windows")}
        </a>
      </div>
    </div>
  );
}

export default function Portada({ idiomaDeRuta }: { idiomaDeRuta?: Idioma }) {
  const raiz = useRef<HTMLDivElement>(null);
  const { t, language, setLanguage } = useLanguage();

  // /de, /fr…: la dirección manda el idioma (y queda como el de esta persona).
  useEffect(() => {
    if (idiomaDeRuta && idiomaDeRuta !== language) setLanguage(idiomaDeRuta);
    // Solo cuando cambia la dirección.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idiomaDeRuta]);
  useEnlacesDeIdioma(idiomaDeRuta ?? language);
  // El formulario de demo queda guardado hasta que alguien lo pide: así la
  // página cierra limpia, como la de referencia, y no con un formulario largo.
  const [demoAbierta, setDemoAbierta] = useState(
    () => typeof window !== "undefined" && window.location.hash === "#demo",
  );

  useEffect(() => {
    document.title = t("portada.tituloDocumento");
  }, [t]);

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
          <nav className="pr-nav-links" aria-label={t("portada.nav.secciones")}>
            <a href="#como-funciona">{t("portada.nav.como")}</a>
            <a href="#empresas">{t("portada.nav.empresas")}</a>
            <a href="#precios">{t("portada.nav.precios")}</a>
          </nav>
          <div className="pr-nav-cta">
            <Link className="pr-btn pr-btn-fantasma" to="/login">{t("portada.nav.entrar")}</Link>
            <a className="pr-btn pr-btn-contorno-verde" href="#demo" onClick={abrirDemo}>{t("portada.cta.demo")}</a>
            <SelectorIdioma />
          </div>
        </div>
      </header>

      <section className="pr-hero">
        <VideoDeFondo />
        <div className="pr-caja">
          <h1>
            <span>{t("portada.hero.linea1")}</span>
            <span className="pr-linea-acento">{t("portada.hero.linea2")}</span>
          </h1>
          <p className="pr-bajada">{t("portada.hero.bajada")}</p>
          <div className="pr-hero-cta">
            <a className="pr-btn pr-btn-neon pr-btn-lg" href="#demo" onClick={abrirDemo}>
              {t("portada.cta.demo")} <ArrowRight aria-hidden="true" />
            </a>
            <a className="pr-btn pr-btn-fantasma pr-btn-lg" href="#como-funciona">{t("portada.hero.verComo")}</a>
          </div>
        </div>
      </section>

      <section className="pr-sec" id="como-funciona">
        <div className="pr-caja">
          <div className="pr-cabeza pr-aparece">
            <p className="pr-ceja">{t("portada.como.ceja")}</p>
            <h2>{t("portada.como.titulo")}</h2>
            <p>{t("portada.como.bajada")}</p>
          </div>
          <div className="pr-pasos">
            {PASOS.map(([titulo, texto], i) => (
              <article className="pr-tarjeta pr-paso pr-aparece" key={titulo}>
                <div className="pr-paso-num">{String(i + 1).padStart(2, "0")}</div>
                <h3>{t(titulo)}</h3>
                <p>{t(texto)}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="pr-sec" id="funciones">
        <div className="pr-caja">
          <div className="pr-cabeza pr-aparece">
            <p className="pr-ceja">{t("portada.funciones.ceja")}</p>
            <h2>{t("portada.funciones.titulo")}</h2>
          </div>
          <div className="pr-funciones">
            {FUNCIONES.map(({ Icono, nombre, texto }) => (
              <article className="pr-tarjeta pr-funcion pr-aparece" key={nombre}>
                <span className="pr-icono"><Icono strokeWidth={1.6} aria-hidden="true" /></span>
                <h3>{t(nombre)}</h3>
                <p>{t(texto)}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="pr-sec pr-equipos" id="empresas">
        <div className="pr-caja">
          <div className="pr-cabeza pr-aparece">
            <p className="pr-ceja">{t("portada.equipos.ceja")}</p>
            <h2>{t("portada.equipos.titulo")}</h2>
            <p>{t("portada.equipos.bajada")}</p>
          </div>
          <ul className="pr-chips pr-aparece">
            {EQUIPOS.map((e) => <li className="pr-chip" key={e}>{t(e)}</li>)}
          </ul>
        </div>
      </section>

      <section className="pr-sec" id="precios">
        <div className="pr-caja">
          <div className="pr-cabeza pr-aparece">
            <p className="pr-ceja">{t("portada.precios.ceja")}</p>
            <h2>{t("portada.precios.titulo")}</h2>
            <p>{t("portada.precios.bajada")}</p>
          </div>
          <div className="pr-precios">
            {PLANES.map((p) => (
              <article className={`pr-plan pr-aparece${p.destacado ? " destacado" : ""}`} key={p.id}>
                {p.destacado ? <span className="pr-plan-sello">{t("portada.precios.recomendado")}</span> : null}
                <h3 className="pr-plan-nombre">{t(p.nombre)}</h3>
                <p className="pr-plan-precio">
                  {typeof p.precio === "string" ? p.precio : t(p.precio.clave)}
                  {p.conPeriodo ? <small> {t("portada.precios.periodo")}</small> : null}
                </p>
                <p className="pr-plan-tope">{t(p.tope)}</p>
                <ul>
                  {p.incluye.map((linea) => <li key={linea}>{t(linea)}</li>)}
                </ul>
                <a
                  className={`pr-btn ${p.contacto ? "pr-btn-fantasma" : "pr-btn-neon"}`}
                  href="#demo"
                  onClick={abrirDemo}
                >
                  {t(p.boton)}
                </a>
              </article>
            ))}
          </div>
          <p className="pr-precios-nota">
            {t("portada.precios.nota")}{" "}
            <b>{t("portada.precios.notaInstalacion")}</b>
          </p>
        </div>
      </section>

      <section className="pr-sec pr-cierre">
        <div className="pr-caja pr-aparece">
          <h2>{t("portada.cierre.titulo")} <em>{t("portada.cierre.tituloAcento")}</em></h2>
          <p>{t("portada.cierre.bajada")}</p>
          {demoAbierta ? null : (
            <a className="pr-btn pr-btn-neon pr-btn-lg" href="#demo" onClick={abrirDemo}>{t("portada.cta.demo")}</a>
          )}
          <BajarApp />
        </div>
      </section>

      {demoAbierta ? <PedirDemo publico="empresas" /> : null}

      <footer className="pr-pie">
        <div className="pr-caja pr-pie-in">
          <div className="pr-pie-marca">
            <Marca chico />
            <span className="pr-pie-lema">{t("portada.pie.lema")}</span>
          </div>
          <nav className="pr-pie-links" aria-label={t("portada.pie.enlaces")}>
            <Link to="/login">{t("portada.nav.entrar")}</Link>
            <a href="#demo" onClick={abrirDemo}>{t("portada.cta.demo")}</a>
            <a href={DESCARGA_MAC} download>{t("portada.app.mac")}</a>
            <a href={DESCARGA_WINDOWS} download>{t("portada.app.windows")}</a>
            <Link to="/privacidad">{t("portada.pie.privacidad")}</Link>
          </nav>
          <span className="pr-pie-copia">© {new Date().getFullYear()} Maven</span>
        </div>
      </footer>
    </div>
  );
}
