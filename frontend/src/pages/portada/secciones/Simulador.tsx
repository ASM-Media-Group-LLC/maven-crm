import { Check, DollarSign, MessageSquareQuote, Send, Square } from "lucide-react";
import { Cara } from "../gente";

// EL SIMULADOR DE CONTRATACIÓN.
//
// Reconstruido de la pantalla real, que son CUATRO columnas: los criterios a
// la izquierda, las sesiones, el chat al centro con su fila de métricas, y la
// ficha del personaje a la derecha. La primera versión de esta maqueta tenía
// tres y le faltaban las métricas y la ficha — que es justo lo que hace
// creíble al simulador.
//
// Todo lo que se muestra es inventado: el personaje es ficticio y las tarifas
// y los límites salen como "definido por ti", porque en el producto los pone
// cada quien y no son un dato nuestro que se pueda publicar.

const CRITERIOS: [string, "si" | "pc" | "no"][] = [
  ["Detección de oportunidad de venta", "si"],
  ["Cierre o intento de venta", "si"],
  ["Conexión emocional real", "pc"],
  ["Personalización estratégica", "si"],
  ["Coherencia del personaje", "si"],
  ["Control del ritmo y escala", "pc"],
  ["Manejo de objeciones", "pc"],
  ["Ortografía y presentación", "no"],
  ["Tiempos de respuesta", "si"],
  ["Vuelve a la conversación tras la venta", "si"],
];

const SESIONES = [
  { seed: "martina", nombre: "Candidata 1", pie: "⏱ 7 d · apta" },
  { seed: "joaquin", nombre: "Candidato 2", pie: "⏱ en curso", on: true },
  { seed: "emilio", nombre: "Candidato 3", pie: "⏱ 12 d · no apto" },
  { seed: "sofia", nombre: "Candidata 4", pie: "sin empezar" },
] as const;

// Cuatro. El historial se ve en la lista de sesiones de la maqueta ("7 d · apta").
const PORQUES = [
  ["Se prueba antes de contratar", "El candidato atiende un chat que se comporta como el real, con objeciones, cambios de tema y pedidos fuera de límite. Lo que hace ahí es lo que va a hacer con un cliente."],
  ["La rúbrica la defines tú", "Los criterios son tuyos y se editan. La evaluación sale como aprobado, a criterio o no apto, con la cita textual de dónde se ganó o se perdió cada punto."],
  ["Sin tocar una cuenta real", "Todo pasa contra un perfil ficticio y un catálogo de prueba. Nadie le entrega una cuenta que factura a alguien que todavía no demostró nada."],
  ["También sirve para entrenar", "El mismo simulador se usa con el equipo que ya está adentro: se practica una objeción difícil sin arriesgar una venta de verdad."],
] as const;

const OPCION = (estado: "si" | "pc" | "no") => (
  <div className="ops">
    <span className={estado === "si" ? "si" : ""}>{estado === "si" ? "✓ Sí" : "Sí"}</span>
    <span className={estado === "pc" ? "pc" : ""}>{estado === "pc" ? "– Parc." : "Parc."}</span>
    <span className={estado === "no" ? "no" : ""}>{estado === "no" ? "✕ No" : "No"}</span>
  </div>
);

