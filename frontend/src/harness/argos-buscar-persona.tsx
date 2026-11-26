import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { ChevronRight, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import type { PersonaVistaArgos } from "./argos-diseno-tipos";
import "./argos-buscar-persona.css";

function normalizar(texto: string) {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function contexto(persona: PersonaVistaArgos, historico: boolean) {
  const { observacion, ubicacion } = persona;
  if (historico)
    return observacion
      ? `${observacion.app} · ${observacion.actividad} · ${observacion.hora}`
      : "Sin observación de pantalla para esta fecha";
  if (observacion) {
    const lugar = persona.conectada ? ubicacion : "Última señal";
    return [
      lugar,
      lugar?.startsWith(observacion.app + " ·") ? null : observacion.app,
      observacion.actividad,
      observacion.hora,
    ]
      .filter(Boolean)
      .join(" · ");
  }
  return persona.conectada
    ? ubicacion || "Conectada"
    : "Sin conexión registrada";
}

type Props = {
  personas: PersonaVistaArgos[];
  abrirPersona: (id: string) => void;
  historico: boolean;
};

export function BuscadorPersonaArgos({
  personas,
  abrirPersona,
  historico,
}: Props) {
  const [consulta, setConsulta] = useState("");
  const [abierto, setAbierto] = useState(false);
  const [indice, setIndice] = useState(0);
  const entrada = useRef<HTMLInputElement>(null);
  const lista = useRef<HTMLUListElement>(null);
  const id = useId();
  const palabras = normalizar(consulta).split(/\s+/).filter(Boolean);
  const resultados = palabras.length
    ? personas.filter(({ nombre, equipo, puesto }) => {
        const texto = normalizar([nombre, equipo, puesto].join(" "));
        return palabras.every((palabra) => texto.includes(palabra));
      })
    : [];
  const visible = abierto && palabras.length > 0;
  const activo = Math.min(indice, resultados.length - 1);
  const opcionId = (n: number) => `${id}-opcion-${n}`;

  useEffect(() => {
    if (visible)
      lista.current?.children[activo]?.scrollIntoView({ block: "nearest" });
  }, [activo, visible]);

  function elegir(persona: PersonaVistaArgos) {
    setConsulta("");
    setAbierto(false);
    setIndice(0);
    abrirPersona(persona.id);
  }

  function manejarTecla(evento: KeyboardEvent<HTMLInputElement>) {
    if (evento.nativeEvent.isComposing) return;
    if (evento.key === "Escape" && visible) {
      evento.preventDefault();
      evento.stopPropagation();
      setAbierto(false);
      return;
    }
    if (!resultados.length) return;
    if (evento.key === "ArrowDown" || evento.key === "ArrowUp") {
      evento.preventDefault();
      const adelante = evento.key === "ArrowDown";
      const siguiente = visible
        ? (activo + (adelante ? 1 : -1) + resultados.length) % resultados.length
        : adelante
          ? 0
          : resultados.length - 1;
      setIndice(siguiente);
      setAbierto(true);
    } else if (evento.key === "Enter" && visible) {
      evento.preventDefault();
      elegir(resultados[activo]);
    }
  }

  return (
    <div
      className="argos-buscar"
      onBlur={(evento) => {
        if (!evento.currentTarget.contains(evento.relatedTarget))
          setAbierto(false);
      }}
    >
      <Search className="argos-buscar__lupa" aria-hidden="true" />
      <Input
        ref={entrada}
        aria-label="Buscar persona"
        placeholder="Buscar persona"
        autoComplete="off"
        role="combobox"
        aria-autocomplete="list"
        aria-controls={visible ? `${id}-resultados` : undefined}
        aria-expanded={visible}
        aria-activedescendant={
          visible && activo >= 0 ? opcionId(activo) : undefined
        }
        onChange={(evento) => {
          setConsulta(evento.target.value);
          setIndice(0);
          setAbierto(true);
        }}
        onClick={() => setAbierto(true)}
        onFocus={() => setAbierto(true)}
        onKeyDown={manejarTecla}
        value={consulta}
      />
      {consulta && (
        <button
          type="button"
          aria-label="Borrar búsqueda"
          className="argos-buscar__borrar"
          onClick={() => {
            setConsulta("");
            setIndice(0);
            entrada.current?.focus();
          }}
        >
          <X size={16} aria-hidden="true" />
        </button>
      )}
      {visible && (
        <div className="argos-buscar__menu">
          <ul
            role="listbox"
            aria-label="Personas encontradas"
            ref={lista}
            id={`${id}-resultados`}
          >
            {resultados.map((persona, n) => (
              <li
                role="option"
                aria-selected={n === activo}
                id={opcionId(n)}
                key={persona.id}
                onMouseDown={(evento) => evento.preventDefault()}
                onClick={() => elegir(persona)}
              >
                <div className="argos-buscar__persona">
                  <span className="argos-buscar__nombre">{persona.nombre}</span>
                  <span className="argos-buscar__puesto">
                    {[persona.equipo, persona.puesto]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                  <span className="argos-buscar__actividad">
                    {contexto(persona, historico)}
                  </span>
                </div>
                <ChevronRight size={15} aria-hidden="true" />
              </li>
            ))}
          </ul>
          {resultados.length === 0 && (
            <p role="status">Sin resultados para «{consulta.trim()}».</p>
          )}
        </div>
      )}
    </div>
  );
}
