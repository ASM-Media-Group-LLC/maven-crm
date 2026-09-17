import { useMemo, useState } from "react";
import { addDays, addMonths, format, isSameMonth, isToday } from "date-fns";
import type { Locale } from "date-fns";
import { es } from "date-fns/locale";
import { CalendarDays, ChevronLeft, ChevronRight, Plus, Video } from "lucide-react";
import { Page } from "@/components/ui/page";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import DialogoDeEvento from "@/components/calendario/DialogoDeEvento";
import VistaDeSemana from "@/components/calendario/VistaDeSemana";
import { useEventos, type EventoDelCalendario } from "@/hooks/useCalendario";
import {
  claveDeDia, diasDeLaSemana, diasDelMes, horaDe, porDia, rangoDeLaSemana, rangoDelMes,
} from "@/lib/calendario";

/** Cuántas píldoras entran en una casilla antes de resumir. Con más, la fila
 *  crece y la grilla deja de ser una grilla. */
const TOPE_POR_DIA = 3;

type Vista = "mes" | "semana";

/** La píldora de un evento. Vive suelta porque la usan las DOS vistas —la
 *  grilla y la agenda del teléfono— y si se duplicara, cualquier arreglo
 *  habría que hacerlo dos veces. */
function Pildora({ ev, onAbrir }: { ev: EventoDelCalendario; onAbrir: () => void }) {
  const hora = horaDe(ev);
  return (
    <span
      role="button"
      tabIndex={0}
      onClick={(e) => { e.stopPropagation(); onAbrir(); }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          e.stopPropagation();
          onAbrir();
        }
      }}
      title={ev.title}
      className={cn(
        "flex w-full items-center gap-1 truncate rounded-control px-1.5 py-0.5 text-[11px] leading-tight",
        ev.estado === "cancelado"
          ? "bg-muted text-muted-foreground line-through"
          : ev.visibility === "equipo"
            ? "bg-primary/15 text-primary"
            : "bg-accent/15 text-accent-foreground",
      )}
    >
      {ev.url && <Video className="h-3 w-3 shrink-0" />}
      {hora && <span className="shrink-0 tabular-nums opacity-70">{hora}</span>}
      <span className="truncate">{ev.title}</span>
    </span>
  );
}