export default function Simulador() {
  return (
    <section
      className="bloque"
      id="simulador"
      style={{ background: "rgba(255,255,255,.014)", borderTop: "1px solid var(--line)" }}
    >
      <div className="wrap">
        <div className="cabeza">
          <span className="eyebrow">simulador de contratación</span>
          <h2>Ningún candidato entra a producción sin haber vendido antes.</h2>
          <p>
            Un simulador donde el postulante conversa con un perfil ficticio, con su personalidad,
            sus límites y su catálogo. Vende, o no vende. Y al final hay una evaluación con
            criterios, no una impresión.
          </p>
        </div>

        <div className="mock-ancho">
          <div className="marco">
            <div className="marco-barra">
              <span className="semaforo"><i /><i /><i /></span>
              <span className="tit">simulador · sesión de prueba</span>
              <span className="der" style={{ font: "400 10.5px/1 'JetBrains Mono',monospace", color: "var(--faint)" }}>
                18:42 en curso
              </span>
            </div>
            <div className="ev-top">
              <span>← Volver</span><span>Criterios</span><span>Info personaje</span>
              <span className="fan">fan: MiguelDL92</span>
            </div>

            <div className="ev">
              <div className="ev-criterios">
                <p className="rot">Criterios <span>↺ Reset</span></p>
                <p className="evaluando">Evaluando: sesión de prueba</p>
                <div className="ev-pct"><b>72%</b><span className="sello">A CRITERIO</span></div>
                <p className="ev-cuenta">6 cumple · 3 parcial · 1 no cumple · 10 total</p>

                {CRITERIOS.map(([texto, estado]) => (
                  <div className="ev-crit" key={texto}>
                    <p>{texto}</p>
                    {OPCION(estado)}
                  </div>
                ))}

                <div className="ev-enviar">➤ Enviar evaluación</div>
              </div>

              <div className="ev-sesiones">
                <div className="nueva">+ Nueva sesión</div>
                {SESIONES.map((s) => (
                  <div className={`ev-ses${"on" in s && s.on ? " on" : ""}`} key={s.nombre}>
                    <Cara seed={s.seed} />
                    <span className="q"><b>{s.nombre}</b><span>{s.pie}</span></span>
                  </div>
                ))}
              </div>

              <div className="ev-chat">
                <div className="ev-chat-cab">
                  <Cara seed="sofia" />
                  <span><b>Perfil ficticio</b><small>candidato: Candidato 2 ✎</small></span>
                  <span className="ev-metricas">
                    <div><span className="k">Tiempo</span><span className="v corriendo">18:42</span></div>
                    <div><span className="k">Msgs</span><span className="v">14</span></div>
                    <div><span className="k">WPM</span><span className="v">41</span></div>
                    <div><span className="k">Resp.</span><span className="v">22 s</span></div>
                  </span>
                  <span className="ev-stop">
                    <Square width={9} height={9} fill="#fff" stroke="none" aria-hidden="true" />
                  </span>
                </div>

                <div className="ev-cuerpo">
                  <span className="ev-b fan">holaa, vi tu último post 🔥 ¿tienes algo más de eso?</span>
                  <span className="ev-b cand">¡Hola! Sí, tengo un set completo de esa sesión 😏 ¿te lo muestro?</span>
                  <span className="ev-b fan">¿cuánto sale?</span>
                  <span className="ev-b cand">Te armo el pack de 12 fotos y 2 videos. Si lo tomas ahora te dejo el video largo de regalo 🎁</span>
                  <span className="ev-b fan">dale, va</span>
                  <span className="ev-venta">
                    <DollarSign width={11} height={11} strokeWidth={2.4} aria-hidden="true" />
                    venta cerrada en la simulación
                  </span>
                  <span className="ev-b cand">¡Listo! Te lo dejo desbloqueado 💕 ¿te gustó cómo quedó la luz en la tercera?</span>
                </div>

                <div className="ev-emojis">
                  😏 🔥 💦 🙈 ❤️ 😘 😍 🎁
                  <span className="az"><span>A−</span><span>A+</span></span>
                </div>
                <div className="ev-input">
                  Mensaje como MiguelDL92…
                  <Send width={12} height={12} strokeWidth={2.2} stroke="var(--azul)" style={{ marginLeft: "auto" }} aria-hidden="true" />
                </div>
                <div className="ev-iconos">
                  <span>📎</span><span>🖼</span><span>📄</span>
                  <span className="plata">$</span><span>🎙</span>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                    <MessageSquareQuote width={11} height={11} strokeWidth={2.2} aria-hidden="true" /> Scripts
                  </span>
                </div>
              </div>

              <div className="ev-personaje">
                <Cara seed="sofia" className="foto" />
                <h4>Perfil ficticio</h4>
                <div className="ev-tarj">
                  <span className="tit">🌎 Origen</span>
                  <span className="k">País</span><span className="v">Definido por ti</span>
                  <span className="k">Edad</span><span className="v">26 años</span>
                </div>
                <div className="ev-tarj">
                  <span className="tit">🪪 Identidad</span>
                  <span className="k">Cómo llamar al usuario</span><span className="v">Amor, baby</span>
                  <span className="k">Saludo inicial</span><span className="v">Hola amor / Hola baby</span>
                </div>
                <div className="ev-tarj rosa">
                  <span className="tit">🚫 Límites</span>
                  <span className="k">Qué no hace</span>
                  <span className="v">Lo que la creadora haya definido: el candidato tiene que respetarlo</span>
                  <span className="k">Colaboraciones</span><span className="v">Sí</span>
                </div>
                <div className="ev-tarj verde">
                  <span className="tit">💵 Servicios</span>
                  <span className="k">Videollamada</span><span className="v">$— definido por ti</span>
                  <span className="k">Personalizado</span><span className="v">$— definido por ti</span>
                </div>
                <div className="ev-tarj">
                  <span className="tit">💬 Tono</span>
                  <span className="k">Línea de comunicación</span>
                  <span className="v">Cercana, con emojis, sin apurar el precio</span>
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
          </div>
        </div>
      </div>
    </section>
  );
}
