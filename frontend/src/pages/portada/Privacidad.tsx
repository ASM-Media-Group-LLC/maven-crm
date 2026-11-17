import { useEffect } from "react";
import { MarcaMaven } from "@/components/MarcaM";
import { Link } from "react-router-dom";
import "./portada.css";
import { SKINS, tokensDe } from "./skins";

// Aviso de privacidad de la portada. Es la única página pública además de la
// portada, así que va con su misma piel (tokens de `.pt`) y en oscuro fijo.
// El texto habla solo del formulario de demo, que es lo único que recoge datos
// de alguien que todavía no es cliente.
export default function Privacidad() {
  useEffect(() => {
    document.title = "Aviso de privacidad — Maven";
  }, []);

  return (
    <div className="pt" style={tokensDe(SKINS[0])} data-skin={SKINS[0].id}>
      <nav className="nav pegado">
        <div className="wrap nav-in">
          <Link to="/" className="marca" style={{ textDecoration: "none", color: "inherit" }}>
            <MarcaMaven />
          </Link>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <Link className="btn btn-fantasma" to="/">Volver a la portada</Link>
          </div>
        </div>
      </nav>

      <section className="bloque">
        <div className="wrap">
          <div className="cabeza">
            <div className="eyebrow">Aviso de privacidad</div>
            <h2>Qué hacemos con lo que nos cuentas.</h2>
            <p>
              Lo único que recogemos de alguien que todavía no es cliente es el formulario para
              pedir una demo. Esto es lo que pasa con esos datos.
            </p>
          </div>

          <div className="legal">
            <h3>Qué datos pedimos</h3>
            <p>
              Tu nombre y un correo de trabajo. La empresa, el teléfono, el tamaño del equipo y lo
              que te interesa son opcionales: nos ayudan a preparar la demo, pero puedes dejarlos
              vacíos.
            </p>

            <h3>Para qué los usamos</h3>
            <p>
              Solo para contestarte y coordinar la demo que pediste. No te suscribimos a ningún
              boletín, no te llamamos si no lo pediste y no usamos tus datos para publicidad.
            </p>

            <h3>Con quién los compartimos</h3>
            <p>
              Con nadie. Los guardamos en nuestros propios servidores y el correo con el que te
              contestamos sale de nuestro dominio. No los vendemos, no los cedemos ni los cruzamos
              con otras bases.
            </p>

            <h3>Cuánto tiempo los guardamos</h3>
            <p>
              Mientras dure la conversación sobre la demo. Si no seguimos adelante, los borramos;
              si te conviertes en cliente, pasan a regirse por el contrato que firmemos.
            </p>

            <h3>Tus derechos</h3>
            <p>
              Puedes pedirnos en cualquier momento ver, corregir o borrar lo que tenemos tuyo.
              Escríbenos a{" "}
              <a href="mailto:alvaro@maven-ai.me">alvaro@maven-ai.me</a> y lo resolvemos
              en el acto.
            </p>

            <h3>Cookies y rastreo</h3>
            <p>
              La portada no usa cookies de seguimiento ni herramientas de analítica de terceros. Lo
              único que se guarda en tu navegador es lo necesario para que la sesión de Maven
              funcione una vez que entras con tu cuenta.
            </p>

            <h3>Quién responde por esto</h3>
            <p>
              Maven, a través de{" "}
              <a href="mailto:alvaro@maven-ai.me">alvaro@maven-ai.me</a>. Es la misma
              persona que te contesta la demo.
            </p>

            <p className="legal-fecha">Última actualización: septiembre de 2026.</p>
          </div>
        </div>
      </section>

      <footer>
        <div className="wrap foot">
          <div className="foot-marca">
            <span>Maven · Correo, chat, oficina virtual y operación, en una sola sesión.</span>
          </div>
          <nav className="foot-links" aria-label="Enlaces del pie">
            <Link to="/">Portada</Link>
            <Link to="/login">Entrar</Link>
            <a href="mailto:alvaro@maven-ai.me">Contacto</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
