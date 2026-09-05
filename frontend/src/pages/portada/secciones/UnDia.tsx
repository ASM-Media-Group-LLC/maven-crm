import { GENTE, Cara } from "../gente";

// UN DÍA DE TRABAJO.
//
// La estructura por horas es información, no adorno: son los momentos en los
// que la plataforma hace algo por su cuenta. Si algún día deja de ser una
// secuencia real, hay que sacarle las horas — numerar por numerar es la clase
// de decoración que se nota.

// Cinco paradas, no ocho: 11:00 se pisaba con 09:15 y 17:00 con la nota de las 19:00, y la
// limpieza de las 02:00 es mantenimiento. Con ocho la sección medía 1.850px sola.
const TRAMOS = [
  {
    hora: "07:00",
    titulo: "Apertura del día",
    texto: "Cada equipo recibe en su grupo lo que hay que mirar hoy: quién está de turno, quién descansa y qué quedó abierto de ayer.",
    quien: "Agentes de mensajería",
  },
  {
    hora: "09:15",
    titulo: "Verificación de lo acordado",
    texto: "La plataforma revisa si lo que se comprometió ayer se hizo, y avisa a quien corresponde cuando algo lleva días sin moverse. El resultado es binario y auditable.",
    quien: "Seguimiento automático",
  },
  {
    hora: "14:30",
    titulo: "Oficina virtual",
    texto: "El equipo entra a las salas. Un detector avisa si alguien quedó fuera de cámara, la cancelación de ruido limpia el audio y el supervisor ve todas las salas a la vez.",
    quien: "Cowork · servidor propio",
    caras: true,
  },
  {
    hora: "19:00",
    titulo: "La nota del día",
    texto: "El cierre calcula una nota del 1 al 10 por persona con el objetivo de su rol, sus horas, su actividad y su resultado. La publica con el desglose de por qué le salió eso.",
    quien: "Cierre diario",
  },
  {
    hora: "23:40",
    titulo: "Conciliación de los números",
    texto: "Los puentes con las plataformas externas traen los datos del día y los reparten por responsable y por equipo. A la mañana cada uno abre su tablero y ya está todo.",
    quien: "Integraciones",
  },
] as const;

/** Quiénes están en la sala a las 14:30. Son caras, no una lista de nombres:
 *  la sala se entiende antes de leer. */
function EnLaSala() {
  return (
    <div className="sala-caras">
      {GENTE.slice(0, 4).map((p) => (
        <span className="persona" key={p.seed}>
          <Cara seed={p.seed} />
          <span>{p.nombre}</span>
          <span className="ok" />
        </span>
      ))}
      <span className="persona" style={{ paddingLeft: 11 }}>
        <span style={{ fontSize: 12, color: "var(--faint)" }}>+2 más</span>
      </span>
    </div>
  );
}

export default function UnDia() {
  return (
    <section
      className="bloque"
      id="dia"
      style={{ background: "rgba(255,255,255,.014)", borderBlock: "1px solid var(--line)" }}
    >
      <div className="wrap">
        <div className="cabeza">
          <span className="eyebrow">un día de trabajo</span>
          <h2>Veinticuatro horas de operación que nadie tiene que empujar.</h2>
          <p>
            Estas son las cosas que Maven hace solo, a la hora que corresponde. Nada de esto es
            un recordatorio: son procesos que leen los datos, deciden y publican.
          </p>
        </div>

        <div className="dia">
          {TRAMOS.map((t) => (
            <div className="tramo" key={t.hora}>
              <div className="t-hora mono">{t.hora}</div>
              <div className="t-nodo"><i /></div>
              {/* `data-hora` no es decorativo: en el teléfono la hora sale de
                  su columna y la pinta el ::before de esta tarjeta. */}
              <div className="t-caja" data-hora={t.hora}>
                <h3>{t.titulo}</h3>
                <p>{t.texto}</p>
                {"caras" in t && t.caras ? <EnLaSala /> : null}
                <span className="quien">{t.quien}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
