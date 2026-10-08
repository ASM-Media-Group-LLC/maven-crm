// «Programar envío»: la flechita pegada al botón Enviar (como Gmail y Google
// Chat; Keila y Jhon, 08/10). La usan el compositor del Correo y el Messenger.
//
// Quien llama pone el DISPARADOR (su flechita, con su estilo) y decide qué hacer
// con el instante elegido; esto dibuja el menú y el diálogo «Elegir fecha y
// hora». Todo en hora de Colombia (ver lib/programarEnvio.ts).
//
// Lo que más cuida: que la persona vea CUÁNDO sale de verdad. Cada opción lleva
// su fecha concreta al lado («vie, 9 oct») —«mañana» a las 11:58 de la noche es
// ambiguo— y el diálogo repite lo elegido en palabras antes de confirmar.

import { useMemo, useState, type ReactNode } from "react";
import { CalendarClock, Clock3, Sunrise, Sun } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLanguage } from "@/hooks/useLanguage";
import { useFormato } from "@/hooks/useFormato";
import type { TranslationKey } from "@/lib/i18n";
import {
  fechaCorta, fechaLarga, fechaYHoraDe, horaCorta, HORIZONTE_MS, leerFechaYHora, opcionesDeProgramar,
  partesEnBogota, zonaDelEquipoSiDistinta, type HoraElegida, type OpcionDeProgramar,
} from "@/lib/programarEnvio";

type Motivo = Extract<HoraElegida, { ok: false }>["motivo"];
const ERROR: Record<Motivo, TranslationKey> = {
  fecha: "shared.schedule.error.fecha",
  hora: "shared.schedule.error.hora",
  pasado: "shared.schedule.error.pasado",
  lejos: "shared.schedule.error.lejos",
};

interface Props {
  /** La flechita. Va con `asChild`: tiene que ser UN elemento que acepte ref. */
  children: ReactNode;
  onProgramar: (cuando: Date) => void;
  /** Del lado en que se abre el menú (en el Messenger el cajón está abajo). */
  lado?: "top" | "bottom";
  alineado?: "start" | "end";
}

const ICONO: Record<OpcionDeProgramar["clave"], typeof Sun> = {
  manana: Sunrise,
  tarde: Sun,
  lunes: CalendarClock,
};

const ROTULO: Record<OpcionDeProgramar["clave"], TranslationKey> = {
  manana: "shared.schedule.tomorrowMorning",
  tarde: "shared.schedule.tomorrowAfternoon",
  lunes: "shared.schedule.nextMonday",
};

export function ProgramarEnvio({ children, onProgramar, lado = "top", alineado = "start" }: Props) {
  const { t, language } = useLanguage();
  const [abierto, setAbierto] = useState(false);
  const [eligiendo, setEligiendo] = useState(false);
  // Se recalculan al ABRIR: un menú armado a las 23:59 y abierto a las 00:01
  // ofrecería «mañana» con el día de ayer.
  const [opciones, setOpciones] = useState<OpcionDeProgramar[]>(() => opcionesDeProgramar());

  return (
    <>
      <DropdownMenu
        open={abierto}
        onOpenChange={(v) => {
          if (v) setOpciones(opcionesDeProgramar());
          setAbierto(v);
        }}
      >
        <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
        <DropdownMenuContent side={lado} align={alineado} className="w-[19rem]">
          <DropdownMenuLabel className="space-y-0.5 py-2">
            <span className="block text-sm font-semibold">{t("shared.schedule.title")}</span>
            <span className="block text-xs font-normal text-muted-foreground">{t("shared.schedule.zone")}</span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {opciones.map((o) => {
            const Icono = ICONO[o.clave];
            return (
              <DropdownMenuItem key={o.clave} onSelect={() => onProgramar(o.cuando)} className="gap-2.5 py-2">
                <Icono className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="flex-1">{t(ROTULO[o.clave])}</span>
                <span className="text-xs tabular-nums text-muted-foreground">{fechaCorta(o.cuando, language)}</span>
              </DropdownMenuItem>
            );
          })}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setEligiendo(true)} className="gap-2.5 py-2">
            <Clock3 className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="flex-1">{t("shared.schedule.custom")}</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {eligiendo && (
        <ElegirFechaYHora
          inicial={opciones[0]?.cuando ?? opcionesDeProgramar()[0].cuando}
          onCerrar={() => setEligiendo(false)}
          onProgramar={(cuando) => {
            setEligiendo(false);
            onProgramar(cuando);
          }}
        />
      )}
    </>
  );
}

/** El diálogo «Elegir fecha y hora»: calendario, la fecha DD/MM/AAAA, la hora y
 *  la frase que repite lo elegido. */
