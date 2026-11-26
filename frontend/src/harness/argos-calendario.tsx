import { useState } from "react";
import { addDays, format, startOfWeek } from "date-fns";
import { es } from "date-fns/locale";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { fechaDeDia } from "@/lib/casosArgos";
import { cn } from "@/lib/utils";

type CalendarioArgosProps = {
  fecha: string;
  hoy: string;
  pendientes: Record<string, number>;
  alCambiar: (dia: string) => void;
};

const opciones = { locale: es };
const iso = (dia: Date) => format(dia, "yyyy-MM-dd");
const nombreCompleto = (dia: Date) =>
  format(dia, "EEEE, d 'de' MMMM 'de' yyyy", opciones);
const flecha =
  "h-10 w-9 shrink-0 rounded-lg p-0 text-muted-foreground hover:text-foreground";

export function CalendarioArgos({
  fecha,
  hoy,
  pendientes,
  alCambiar,
}: CalendarioArgosProps) {
  const [abierto, setAbierto] = useState(false);
  const seleccion = fechaDeDia(fecha);
  const inicio = startOfWeek(seleccion, { weekStartsOn: 1 });
  const semana = Array.from({ length: 7 }, (_, indice) =>
    addDays(inicio, indice),
  );
  const esHoy = fecha === hoy;

  function tienePendientes(dia: string) {
    return dia < hoy && pendientes[dia] > 0;
  }

  function etiqueta(dia: Date) {
    const clave = iso(dia);
    return [
      nombreCompleto(dia),
      clave === hoy ? "Hoy" : null,
      tienePendientes(clave) ? "Pendientes por revisar" : null,
    ]
      .filter(Boolean)
      .join(" · ");
  }

  return (
    <section aria-label="Fecha de la jornada" className="pt-2">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div aria-live="polite" aria-atomic="true">
          <h2 className="font-display text-[2rem] font-semibold leading-tight tracking-tight text-foreground first-letter:uppercase sm:text-4xl">
            {esHoy ? "Hoy" : format(seleccion, "EEEE d", opciones)}
          </h2>
          <time
            dateTime={fecha}
            className="mt-1 block text-base leading-snug text-muted-foreground first-letter:uppercase"
          >
            {esHoy
              ? nombreCompleto(seleccion)
              : format(seleccion, "MMMM 'de' yyyy", opciones)}
          </time>
        </div>
        <div className="flex items-center gap-1.5">
          {!esHoy && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-sm"
              onClick={() => alCambiar(hoy)}
            >
              Volver a hoy
            </Button>
          )}
          <Popover open={abierto} onOpenChange={setAbierto}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                className="h-10 gap-2 rounded-lg px-3 text-sm font-medium"
                aria-label="Abrir calendario"
              >
                <CalendarDays className="h-4 w-4" aria-hidden="true" />
                Calendario
              </Button>
            </PopoverTrigger>
            <PopoverContent
              align="end"
              aria-label="Calendario de la jornada"
              className="w-auto max-w-[calc(100vw-1.5rem)] p-0"
            >
              <Calendar
                mode="single"
                required
                initialFocus
                locale={es}
                weekStartsOn={1}
                today={fechaDeDia(hoy)}
                defaultMonth={seleccion}
                selected={seleccion}
                onSelect={(dia) => {
                  if (!dia) return;
                  alCambiar(iso(dia));
                  setAbierto(false);
                }}
                labels={{
                  labelNext: () => "Mes siguiente",
                  labelPrevious: () => "Mes anterior",
                  labelWeekday: (dia) => format(dia, "EEEE", opciones),
                }}
                formatters={{
                  formatDay: (dia) => (
                    <>
                      <span aria-hidden="true">{dia.getDate()}</span>
                      <span className="sr-only">{etiqueta(dia)}</span>
                    </>
                  ),
                }}
                modifiers={{ pendientes: (dia) => tienePendientes(iso(dia)) }}
                modifiersClassNames={{
                  pendientes:
                    "relative after:absolute after:bottom-0.5 after:h-1 after:w-1 after:rounded-full after:bg-warning",
                }}
              />
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <nav
        aria-label="Semana de la jornada"
        className="mt-4 flex items-center gap-1 border-y border-border/60 py-1 sm:gap-2"
      >
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Semana anterior"
          className={flecha}
          onClick={() => alCambiar(iso(addDays(seleccion, -7)))}
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </Button>
        <div className="grid min-w-0 flex-1 grid-cols-7 gap-0.5 sm:gap-1">
          {semana.map((dia) => {
            const clave = iso(dia);
            const activo = fecha === clave;
            const pendiente = tienePendientes(clave);
            return (
              <button
                key={clave}
                type="button"
                aria-label={etiqueta(dia)}
                aria-current={clave === hoy ? "date" : undefined}
                aria-pressed={activo}
                onClick={() => alCambiar(clave)}
                className={cn(
                  "relative flex min-h-[3.75rem] min-w-0 flex-col items-center justify-center gap-0.5 rounded-md px-0.5 pb-1 text-foreground outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                  activo ? "bg-primary/10 text-primary" : "hover:bg-muted/60",
                )}
              >
                <span
                  className={cn(
                    "text-[13px] font-medium leading-none first-letter:uppercase sm:text-sm",
                    !activo && "text-muted-foreground",
                  )}
                >
                  {format(dia, "EEEEEE", opciones)}
                </span>
                <span className="text-lg font-semibold leading-tight tabular-nums">
                  {dia.getDate()}
                </span>
                {activo && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-[18%] bottom-0 h-0.5 rounded-full bg-primary"
                  />
                )}
                {pendiente && (
                  <span
                    aria-hidden="true"
                    className="absolute bottom-1.5 h-1 w-1 rounded-full bg-warning"
                  />
                )}
              </button>
            );
          })}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Semana siguiente"
          className={flecha}
          onClick={() => alCambiar(iso(addDays(seleccion, 7)))}
        >
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </Button>
      </nav>
      {semana.some((dia) => tienePendientes(iso(dia))) && (
        <p className="mt-2 flex items-center gap-2 text-[13px] text-muted-foreground">
          <span
            aria-hidden="true"
            className="h-1.5 w-1.5 rounded-full bg-warning"
          />
          Con pendientes por revisar
        </p>
      )}
    </section>
  );
}
