import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { Check, Loader2, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Publico } from "../guiones";
import { INTERESES } from "../publico";
import { useLanguage } from "@/hooks/useLanguage";
import { type TranslationKey } from "@/lib/i18n";

// PEDIR UNA DEMO.
//
// Cierra la portada y es la única acción que le pedimos a quien entra. El
// pedido va a la edge function `demo-request`, que lo GUARDA en la base y
// después manda el correo: si el correo falla, el pedido no se pierde.
//
// Dos cosas del formulario que parecen de más y no lo son:
//  · El campo trampa (`web`), escondido fuera de la pantalla. Los bots
//    llenan todo lo que encuentran; una persona no lo ve. Está posicionado
//    lejos y no con `display:none`, que algunos bots ya detectan.
//  · El panel de gracias REEMPLAZA al formulario. Dejándolo a la vista, la
//    gente lo manda dos veces y llegan pedidos duplicados.
//
// Nada de pedir datos que no vamos a usar para responder: nombre y correo
// son los únicos obligatorios. Cada campo extra en un formulario de contacto
// es gente que lo abandona a mitad de camino.

// El valor que llega a ventas va siempre en español (así lo lee el equipo);
// lo que ve la persona sale del diccionario en su idioma.
const TAMANOS: [string, TranslationKey][] = [
  ["1 a 10 personas", "portada.demo.tamano1"],
  ["11 a 50", "portada.demo.tamano2"],
  ["51 a 200", "portada.demo.tamano3"],
  ["más de 200", "portada.demo.tamano4"],
];

/** El nombre de cada interés en el idioma de quien mira (el valor que se manda
 *  sigue siendo el de publico.tsx). */
const NOMBRE_INTERES: Record<string, TranslationKey> = {
  "Correo propio": "portada.interes.correo",
  "Messenger": "portada.interes.messenger",
  "Cowork y reuniones": "portada.interes.cowork",
  "Personas y nómina": "portada.interes.personas",
  "Ventas y pipeline": "portada.interes.ventas",
  "Tickets": "portada.interes.tickets",
  "Marca blanca": "portada.interes.marcaBlanca",
  "Promolog": "portada.interes.promolog",
  "Otras opciones de agencia": "portada.interes.otras",
  "Todo": "portada.interes.todo",
};

type Estado = "escribiendo" | "enviando" | "listo";

