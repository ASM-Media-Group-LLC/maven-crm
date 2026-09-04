import { Bot, Check, Headphones, Search, ShieldCheck, Sparkles, Video, X } from "lucide-react";
import { Cara, Pila } from "../gente";

// LA CAPA DE IA.
//
// Seis tarjetas con el mismo ícono violeta no decían nada. Lo que la IA hace,
// lo hace SOBRE personas: a quién le avisa, a quién le puso nota, a quién se
// le fue la cámara. Así que cada tarjeta muestra una escena con caras — el
// mismo muñequito de la app — y el ícono queda como etiqueta del tipo de
// agente, no como toda la ilustración.

/** Una persona con su número: nota, puntaje o calificación. */
function Persona({ seed, nombre, num, tono }: { seed: Parameters<typeof Cara>[0]["seed"]; nombre: string; num: string; tono: "alto" | "medio" }) {
  return (
    <div className="ag-persona">
      <Cara seed={seed} />
      <span className="nom">{nombre}</span>
      <span className={`num ${tono}`}>{num}</span>
    </div>
  );
}

const AGENTES = [
  {
    Icono: Bot,
    titulo: "Agentes que acompañan al equipo",
    texto: "Un agente por grupo, con su tono y su rol: pide avances, responde con lo que ya funcionó antes en tu propia operación, y escala al supervisor cuando algo se sale de cauce.",
    dato: "un agente por equipo",
    escena: (
      <div className="ag-equipo">
        <span className="bot"><Bot aria-hidden="true" /></span>
        <span className="flecha-mini" aria-hidden="true">→</span>
        <Pila cuantas={4} />
      </div>
    ),
  },
  {
    Icono: Headphones,
    titulo: "Calidad de conversaciones y llamadas",
    texto: "Las conversaciones y las llamadas se transcriben y se puntúan contra una rúbrica que defines. El feedback llega con el ejemplo textual de lo que estuvo bien y lo que no.",
    dato: "rúbrica configurable",
    escena: (
      <>
        <Persona seed="martina" nombre="Llamada de ayer" num="8.4" tono="alto" />
        <Persona seed="emilio" nombre="Chat del turno" num="6.2" tono="medio" />
      </>
    ),
  },
  {
    Icono: Sparkles,
    titulo: "La nota diaria, explicada",
    texto: "Cada persona recibe una nota del 1 al 10 armada con el objetivo de su rol, sus horas, su actividad y su resultado — y, sobre todo, con el desglose de por qué. Una nota que no se puede explicar es una nota en la que nadie confía.",
    dato: "por rol, todos los días",
    escena: (
      <>
        <Persona seed="valentina" nombre="Valentina" num="9.1" tono="alto" />
        <Persona seed="joaquin" nombre="Joaquín" num="7.4" tono="medio" />
      </>
    ),
  },
  {
    Icono: Video,
    titulo: "Supervisión de cámara y audio",
    texto: "En las salas de trabajo, un detector avisa cuando alguien quedó fuera de encuadre y una puerta de ruido con supresión neuronal limpia el audio antes de que salga.",
    dato: "en el navegador, sin instalar nada",
    escena: (
      <div className="ag-camaras">
        <div className="ag-cam ok">
          <Cara seed="luciana" />
          <span className="marca">encuadre ok</span>
        </div>
        <div className="ag-cam fuera">
          <Cara seed="andres" style={{ transform: "translate(26%, 14%)" }} />
          <span className="marca">fuera de encuadre</span>
        </div>
      </div>
    ),
  },
  {
    Icono: ShieldCheck,
    titulo: "Verificación de lo que se acordó",
    texto: "Lo que se prometió se revisa contra la evidencia, no contra la memoria de nadie. Con eso un objetivo deja de ser una charla y pasa a ser un número que se puede discutir.",
    dato: "resultado binario y auditable",
    escena: (
      <>
        <div className="ag-linea">
          <Cara seed="camilo" />
          <span>Lo de ayer</span>
          <span className="estado si"><Check aria-hidden="true" /> cumplido</span>
        </div>
        <div className="ag-linea">
          <Cara seed="sofia" />
          <span>Hace tres días</span>
          <span className="estado no"><X aria-hidden="true" /> sin avance</span>
        </div>
      </>
    ),
  },
  {
    Icono: Search,
    titulo: "Búsqueda y calificación asistida",
    texto: "Prospección con calificación automática, detección de cuentas restringidas y verificación de que el contacto siga vivo antes de que alguien pierda una hora.",
    dato: "antes de la primera llamada",
    escena: (
      <>
        <Persona seed="joaquin" nombre="Contacto nuevo" num="82" tono="alto" />
        <Persona seed="emilio" nombre="Contacto nuevo" num="41" tono="medio" />
      </>
    ),
  },
] as const;

export default function CapaDeIA() {
  return (
    <section className="bloque ia" id="ia" style={{ borderTop: "1px solid var(--line)" }}>
      <div className="wrap">
        <div className="cabeza">
          <span className="eyebrow">la capa de ia</span>
          <h2>No es un chat pegado al costado. Es quien hace la supervisión.</h2>
          <p>
            La mayoría de las plataformas agregaron un asistente que responde preguntas. Acá la
            IA hace el trabajo que antes ocupaba a una persona entera: leer, verificar,
            calificar y avisar.
          </p>
        </div>

        <div className="ia-grid">
          {AGENTES.map(({ Icono, titulo, texto, dato, escena }) => (
            <div className="agente" key={titulo}>
              <span className="ico"><Icono strokeWidth={2.2} stroke="var(--violeta)" aria-hidden="true" /></span>
              <h3>{titulo}</h3>
              <p>{texto}</p>
              <div className="escena">{escena}</div>
              <span className="dato">{dato}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
