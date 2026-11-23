import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Coffee, Pause, Play, Square, Utensils } from "lucide-react";
import { toast } from "sonner";
import { useLanguage } from "@/hooks/useLanguage";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { horaUI } from "@/lib/formatoHora";
import { useAhoraCadaSegundo } from "@/lib/ahoraCompartido";
import { pedirACowork, pedirACoworkAhora } from "@/lib/pedidoACowork";
import { useAccionesTurno, useMiTurno } from "@/hooks/useMiTurno";
import { useAuth } from "@/hooks/useAuth";
import { useJornadaAcciones, useJornadaConfig } from "@/hooks/useJornada";
import { RegistrosJornada } from "@/components/turno/RegistrosJornada";
import { Button } from "@/components/ui/button";
import { useMiPausa } from "@/hooks/usePausas";
import { AvisoEntrada, CLASE_BOTON_SUAVE, ConfirmarSalida, PreguntaSigues, TarjetaTurno, type EstadoTurno } from "@/components/turno/PiezasTurno";

// LA TARJETA DEL TURNO EN EL MENÚ (Alvaro, 19/11/2026): marcar entrada, pausa
// (baño/comida) y salida. Con el diseño que eligió («En turno»). Si la persona no
// marca (admin, dueño o exonerado), no se dibuja. «¿Sigues?» sale 30 min después
// de su salida; si no responde en 5 min, se marca la salida sola.

const SIGUES_TRAS_MIN = 30;
const SIGUES_ESPERA_MIN = 5;

