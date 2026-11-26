import { CalendarClock, ChevronRight, History } from "lucide-react";
import { a12 } from "@/lib/horaBogota";

type EpisodioDelDia = {
  id: string;
  persona: string;
  hora: string;
  titulo: string;
  duracion: string;
  revisar?: boolean;
  recuperado?: string;
};

type Props<E extends EpisodioDelDia> = {
  fecha: string;
  hoy: string;
  episodios: E[];
  decisiones: Record<string, { resultado: string }>;
  nombre: (id: string) => string;
  abrirEpisodio: (episodio: E) => void;
};

export function CierreDiaArgos<E extends EpisodioDelDia>({
  fecha,
  hoy,
  episodios,
  decisiones,
  nombre,
  abrirEpisodio,
}: Props<E>) {
  if (fecha > hoy || !episodios.length) {
    const futuro = fecha > hoy;
    const Icono = futuro ? CalendarClock : History;
    return (
      <section
        className="border-y border-border/60 py-8"
        aria-label={futuro ? "Planificación" : "Cierre del día"}
      >
        <div className="flex items-center gap-3">
          <Icono aria-hidden className="h-5 w-5 text-muted-foreground" />
          <h2 className="font-display text-xl font-semibold text-foreground">
            {futuro ? "Planificación" : "Cierre del día"}
          </h2>
        </div>
        <p className="mt-2 text-base leading-relaxed text-muted-foreground">
          {futuro
            ? "La planificación de esta fecha aún no está disponible en la vista previa."
            : "Sin registros para esta fecha en la selección actual."}
        </p>
      </section>
    );
  }

  const cronologia = [...episodios].sort((a, b) =>
    b.hora.localeCompare(a.hora),
  );
  const pendientes = cronologia.filter(
    (item) => item.revisar && !decisiones[item.id],
  );
  const registrados = cronologia.filter(
    (item) => !item.revisar || decisiones[item.id],
  );
  const personas = new Set(cronologia.map((item) => item.persona)).size;

  function fila(item: E) {
    const decision = decisiones[item.id]?.resultado;
    return (
      <li key={item.id}>
        <button
          type="button"
          onClick={() => abrirEpisodio(item)}
          className="group grid w-full grid-cols-[4.25rem_1fr_auto] items-baseline gap-x-3 rounded-md py-3.5 text-left hover:bg-muted/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary sm:grid-cols-[5rem_1fr_auto] sm:px-1.5"
        >
          <time className="whitespace-nowrap text-sm font-medium tabular-nums text-muted-foreground">
            {a12(item.hora)}
          </time>
          <span className="min-w-0">
            <span className="block text-base font-medium leading-snug text-foreground">
              {item.titulo}
            </span>
            <span className="mt-1 block text-sm leading-relaxed text-muted-foreground">
              {nombre(item.persona)} · {item.duracion}
              {item.recuperado &&
                ` · Recuperación a las ${a12(item.recuperado)}`}
              {decision && ` · Revisión: ${decision.toLowerCase()}`}
            </span>
          </span>
          <ChevronRight
            aria-hidden
            className="h-4 w-4 self-center text-muted-foreground group-hover:text-primary"
          />
        </button>
      </li>
    );
  }

  return (
    <section aria-label="Cierre del día" className="space-y-6">
      <header className="space-y-1">
        <h2 className="font-display text-[1.4rem] font-semibold leading-tight text-foreground">
          Cierre del día
        </h2>
        <p className="text-base text-muted-foreground">
          {cronologia.length}{" "}
          {cronologia.length === 1 ? "registro" : "registros"} de {personas}{" "}
          {personas === 1 ? "persona" : "personas"}
        </p>
      </header>
      <div>
        <h3 className="flex items-center gap-2 border-b border-border/60 pb-2.5 text-base font-semibold">
          {!!pendientes.length && (
            <span aria-hidden className="h-2 w-2 rounded-full bg-warning" />
          )}
          Pendientes de revisión{" "}
          <span className="font-normal tabular-nums text-muted-foreground">
            {pendientes.length}
          </span>
        </h3>
        {pendientes.length ? (
          <ul className="divide-y divide-border/50">{pendientes.map(fila)}</ul>
        ) : (
          <p className="pt-3 text-sm text-muted-foreground">
            Sin revisiones pendientes.
          </p>
        )}
      </div>
      {!!registrados.length && (
        <div>
          <h3 className="border-b border-border/60 pb-2.5 text-base font-semibold">
            Actividad registrada
          </h3>
          <ul className="divide-y divide-border/50">{registrados.map(fila)}</ul>
        </div>
      )}
    </section>
  );
}
