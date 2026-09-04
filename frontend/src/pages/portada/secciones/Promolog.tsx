import { Check, Instagram, Sparkles } from "lucide-react";
import { Cara } from "../gente";

// PROMOLOG · sección de AGENCIA.
//
// Es la pieza que no existe en ninguna suite de oficina y la que hace que una
// agencia entienda para qué es Maven: saber si cada cuenta publicó, con la
// evidencia leída por un agente, y cuánto entró alrededor de esa publicación.
//
// La maqueta son las DOS pantallas que se venden juntas: el calendario del
// mes y la ficha de una entrada. Todo inventado —la creadora, el handle, los
// importes— y la franja de la ventana lo dice, porque un calendario con plata
// se lee como real. Nada de fotos: las historias van como degradados.

/** Un mes de ejemplo. `si` = promocionó, `no` = no promocionó, null = fuera
 *  del mes. `pct` es lo que llena la barrita (calidad de la publicación). */
type Dia = { n: number; si?: boolean; plata?: number; pct?: number; ratio?: string; top?: boolean; fuera?: boolean };

const DIAS: Dia[] = [
  { n: 27, fuera: true }, { n: 28, fuera: true }, { n: 29, fuera: true }, { n: 30, fuera: true }, { n: 31, fuera: true },
  { n: 1, si: true, plata: 54, pct: 82, ratio: "3/20", top: true },
  { n: 2, si: true, plata: 35, pct: 64, ratio: "2/16" },

  { n: 3, si: true, plata: 74, pct: 71, ratio: "2/23", top: true },
  { n: 4, si: true, plata: 13, pct: 48, ratio: "2/10" },
  { n: 5, si: true, plata: 22, pct: 55, ratio: "1/16" },
  { n: 6, si: false, plata: 26, pct: 12, ratio: "0/2" },
  { n: 7, si: true, plata: 26, pct: 44, ratio: "1/17" },
  { n: 8, si: true, plata: 32, pct: 60, ratio: "1/11" },
  { n: 9, si: true, plata: 6, pct: 22, ratio: "1/14" },

  { n: 10, si: false, plata: 12, pct: 8, ratio: "0/1" },
  { n: 11, si: true, plata: 18, pct: 88, ratio: "3/23" },
  { n: 12, si: true, plata: 63, pct: 76, ratio: "2/9", top: true },
  { n: 13, si: false, plata: 28, pct: 10, ratio: "0/4" },
  { n: 14, si: true, plata: 32, pct: 40, ratio: "1/17" },
  { n: 15, si: false, plata: 0, pct: 6, ratio: "0/3" },
  { n: 16, si: true, plata: 35, pct: 52, ratio: "1/11" },

  { n: 17, si: true, plata: 6, pct: 34, ratio: "1/12" },
  { n: 18, si: true, plata: 15, pct: 26, ratio: "1/8" },
  { n: 19, si: false, plata: 16, pct: 9, ratio: "0/10" },
  { n: 20, si: false, plata: 9, pct: 7, ratio: "0/6" },
  { n: 21, si: true, plata: 33, pct: 68, ratio: "2/11" },
  { n: 22, si: true, plata: 8, pct: 58, ratio: "2/10" },
  { n: 23, si: true, plata: 29, pct: 62, ratio: "1/15" },

  { n: 24, si: true, plata: 23, pct: 56, ratio: "1/9" },
  { n: 25, si: true, plata: 29, pct: 50, ratio: "1/12" },
  { n: 26, si: true, plata: 92, pct: 74, ratio: "1/9", top: true },
  { n: 27, si: false, plata: 18, pct: 11, ratio: "0/2" },
  { n: 28, si: false, plata: 22, pct: 9, ratio: "0/2" },
  { n: 29, si: true, plata: 29, pct: 66, ratio: "2/14" },
  { n: 30, si: true, plata: 3, pct: 30, ratio: "1/10" },

  { n: 31, si: true, plata: 52, pct: 70, ratio: "1/5", top: true },
];

const HISTORIAS = [
  { ok: true, verdicto: "Muestra a la creadora con el enlace y un llamado a la acción claro." },
  { ok: false, verdicto: "Sin enlace, sin sticker y sin mención: no cuenta como promoción." },
  { ok: true, verdicto: "Menciona la plataforma y deja el enlace fijado arriba." },
];

const PORQUES = [
  ["Lo lee un agente, no una planilla", "Cada historia se revisa sola: si hay enlace, mención o llamado a la acción, queda marcada como promoción — y si no, también, con el motivo escrito."],
  ["El dinero al lado de la publicación", "Lo que entró el día de la promoción y los días de alrededor, en la misma ficha. Ahí se ve si la publicación movió algo o solo llenó una casilla."],
  ["El mes completo de un vistazo", "Quién publicó cada día, los mejores días del mes y el porcentaje de calidad — sin abrir una cuenta por una."],
  ["La evidencia queda guardada", "La captura de cada historia se archiva con su veredicto. Seis meses después se puede mostrar por qué se dijo que sí o que no."],
  ["Si alguien deja de publicar, alguien se entera", "El responsable recibe el aviso el mismo día, sin que nadie tenga que ir a revisar cuenta por cuenta."],
  ["Y se puede corregir a mano", "Si el agente se equivocó, una persona dice sí o no y queda registrado quién lo cambió."],
] as const;

const color = (pct: number) => (pct >= 65 ? "var(--verde)" : pct >= 30 ? "var(--ambar)" : "var(--rosa)");

