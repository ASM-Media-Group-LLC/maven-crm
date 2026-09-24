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

const OPCIONES_PRESET: { valor: Preset; texto: string }[] = [
  { valor: "estricto", texto: "Estricto" },
  { valor: "estandar", texto: "Estándar" },
  { valor: "relajado", texto: "Relajado" },
  { valor: "personalizado", texto: "Personalizado" },
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

function opcionesSupervisor(actual: number | null, sufijo?: string): Opcion[] {
  const base = actual === null ? [...OPCIONES_SEG] : conValorActual(OPCIONES_SEG, actual);
  return [
    ...base.map((s) => ({
      valor: String(s),
      texto: sufijo ? `${textoSegundos(s)} ${sufijo}` : textoSegundos(s),
      textoCorto: textoSegundos(s),
    })),
    { valor: NUNCA, texto: "Nunca" },
  ];
}


function resumenAviso(r: ReglaAviso): string {
  if (!r.activa) return "Sin aviso en esta sesión.";
  const supervisor = r.supervisorSeg === null ? "a ti nunca" : `te avisa a los ${textoSegundos(r.supervisorSeg)}`;
  return `Se le avisa a la persona a ${textoSegundos(r.primerAvisoSeg)} y cada ${textoSegundos(r.repetirSeg)} · ${supervisor}`;
}

function resumenReloj(r: ReglaReloj, camara: boolean, pantalla: boolean): string {
  const exige = camara && pantalla ? "cámara y pantalla" : camara ? "cámara (la pantalla no se exige acá)" : pantalla ? "pantalla (la cámara no se exige acá)" : "estar en la sala (ni cámara ni pantalla se exigen acá)";
  const paradas = [
    "en pausa",
    camara ? "sin cámara" : null,
    pantalla ? "sin pantalla" : null,
    camara ? `si no hay nadie ${textoSegundos(r.fueraDeCamaraSeg)} seguidos` : null,
  ].filter(Boolean).join(", ");
  return `Corre con ${exige} · se detiene ${paradas}`;
}

function resumenPausas(p: ReglaPausas): string {
  const supervisor = p.supervisorSeg === null
    ? "a ti nunca"
    : `te avisa ${textoSegundos(p.supervisorSeg)} después de pasarse`;
  return `Baño ${p.banoMin} min/día · Break ${p.breakMin} min · ${supervisor}`;
}

/** "por Yoselin Castillo · 8 de sept", o null si no hay nada que decir. */
export function firmaDeLasReglas(autoria?: { quien: string | null; cuando: string | null }, locale: string = "es-CO"): string | null {
  if (!autoria?.quien && !autoria?.cuando) return null;
  const cuando = autoria.cuando
    ? new Date(autoria.cuando).toLocaleDateString(locale, { day: "numeric", month: "short" })
    : null;
  if (autoria.quien && cuando) return `por ${autoria.quien} · ${cuando}`;
  if (autoria.quien) return `por ${autoria.quien}`;
  return `el ${cuando}`;
}

export default function CoworkReglasDialog({ open, onOpenChange, reglas, nombreSesion, autoria, onGuardar }: Props) {
  const f = useFormato();
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
      toast.success("Reglas guardadas", { description: "Aplican en vivo a quienes ya están en la sesión." });
      onOpenChange(false);
    } catch (e) {
      toast.error("No se pudieron guardar las reglas", { description: (e as Error).message });
    } finally {
      setGuardando(false);
    }
  };

  const camposAviso = (clave: ClaveAviso) => {
    const r = borrador[clave];
    return (
      <>
        <CampoOpcion
          etiqueta="Primer aviso"
          valor={String(r.primerAvisoSeg)}
          opciones={opcionesSegundos(r.primerAvisoSeg)}
          onCambio={(v) => cambiarAviso(clave, { primerAvisoSeg: Number(v) })}
        />
        <CampoOpcion
          etiqueta="Repetir cada"
          valor={String(r.repetirSeg)}
          opciones={opcionesSegundos(r.repetirSeg)}
          onCambio={(v) => cambiarAviso(clave, { repetirSeg: Number(v) })}
        />
        <CampoOpcion
          etiqueta="Avisarte a los"
          valor={r.supervisorSeg === null ? NUNCA : String(r.supervisorSeg)}
          opciones={opcionesSupervisor(r.supervisorSeg)}
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
          <p className="text-xs font-semibold text-primary">Reglas de esta sesión</p>
          <DialogTitle className="font-display text-[26px] leading-tight tracking-tight">{nombreSesion || "Esta sesión"}</DialogTitle>
          <DialogDescription>Aplican a todas las personas que entren a esta sesión, hoy y en adelante.</DialogDescription>
          {/* Quién las dejó así. Antes no quedaba registro: Jhon vio cuatro
              sesiones con las alertas apagadas y no había forma de saber quién
              lo había hecho (09/09/2026). */}
          {firmaDeLasReglas(autoria, f.intl("es-CO")) && (
            <p className="text-xs text-muted-foreground">
              Personalizadas {firmaDeLasReglas(autoria, f.intl("es-CO"))}
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
                  {op.texto}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground px-1">
            Estándar es lo que Cowork hace hoy con los chatters. Personalizado abre las cuatro reglas para ajustarlas una por una.
          </p>
        </div>

        <div className="px-7 pt-5 grid grid-cols-1 sm:grid-cols-2 gap-3 items-start">
          <TarjetaRegla
            icono={VideoOff}
            titulo="Cámara apagada"
            resumen={resumenAviso(borrador.camara)}
            activa={borrador.camara.activa}
            onActiva={(v) => cambiarAviso("camara", { activa: v })}
            abierta={!!abiertas.camara}
            onAlternar={() => alternar("camara")}
          >
            {camposAviso("camara")}
          </TarjetaRegla>

          <TarjetaRegla
            icono={ScanFace}
            titulo="Encuadre y luz"
            resumen={
              <>
                <span className="block">Sin rostro, fuera de cuadro o con poca luz.</span>
                <span className="block">{resumenAviso(borrador.encuadre)}</span>
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
            titulo="Compartir pantalla"
            resumen={resumenAviso(borrador.pantalla)}
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
            titulo="Pausas"
            resumen={resumenPausas(borrador.pausas)}
            abierta={!!abiertas.pausas}
            onAlternar={() => alternar("pausas")}
          >
            <CampoOpcion
              etiqueta="Baño"
              valor={String(borrador.pausas.banoMin)}
              opciones={conValorActual(OPCIONES_BANO_MIN, borrador.pausas.banoMin)
                .map((m) => ({ valor: String(m), texto: `${m} min/día` }))}
              onCambio={(v) => cambiarPausas({ banoMin: Number(v) })}
            />
            <CampoOpcion
              etiqueta="Break"
              valor={String(borrador.pausas.breakMin)}
              opciones={conValorActual(OPCIONES_BREAK_MIN, borrador.pausas.breakMin)
                .map((m) => ({ valor: String(m), texto: `${m} min` }))}
              onCambio={(v) => cambiarPausas({ breakMin: Number(v) })}
            />
            <CampoOpcion
              etiqueta="Avisarte"
              valor={borrador.pausas.supervisorSeg === null ? NUNCA : String(borrador.pausas.supervisorSeg)}
              opciones={opcionesSupervisor(borrador.pausas.supervisorSeg, "después de pasarse")}
              onCambio={(v) => cambiarPausas({ supervisorSeg: v === NUNCA ? null : Number(v) })}
            />
          </TarjetaRegla>

          {/* El reloj de tiempo trabajado (reemplazo de Hubstaff). No se apaga:
              lo único ajustable es la tolerancia del "no hay nadie". Mal
              encuadre y poca luz nunca lo detienen — para eso están las
              tarjetas de arriba. */}
          <TarjetaRegla
            icono={Timer}
            titulo="Reloj de tiempo trabajado"
            resumen={resumenReloj(borrador.reloj, borrador.camara.activa, borrador.pantalla.activa)}
            abierta={!!abiertas.reloj}
            onAlternar={() => alternar("reloj")}
          >
            <CampoOpcion
              etiqueta="Nadie frente a la cámara"
              valor={String(borrador.reloj.fueraDeCamaraSeg)}
              opciones={conValorActual(OPCIONES_RELOJ_SEG, borrador.reloj.fueraDeCamaraSeg)
                .map((sg) => ({ valor: String(sg), texto: `${textoSegundos(sg)} y se detiene` }))}
              onCambio={(v) => cambiarReloj({ fueraDeCamaraSeg: Number(v) })}
            />
            <p className="text-xs text-muted-foreground sm:col-span-2">
              El reloj exige lo mismo que las alertas de arriba: si apagas la de pantalla, no se detiene por pantalla;
              si apagas la de cámara, tampoco por cámara. Agacharse un momento no descuenta: se detiene solo cuando
              la ausencia dura más que esto. Muy lejos o con poca luz no lo detienen; eso va por las alertas de encuadre.
            </p>
          </TarjetaRegla>
        </div>

        <div className="mt-6 mx-7 mb-7 border-t border-white/10 pt-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-start gap-2 text-xs text-muted-foreground sm:max-w-[46%]">
            <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>
              Los llamados de atención se registran con estas mismas reglas: si una alerta no existe acá,
              no queda anotada en nadie.
            </span>
          </p>
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="ghost"
              className="gap-1.5 tactil:h-10"
              disabled={guardando}
              onClick={() => setBorrador(REGLAS_ESTANDAR)}
            >
              <RotateCcw className="h-3.5 w-3.5" /> Restablecer estándar
            </Button>
            <Button className="gap-1.5 tactil:h-10" disabled={sinCambios || guardando} onClick={() => void guardar()}>
              {guardando && <Loader2 className="h-4 w-4 animate-spin" />}
              Guardar cambios
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
            <span className="block text-xs text-muted-foreground">{apagada ? "Sin aviso en esta sesión." : resumen}</span>
          </span>
          <ChevronDown className={cn("h-4 w-4 shrink-0 mt-2 text-muted-foreground/60 transition-transform", abierta && "rotate-180")} />
        </button>
        {activa !== undefined && onActiva && (
          <Switch checked={activa} onCheckedChange={onActiva} aria-label={`${titulo}: activa en esta sesión`} />
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
