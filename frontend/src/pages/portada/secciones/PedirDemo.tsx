import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { Check, Loader2, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Publico } from "../guiones";
import { INTERESES } from "../publico";

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

const TAMANOS = ["1 a 10 personas", "11 a 50", "51 a 200", "más de 200"];

type Estado = "escribiendo" | "enviando" | "listo";

export default function PedirDemo({ publico }: { publico: Publico }) {
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
      setError("No pudimos enviar el pedido. Intenta de nuevo en un momento.");
      setEstado("escribiendo");
      return;
    }
    setEstado("listo");
  };

  return (
    <section className="demo" id="demo">
      <div className="wrap demo-grid">
        <div>
          <span className="eyebrow">pedir una demo</span>
          <h2>Deja de operar en catorce pestañas.</h2>
          <p className="bajada">
            Maven nació dentro de una empresa que factura todos los días, no en una sala de
            reuniones. Cuéntanos qué usas hoy y te mostramos qué se reemplaza con qué.
          </p>
          <div className="demo-listo">
            <div>
              <Check strokeWidth={3} aria-hidden="true" />
              <span>Te contestamos por correo, sin llamadas de venta que no pediste.</span>
            </div>
            <div>
              <Check strokeWidth={3} aria-hidden="true" />
              <span>La demo se da sobre datos de prueba: no hace falta traer nada.</span>
            </div>
            <div>
              <Check strokeWidth={3} aria-hidden="true" />
              <span>Sin instalar programas — todo pasa en el navegador.</span>
            </div>
          </div>
        </div>

        <div className="tarjeta-form">
          {estado === "listo" ? (
            <div className="gracias-panel">
              <span className="tic-grande">
                <Check strokeWidth={3} aria-hidden="true" />
              </span>
              <h3>Pedido recibido</h3>
              <p>
                Te escribimos al correo que dejaste. Si es urgente, responde ese mismo correo y
                nos llega directo.
              </p>
            </div>
          ) : (
            <form onSubmit={enviar} noValidate>
              <div className="campos dos">
                <label className="campo">
                  <span>Nombre <em>*</em></span>
                  <input name="nombre" required maxLength={80} autoComplete="name" placeholder="Tu nombre" />
                </label>
                <label className="campo">
                  <span>Empresa</span>
                  <input name="empresa" maxLength={120} autoComplete="organization" placeholder="Nombre de la empresa" />
                </label>
                <label className="campo">
                  <span>Correo de trabajo <em>*</em></span>
                  <input name="email" type="email" required maxLength={160} autoComplete="email" placeholder="tu@empresa.com" />
                </label>
                <label className="campo">
                  <span>Teléfono</span>
                  <input name="telefono" maxLength={40} autoComplete="tel" placeholder="Opcional" />
                </label>
              </div>

              <div className="campos" style={{ marginTop: 14 }}>
                <label className="campo">
                  <span>Tamaño del equipo</span>
                  <select name="tamano_equipo" defaultValue="">
                    <option value="">Elige una opción</option>
                    {TAMANOS.map((t) => <option value={t} key={t}>{t}</option>)}
                  </select>
                </label>

                <div className="campo">
                  <span>Qué te interesa</span>
                  <div className="elige">
                    {opciones.map((i) => (
                      <button
                        type="button"
                        key={i}
                        aria-pressed={interes.includes(i)}
                        onClick={() => alternar(i)}
                      >
                        {i}
                      </button>
                    ))}
                  </div>
                </div>

                <label className="campo">
                  <span>Cuéntanos algo más</span>
                  <textarea name="mensaje" maxLength={2000} placeholder="Qué usas hoy, qué te está costando, cuánta gente lo va a usar…" />
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
                    ? <><Loader2 className="girando" width={16} height={16} aria-hidden="true" /> Enviando…</>
                    : <><Send width={16} height={16} aria-hidden="true" /> Pedir la demo</>}
                </button>
                <span className="nota">Te contestamos al correo. Nada más.</span>
              </div>
              <p className="form-priv">
                Al enviar aceptas que usemos estos datos solo para contestarte. No los
                compartimos ni te suscribimos a nada.{" "}
                <Link to="/privacidad">Aviso de privacidad</Link>
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