export default function Promolog() {
  return (
    <section
      className="bloque"
      id="promolog"
      style={{ background: "rgba(255,255,255,.014)", borderTop: "1px solid var(--line)" }}
    >
      <div className="wrap">
        <div className="cabeza">
          <span className="eyebrow">promolog</span>
          <h2>Sabes si publicó, cuándo, y cuánto entró después.</h2>
          <p>
            El seguimiento de promoción que ninguna suite de oficina te va a dar: un agente
            revisa las historias de cada cuenta, decide si hubo promoción y lo deja anotado con
            la captura. Al lado, los ingresos de ese día y de los de alrededor.
          </p>
        </div>

        <div className="mock-ancho">
          <div className="marco">
            <div className="marco-barra">
              <span className="semaforo"><i /><i /><i /></span>
              <span className="tit">promolog · seguimiento diario</span>
              <span className="der" style={{ font: "400 10.5px/1 'JetBrains Mono',monospace", color: "var(--faint)" }}>
                datos de ejemplo
              </span>
            </div>

            <div className="pl">
              <div className="pl-izq">
                <div className="pl-tabs">
                  <span>Dashboard</span>
                  <span>Promos</span>
                  <span className="on">Calendario</span>
                  <span>Agentes</span>
                  <span>Automático</span>
                  <span>Vincular ingresos</span>
                </div>

                <div className="pl-quien">
                  <Cara seed="valentina" />
                  <span>
                    <b>Cuenta de ejemplo</b>
                    <small>62% calidad · 17 promocionó · 6 no · 0 sin análisis</small>
                  </span>
                  <span className="mes">agosto ▾</span>
                </div>

                <div className="pl-sem">
                  {["LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB", "DOM"].map((d) => <span key={d}>{d}</span>)}
                </div>

                <div className="pl-cal">
                  {DIAS.map((d, i) => (
                    <div
                      key={`${d.n}-${i}`}
                      className={`pl-dia${d.fuera ? " fuera" : d.si ? " si" : " no"}${d.top ? " top" : ""}`}
                    >
                      <span className="n">{d.n}</span>
                      {!d.fuera ? (
                        <>
                          <span className="plata">${d.plata}</span>
                          <span className="tick">{d.si ? "✅" : "⛔"}</span>
                          <span className="barra">
                            <i style={{ width: `${d.pct}%`, background: color(d.pct ?? 0) }} />
                          </span>
                          <span className="ratio">{d.ratio}</span>
                        </>
                      ) : null}
                    </div>
                  ))}
                </div>

                <div className="pl-leyenda">
                  <span><i style={{ background: "var(--verde)" }} /> promocionó</span>
                  <span><i style={{ background: "var(--red)" }} /> no promocionó</span>
                  <span><i style={{ background: "var(--faint)" }} /> sin análisis</span>
                  <span>🔥 mejores días del mes</span>
                </div>
              </div>

              <div className="pl-ficha">
                <div className="cab">
                  <Cara seed="valentina" />
                  <span>
                    <b>Cuenta de ejemplo</b>{" "}
                    <span>@cuenta_de_ejemplo</span>
                  </span>
                </div>

                <div className="pl-datos">
                  <div>Red social <b>Instagram</b></div>
                  <div>Plataforma destino <b>La que definas</b></div>
                  <div>Resultado <b className="si">Sí</b></div>
                  <div>Detectado por <b>Agente</b></div>
                  <div>Fecha <b>12 de agosto</b></div>
                  <div>Hora <b>19:57</b></div>
                </div>

                <div className="pl-plata">
                  <p className="rot" style={{ margin: 0 }}>Ingresos alrededor de la promoción</p>
                  <div className="dias">
                    <div className="pl-dchip"><small>11 ago</small><b>$18</b></div>
                    <div className="pl-dchip promo"><small>12 ago · promo</small><b>$63</b></div>
                    <div className="pl-dchip"><small>13 ago</small><b>$28</b></div>
                    <div className="pl-dchip"><small>14 ago</small><b>$32</b></div>
                    <div className="pl-dchip"><small>15 ago</small><b>$0</b></div>
                  </div>
                  <div className="desglose">
                    <span>Suscripciones $3</span>
                    <span>Mensajes $25</span>
                  </div>
                </div>

                <p className="pl-notas">
                  Nota del agente: subió tres historias seguidas con el enlace y una mención de la
                  plataforma. La cuarta no lleva nada.
                </p>

                <div className="pl-ev">
                  <p className="rot" style={{ margin: 0 }}>
                    <Instagram width={11} height={11} strokeWidth={2.2} aria-hidden="true" />
                    Evidencia · 3 historias
                    <span className="promociono">promocionó</span>
                  </p>
                  <div className="pl-historias">
                    {HISTORIAS.map((h, i) => (
                      <div className="pl-historia" key={i}>
                        <div className="foto">
                          <b>#{i + 1}</b>
                          <em>100%</em>
                        </div>
                        <div className="sino">
                          <span className={h.ok ? "si" : ""}>✓ Sí</span>
                          <span className={h.ok ? "" : "no"}>✕ No</span>
                        </div>
                        <p>{h.verdicto}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="porques">
            {PORQUES.map(([titulo, detalle]) => (
              <div className="porque" key={titulo}>
                <span className="tic" style={{ background: "rgba(var(--violeta-rgb), .16)" }}>
                  <Check width={13} height={13} strokeWidth={3} stroke="var(--violeta)" aria-hidden="true" />
                </span>
                <span><b>{titulo}</b><span>{detalle}</span></span>
              </div>
            ))}
            <div className="porque">
              <span className="tic" style={{ background: "rgba(var(--violeta-rgb), .16)" }}>
                <Sparkles width={13} height={13} strokeWidth={3} stroke="var(--violeta)" aria-hidden="true" />
              </span>
              <span>
                <b>Y arma el ranking solo</b>
                <span>
                  Con lo publicado y lo que entró, cada cuenta recibe un puntaje del mes y cada
                  responsable su resumen — sin que nadie sume nada a mano.
                </span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
