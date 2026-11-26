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
    <section aria-label="Fecha de la jornada" className="argos-fecha">
      <div className="argos-fecha__cabecera">
        <div
          aria-live="polite"
          aria-atomic="true"
          className="argos-fecha__titulo"
        >
          <h2 className="font-display">
            {esHoy ? "Hoy" : format(seleccion, "EEEE d", opciones)}
          </h2>
          <time dateTime={fecha}>
            {esHoy
              ? nombreCompleto(seleccion)
              : format(seleccion, "MMMM 'de' yyyy", opciones)}
          </time>
        </div>
        <div className="argos-fecha__acciones">
          {!esHoy && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="argos-fecha__volver"
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
                className="argos-fecha__abrir"
                aria-label="Abrir calendario"
              >
                <CalendarDays className="h-4 w-4" aria-hidden="true" />
                <span>Calendario</span>
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

      <nav aria-label="Semana de la jornada" className="argos-fecha__semana">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Semana anterior"
          className="argos-fecha__flecha"
          onClick={() => alCambiar(iso(addDays(seleccion, -7)))}
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </Button>
        <div className="argos-fecha__dias">
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
                className="argos-fecha__dia"
              >
                <span className="argos-fecha__nombre">
                  {format(dia, "EEE", opciones)}
                </span>
                <span className="argos-fecha__numero">
                  {dia.getDate()}
                  {pendiente && (
                    <span aria-hidden="true" className="argos-fecha__punto" />
                  )}
                </span>
              </button>
            );
          })}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Semana siguiente"
          className="argos-fecha__flecha"
          onClick={() => alCambiar(iso(addDays(seleccion, 7)))}
        >
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </Button>
      </nav>
      {semana.some((dia) => tienePendientes(iso(dia))) && (
        <p className="argos-fecha__leyenda">
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