export default function CalendarioPage() {
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const locale = language === "es" ? es : undefined;

  const [vista, setVista] = useState<Vista>("mes");
  // Una sola fecha ancla las dos vistas: al cambiar de mes a semana se ve la
  // semana del mes que estabas mirando, y no te tira a hoy.
  const [ancla, setAncla] = useState(() => new Date());
  const [dialogo, setDialogo] =
    useState<{ evento?: EventoDelCalendario; dia?: Date; hora?: number } | null>(null);

  const esSemana = vista === "semana";

  const dias = useMemo(
    () => (esSemana ? diasDeLaSemana(ancla) : diasDelMes(ancla)),
    [esSemana, ancla],
  );
  const { desde, hasta } = useMemo(
    () => (esSemana ? rangoDeLaSemana(ancla) : rangoDelMes(ancla)),
    [esSemana, ancla],
  );
  const eventos = useEventos(desde, hasta);
  const mapa = useMemo(() => porDia(eventos.data ?? []), [eventos.data]);

  // Los nombres de los días salen del locale y no de una lista escrita a mano:
  // así el botón EN también los traduce.
  const encabezados = useMemo(
    () => dias.slice(0, 7).map((d) => format(d, "EEE", { locale })),
    [dias, locale],
  );

  const hayAlgo = (eventos.data ?? []).length > 0;

  // Solo los días con algo agendado: la agenda del teléfono no muestra casillas
  // vacías, muestra lo que hay. En la vista de mes se recorta a los días DEL
  // mes; en la de semana entran los 7, que son todos los que se están mirando.
  const diasConAlgo = useMemo(
    () => dias
      .filter((d) => esSemana || isSameMonth(d, ancla))
      .map((dia) => ({ dia, clave: claveDeDia(dia), eventos: mapa.get(claveDeDia(dia)) ?? [] }))
      .filter((d) => d.eventos.length > 0),
    [dias, esSemana, ancla, mapa],
  );

  const mover = (haciaAdelante: boolean) =>
    setAncla((a) => (esSemana
      ? addDays(a, haciaAdelante ? 7 : -7)
      : addMonths(a, haciaAdelante ? 1 : -1)));

  // En la semana el rótulo es el rango, porque una semana puede cruzar de mes
  // (y de año): decir solo "septiembre" sería mentira la mitad de las veces.
  const rotulo = esSemana
    ? `${format(dias[0], "d MMM", { locale })} – ${format(dias[6], "d MMM yyyy", { locale })}`
    : format(ancla, "MMMM yyyy", { locale });

  return (
    <Page>
      <div className="flex w-full flex-col gap-5">
        <PageHeader
          title={t("nav.office.calendar")}
          subtitle={t("cal.subtitulo")}
          icon={<CalendarDays />}
          actions={
            <Button onClick={() => setDialogo({ dia: new Date() })} className="rounded-full">
              <Plus className="mr-2 h-4 w-4" />
              {t("cal.nuevo")}
            </Button>
          }
        />

        <div className="flex flex-wrap items-center gap-2">
          <Button size="icon" variant="outline" className="h-9 w-9 rounded-full"
            aria-label={t(esSemana ? "cal.semanaAnterior" : "cal.mesAnterior")}
            onClick={() => mover(false)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="outline" className="h-9 w-9 rounded-full"
            aria-label={t(esSemana ? "cal.semanaSiguiente" : "cal.mesSiguiente")}
            onClick={() => mover(true)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="outline" className="rounded-full"
            onClick={() => setAncla(new Date())}>
            {t("cal.hoy")}
          </Button>
          <p className="ml-2 text-lg font-semibold capitalize">{rotulo}</p>

          <div className="ml-auto flex gap-1 rounded-full bg-muted/60 p-1">
            {(["mes", "semana"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setVista(v)}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                  vista === v
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t(v === "mes" ? "cal.vistaMes" : "cal.vistaSemana")}
              </button>
            ))}
          </div>
        </div>

        {eventos.isPending ? (
          <Skeleton className="h-[560px] w-full rounded-panel" />
        ) : esSemana ? (
          <>
            <VistaDeSemana
              dias={dias}
              eventos={eventos.data ?? []}
              onAbrirEvento={(ev) => setDialogo({ evento: ev })}
              onNuevoEn={(dia, hora) => setDialogo({ dia, hora })}
            />
            {/* La grilla horaria no entra en un teléfono: 7 columnas de ~50 px
                con bloques posicionados al minuto son ilegibles. Debajo de `sm`
                se reusa la misma agenda de la vista de mes. */}
            <div className="overflow-hidden rounded-panel border border-border/60 sm:hidden">
              <AgendaDelTelefono
                dias={diasConAlgo}
                locale={locale}
                vacio={t("cal.sinEventosSemana")}
                onAbrirDia={(dia) => setDialogo({ dia })}
                onAbrirEvento={(ev) => setDialogo({ evento: ev })}
              />
            </div>
          </>
        ) : (
          <div className="overflow-hidden rounded-panel border border-border/60">
            {/* ⚠️ En un teléfono, 7 columnas dan celdas de ~50 px donde las
                píldoras quedan ilegibles. Debajo de `sm` va una AGENDA: solo
                los días que tienen algo, uno debajo del otro. Es lo que hacen
                los calendarios buenos, y no un breakpoint puesto para callar
                a la guarda de diseño. */}
            <div className="sm:hidden">
              <AgendaDelTelefono
                dias={diasConAlgo}
                locale={locale}
                vacio={t("cal.sinEventos")}
                onAbrirDia={(dia) => setDialogo({ dia })}
                onAbrirEvento={(ev) => setDialogo({ evento: ev })}
              />
            </div>

            <div className="hidden sm:grid sm:grid-cols-7 border-b border-border/60 bg-muted/40">
              {encabezados.map((d, i) => (
                <div key={i} className="px-2 py-2 text-center text-xs font-medium capitalize text-muted-foreground">
                  {d}
                </div>
              ))}
            </div>

            <div className="hidden sm:grid sm:grid-cols-7">
              {dias.map((dia) => {
                const clave = claveDeDia(dia);
                const delDia = mapa.get(clave) ?? [];
                const delMes = isSameMonth(dia, ancla);
                return (
                  <button
                    key={clave}
                    type="button"
                    onClick={() => setDialogo({ dia })}
                    className={cn(
                      "flex min-h-[104px] flex-col gap-1 border-b border-r border-border/40 p-1.5 text-left transition-colors hover:bg-muted/40",
                      // Los días de los meses vecinos se atenúan en vez de
                      // ocultarse: dan contexto de dónde cae la semana.
                      !delMes && "bg-muted/20 text-muted-foreground",
                    )}
                  >
                    <span
                      className={cn(
                        "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs",
                        isToday(dia) && "bg-primary font-semibold text-primary-foreground",
                      )}
                    >
                      {format(dia, "d")}
                    </span>

                    {delDia.slice(0, TOPE_POR_DIA).map((ev) => (
                      <Pildora key={ev.id} ev={ev} onAbrir={() => setDialogo({ evento: ev })} />
                    ))}

                    {delDia.length > TOPE_POR_DIA && (
                      <span className="px-1.5 text-[11px] text-muted-foreground">
                        {t("cal.masEventos", { n: delDia.length - TOPE_POR_DIA })}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {!eventos.isPending && !hayAlgo && (
          <div className="rounded-panel border border-dashed border-border py-10 text-center">
            <CalendarDays className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-3 text-sm font-medium">
              {t(esSemana ? "cal.sinEventosSemana" : "cal.sinEventos")}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{t("cal.sinEventosAyuda")}</p>
          </div>
        )}
      </div>

      <DialogoDeEvento
        abierto={!!dialogo}
        onCerrar={() => setDialogo(null)}
        evento={dialogo?.evento}
        dia={dialogo?.dia}
        hora={dialogo?.hora}
        // Un evento del equipo se ve pero no se toca: moverle la hora a una
        // reunión ajena no es colaborar, es romperle la agenda a alguien.
        esMio={!dialogo?.evento || dialogo.evento.owner_id === user?.id}
      />
    </Page>
  );
}

interface PropsAgenda {
  dias: { dia: Date; clave: string; eventos: EventoDelCalendario[] }[];
  locale: Locale | undefined;
  vacio: string;
  onAbrirDia: (dia: Date) => void;
  onAbrirEvento: (ev: EventoDelCalendario) => void;
}

/** La agenda del teléfono. Es la misma en mes y en semana: lo único que cambia
 *  es qué días le llegan. */
function AgendaDelTelefono({ dias, locale, vacio, onAbrirDia, onAbrirEvento }: PropsAgenda) {
  if (dias.length === 0) {
    return <p className="px-4 py-8 text-center text-sm text-muted-foreground">{vacio}</p>;
  }
  return (
    <div className="flex flex-col divide-y divide-border/40">
      {dias.map(({ dia, clave, eventos: delDia }) => (
        <button
          key={clave}
          type="button"
          onClick={() => onAbrirDia(dia)}
          className="flex gap-3 p-3 text-left transition-colors hover:bg-muted/40"
        >
          <span className="flex w-10 shrink-0 flex-col items-center">
            <span className="text-[11px] capitalize text-muted-foreground">
              {format(dia, "EEE", { locale })}
            </span>
            <span className={cn(
              "inline-flex h-7 w-7 items-center justify-center rounded-full text-sm",
              isToday(dia) && "bg-primary font-semibold text-primary-foreground",
            )}>
              {format(dia, "d")}
            </span>
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-1">
            {delDia.map((ev) => (
              <Pildora key={ev.id} ev={ev} onAbrir={() => onAbrirEvento(ev)} />
            ))}
          </span>
        </button>
      ))}
    </div>
  );
}
