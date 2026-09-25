import { useEffect, useState, type ReactNode } from "react";
import { ChevronDown, Coffee, Info, Loader2, Monitor, RotateCcw, ScanFace, Timer, VideoOff, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useFormato } from "@/hooks/useFormato";
import { useLanguage } from "@/hooks/useLanguage";
import { traducir, type TranslationKey } from "@/lib/i18n";
import type { Traductor } from "./textosCowork";
import {
  PRESETS, REGLAS_ESTANDAR, OPCIONES_SEG, OPCIONES_BANO_MIN, OPCIONES_BREAK_MIN, OPCIONES_RELOJ_SEG,
  detectarPreset, paraGuardar, textoSegundos, mismasReglas,
  type Preset, type ReglaAviso, type ReglaPausas, type ReglaReloj, type ReglasCowork,
} from "@/lib/coworkReglas";

// Popup del supervisor para las reglas de UNA sesión de Cowork (ver
// lib/coworkReglas). Trabaja sobre un BORRADOR: nada se aplica hasta tocar
// "Guardar cambios", porque cada cambio llega en vivo a todas las personas de
// la sesión y no queremos que un menú a medio elegir les cambie los avisos.
//
// Es un Dialog centrado y no un panel lateral: Jhon lo vio en producción como
// Sheet y pidió el popup con el vidrio de Maven. El `Dialog` del proyecto ya
// trae ese acabado (borde translúcido, degradado del acento, blur); acá solo se
// arma el contenido con las mismas piezas de vidrio (`glass-card-subtle`) y en
// dos columnas, para que las cuatro reglas entren de un vistazo sin scroll.

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Lo que la sesión tiene guardado HOY (ya normalizado). */
  reglas: ReglasCowork;
  nombreSesion: string;
  /** Quién dejó estas reglas y cuándo. Vacío = nadie las tocó desde que se
   *  registra (10/09/2026), o la sesión sigue el estándar. */
  autoria?: { quien: string | null; cuando: string | null };
  /** Recibe lo que va a la base: null = volver al estándar. */
  onGuardar: (r: ReglasCowork | null) => Promise<unknown>;
}

type ClaveAviso = "camara" | "encuadre" | "pantalla";

// `valor` es el preset que se guarda en la base (alert_rules.preset): no se traduce.
const OPCIONES_PRESET: { valor: Preset; texto: TranslationKey }[] = [
  { valor: "estricto", texto: "cowork.rules.preset.strict" },
  { valor: "estandar", texto: "cowork.rules.preset.standard" },
  { valor: "relajado", texto: "cowork.rules.preset.relaxed" },
  { valor: "personalizado", texto: "cowork.rules.preset.custom" },
];

/** Las opciones del menú más el valor actual si no está entre ellas: una fila
 *  guardada con otro número (una versión vieja del panel, un ajuste a mano en
 *  la base) no puede perderse solo por abrir el panel. */
function conValorActual(opciones: readonly number[], actual: number): number[] {
  return opciones.includes(actual) ? [...opciones] : [...opciones, actual].sort((a, b) => a - b);
}

const NUNCA = "nunca";

interface Opcion { valor: string; texto: string; textoCorto?: string }

function opcionesSegundos(actual: number): Opcion[] {
  return conValorActual(OPCIONES_SEG, actual).map((s) => ({ valor: String(s), texto: textoSegundos(s) }));
}

function opcionesSupervisor(t: Traductor, actual: number | null, sufijo?: string): Opcion[] {
  const base = actual === null ? [...OPCIONES_SEG] : conValorActual(OPCIONES_SEG, actual);
  return [
    ...base.map((s) => ({
      valor: String(s),
      texto: sufijo ? `${textoSegundos(s)} ${sufijo}` : textoSegundos(s),
      textoCorto: textoSegundos(s),
    })),
    { valor: NUNCA, texto: t("cowork.rules.never") },
  ];
}


function resumenAviso(r: ReglaAviso, t: Traductor): string {
  if (!r.activa) return t("cowork.rules.noAlert");
  const supervisor = r.supervisorSeg === null
    ? t("cowork.rules.summary.neverToYou")
    : t("cowork.rules.summary.alertsYouAt", { time: textoSegundos(r.supervisorSeg) });
  return t("cowork.rules.summary.alert", {
    first: textoSegundos(r.primerAvisoSeg), repeat: textoSegundos(r.repetirSeg), supervisor,
  });
}

