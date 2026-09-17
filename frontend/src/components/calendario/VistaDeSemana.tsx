import { useEffect, useMemo, useRef, useState } from "react";
import { format, isToday } from "date-fns";
import { es } from "date-fns/locale";
import { Video } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/useLanguage";
import type { EventoDelCalendario } from "@/hooks/useCalendario";
import { claveDeDia, porDia, repartirSolapados } from "@/lib/calendario";

/** Alto de una hora, en píxeles. 48 deja leer un evento de media hora sin que
 *  la semana entera pida scroll infinito. */
const ALTO_HORA = 48;
const HORAS = Array.from({ length: 24 }, (_, i) => i);

interface Props {
  dias: Date[];
  eventos: EventoDelCalendario[];
  onAbrirEvento: (ev: EventoDelCalendario) => void;
  onNuevoEn: (dia: Date, hora: number) => void;
}

export default function VistaDeSemana({ dias, eventos, onAbrirEvento, onNuevoEn }: Props) {
  const { t, language } = useLanguage();
  const locale = language === "es" ? es : undefined;
  const scroller = useRef<HTMLDivElement>(null);

  // Los de día completo van en su propia banda arriba, separados de la grilla
  // horaria — es lo que hace Google, y tiene sentido: no tienen hora que
  // ubicar, así que meterlos en la grilla sería inventarles una.
  const mapa = useMemo(() => porDia(eventos.filter((e) => e.all_day)), [eventos]);

  // El reparto en columnas se calcula una vez por semana y no en cada render:
  // la línea de "ahora" se mueve cada minuto y sin esto arrastraría consigo el
  // recálculo de los 7 días con todos los eventos.
  const columnas = useMemo(
    () => dias.map((dia) => ({
      dia,
      clave: claveDeDia(dia),
      bloques: repartirSolapados(eventos, dia),
    })),
    [dias, eventos],
  );

  // La línea de "ahora", solo si hoy cae en esta semana.
  const [ahora, setAhora] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setAhora(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  const minutosDeAhora = ahora.getHours() * 60 + ahora.getMinutes();

  // Se abre a la altura de la jornada y no a medianoche: nadie tiene reuniones
  // a las 3 de la mañana y arrancar ahí obliga a scrollear siempre.
  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = 7 * ALTO_HORA;
  }, []);

  return (
    <div className="hidden overflow-hidden rounded-panel border border-border/60 sm:block">
      {/* Encabezado: los días. La columna vacía de la izquierda alinea con la
          canaleta de las horas de abajo. */}
      <div className="grid border-b border-border/60 bg-muted/40" style={{ gridTemplateColumns: `56px repeat(7, minmax(0, 1fr))` }}>
        <div className="border-r border-border/40" />
        {dias.map((d) => (
          <div key={claveDeDia(d)} className="flex flex-col items-center gap-0.5 border-r border-border/40 px-1 py-2">
            <span className="text-xs capitalize text-muted-foreground">
              {format(d, "EEE", { locale })}
            </span>
            <span className={cn(
              "inline-flex h-7 w-7 items-center justify-center rounded-full text-sm",
              isToday(d) && "bg-primary font-semibold text-primary-foreground",
            )}>
              {format(d, "d")}
            </span>
          </div>
        ))}
      </div>

      {/* Banda de día completo. Solo aparece si hay algo: una franja vacía
          permanente le roba alto a la grilla, que es lo que se mira. */}
      {dias.some((d) => (mapa.get(claveDeDia(d)) ?? []).length > 0) && (
        <div className="grid border-b border-border/60" style={{ gridTemplateColumns: `56px repeat(7, minmax(0, 1fr))` }}>
          <div className="flex items-center justify-end border-r border-border/40 pr-2 text-[11px] text-muted-foreground">
            {t("cal.todoElDia")}
          </div>
          {dias.map((d) => (
            <div key={claveDeDia(d)} className="flex min-h-[32px] flex-col gap-0.5 border-r border-border/40 p-1">
              {(mapa.get(claveDeDia(d)) ?? []).map((ev) => (
                <button
                  key={ev.id}
                  type="button"
                  onClick={() => onAbrirEvento(ev)}
                  title={ev.title}
                  className={cn(
                    "truncate rounded-control px-1.5 py-0.5 text-left text-[11px] leading-tight",
                    ev.estado === "cancelado"
                      ? "bg-muted text-muted-foreground line-through"
                      : "bg-primary/15 text-primary",
                  )}
                >
                  {ev.title}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* La grilla horaria. Scrollea sola para no estirar la página entera. */}
      <div ref={scroller} className="max-h-[60vh] overflow-y-auto">
        <div className="grid" style={{ gridTemplateColumns: `56px repeat(7, minmax(0, 1fr))` }}>
          {/* Canaleta de horas */}
          <div className="border-r border-border/40">
            {HORAS.map((h) => (
              <div key={h} style={{ height: ALTO_HORA }} className="relative">
                <span className="absolute -top-2 right-2 text-[11px] tabular-nums text-muted-foreground">
                  {h === 0 ? "" : `${String(h).padStart(2, "0")}:00`}
                </span>
              </div>
            ))}
          </div>

          {columnas.map(({ dia, clave, bloques }) => (
              <div
                key={clave}
                className="relative border-r border-border/40"
                style={{ height: 24 * ALTO_HORA }}
              >
                {/* Las franjas de fondo, y de paso el clic para crear a esa hora. */}
                {HORAS.map((h) => (
                  <button
                    key={h}
                    type="button"
                    aria-label={`${format(dia, "EEEE d", { locale })} ${String(h).padStart(2, "0")}:00`}
                    onClick={() => onNuevoEn(dia, h)}
                    className="absolute left-0 w-full border-b border-border/20 transition-colors hover:bg-muted/40"
                    style={{ top: h * ALTO_HORA, height: ALTO_HORA }}
                  />
                ))}

                {isToday(dia) && (
                  <div
                    className="pointer-events-none absolute left-0 z-10 w-full border-t-2 border-destructive"
                    style={{ top: (minutosDeAhora / 60) * ALTO_HORA }}
                  />
                )}

                {bloques.map(({ ev, trozo, columna, columnas }) => (
                  <button
                    key={ev.id}
                    type="button"
                    onClick={() => onAbrirEvento(ev)}
                    title={ev.title}
                    className={cn(
                      "absolute overflow-hidden rounded-control border px-1.5 py-0.5 text-left text-[11px] leading-tight",
                      ev.estado === "cancelado"
                        ? "border-border bg-muted text-muted-foreground line-through"
                        : ev.visibility === "equipo"
                          ? "border-primary/30 bg-primary/15 text-primary"
                          : "border-accent/30 bg-accent/15 text-accent-foreground",
                    )}
                    style={{
                      top: (trozo.desde / 60) * ALTO_HORA,
                      height: (trozo.minutos / 60) * ALTO_HORA - 2,
                      // Los que se pisan se reparten el ancho, como en Google.
                      left: `calc(${(columna / columnas) * 100}% + 2px)`,
                      width: `calc(${100 / columnas}% - 4px)`,
                    }}
                  >
                    <span className="flex items-center gap-1 font-medium">
                      {ev.url && <Video className="h-3 w-3 shrink-0" />}
                      <span className="truncate">{ev.title}</span>
                    </span>
                  </button>
                ))}
              </div>
          ))}
        </div>
      </div>
    </div>
  );
}
