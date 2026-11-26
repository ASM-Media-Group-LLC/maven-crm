import { useState } from "react";
import {
  CalendarClock,
  Check,
  ChevronRight,
  Clock3,
  Moon,
  Radio,
  Sunrise,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

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
}: {
  personas: Persona[];
  episodios: E[];
  decisiones: Record<string, { resultado: string }>;
  abrirPersona: (id: string) => void;
  abrirEpisodio: (episodio: E) => void;
}) {
  const [seccion, setSeccion] = useState<Seccion | null>(null);
  const [resto, setResto] = useState(false);
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
  const bloques = [
    {
      id: "AM",
      titulo: "Cierre AM",
      cobertura: am.length ? entradasAM / am.length : 0,
      icono: Sunrise,
      color: "text-amber-500",
      accion: "Ver cierre AM",
      cifra: `${entradasAM} de ${am.length}`,
      unidad: "entradas registradas",
      pie: `${aRevisar.length} ${aRevisar.length === 1 ? "pendiente del AM" : "pendientes del AM"}`,
    },
    {
      id: "PM",
      titulo: "PM en curso",
      cobertura: pm.length ? entradasPM / pm.length : 0,
      icono: Radio,
      color: "text-success",
      accion: "Ver turno PM",
      cifra: `${entradasPM} de ${pm.length}`,
      unidad: "entradas previstas al corte",
      pie:
        pm.length > entradasPM
          ? `${pm.length - entradasPM} sin entrada registrada`
          : pm.length
            ? "Todas las entradas al día"
            : "Nadie debía entrar todavía",
    },
    {
      id: "Próximas entradas",
      titulo: "Próximas entradas",
      cobertura: null,
      icono: CalendarClock,
      color: "text-primary",
      accion: "Ver próximas entradas",
      cifra: proximas[0]?.horario.inicio ?? "—",
      unidad: proximas[0]?.persona.nombre ?? "Sin entradas en la próxima hora",
      pie:
        proximas.length > 1
          ? `${proximas.length} entradas en los próximos 60 min`
          : proximas.length
            ? `En ${minutos(proximas[0].horario.inicio) - minutoCorte} min`
            : "Próximos 60 minutos",
    },
  ] as const;

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
          <span className="text-xs text-muted-foreground">
            Desde {item.hora} ·{" "}
            {decisiones[item.id]?.resultado ??
              (item.recuperado
                ? `Recuperado a las ${item.recuperado}`
                : item.responsable
                  ? `Seguimiento: ${item.responsable}`
                  : "Sin responsable asignado")}
          </span>
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>
    );
  }

  return (
    <section
      aria-label="Cómo va el día"
      className="vidrio mt-4 overflow-hidden rounded-2xl"
    >
      <header className="flex flex-wrap items-center justify-between gap-2 px-4 pb-3 pt-4 sm:px-5">
        <h2 className="font-display text-base font-bold">Cómo va el día</h2>
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <Clock3 className="h-3.5 w-3.5" />
          25 nov · {corteEjemplo} · Bogotá
        </span>
      </header>
      <div className="grid gap-px overflow-hidden border-t border-border/50 bg-border/50 sm:grid-cols-3">
        {bloques.map(
          ({
            id,
            titulo,
            icono: Icono,
            color,
            accion,
            cifra,
            unidad,
            pie,
            cobertura,
          }) => (
            <button
              key={id}
              type="button"
              aria-label={accion}
              aria-describedby={`cifra-relevo-${id.split(" ")[0]} pie-relevo-${id.split(" ")[0]}`}
              aria-expanded={seccion === id}
              onClick={() => {
                setSeccion(seccion === id ? null : id);
                setResto(false);
              }}
              className={cn(
                "flex flex-col items-stretch bg-card px-4 py-3.5 text-left transition-colors hover:bg-secondary sm:px-5",
                seccion === id && "bg-secondary",
              )}
            >
              <span className="flex items-center gap-2 text-sm font-medium">
                <Icono className={cn("h-4 w-4", color)} />
                {titulo}
                <ChevronRight
                  className={cn(
                    "ml-auto h-4 w-4 text-muted-foreground",
                    seccion === id && "rotate-90",
                  )}
                />
              </span>
              <span
                id={`cifra-relevo-${id.split(" ")[0]}`}
                className="mt-1.5 flex flex-wrap items-baseline gap-x-2"
              >
                <strong className="text-2xl font-semibold tracking-tight tabular-nums">
                  {cifra}
                </strong>
                <span className="text-xs text-foreground/80">{unidad}</span>
              </span>
              <span
                id={`pie-relevo-${id.split(" ")[0]}`}
                className="mt-1 text-xs text-muted-foreground"
              >
                {pie}
              </span>
              {cobertura !== null && (
                <span
                  aria-hidden="true"
                  className="mt-2 block h-1 w-full overflow-hidden rounded-full bg-muted"
                >
                  <span
                    className={cn(
                      "block h-full rounded-full",
                      id === "AM" ? "bg-amber-500/75" : "bg-success/80",
                    )}
                    style={{ width: `${cobertura * 100}%` }}
                  />
                </span>
              )}
            </button>
          ),
        )}
      </div>
      {seccion && (
        <div className="space-y-3 border-t border-border/60 px-4 py-3 sm:px-5">
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
                className="rounded-full border px-3 py-1 text-xs font-medium"
                onClick={() => setResto(!resto)}
              >
                {resto ? "Próximos 60 min" : "Resto del día"}
              </button>
            )}
            <button
              aria-label="Cerrar detalle del turno"
              className="rounded-md p-1 hover:bg-muted"
              onClick={() => setSeccion(null)}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="divide-y divide-border/40">
            {mostrar.map(({ persona, horario }) => (
              <button
                key={persona.id}
                className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-lg py-2 text-left text-sm hover:bg-muted/60"
                onClick={() => abrirPersona(persona.id)}
              >
                <span className="rounded-md bg-muted px-2 py-1 font-medium tabular-nums">
                  {horario.inicio}
                </span>
                <span className="min-w-28 flex-1 font-medium">
                  {persona.nombre}
                </span>
                <span className="text-xs">
                  <EstadoEntrada horario={horario} />
                </span>
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            ))}
          </div>
          {!mostrar.length && (
            <p className="text-xs text-muted-foreground">
              Sin entradas previstas en este intervalo.
            </p>
          )}
          {seccion === "AM" && (
            <div className="grid gap-3 border-t border-border/40 pt-3 lg:grid-cols-2">
              <div>
                <h4 className="mb-1 flex items-center gap-1 text-xs font-semibold">
                  <Check className="h-3.5 w-3.5 text-success" />
                  Del AM ya resuelto o revisado a las {corteEjemplo} ·{" "}
                  {solucionados.length}
                </h4>
                {solucionados.map(mostrarEpisodio)}
              </div>
              <div>
                <h4 className="mb-1 flex items-center gap-1 text-xs font-semibold">
                  <Moon className="h-3.5 w-3.5 text-warning" />
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