function resumenReloj(r: ReglaReloj, camara: boolean, pantalla: boolean, t: Traductor): string {
  const exige = camara && pantalla ? t("cowork.rules.clock.requiresBoth")
    : camara ? t("cowork.rules.clock.requiresCamera")
    : pantalla ? t("cowork.rules.clock.requiresScreen")
    : t("cowork.rules.clock.requiresNone");
  const paradas = [
    t("cowork.rules.clock.stopPaused"),
    camara ? t("cowork.rules.clock.stopNoCamera") : null,
    pantalla ? t("cowork.rules.clock.stopNoScreen") : null,
    camara ? t("cowork.rules.clock.stopNobody", { time: textoSegundos(r.fueraDeCamaraSeg) }) : null,
  ].filter(Boolean).join(", ");
  return t("cowork.rules.clock.summary", { requires: exige, stops: paradas });
}

function resumenPausas(p: ReglaPausas, t: Traductor): string {
  const supervisor = p.supervisorSeg === null
    ? t("cowork.rules.summary.neverToYou")
    : t("cowork.rules.summary.alertsYouAfter", { time: textoSegundos(p.supervisorSeg) });
  return t("cowork.rules.summary.pauses", { bathroom: p.banoMin, break: p.breakMin, supervisor });
}

/** "por Yoselin Castillo · 8 de sept", o null si no hay nada que decir.
 *  Sin `t` sale en el idioma vigente (los tests la llaman sola). */
export function firmaDeLasReglas(
  autoria?: { quien: string | null; cuando: string | null },
  locale: string = "es-CO",
  t: Traductor = traducir,
): string | null {
  if (!autoria?.quien && !autoria?.cuando) return null;
  const cuando = autoria.cuando
    ? new Date(autoria.cuando).toLocaleDateString(locale, { day: "numeric", month: "short" })
    : null;
  if (autoria.quien && cuando) return t("cowork.rules.signature.byOn", { name: autoria.quien, date: cuando });
  if (autoria.quien) return t("cowork.rules.signature.by", { name: autoria.quien });
  return t("cowork.rules.signature.on", { date: cuando ?? "" });
}