export function TurnoEnMenu({ compacto = false }: { compacto?: boolean }) {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const q = useMiTurno();
  const config = useJornadaConfig();
  const jornada = useJornadaAcciones();
  const independiente = config.data?.configurada === true;
  const { user } = useAuth();
  const miPausa = useMiPausa(user?.id);
  const { entrar, salir, sigo } = useAccionesTurno();
  const tr = q.data;
  // El reloj compartido: 1 s a la vista, 30 s fuera (lib/ahoraCompartido.ts).
  const ahora = useAhoraCadaSegundo();
  const [abrirEntrada, setAbrirEntrada] = useState(false);
  const [abrirSalida, setAbrirSalida] = useState(false);
  const [preguntaDesde, setPreguntaDesde] = useState<number | null>(null);
  const cerrandoSolo = useRef(false);

  const ms = (iso: string | null | undefined) => (iso ? Date.parse(iso) : null);
  const fin = ms(tr?.turno_fin);
  const fueraDeHorario = !!tr?.abierta && fin != null && ahora > fin;

  // «¿Sigues trabajando?» 30 min después de su salida.
  useEffect(() => {
    if (!tr?.abierta || fin == null) { setPreguntaDesde(null); return; }
    const sigueHasta = ms(tr.sigue_hasta);
    const toca = ahora >= fin + SIGUES_TRAS_MIN * 60_000 && (sigueHasta == null || sigueHasta < ahora);
    if (toca && preguntaDesde == null) setPreguntaDesde(ahora);
    if (!toca && preguntaDesde != null) setPreguntaDesde(null);
  }, [tr?.abierta, tr?.sigue_hasta, fin, ahora, preguntaDesde]);
  useEffect(() => {
    if (preguntaDesde == null || cerrandoSolo.current) return;
    if (ahora - preguntaDesde >= SIGUES_ESPERA_MIN * 60_000) {
      cerrandoSolo.current = true;
      salir.mutate("olvido", { onSettled: () => { cerrandoSolo.current = false; setPreguntaDesde(null); } });
      pedirACowork({ tipo: "salida" });
    }
  }, [ahora, preguntaDesde, salir]);

  const estado: EstadoTurno = useMemo(() => {
    if (!tr) return "fuera";
    if (tr.abierta && tr.en_pausa) return "en_pausa";
    if (tr.abierta) return "en_turno";
    return tr.puede ? "puede" : "fuera";
  }, [tr]);

  if (!tr || !tr.aplica) return null;
  if (!config.data) return config.isError
    ? <Button variant="ghost" size="sm" onClick={() => void config.refetch()}>{t("cowork.jornada.reintentar")}</Button>
    : null;

  const entradaTxt = tr.turno_inicio ? horaUI(tr.turno_inicio) : null;
  const horarioTxt = tr.turno_inicio && tr.turno_fin ? `${horaUI(tr.turno_inicio)} – ${horaUI(tr.turno_fin)}` : null;
  const transcurrido = tr.marca_inicio ? (ahora - Date.parse(tr.marca_inicio)) / 1000 : 0;
  const pausaSeg = tr.pausa_desde ? (ahora - Date.parse(tr.pausa_desde)) / 1000 : 0;
  const faltaSeg = tr.turno_inicio ? (Date.parse(tr.turno_inicio) - ahora) / 1000 : null;

  const marcarEntrada = () => {
    entrar.mutate({ aceptarTerminos: !tr.terminos_ok }, {
      onSuccess: () => {
        setAbrirEntrada(false);
        toast.success(t("cowork.turno.toast.entrada"));
        if (!independiente) navigate("/cowork");
      },
      onError: (e) => toast.error(t("cowork.turno.toast.noEntrada"), { description: (e as Error).message }),
    });
  };
  const marcarSalida = () => {
    salir.mutate("manual", {
      onSuccess: () => { setAbrirSalida(false); setPreguntaDesde(null); pedirACowork({ tipo: "salida" }); toast.success(t("cowork.turno.toast.salida")); },
      onError: (e) => toast.error(t("cowork.turno.toast.noSalida"), { description: (e as Error).message }),
    });
  };
  const pausar = (kind: "bano" | "almuerzo") => {
    if (independiente) {
      if (!pedirACoworkAhora({ tipo: "pausar", kind })) jornada.pausar.mutate(kind, { onError: (e) => toast.error(e.message) });
      else window.setTimeout(() => void q.refetch(), 1500);
      return;
    }
    if (!pedirACowork({ tipo: "pausar", kind })) navigate("/cowork");
    window.setTimeout(() => void q.refetch(), 2500);
  };
  const volver = () => {
    if (independiente) {
      if (!pedirACoworkAhora({ tipo: "volver" })) jornada.retomar.mutate(undefined, { onError: (e) => toast.error(e.message) });
      else window.setTimeout(() => void q.refetch(), 1500);
      return;
    }
    if (!pedirACowork({ tipo: "volver" })) navigate("/cowork");
    window.setTimeout(() => void q.refetch(), 2500);
  };

  // Menú lateral plegado: solo un botón redondo con el estado.
  if (compacto) {
    const enTurno = estado === "en_turno" || estado === "en_pausa";
    return (
      <button type="button" onClick={() => (enTurno ? setAbrirSalida(true) : tr.puede && setAbrirEntrada(true))}
        title={enTurno ? t("cowork.turno.marcarSalida") : t("cowork.turno.marcarEntrada")}
        className={`mx-auto flex h-9 w-9 items-center justify-center rounded-xl ${enTurno ? "bg-success/15 text-success ring-1 ring-success/40" : tr.puede ? "bg-success text-success-foreground" : "bg-foreground/[0.06] text-muted-foreground"}`}>
        {enTurno ? <Square className="h-3.5 w-3.5 fill-current" /> : <Play className="h-4 w-4 fill-current" />}
      </button>
    );
  }

  return (
    <>
      <div>
        <TarjetaTurno
          soloRegistro={independiente}
          estado={estado}
          entrada={entradaTxt}
          horario={horarioTxt}
          desde={tr.puede_desde ? horaUI(tr.puede_desde) : null}
          faltaSeg={faltaSeg}
          transcurridoSeg={transcurrido}
          pausaSeg={pausaSeg}
          cupoPausaSeg={Math.max(0, tr.cupo_seg - Math.max(0, tr.pausa_usada_seg - pausaSeg))}
          fueraDeHorario={fueraDeHorario}
          onEntrada={() => setAbrirEntrada(true)}
          onVolver={volver}
          onSalida={() => setAbrirSalida(true)}
          botonPausa={
            // «Pausa» abre el menú baño / comida.
            (config.data.registra_comida || config.data.registra_bano) && <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" className={`${CLASE_BOTON_SUAVE} h-10 text-sm`}><Pause className="h-3.5 w-3.5 fill-current" />{t("cowork.turno.pausa")}</button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" side="top" className="w-48">
                {config.data.registra_bano && <DropdownMenuItem onSelect={() => pausar("bano")} className="gap-2"><Coffee className="h-4 w-4" />{t("cowork.turno.pausaBano")}</DropdownMenuItem>}
                {config.data.registra_comida && <DropdownMenuItem onSelect={() => pausar("almuerzo")} className="gap-2"><Utensils className="h-4 w-4" />{t("cowork.turno.pausaComida")}</DropdownMenuItem>}
              </DropdownMenuContent>
            </DropdownMenu>
          }
          t={t}
        />
        {independiente && <RegistrosJornada />}
      </div>

      <Dialog open={abrirEntrada} onOpenChange={setAbrirEntrada}>
        <DialogContent className="max-w-2xl overflow-hidden border-border/60 p-0">
          <DialogTitle className="sr-only">{t("cowork.turno.aviso.titulo")}</DialogTitle>
          {independiente ? <div className="space-y-4 p-6">
            <h2 className="text-lg font-semibold">{t("cowork.jornada.iniciar")}</h2>
            <p className="text-sm text-muted-foreground">{t("cowork.jornada.aviso")}</p>
            <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setAbrirEntrada(false)}>{t("cowork.jornada.cancelar")}</Button><Button disabled={entrar.isPending} onClick={marcarEntrada}>{t("cowork.turno.marcarEntrada")}</Button></div>
          </div> : <AvisoEntrada primeraVez={!tr.terminos_ok} horario={horarioTxt} pausa={miPausa.data ?? null} onAceptar={marcarEntrada} onCancelar={() => setAbrirEntrada(false)} t={t} />}
        </DialogContent>
      </Dialog>

      <Dialog open={abrirSalida} onOpenChange={setAbrirSalida}>
        <DialogContent className="max-w-md overflow-hidden border-border/60 p-0">
          <DialogTitle className="sr-only">{t("cowork.turno.salida.titulo")}</DialogTitle>
          <ConfirmarSalida transcurridoSeg={transcurrido} onConfirmar={marcarSalida} onCancelar={() => setAbrirSalida(false)} t={t} />
        </DialogContent>
      </Dialog>

      <Dialog open={preguntaDesde != null} onOpenChange={() => undefined}>
        <DialogContent className="max-w-md overflow-hidden border-border/60 p-0 [&>button]:hidden">
          <DialogTitle className="sr-only">{t("cowork.turno.sigues.titulo")}</DialogTitle>
          <PreguntaSigues
            salida={tr.turno_fin ? horaUI(tr.turno_fin) : "—"}
            minutosParaCerrar={Math.max(1, Math.ceil((SIGUES_ESPERA_MIN * 60_000 - (ahora - (preguntaDesde ?? ahora))) / 60_000))}
            onSigo={() => sigo.mutate(undefined, { onSuccess: () => setPreguntaDesde(null) })}
            onSalir={marcarSalida}
            t={t}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
