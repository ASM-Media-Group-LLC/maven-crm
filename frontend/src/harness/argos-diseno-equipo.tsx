import { useId, useState } from "react";
import {
  ArrowRight,
  CalendarClock,
  ChevronRight,
  MapPin,
  Monitor,
} from "lucide-react";
import { UserAvatar } from "@/components/UserAvatar";
import type { PersonaVistaArgos, PropsVistaArgos } from "./argos-diseno-tipos";
import "./argos-diseno-equipo.css";

type Filtro = "Conectados" | "Por entrar" | "Todos";

function situacion(
  persona: PersonaVistaArgos,
  corte: string,
  historico: boolean,
) {
  if (historico)
    return persona.ubicacion || "Ubicación sin registrar para esta fecha";
  if (persona.conectada) return persona.ubicacion || "Ubicación sin confirmar";
  if (persona.marca) return `Entrada registrada · ${persona.marca}`;
  if (persona.inicio > corte) return `Entrada prevista · ${persona.inicio}`;
  return `Sin entrada registrada · prevista ${persona.inicio}`;
}

export function EquipoVisual({
  personas,
  corte,
  abrirPersona,
  abrirPantalla,
  abrirTurno,
  buscando = false,
  historico = false,
}: PropsVistaArgos) {
  const titulo = useId();
  const [seleccion, seleccionar] = useState<Filtro>("Conectados");
  const filtro = buscando || historico ? "Todos" : seleccion;
  const conectados = personas.filter((persona) => persona.conectada);
  const porEntrar = personas
    .filter(
      (persona) =>
        !persona.conectada && !persona.marca && persona.inicio > corte,
    )
    .sort((a, b) => a.inicio.localeCompare(b.inicio));
  const grupos = {
    Conectados: conectados,
    "Por entrar": porEntrar,
    Todos: personas,
  };
  const filas = grupos[filtro];
  const proxima = porEntrar[0];
  return (
    <section className="argos-nomina" aria-labelledby={titulo}>
      <header className="argos-nomina__cabecera">
        <h2 id={titulo}>
          {buscando ? "Resultados del equipo" : "Actividad del equipo"}
        </h2>
        {!buscando && !historico && (
          <div
            className="argos-nomina__filtros"
            role="group"
            aria-label="Mostrar personas"
          >
            {(["Conectados", "Por entrar", "Todos"] as const).map((opcion) => (
              <button
                key={opcion}
                type="button"
                aria-pressed={filtro === opcion}
                onClick={() => seleccionar(opcion)}
              >
                {opcion}
                <span>{grupos[opcion].length}</span>
              </button>
            ))}
          </div>
        )}
      </header>
      {filas.length > 0 ? (
        <>
          <div className="argos-nomina__rotulos" aria-hidden="true">
            <span>Persona</span>
            <span>Última actividad observada</span>
            <span className="argos-nomina__rotulo-hora">Hora de la señal</span>
          </div>
          <ul
            aria-label={buscando ? "Personas encontradas" : filtro}
            className="argos-nomina__lista"
          >
            {filas.map((persona) => (
              <li className="argos-nomina__fila" key={persona.id}>
                <button
                  className="argos-nomina__persona"
                  type="button"
                  onClick={() => abrirPersona(persona.id)}
                  aria-label={`Abrir ficha de ${persona.nombre}`}
                >
                  <span aria-hidden="true">
                    <UserAvatar
                      name={persona.nombre}
                      size="md"
                      status={
                        !historico && persona.conectada ? "online" : undefined
                      }
                    />
                  </span>
                  <span className="argos-nomina__identidad">
                    <strong>{persona.nombre}</strong>
                    <span>{persona.equipo}</span>
                  </span>
                </button>
                <div className="argos-nomina__actividad">
                  {persona.observacion ? (
                    <>
                      <p>
                        <strong>{persona.observacion.app}</strong>
                        <span className="argos-nomina__separador"> · </span>
                        {persona.observacion.actividad}
                      </p>
                      <span className="argos-nomina__ubicacion">
                        <MapPin aria-hidden="true" />
                        {situacion(persona, corte, historico)}
                      </span>
                    </>
                  ) : (
                    <>
                      <p>{situacion(persona, corte, historico)}</p>
                      <span className="argos-nomina__ubicacion">
                        Sin actividad observada
                      </span>
                    </>
                  )}
                </div>
                <div className="argos-nomina__evidencia">
                  {persona.observacion && (
                    <time
                      dateTime={persona.observacion.hora}
                      aria-label={`Última señal a las ${persona.observacion.hora}`}
                    >
                      {persona.observacion.hora}
                    </time>
                  )}
                  {persona.imagen && persona.observacion && (
                    <button
                      type="button"
                      onClick={() => abrirPantalla(persona.id)}
                      aria-label={`Ver pantalla de ${persona.nombre}`}
                    >
                      <Monitor aria-hidden="true" />
                      Ver pantalla
                    </button>
                  )}
                </div>
                <button
                  className="argos-nomina__abrir"
                  type="button"
                  onClick={() => abrirPersona(persona.id)}
                  aria-label={`Ver detalle de ${persona.nombre}`}
                >
                  <ChevronRight aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="argos-nomina__vacio" role="status">
          {buscando
            ? "No hay personas que coincidan con la búsqueda."
            : historico
              ? "Sin personas registradas en esta fecha."
              : filtro === "Conectados"
                ? "No hay personas conectadas a esta hora."
                : filtro === "Por entrar"
                  ? "No quedan entradas programadas para hoy."
                  : "Sin personas en esta selección."}
        </p>
      )}
      {proxima && !historico && !buscando && filtro === "Conectados" && (
        <button
          className="argos-nomina__proxima"
          type="button"
          onClick={() => abrirTurno("Próximas entradas")}
        >
          <CalendarClock aria-hidden="true" />
          <span className="argos-nomina__proxima-titulo">
            Siguiente entrada
          </span>
          <span className="argos-nomina__proxima-persona">
            {proxima.nombre} <span>·</span>{" "}
            <time dateTime={proxima.inicio}>{proxima.inicio}</time>
          </span>
          <ArrowRight aria-hidden="true" />
        </button>
      )}
    </section>
  );
}
