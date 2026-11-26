import { ArrowUpRight, ChevronRight, Clock3, Moon, Sun } from "lucide-react";
import type { PropsVistaArgos } from "./argos-diseno-tipos";
import "./argos-diseno-agenda.css";

const DIA = 24 * 60;
const INTERVALO = 4 * 60;

function minuto(hora: string) {
  const [horas, minutos] = hora.split(":").map(Number);
  return horas * 60 + minutos;
}

function horaDeEje(minutos: number) {
  return String(Math.floor((minutos % DIA) / 60)).padStart(2, "0") + ":00";
}

export function AgendaVisual({
  personas,
  corte,
  historico,
  buscando,
  abrirPersona,
  abrirTurno,
}: PropsVistaArgos) {
  const ahora = minuto(corte);
  const filas = personas
    .map((persona) => {
      const inicio = minuto(persona.inicio);
      const finDelReloj = minuto(persona.fin);
      const fin = finDelReloj <= inicio ? finDelReloj + DIA : finDelReloj;
      return { persona, inicio, fin };
    })
    .sort(
      (a, b) =>
        a.inicio - b.inicio ||
        a.persona.nombre.localeCompare(b.persona.nombre, "es"),
    );
  const primeraHora =
    Math.floor(Math.min(ahora, ...filas.map((f) => f.inicio)) / 60) * 60;
  const ultimaHora = Math.max(
    primeraHora + 60,
    Math.ceil(Math.max(ahora, ...filas.map((f) => f.fin)) / 60) * 60,
  );
  const posicion = (minutos: number) =>
    (100 * (minutos - primeraHora)) / (ultimaHora - primeraHora);
  const eje = [primeraHora];
  for (
    let punto = (Math.floor(primeraHora / INTERVALO) + 1) * INTERVALO;
    punto < ultimaHora;
    punto += INTERVALO
  ) {
    if (punto - primeraHora >= 90 && ultimaHora - punto >= 90) eje.push(punto);
  }
  eje.push(ultimaHora);
  const proxima =
    !historico &&
    filas.find(({ persona, inicio }) => inicio > ahora && !persona.marca);

  return (
    <section className="av-agenda" aria-label="Agenda del equipo">
      <header className="av-cabecera">
        <div>
          <h2>Agenda del equipo</h2>
          <p>
            {filas.length}{" "}
            {filas.length === 1 ? "persona programada" : "personas programadas"}
          </p>
        </div>
        {proxima && (
          <button
            className="av-proxima"
            onClick={() => abrirTurno("Próximas entradas")}
          >
            <Clock3 size={17} aria-hidden="true" />
            <span>
              <small>Próxima entrada</small>
              <strong>
                {proxima.persona.inicio} <span>·</span> {proxima.persona.nombre}
              </strong>
            </span>
            <ChevronRight size={16} aria-hidden="true" />
          </button>
        )}
      </header>
      {filas.length === 0 ? (
        <p className="av-vacia">
          {buscando
            ? "Ningún turno coincide con la búsqueda."
            : "Sin turnos programados."}
        </p>
      ) : (
        <>
          <div className="av-grafico">
            <div className="av-papel" aria-hidden="true">
              {ultimaHora > DIA && (
                <i
                  className="av-dia-extra"
                  style={{ left: posicion(DIA) + "%" }}
                />
              )}
              {eje.slice(1, -1).map((punto) => (
                <i
                  key={punto}
                  className="av-guia"
                  style={{ left: posicion(punto) + "%" }}
                />
              ))}
            </div>
            <div className="av-regla-corte" aria-hidden="true">
              <i
                className="av-linea-corte"
                style={{ left: posicion(ahora) + "%" }}
              />
            </div>
            <div className="av-fila av-escala">
              <span className="av-titulo-col">Persona / entrada</span>
              <div className="av-eje">
                <span
                  className="av-hora-corte"
                  style={{ left: posicion(ahora) + "%" }}
                >
                  {corte}
                </span>
                {eje.map((punto) => (
                  <span
                    className="av-hora"
                    key={punto}
                    style={{ left: posicion(punto) + "%" }}
                  >
                    {horaDeEje(punto)}
                    {punto >= DIA && <sup>+1</sup>}
                  </span>
                ))}
              </div>
            </div>
            {(["AM", "PM"] as const).map((turno) => {
              const grupo = filas.filter(
                ({ persona }) => persona.turno === turno,
              );
              if (!grupo.length) return null;
              const Icono = turno === "AM" ? Sun : Moon;
              return (
                <div className="av-grupo" data-turno={turno} key={turno}>
                  <button
                    className="av-turno"
                    onClick={() => abrirTurno(turno)}
                  >
                    <Icono size={15} aria-hidden="true" />
                    Turno {turno}
                    <span>{grupo.length}</span>
                    <ChevronRight size={14} aria-hidden="true" />
                  </button>
                  {grupo.map(({ persona, inicio, fin }) => {
                    const pendiente = !persona.marca && inicio <= ahora;
                    const horas = persona.inicio + " – " + persona.fin;
                    return (
                      <button
                        key={persona.id}
                        className="av-fila av-persona"
                        onClick={() => abrirPersona(persona.id)}
                      >
                        <span className="av-identidad">
                          <span className="av-iniciales" aria-hidden="true">
                            {persona.iniciales}
                          </span>
                          <span className="av-persona-texto">
                            <strong>{persona.nombre}</strong>
                            <small
                              className={pendiente ? "av-pendiente" : undefined}
                            >
                              {persona.marca
                                ? "Marcó " + persona.marca
                                : pendiente
                                  ? "Sin entrada registrada"
                                  : "Prevista " + persona.inicio}
                            </small>
                          </span>
                        </span>
                        <span className="av-carril">
                          <span
                            className="av-banda"
                            data-prevista={inicio > ahora}
                            style={{
                              left: posicion(inicio) + "%",
                              width: posicion(fin) - posicion(inicio) + "%",
                            }}
                          >
                            <span>
                              {horas}
                              {fin >= DIA && <sup>+1</sup>}
                            </span>
                          </span>
                          <i
                            className="av-corte-movil"
                            aria-hidden="true"
                            style={{ left: posicion(ahora) + "%" }}
                          />
                        </span>
                        <span className="av-horas-movil">
                          {horas}
                          {fin >= DIA && <sup>+1</sup>}
                        </span>
                        <ArrowUpRight
                          className="av-abrir"
                          size={13}
                          aria-hidden="true"
                        />
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
          <footer className="av-pie">
            <span>
              <i className="av-muestra am" />
              Turno AM
            </span>
            <span>
              <i className="av-muestra pm" />
              Turno PM
            </span>
            <span className="av-leyenda-corte">
              <i />
              Hora de corte · {corte}
            </span>
            {ultimaHora >= DIA && (
              <span className="av-dia-siguiente">+1 día siguiente</span>
            )}
          </footer>
        </>
      )}
    </section>
  );
}