export default function CoworkReglasDialog({ open, onOpenChange, reglas, nombreSesion, autoria, onGuardar }: Props) {
  const f = useFormato();
  const { t } = useLanguage();
  const [borrador, setBorrador] = useState<ReglasCowork>(reglas);
  const [guardando, setGuardando] = useState(false);
  const [abiertas, setAbiertas] = useState<Record<string, boolean>>({});

  // Cada apertura arranca de lo guardado: si la vez anterior se cerró sin
  // guardar, ese borrador no tiene por qué seguir ahí. SOLO al abrir: `reglas`
  // cambia de identidad con cada refetch de la sesión (el realtime de
  // cualquier tabla de Cowork lo dispara), y resetear ahí borraría lo que el
  // supervisor está eligiendo en ese momento.
  useEffect(() => {
    if (!open) return;
    setBorrador(reglas);
    setAbiertas({});
    setModoPersonalizado(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // "Personalizado" no tiene valores propios: es lo que queda al tocar
  // cualquier número. Pero Jhon lo intentó tocar y no pasaba nada, y un botón
  // que no responde se lee como roto. Ahora al elegirlo se marca y se
  // despliegan las cuatro tarjetas: la invitación es "ajústalas una por una".
  // La marca dura hasta que se elija otro preset; guardar sigue usando los
  // valores reales (si quedaron iguales a un preset, se guarda ese).
  const [modoPersonalizado, setModoPersonalizado] = useState(false);
  const presetActivo = modoPersonalizado ? "personalizado" : detectarPreset(borrador);
  const sinCambios = mismasReglas(borrador, reglas);

  const cambiarAviso = (clave: ClaveAviso, parche: Partial<ReglaAviso>) =>
    setBorrador((b) => ({ ...b, [clave]: { ...b[clave], ...parche } }));
  const cambiarPausas = (parche: Partial<ReglaPausas>) =>
    setBorrador((b) => ({ ...b, pausas: { ...b.pausas, ...parche } }));
  const cambiarReloj = (parche: Partial<ReglaReloj>) =>
    setBorrador((b) => ({ ...b, reloj: { ...b.reloj, ...parche } }));
  const alternar = (clave: string) => setAbiertas((a) => ({ ...a, [clave]: !a[clave] }));

  const guardar = async () => {
    setGuardando(true);
    try {
      await onGuardar(paraGuardar(borrador));
      toast.success(t("cowork.rules.saved"), { description: t("cowork.rules.savedDesc") });
      onOpenChange(false);
    } catch (e) {
      toast.error(t("cowork.rules.saveError"), { description: (e as Error).message });
    } finally {
      setGuardando(false);
    }
  };

  const camposAviso = (clave: ClaveAviso) => {
    const r = borrador[clave];
    return (
      <>
        <CampoOpcion
          etiqueta={t("cowork.rules.firstAlert")}
          valor={String(r.primerAvisoSeg)}
          opciones={opcionesSegundos(r.primerAvisoSeg)}
          onCambio={(v) => cambiarAviso(clave, { primerAvisoSeg: Number(v) })}
        />
        <CampoOpcion
          etiqueta={t("cowork.rules.repeatEvery")}
          valor={String(r.repetirSeg)}
          opciones={opcionesSegundos(r.repetirSeg)}
          onCambio={(v) => cambiarAviso(clave, { repetirSeg: Number(v) })}
        />
        <CampoOpcion
          etiqueta={t("cowork.rules.alertYouAt")}
          valor={r.supervisorSeg === null ? NUNCA : String(r.supervisorSeg)}
          opciones={opcionesSupervisor(t, r.supervisorSeg)}
          onCambio={(v) => cambiarAviso(clave, { supervisorSeg: v === NUNCA ? null : Number(v) })}
        />
      </>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-1.5rem)] sm:max-w-3xl max-h-[92vh] overflow-y-auto overflow-x-hidden gap-0 p-0 grid-cols-[minmax(0,1fr)] [&>*]:min-w-0">
        {/* Cabecera: el nombre grande en la display, como los títulos del
            reskin. El degradado del acento del Dialog vive justo detrás. */}
        <DialogHeader className="px-7 pt-7 pb-5 text-left space-y-1.5">
          <p className="text-xs font-semibold text-primary">{t("cowork.rules.eyebrow")}</p>
          <DialogTitle className="font-display text-[26px] leading-tight tracking-tight">{nombreSesion || t("cowork.common.thisSession")}</DialogTitle>
          <DialogDescription>{t("cowork.rules.desc")}</DialogDescription>
          {/* Quién las dejó así. Antes no quedaba registro: Jhon vio cuatro
              sesiones con las alertas apagadas y no había forma de saber quién
              lo había hecho (09/09/2026). */}
          {firmaDeLasReglas(autoria, f.intl("es-CO"), t) && (
            <p className="text-xs text-muted-foreground">
              {t("cowork.rules.customized", { signature: firmaDeLasReglas(autoria, f.intl("es-CO"), t) ?? "" })}
            </p>
          )}
        </DialogHeader>

        <div className="px-7 space-y-2">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1 rounded-2xl sm:rounded-full bg-white/[0.04] border border-white/10 p-1 backdrop-blur-md">
            {OPCIONES_PRESET.map((op) => {
              const activo = presetActivo === op.valor;
              const manual = op.valor === "personalizado";
              return (
                <button
                  key={op.valor}
                  type="button"
                  onClick={() => {
                    if (manual) {
                      setModoPersonalizado(true);
                      setAbiertas({ camara: true, encuadre: true, pantalla: true, pausas: true, reloj: true });
                      return;
                    }
                    setModoPersonalizado(false);
                    setBorrador(PRESETS[op.valor]);
                  }}
                  className={cn(
                    "h-8 tactil:h-10 min-w-0 truncate px-2 rounded-full text-xs font-medium transition-all",
                    activo
                      ? "bg-primary text-primary-foreground shadow-md shadow-primary/30"
                      : "text-muted-foreground hover:text-foreground hover:bg-white/[0.06]",
                  )}
                >
                  {t(op.texto)}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground px-1">{t("cowork.rules.presetsHint")}</p>
        </div>

        <div className="px-7 pt-5 grid grid-cols-1 sm:grid-cols-2 gap-3 items-start">
          <TarjetaRegla
            icono={VideoOff}
            titulo={t("cowork.rules.camera")}
            resumen={resumenAviso(borrador.camara, t)}
            activa={borrador.camara.activa}
            onActiva={(v) => cambiarAviso("camara", { activa: v })}
            abierta={!!abiertas.camara}
            onAlternar={() => alternar("camara")}
          >
            {camposAviso("camara")}
          </TarjetaRegla>

          <TarjetaRegla
            icono={ScanFace}
            titulo={t("cowork.rules.framing")}
            resumen={
              <>
                <span className="block">{t("cowork.rules.framingHint")}</span>
                <span className="block">{resumenAviso(borrador.encuadre, t)}</span>
              </>
            }
            activa={borrador.encuadre.activa}
            onActiva={(v) => cambiarAviso("encuadre", { activa: v })}
            abierta={!!abiertas.encuadre}
            onAlternar={() => alternar("encuadre")}
          >
            {camposAviso("encuadre")}
          </TarjetaRegla>

          <TarjetaRegla
            icono={Monitor}
            titulo={t("cowork.rules.screen")}
            resumen={resumenAviso(borrador.pantalla, t)}
            activa={borrador.pantalla.activa}
            onActiva={(v) => cambiarAviso("pantalla", { activa: v })}
            abierta={!!abiertas.pantalla}
            onAlternar={() => alternar("pantalla")}
          >
            {camposAviso("pantalla")}
          </TarjetaRegla>

          {/* Las pausas no se apagan: el tope existe siempre, lo que cambia es
              cuánto y si el supervisor se entera cuando alguien se pasa. */}
          <TarjetaRegla
            icono={Coffee}
            titulo={t("cowork.rules.pauses")}
            resumen={resumenPausas(borrador.pausas, t)}
            abierta={!!abiertas.pausas}
            onAlternar={() => alternar("pausas")}
          >
            <CampoOpcion
              etiqueta={t("cowork.pause.bano")}
              valor={String(borrador.pausas.banoMin)}
              opciones={conValorActual(OPCIONES_BANO_MIN, borrador.pausas.banoMin)
                .map((m) => ({ valor: String(m), texto: t("cowork.rules.minPerDay", { n: m }) }))}
              onCambio={(v) => cambiarPausas({ banoMin: Number(v) })}
            />
            <CampoOpcion
              etiqueta={t("cowork.pause.break")}
              valor={String(borrador.pausas.breakMin)}
              opciones={conValorActual(OPCIONES_BREAK_MIN, borrador.pausas.breakMin)
                .map((m) => ({ valor: String(m), texto: `${m} min` }))}
              onCambio={(v) => cambiarPausas({ breakMin: Number(v) })}
            />
            <CampoOpcion
              etiqueta={t("cowork.rules.alertYou")}
              valor={borrador.pausas.supervisorSeg === null ? NUNCA : String(borrador.pausas.supervisorSeg)}
              opciones={opcionesSupervisor(t, borrador.pausas.supervisorSeg, t("cowork.rules.afterGoingOver"))}
              onCambio={(v) => cambiarPausas({ supervisorSeg: v === NUNCA ? null : Number(v) })}
            />
          </TarjetaRegla>

          {/* El reloj de tiempo trabajado (reemplazo de Hubstaff). No se apaga:
              lo único ajustable es la tolerancia del "no hay nadie". Mal
              encuadre y poca luz nunca lo detienen — para eso están las
              tarjetas de arriba. */}
          <TarjetaRegla
            icono={Timer}
            titulo={t("cowork.rules.clock")}
            resumen={resumenReloj(borrador.reloj, borrador.camara.activa, borrador.pantalla.activa, t)}
            abierta={!!abiertas.reloj}
            onAlternar={() => alternar("reloj")}
          >
            <CampoOpcion
              etiqueta={t("cowork.rules.nobodyOnCamera")}
              valor={String(borrador.reloj.fueraDeCamaraSeg)}
              opciones={conValorActual(OPCIONES_RELOJ_SEG, borrador.reloj.fueraDeCamaraSeg)
                .map((sg) => ({ valor: String(sg), texto: t("cowork.rules.andStops", { time: textoSegundos(sg) }) }))}
              onCambio={(v) => cambiarReloj({ fueraDeCamaraSeg: Number(v) })}
            />
            <p className="text-xs text-muted-foreground sm:col-span-2">{t("cowork.rules.clockHint")}</p>
          </TarjetaRegla>
        </div>

        <div className="mt-6 mx-7 mb-7 border-t border-white/10 pt-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-start gap-2 text-xs text-muted-foreground sm:max-w-[46%]">
            <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>{t("cowork.rules.logHint")}</span>
          </p>
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="ghost"
              className="gap-1.5 tactil:h-10"
              disabled={guardando}
              onClick={() => setBorrador(REGLAS_ESTANDAR)}
            >
              <RotateCcw className="h-3.5 w-3.5" /> {t("cowork.rules.reset")}
            </Button>
            <Button className="gap-1.5 tactil:h-10" disabled={sinCambios || guardando} onClick={() => void guardar()}>
              {guardando && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("cowork.rules.saveChanges")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Piezas ───────────────────────────────────────────────────────────────────

interface TarjetaProps {
  icono: LucideIcon;
  titulo: string;
  resumen: ReactNode;
  /** Sin `activa` la tarjeta no tiene interruptor (Pausas). */
  activa?: boolean;
  onActiva?: (v: boolean) => void;
  abierta: boolean;
  onAlternar: () => void;
  children: ReactNode;
}

function TarjetaRegla({ icono: Icono, titulo, resumen, activa, onActiva, abierta, onAlternar, children }: TarjetaProps) {
  const { t } = useLanguage();
  const apagada = activa === false;
  return (
    <div className={cn("glass-card-subtle bg-white/[0.03] p-4 transition-all hover:bg-white/[0.05]", apagada && "opacity-60")}>
      <div className="flex items-start gap-3">
        {/* La cabecera despliega los campos; el interruptor va AL LADO y no
            adentro del botón (un botón dentro de otro no es HTML válido y el
            clic llegaría a los dos). */}
        <button type="button" onClick={onAlternar} className="flex flex-1 items-start gap-3 text-left min-w-0">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/15 ring-1 ring-primary/25">
            <Icono className="h-4 w-4 text-primary" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-foreground">{titulo}</span>
            <span className="block text-xs text-muted-foreground">{apagada ? t("cowork.rules.noAlert") : resumen}</span>
          </span>
          <ChevronDown className={cn("h-4 w-4 shrink-0 mt-2 text-muted-foreground/60 transition-transform", abierta && "rotate-180")} />
        </button>
        {activa !== undefined && onActiva && (
          <Switch checked={activa} onCheckedChange={onActiva} aria-label={t("cowork.rules.switchAria", { title: titulo })} />
        )}
      </div>
      {abierta && (
        <div className="mt-3 grid grid-cols-3 gap-2 border-t border-white/10 pt-3">
          {children}
        </div>
      )}
    </div>
  );
}

interface CampoProps {
  etiqueta: string;
  valor: string;
  opciones: Opcion[];
  onCambio: (valor: string) => void;
}

function CampoOpcion({ etiqueta, valor, opciones, onCambio }: CampoProps) {
  const actual = opciones.find((o) => o.valor === valor);
  return (
    <div className="space-y-1 min-w-0">
      <Label className="text-xs text-muted-foreground">{etiqueta}</Label>
      <Select value={valor} onValueChange={onCambio}>
        <SelectTrigger className="h-9 tactil:h-10 rounded-xl bg-white/[0.04] border-white/10">
          {/* En el disparador va la versión corta: "3:00 después de pasarse"
              no entra en un tercio del panel. El menú sí dice la frase entera. */}
          <SelectValue>{actual?.textoCorto ?? actual?.texto ?? valor}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {opciones.map((o) => (
            <SelectItem key={o.valor} value={o.valor}>{o.texto}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
