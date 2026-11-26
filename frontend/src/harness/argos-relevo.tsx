import { useRef, useState, type MouseEvent } from "react";
import { Check, ChevronRight, X } from "lucide-react";

export const corteEjemplo = "16:20";
type Horario = {
  inicio: string;
  fin: string;
  marca: string | null;
  tolerancia: number;
};
export const horariosEjemplo: Record<string, Horario> = {
  laura: { inicio: "08:00", fin: "17:00", marca: "08:01", tolerancia: 5 },
  diego: { inicio: "08:00", fin: "16:00", marca: "08:00", tolerancia: 5 },
  camila: { inicio: "08:00", fin: "16:00", marca: "08:09", tolerancia: 10 },
  lucia: { inicio: "16:00", fin: "00:00", marca: "16:02", tolerancia: 5 },
  mateo: { inicio: "16:00", fin: "00:00", marca: null, tolerancia: 10 },
  ines: { inicio: "17:00", fin: "01:00", marca: null, tolerancia: 5 },
  nora: { inicio: "18:00", fin: "02:00", marca: null, tolerancia: 5 },
};

type Persona = { id: string; nombre: string; turno: string };
type Episodio = {
  id: string;
  persona: string;
  titulo: string;
  hora: string;
  tipo: string;
  revisar?: boolean;
  recuperado?: string;
  responsable?: string;
};
type Seccion = "AM" | "PM" | "Próximas entradas";
const minutos = (hora: string) => {
  const [h, m] = hora.split(":").map(Number);
  return h * 60 + m;
};
const minutoCorte = minutos(corteEjemplo);
const minutoRelevo = minutos("16:00");

function EstadoEntrada({ horario }: { horario: Horario }) {
  const diferencia =
    minutos(horario.marca ?? corteEjemplo) - minutos(horario.inicio);
  if (!horario.marca) {
    if (diferencia < 0)
      return (
        <span className="text-muted-foreground">
          En {Math.abs(diferencia)} min
        </span>
      );
    return (
      <span
        className={
          diferencia > horario.tolerancia
            ? "text-warning"
            : "text-muted-foreground"
        }
      >
        Sin entrada registrada · {diferencia} min desde la hora prevista ·{" "}
        {diferencia > horario.tolerancia ? "supera" : "dentro de"} la tolerancia
        de {horario.tolerancia} min
      </span>
    );
  }
  let puntualidad = "A la hora prevista";
  if (diferencia < 0) puntualidad = `${-diferencia} min antes`;
  if (diferencia > 0)
    puntualidad = `+${diferencia} min · ${diferencia <= horario.tolerancia ? "dentro de" : "supera"} la tolerancia de ${horario.tolerancia} min`;
  return (
    <span className="text-muted-foreground">
      Marcó {horario.marca} · {puntualidad}
    </span>
  );
}