export function ElegirFechaYHora({ inicial, onCerrar, onProgramar }: {
  inicial: Date;
  onCerrar: () => void;
  onProgramar: (cuando: Date) => void;
}) {
  const { t, language } = useLanguage();
  const formato = useFormato();
  const [fecha, setFecha] = useState(() => fechaYHoraDe(inicial).fecha);
  const [hora, setHora] = useState(() => fechaYHoraDe(inicial).hora);
  const [intento, setIntento] = useState(false);
  const leido = leerFechaYHora(fecha, hora);

  // El calendario trabaja con fechas del equipo: se le da el DÍA elegido
  // (de Bogotá) como una fecha local cualquiera de ese día.
  const diaElegido = useMemo(() => {
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(fecha.trim());
    return m ? new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1])) : undefined;
  }, [fecha]);
  const hoy = partesEnBogota(new Date());
  const primerDia = new Date(hoy.anio, hoy.mes - 1, hoy.dia);
  const ultimoDia = new Date(primerDia.getTime() + HORIZONTE_MS);

  // «Ya pasó» y «muy lejos» se dicen enseguida; una fecha a medio escribir,
  // recién al intentar confirmar (si no, se marca en rojo mientras se tipea).
  const motivo: Motivo | null = "motivo" in leido ? leido.motivo : null;
  const error = motivo && (intento || motivo === "pasado" || motivo === "lejos") ? t(ERROR[motivo]) : null;
  const zonaLocal = leido.ok ? zonaDelEquipoSiDistinta(leido.cuando) : null;

  const confirmar = () => {
    setIntento(true);
    if (leido.ok) onProgramar(leido.cuando);
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onCerrar()}>
      <DialogContent className="max-w-[min(96vw,40rem)] gap-5">
        <DialogHeader>
          <DialogTitle>{t("shared.schedule.customTitle")}</DialogTitle>
          <DialogDescription>{t("shared.schedule.zone")}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-5 sm:grid-cols-[auto_1fr]">
          <Calendar
            mode="single"
            selected={diaElegido}
            defaultMonth={diaElegido}
            onSelect={(d) => {
              if (!d) return;
              setFecha(`${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`);
            }}
            disabled={[{ before: primerDia }, { after: ultimoDia }]}
            locale={formato.fechas}
            className="mx-auto rounded-2xl border border-border/60 bg-background/40 sm:mx-0"
            // Hoy, apenas marcado: con el relleno de siempre se confundía con
            // el día elegido, que es el único que tiene que destacar.
            classNames={{
              day_today: "font-semibold text-primary",
              day_selected:
                "rounded-full bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
              cell: "h-9 w-9 p-0 text-center text-sm",
              day: "inline-flex h-9 w-9 items-center justify-center rounded-full p-0 font-normal transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-selected:opacity-100",
            }}
          />

          <div className="flex flex-col gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="programar-fecha">{t("shared.schedule.date")}</Label>
              <Input
                id="programar-fecha"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                placeholder={t("shared.schedule.datePlaceholder")}
                inputMode="numeric"
                autoComplete="off"
                className="tabular-nums"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="programar-hora">{t("shared.schedule.time")}</Label>
              <Input
                id="programar-hora"
                type="time"
                step={60}
                value={hora}
                onChange={(e) => setHora(e.target.value)}
                className="tabular-nums"
              />
            </div>

            {/* La frase: lo elegido en palabras, para leerlo antes de confirmar. */}
            <div
              aria-live="polite"
              className="mt-auto rounded-2xl bg-primary/10 px-4 py-3 text-sm leading-relaxed"
            >
              {leido.ok ? (
                <>
                  <p className="font-medium text-foreground">
                    {t(partesEnBogota(leido.cuando).hora % 12 === 1 ? "shared.schedule.summaryAtOne" : "shared.schedule.summary", {
                      fecha: fechaLarga(leido.cuando, language),
                      hora: horaCorta(leido.cuando, language),
                    })}
                  </p>
                  {zonaLocal && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t("shared.schedule.localTime", { hora: horaCorta(leido.cuando, language, zonaLocal) })}
                    </p>
                  )}
                </>
              ) : (
                <p className={error ? "text-destructive" : "text-muted-foreground"}>
                  {error ?? t("shared.schedule.pickHint")}
                </p>
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" onClick={onCerrar}>{t("shared.schedule.cancel")}</Button>
          <Button onClick={confirmar} disabled={intento && !leido.ok}>
            <CalendarClock className="mr-2 h-4 w-4" aria-hidden />
            {t("shared.schedule.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