export default function PedirDemo({ publico }: { publico: Publico }) {
  const { t } = useLanguage();
  const [estado, setEstado] = useState<Estado>("escribiendo");
  const [error, setError] = useState<string | null>(null);
  const [interes, setInteres] = useState<string[]>([]);
  const opciones = INTERESES[publico];

  const alternar = (i: string) =>
    setInteres((prev) => (prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i]));

  // Si cambia el público cambian las opciones, y lo que había marcado puede
  // ya no existir. Se descartan las que no están en la lista nueva en vez de
  // mandar al correo un interés que la persona no ve en pantalla.
  useEffect(() => {
    setInteres((prev) => prev.filter((i) => INTERESES[publico].includes(i)));
  }, [publico]);

  const enviar = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (estado === "enviando") return;
    setError(null);
    setEstado("enviando");

    const f = new FormData(e.currentTarget);
    const { data, error: errFn } = await supabase.functions.invoke("demo-request", {
      body: {
        nombre: f.get("nombre"),
        empresa: f.get("empresa"),
        email: f.get("email"),
        telefono: f.get("telefono"),
        tamano_equipo: f.get("tamano_equipo"),
        mensaje: f.get("mensaje"),
        web: f.get("web"),
        interes,
        publico,
      },
    });

    // `invoke` trata cualquier respuesta que no sea 2xx como error, y el
    // motivo de verdad viene en el cuerpo. Sin leerlo, un "revisa el correo"
    // se le muestra a la persona como "Edge Function returned a non-2xx".
    const motivo =
      (data as { error?: string } | null)?.error ??
      (errFn ? await leerMotivo(errFn) : null);

    if (motivo) {
      setError(motivo);
      setEstado("escribiendo");
      return;
    }
    if (errFn) {
      setError(t("portada.demo.error"));
      setEstado("escribiendo");
      return;
    }
    setEstado("listo");
  };

  return (
    <section className="demo" id="demo">
      <div className="wrap demo-grid">
        <div>
          <span className="eyebrow">{t("portada.demo.etiqueta")}</span>
          <h2>{t("portada.demo.titulo")}</h2>
          <p className="bajada">{t("portada.demo.bajada")}</p>
          <div className="demo-listo">
            <div>
              <Check strokeWidth={3} aria-hidden="true" />
              <span>{t("portada.demo.listo1")}</span>
            </div>
            <div>
              <Check strokeWidth={3} aria-hidden="true" />
              <span>{t("portada.demo.listo2")}</span>
            </div>
            <div>
              <Check strokeWidth={3} aria-hidden="true" />
              <span>{t("portada.demo.listo3")}</span>
            </div>
          </div>
        </div>

        <div className="tarjeta-form">
          {estado === "listo" ? (
            <div className="gracias-panel">
              <span className="tic-grande">
                <Check strokeWidth={3} aria-hidden="true" />
              </span>
              <h3>{t("portada.demo.graciasTitulo")}</h3>
              <p>{t("portada.demo.graciasTexto")}</p>
            </div>
          ) : (
            <form onSubmit={enviar} noValidate>
              <div className="campos dos">
                <label className="campo">
                  <span>{t("portada.demo.nombre")} <em>*</em></span>
                  <input name="nombre" required maxLength={80} autoComplete="name" placeholder={t("portada.demo.nombrePh")} />
                </label>
                <label className="campo">
                  <span>{t("portada.demo.empresa")}</span>
                  <input name="empresa" maxLength={120} autoComplete="organization" placeholder={t("portada.demo.empresaPh")} />
                </label>
                <label className="campo">
                  <span>{t("portada.demo.correo")} <em>*</em></span>
                  <input name="email" type="email" required maxLength={160} autoComplete="email" placeholder={t("portada.demo.correoPh")} />
                </label>
                <label className="campo">
                  <span>{t("portada.demo.telefono")}</span>
                  <input name="telefono" maxLength={40} autoComplete="tel" placeholder={t("portada.demo.opcional")} />
                </label>
              </div>

              <div className="campos" style={{ marginTop: 14 }}>
                <label className="campo">
                  <span>{t("portada.demo.tamano")}</span>
                  <select name="tamano_equipo" defaultValue="">
                    <option value="">{t("portada.demo.elige")}</option>
                    {TAMANOS.map(([valor, clave]) => <option value={valor} key={valor}>{t(clave)}</option>)}
                  </select>
                </label>

                <div className="campo">
                  <span>{t("portada.demo.interes")}</span>
                  <div className="elige">
                    {opciones.map((i) => (
                      <button
                        type="button"
                        key={i}
                        aria-pressed={interes.includes(i)}
                        onClick={() => alternar(i)}
                      >
                        {NOMBRE_INTERES[i] ? t(NOMBRE_INTERES[i]) : i}
                      </button>
                    ))}
                  </div>
                </div>

                <label className="campo">
                  <span>{t("portada.demo.mensaje")}</span>
                  <textarea name="mensaje" maxLength={2000} placeholder={t("portada.demo.mensajePh")} />
                </label>
              </div>

              {/* Campo trampa. Ninguna persona lo ve ni lo tabula. */}
              <div className="trampa" aria-hidden="true">
                <label>
                  No llenar
                  <input name="web" tabIndex={-1} autoComplete="off" />
                </label>
              </div>

              <div className="form-pie">
                <button className="btn btn-primario btn-lg" type="submit" disabled={estado === "enviando"}>
                  {estado === "enviando"
                    ? <><Loader2 className="girando" width={16} height={16} aria-hidden="true" /> {t("portada.demo.enviando")}</>
                    : <><Send width={16} height={16} aria-hidden="true" /> {t("portada.demo.enviar")}</>}
                </button>
                <span className="nota">{t("portada.demo.nota")}</span>
              </div>
              <p className="form-priv">
                {t("portada.demo.privacidad")}{" "}
                <Link to="/privacidad">{t("portada.demo.avisoPrivacidad")}</Link>
              </p>

              {error ? <p className="form-error" role="alert">{error}</p> : null}
            </form>
          )}
        </div>
      </div>
    </section>
  );
}

/** El cuerpo del error de una edge function viene en `context`, que puede ser
 *  una Response (hay que leerla) o ya venir parseado según la versión del
 *  cliente. Se intenta lo uno y lo otro y, si no hay nada legible, se
 *  devuelve null para que el llamador ponga un mensaje genérico. */
async function leerMotivo(err: unknown): Promise<string | null> {
  const ctx = (err as { context?: unknown })?.context;
  if (!ctx) return null;
  try {
    if (ctx instanceof Response) {
      const j = await ctx.clone().json();
      return typeof j?.error === "string" ? j.error : null;
    }
    const j = ctx as { error?: string };
    return typeof j?.error === "string" ? j.error : null;
  } catch {
    return null;
  }
}
