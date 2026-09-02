import { useEffect, useState, type ReactNode } from "react";
import { Coffee, Info, Loader2, Monitor, RotateCcw, ScanFace, VideoOff, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  PRESETS, REGLAS_ESTANDAR, OPCIONES_SEG, OPCIONES_BANO_MIN, OPCIONES_BREAK_MIN,
  detectarPreset, paraGuardar, textoSegundos, mismasReglas,
  type Preset, type ReglaAviso, type ReglaPausas, type ReglasCowork,
} from "@/lib/coworkReglas";

// Panel del supervisor para las reglas de UNA sesión de Cowork (ver
// lib/coworkReglas). Trabaja sobre un BORRADOR: nada se aplica hasta tocar
// "Guardar cambios", porque cada cambio llega en vivo a todas las personas de
// la sesión y no queremos que un menú a medio elegir les cambie los avisos.

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Lo que la sesión tiene guardado HOY (ya normalizado). */
  reglas: ReglasCowork;
  nombreSesion: string;
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

function resumenPausas(p: ReglaPausas): string {
  const supervisor = p.supervisorSeg === null
    ? "a ti nunca"
    : `te avisa ${textoSegundos(p.supervisorSeg)} después de pasarse`;
  return `Baño ${p.banoMin} min/día · Break ${p.breakMin} min · ${supervisor}`;
}

export default function CoworkReglasSheet({ open, onOpenChange, reglas, nombreSesion, onGuardar }: Props) {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const presetActivo = detectarPreset(borrador);
  const sinCambios = mismasReglas(borrador, reglas);

  const cambiarAviso = (clave: ClaveAviso, parche: Partial<ReglaAviso>) =>
    setBorrador((b) => ({ ...b, [clave]: { ...b[clave], ...parche } }));
  const cambiarPausas = (parche: Partial<ReglaPausas>) =>
    setBorrador((b) => ({ ...b, pausas: { ...b.pausas, ...parche } }));
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
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="sm:max-w-md overflow-y-auto">
        <SheetHeader className="text-left space-y-1">
          <p className="text-[11px] font-semibold tracking-widest uppercase text-primary">Reglas de esta sesión</p>
          <SheetTitle className="font-display text-2xl">{nombreSesion || "Esta sesión"}</SheetTitle>
          <SheetDescription>Aplican a todas las personas que entren a esta sesión, hoy y en adelante.</SheetDescription>
        </SheetHeader>

        <div className="mt-5 space-y-2">
          <div className="grid grid-cols-4 rounded-xl bg-muted border border-border p-1">
            {OPCIONES_PRESET.map((op) => {
              const activo = presetActivo === op.valor;
              // "Personalizado" no se elige: es lo que queda al tocar cualquier
              // número. Se muestra activo cuando el borrador ya no coincide con
              // ningún preset.
              const manual = op.valor === "personalizado";
              return (
                <button
                  key={op.valor}
                  type="button"
                  disabled={manual}
                  onClick={() => { if (!manual) setBorrador(PRESETS[op.valor]); }}
                  className={cn(
                    "h-8 tactil:h-10 rounded-lg text-xs font-medium transition-colors disabled:cursor-default",
                    activo
                      ? "bg-card text-foreground ring-1 ring-white/10"
                      : "text-muted-foreground enabled:hover:text-foreground",
                  )}
                >
                  {op.texto}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">
            Estándar es lo que Cowork hace hoy con los chatters. Al tocar cualquier regla pasa a Personalizado.
          </p>
        </div>

        <div className="mt-5 space-y-3">
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
        </div>

        <div className="mt-6 border-t border-border pt-4 space-y-4">
          <p className="flex items-start gap-2 text-xs text-muted-foreground">
            <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>
              Los llamados de atención se registran con estas mismas reglas: si una alerta no existe acá,
              no queda anotada en nadie.
            </span>
          </p>
          <div className="flex items-center justify-between gap-2">
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
      </SheetContent>
    </Sheet>
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
    <div className={cn("rounded-2xl border border-border bg-background/40 p-4 transition-opacity", apagada && "opacity-60")}>
      <div className="flex items-start gap-3">
        {/* La cabecera despliega los campos; el interruptor va AL LADO y no
            adentro del botón (un botón dentro de otro no es HTML válido y el
            clic llegaría a los dos). */}
        <button type="button" onClick={onAlternar} className="flex flex-1 items-start gap-3 text-left min-w-0">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-muted">
            <Icono className="h-4 w-4 text-foreground" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-foreground">{titulo}</span>
            <span className="block text-xs text-muted-foreground">{apagada ? "Sin aviso en esta sesión." : resumen}</span>
          </span>
        </button>
        {activa !== undefined && onActiva && (
          <Switch checked={activa} onCheckedChange={onActiva} aria-label={`${titulo}: activa en esta sesión`} />
        )}
      </div>
      {abierta && (
        <div className="mt-3 grid grid-cols-3 gap-2 border-t border-border/60 pt-3">
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
      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">{etiqueta}</Label>
      <Select value={valor} onValueChange={onCambio}>
        <SelectTrigger className="h-9 tactil:h-10 rounded-xl">
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