export function RelevoArgos<E extends Episodio>({
  personas,
  episodios,
  decisiones,
  abrirPersona,
  abrirEpisodio,
  seccionElegida,
  alElegirSeccion,
}: {
  personas: Persona[];
  episodios: E[];
  decisiones: Record<string, { resultado: string }>;
  abrirPersona: (id: string) => void;
  abrirEpisodio: (episodio: E) => void;
  seccionElegida?: Seccion | null;
  alElegirSeccion?: (seccion: Seccion | null) => void;
}) {
  const [seccionInterna, setSeccionInterna] = useState<Seccion | null>(null);
  const seccion =
    seccionElegida === undefined ? seccionInterna : seccionElegida;
  const setSeccion = alElegirSeccion ?? setSeccionInterna;
  const [resto, setResto] = useState(false);
  const botonDeDetalle = useRef<HTMLButtonElement | null>(null);
  const turnos = personas
    .filter((p) => horariosEjemplo[p.id])
    .map((persona) => ({ persona, horario: horariosEjemplo[persona.id] }))
    .sort(
      (a, b) =>
        a.horario.inicio.localeCompare(b.horario.inicio) ||
        a.persona.nombre.localeCompare(b.persona.nombre, "es"),
    );
  const am = turnos.filter(({ persona }) => persona.turno === "AM");
  const pm = turnos.filter(
    ({ persona, horario }) =>
      persona.turno === "PM" && minutos(horario.inicio) <= minutoCorte,
  );
  const futuras = turnos.filter(
    ({ horario }) => minutos(horario.inicio) > minutoCorte,
  );
  const proximas = futuras.filter(
    ({ horario }) => minutos(horario.inicio) <= minutoCorte + 60,
  );
  const aRevisar = episodios.filter(
    (e) => minutos(e.hora) < minutoRelevo && e.revisar && !decisiones[e.id],
  );
  const recuperadosAM = episodios.filter(
    (e) => e.recuperado && minutos(e.recuperado) < minutoRelevo,
  );
  const revisadosAM = episodios.filter(
    (e) => minutos(e.hora) < minutoRelevo && decisiones[e.id],
  );
  const solucionados = [...new Set([...recuperadosAM, ...revisadosAM])];
  const entradasAM = am.filter(
    (x) => x.horario.marca && minutos(x.horario.marca) < minutoRelevo,
  ).length;
  const entradasPM = pm.filter(
    (x) => x.horario.marca && minutos(x.horario.marca) <= minutoCorte,
  ).length;
  const mostrar =
    seccion === "AM" ? am : seccion === "PM" ? pm : resto ? futuras : proximas;
  const nombre = (id: string) =>
    personas.find((p) => p.id === id)?.nombre ?? "Sin identificar";
  const sinMarca = pm.filter(({ horario }) => !horario.marca);
  const pendientesAM =
    aRevisar.length === 1 ? "1 pendiente" : `${aRevisar.length} pendientes`;
  const proxima = proximas[0];
  const longitudDelDia = minutos("24:00") - minutos("08:00");
  const posicionDelCorte = (minutoCorte - minutos("08:00")) / longitudDelDia;

  function controlDeDetalle(vista: Seccion, etiqueta: string) {
    return {
      type: "button" as const,
      "aria-label": etiqueta,
      "aria-expanded": seccion === vista,
      "aria-controls": seccion === vista ? "detalle-agenda-turno" : undefined,
      onClick: (evento: MouseEvent<HTMLButtonElement>) => {
        botonDeDetalle.current = evento.currentTarget;
        setSeccion(seccion === vista ? null : vista);
        setResto(false);
      },
    };
  }

  function mostrarEpisodio(item: E) {
    return (
      <button
        key={item.id}
        type="button"
        onClick={() => abrirEpisodio(item)}
        className="flex w-full items-center justify-between gap-2 rounded-lg p-2 text-left hover:bg-muted/60"
      >
        <span>
          <span className="block text-sm font-medium">
            {item.titulo} · {nombre(item.persona)}
          </span>
          <span className="text-sm text-muted-foreground">
            Desde {item.hora} ·{" "}
            {decisiones[item.id]?.resultado ??
              (item.recuperado
                ? `Recuperado a las ${item.recuperado}`
                : item.responsable
                  ? `Seguimiento de ${item.responsable}`
                  : "Sin responsable asignado")}
          </span>
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>
    );
  }

  return (
    <section aria-labelledby="titulo-agenda-turnos" className="argos-turno">
      <div className="argos-turno__contenido">
        <header className="argos-turno__cabecera">
          <h2 id="titulo-agenda-turnos">Turno PM</h2>
          <span className="argos-turno__estado">En curso</span>
        </header>
        <button
          {...controlDeDetalle("PM", "Ver turno PM")}
          aria-describedby="cobertura-pm faltan-marcas-pm"
          className="argos-turno__cobertura"
        >
          <span id="cobertura-pm" className="argos-turno__numeros">
            {pm.length > 0 ? (
              <>
                <span className="argos-turno__cifra">
                  {entradasPM} <span>de</span> {pm.length}
                </span>
                <span>entradas registradas</span>
              </>
            ) : (
              <span>Nadie debía entrar todavía</span>
            )}
          </span>
          <span id="faltan-marcas-pm" className="argos-turno__avisar">
            {sinMarca.length === 1 ? (
              <>
                Falta la marca de <strong>{sinMarca[0].persona.nombre}</strong>
              </>
            ) : sinMarca.length > 1 ? (
              <>
                <strong>{sinMarca.length} personas</strong> sin entrada
                registrada
              </>
            ) : pm.length > 0 ? (
              "Todas las entradas al día"
            ) : (
              "Ver entradas"
            )}
            <ChevronRight aria-hidden="true" size={16} />
          </span>
        </button>
        <div
          role="img"
          aria-label={`Horario de Bogotá. Turno AM de 08:00 a 16:00, PM de 16:00 a medianoche. Corte a las ${corteEjemplo}.`}
          className="argos-turno__tiempo"
        >
          <div aria-hidden="true" className="argos-turno__riel">
            <span
              className="argos-turno__avance"
              style={{ width: `${posicionDelCorte * 100}%` }}
            />
            <span className="argos-turno__relevo" />
            <span
              className="argos-turno__corte"
              style={{ left: `${posicionDelCorte * 100}%` }}
            >
              <span>{corteEjemplo} · Bogotá</span>
            </span>
          </div>
          <div aria-hidden="true" className="argos-turno__horas">
            <span>08:00</span>
            <span>16:00</span>
            <span>00:00</span>
          </div>
        </div>
      </div>
      <div className="argos-turno__accesos">
        <button
          {...controlDeDetalle("AM", "Ver cierre AM")}
          aria-describedby="info-cierre-am"
        >
          <span className="argos-turno__etiqueta">
            Cierre AM <ChevronRight aria-hidden="true" size={14} />
          </span>
          <span id="info-cierre-am">
            {am.length > 0
              ? `${entradasAM} de ${am.length} entradas · ${pendientesAM}`
              : "Sin entradas programadas"}
          </span>
        </button>
        <button
          {...controlDeDetalle("Próximas entradas", "Ver próximas entradas")}
          aria-describedby="info-entrada"
        >
          <span className="argos-turno__etiqueta">
            Próxima entrada <ChevronRight aria-hidden="true" size={14} />
          </span>
          <span id="info-entrada">
            {proxima ? (
              <>
                <strong>{proxima.horario.inicio}</strong> ·{" "}
                {proxima.persona.nombre}
                {proximas.length > 1
                  ? ` (+${proximas.length - 1} en la próxima hora)`
                  : ""}
              </>
            ) : (
              "Sin entradas en los próximos 60 minutos"
            )}
          </span>
        </button>
      </div>
      {seccion && (
        <div
          id="detalle-agenda-turno"
          tabIndex={-1}
          className="argos-turno__detalle space-y-3"
        >
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="mr-auto text-sm font-semibold">
              {seccion === "AM"
                ? "Entradas del AM"
                : seccion === "PM"
                  ? `Entradas previstas hasta las ${corteEjemplo}`
                  : resto
                    ? "Entradas del resto del día"
                    : "Entradas en los próximos 60 minutos"}
            </h3>
            {seccion === "Próximas entradas" && (
              <button
                type="button"
                className="rounded-md border px-2.5 py-1.5 text-sm font-medium hover:bg-muted"
                onClick={() => setResto(!resto)}
              >
                {resto ? "Próximos 60 min" : "Resto del día"}
              </button>
            )}
            <button
              aria-label="Cerrar detalle del turno"
              type="button"
              className="rounded-md p-2 hover:bg-muted"
              onClick={() => {
                setSeccion(null);
                botonDeDetalle.current?.focus();
              }}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="divide-y divide-border/50">
            {mostrar.map(({ persona, horario }) => (
              <button
                key={persona.id}
                type="button"
                className="grid w-full grid-cols-[auto_1fr_1rem] items-center gap-x-3 gap-y-1 rounded-md py-2 text-left text-sm hover:bg-muted/60"
                onClick={() => abrirPersona(persona.id)}
              >
                <span className="rounded-md bg-muted px-2 py-1 font-medium tabular-nums">
                  {horario.inicio}
                </span>
                <span className="min-w-28 flex-1 font-medium">
                  {persona.nombre}
                </span>
                <span className="col-start-2 row-start-2 text-sm leading-snug">
                  <EstadoEntrada horario={horario} />
                </span>
                <ChevronRight
                  aria-hidden="true"
                  className="col-start-3 row-start-1 h-3.5 w-3.5 text-muted-foreground"
                />
              </button>
            ))}
          </div>
          {!mostrar.length && (
            <p className="text-sm text-muted-foreground">
              Sin entradas previstas en este intervalo.
            </p>
          )}
          {seccion === "AM" && (
            <div className="grid gap-3 border-t border-border/40 pt-3 lg:grid-cols-2">
              <div>
                <h4 className="mb-1 flex items-center gap-2 text-sm font-semibold">
                  <Check className="h-3.5 w-3.5 text-success" />
                  Del AM ya resuelto o revisado a las {corteEjemplo} ·{" "}
                  {solucionados.length}
                </h4>
                {solucionados.map(mostrarEpisodio)}
              </div>
              <div>
                <h4 className="mb-1 flex items-center gap-2 text-sm font-semibold">
                  <span
                    aria-hidden="true"
                    className="h-1.5 w-1.5 rounded-full bg-warning"
                  />
                  Del AM que sigue pendiente · {aRevisar.length}
                </h4>
                {aRevisar.map(mostrarEpisodio)}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
