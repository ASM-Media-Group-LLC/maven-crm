import { formatUI } from "@/lib/formatoHora";
import { format, isSameDay } from "date-fns";
import { es } from "date-fns/locale";
import { CalendarDays, Clock, MapPin, Repeat, Users, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/hooks/useLanguage";
import type { TranslationKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { EventoDeCalendario, PersonaDelEvento } from "@/lib/ics";

/** Cómo se lee la respuesta de cada invitado. Lo que no esté acá se omite:
 *  mejor no decir nada que traducir mal el estado de alguien. */
const RESPUESTAS: Record<string, { clave: TranslationKey; clase: string }> = {
  ACCEPTED: { clave: "correo.evento.va", clase: "text-success" },
  DECLINED: { clave: "correo.evento.noVa", clase: "text-destructive" },
  TENTATIVE: { clave: "correo.evento.quizas", clase: "text-warning" },
  "NEEDS-ACTION": { clave: "correo.evento.sinResponder", clase: "text-muted-foreground" },
};

function Renglon({ icono, children }: { icono: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 text-sm">
      <span className="mt-0.5 shrink-0 text-muted-foreground">{icono}</span>
      <span className="min-w-0 flex-1">{children}</span>
    </div>
  );
}

/** Una invitación de calendario, legible.
 *
 *  Antes esto era un adjunto llamado "adjunto" que no se podía abrir. Es el
 *  9,6% de lo que llega al correo del equipo: las reuniones que agenda RRHH.
 */
export default function TarjetaDeEvento({ evento }: { evento: EventoDeCalendario }) {
  const { t, language } = useLanguage();
  // ⚠️ La fecha también se traduce, y no alcanza con cambiar el locale: el
  // patrón lleva los "de" ESCRITOS, así que en inglés saldría "Monday 9 de
  // September de 2026". El patrón cambia junto con el idioma.
  const enEspanol = language === "es";
  const locale = enEspanol ? es : undefined;
  const PATRON_LARGO = enEspanol ? "EEEE d 'de' MMMM 'de' yyyy" : "EEEE, MMMM d, yyyy";
  const PATRON_CORTO = enEspanol ? "EEEE d 'de' MMMM" : "EEEE, MMMM d";

  const nombreDe = (p: PersonaDelEvento): string =>
    p.nombre || p.email || t("correo.evento.alguien");

  /** El renglón de cuándo. Un evento de día completo NO lleva hora: inventarla
   *  sería peor que omitirla. Y si empieza y termina el mismo día, la fecha va
   *  una sola vez. */
  const cuando = (): string | null => {
    if (!evento.inicio) return null;
    const dia = format(evento.inicio, PATRON_LARGO, { locale });
    if (evento.todoElDia) return `${dia} · ${t("correo.evento.todoElDia")}`;

    const desde = formatUI(evento.inicio, "HH:mm");
    if (!evento.fin) return `${dia} · ${desde}`;
    if (isSameDay(evento.inicio, evento.fin)) {
      // ⚠️ Los marcadores van en inglés a propósito: la guarda de i18n lee la
      // columna `en` y un {desde} adentro la hace creer que quedó sin traducir.
      const rango = t("correo.evento.rango", {
        from: desde,
        to: formatUI(evento.fin, "HH:mm"),
      });
      return `${dia} · ${rango}`;
    }
    return `${dia} ${desde} → ${formatUI(evento.fin, PATRON_CORTO, { locale })} ${formatUI(evento.fin, "HH:mm")}`;
  };

  const fecha = cuando();
  const conRespuesta = evento.invitados.filter((i) => i.respuesta && RESPUESTAS[i.respuesta]);

  return (
    <div className="h-full overflow-auto bg-background p-5">
      <div className="mx-auto w-full max-w-2xl">
        {evento.cancelado && (
          <p className="mb-4 rounded-panel border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">
            {t("correo.evento.cancelada")}
          </p>
        )}

        <div className="flex flex-col gap-4 rounded-panel border border-border/60 bg-card p-5">
          <div className="flex items-start gap-3">
            <CalendarDays className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <h2
              className={cn(
                "min-w-0 flex-1 text-lg font-semibold leading-snug",
                evento.cancelado && "line-through opacity-70",
              )}
            >
              {evento.titulo || t("correo.evento.sinTitulo")}
            </h2>
          </div>

          <div className="flex flex-col gap-2.5">
            {fecha && (
              <Renglon icono={<Clock className="h-4 w-4" />}>
                <span className="first-letter:uppercase">{fecha}</span>
              </Renglon>
            )}

            {evento.repeticion && (
              <Renglon icono={<Repeat className="h-4 w-4" />}>
                <span className="text-muted-foreground">{t("correo.evento.seRepite")}</span>
              </Renglon>
            )}

            {/* El lugar solo si no es el propio link: Google mete la URL ahí y
                repetirla debajo del botón es ruido. */}
            {evento.lugar && evento.lugar !== evento.enlace && (
              <Renglon icono={<MapPin className="h-4 w-4" />}>{evento.lugar}</Renglon>
            )}

            {evento.organiza && (
              <Renglon icono={<Users className="h-4 w-4" />}>
                <span className="text-muted-foreground">{t("correo.evento.organiza")}</span>{" "}
                {nombreDe(evento.organiza)}
              </Renglon>
            )}
          </div>

          {evento.enlace && (
            <Button asChild size="sm" className="w-fit rounded-full">
              {/* `noreferrer` además de `noopener`: el destino no tiene por qué
                  enterarse de desde dónde se entró. */}
              <a href={evento.enlace} target="_blank" rel="noopener noreferrer">
                <Video className="mr-2 h-4 w-4" />
                {t("correo.evento.entrar")}
              </a>
            </Button>
          )}
        </div>

        {conRespuesta.length > 0 && (
          <div className="mt-4 flex flex-col gap-2 rounded-panel border border-border/60 bg-card p-5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t("correo.evento.invitados", { n: evento.invitados.length })}
            </p>
            <ul className="flex flex-col gap-1.5">
              {conRespuesta.map((p, i) => (
                <li key={`${p.email ?? i}`} className="flex items-baseline gap-2 text-sm">
                  <span className="min-w-0 flex-1 truncate">{nombreDe(p)}</span>
                  <span className={cn("shrink-0 text-xs", RESPUESTAS[p.respuesta!].clase)}>
                    {t(RESPUESTAS[p.respuesta!].clave)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {evento.descripcion && (
          <div className="mt-4 rounded-panel border border-border/60 bg-card p-5">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t("correo.evento.detalles")}
            </p>
            <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
              {evento.descripcion}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
