import { useMemo, useState } from "react";
import { Loader2, Paperclip, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/useLanguage";
import { useAuth } from "@/hooks/useAuth";
import {
  type DiaHorario, subirAdjunto, useAccionesAusencias, useFestivos, usePoliticaAusencias,
} from "@/hooks/useAusencias";
import {
  ETIQUETA_TIPO, TIPOS, type TipoAusencia, diasHabiles, hoyBogota, primerDiaPermitido, validarSolicitud,
} from "@/lib/ausencias";
import { CAMPO, useFechaCorta } from "./piezas";

// EL FORMULARIO DE UNA AUSENCIA (20/11/2026). Dos usos:
//   · «Mis días»: la persona PIDE (va a su jefe y después a RR. HH.).
//   · «Asistencia → Ausencias → Registrar»: RR. HH. registra una ya aprobada
//     para otra persona (elige persona y si es pagada). Sin aviso mínimo.
// El aviso mínimo, los días hábiles y el saldo se calculan aquí para avisar
// antes de enviar; el servidor vuelve a mirar todo.

interface Props {
  /** Registrar para otra persona (RR. HH.). */
  personas?: Array<{ user_id: string; nombre: string | null }>;
  /** Horario de la persona (qué días trabaja) para contar los días hábiles. */
  horario?: DiaHorario[];
  saldoLibre?: number | null;
  onListo?: () => void;
}

export function FormularioAusencia({ personas, horario, saldoLibre = null, onListo }: Props) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const { user } = useAuth();
  const fecha = useFechaCorta();
  const politica = usePoliticaAusencias();
  const festivos = useFestivos();
  const acciones = useAccionesAusencias();
  const registrar = !!personas;
  const hoy = hoyBogota();

  const [persona, setPersona] = useState<string>("");
  const [tipo, setTipo] = useState<TipoAusencia>("vacaciones");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [parcial, setParcial] = useState(false);
  const [horaDesde, setHoraDesde] = useState("08:00");
  const [horaHasta, setHoraHasta] = useState("10:00");
  const [motivo, setMotivo] = useState("");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [pagada, setPagada] = useState(true);
  const [subiendo, setSubiendo] = useState(false);

  const pol = politica.data ?? { vacaciones_dias_anio: 15, aviso_vacaciones_dias: 15, aviso_permiso_dias: 2, aviso_dia_libre_dias: 2 };
  const trabaja = useMemo(() => {
    const arr = [false, false, false, false, false, false, false];
    for (const d of horario ?? []) if (d.entrada && d.salida) arr[d.dia] = true;
    return arr;
  }, [horario]);
  const setFest = useMemo(() => new Set((festivos.data ?? []).map((f) => f.fecha)), [festivos.data]);
  const hastaReal = parcial ? desde : hasta || desde;
  const dias = diasHabiles(desde, hastaReal, trabaja, setFest, parcial);
  const error = validarSolicitud({
    tipo, desde, hasta: hastaReal, parcial, horaDesde, horaHasta, tieneAdjunto: !!archivo || registrar, dias,
    saldoLibre: registrar ? null : saldoLibre, politica: pol, hoy: registrar ? "0000-01-01" : hoy,
  });
  const minimo = primerDiaPermitido(tipo, pol, hoy);
  const ocupado = acciones.solicitar.isPending || acciones.registrar.isPending || subiendo;
  const puedeEnviar = !error && (!registrar || !!persona) && !ocupado;

  const limpiar = () => { setDesde(""); setHasta(""); setParcial(false); setMotivo(""); setArchivo(null); setPersona(""); };

  const enviar = async () => {
    if (!user?.id || !puedeEnviar) return;
    const duenoAdjunto = registrar ? persona : user.id;
    try {
      let adjunto: string | null = null;
      if (archivo) { setSubiendo(true); adjunto = await subirAdjunto(duenoAdjunto, archivo); }
      setSubiendo(false);
      const base = { tipo, desde, hasta: hastaReal, horaDesde: parcial ? horaDesde : null, horaHasta: parcial ? horaHasta : null, motivo, adjunto };
      if (registrar) await acciones.registrar.mutateAsync({ ...base, userId: persona, pagada });
      else await acciones.solicitar.mutateAsync(base);
      toast({ title: t(registrar ? "aus.reg.listo" : "aus.form.enviada") });
      limpiar();
      onListo?.();
    } catch (e) {
      setSubiendo(false);
      toast({ title: t("aus.form.noSeEnvio"), description: (e as Error).message, variant: "destructive" });
    }
  };

  const avisoTexto =
    error === "aviso" ? t("aus.form.avisoMinimo", { n: pol[tipo === "vacaciones" ? "aviso_vacaciones_dias" : tipo === "permiso" ? "aviso_permiso_dias" : "aviso_dia_libre_dias"], f: fecha(minimo) })
    : error === "saldo" ? t("aus.form.sinSaldo")
    : error === "adjunto" ? t("aus.form.faltaAdjunto")
    : error === "fechas" && desde ? t("aus.form.fechasMal")
    : null;

  return (
    <div className="flex flex-col gap-3">
      {registrar && (
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">{t("aus.reg.persona")}
          <select className={CAMPO} value={persona} onChange={(e) => setPersona(e.target.value)}>
            <option value="">—</option>
            {personas!.map((p) => <option key={p.user_id} value={p.user_id}>{p.nombre ?? "—"}</option>)}
          </select>
        </label>
      )}
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={t("aus.form.tipo")}>
        {TIPOS.map((k) => (
          <button key={k} type="button" role="radio" aria-checked={tipo === k}
            onClick={() => { setTipo(k); if (k === "vacaciones") setParcial(false); setPagada(k === "vacaciones" || k === "incapacidad"); }}
            className={`h-9 rounded-lg px-3 text-xs font-semibold transition-colors ${tipo === k ? "bg-primary/20 text-foreground ring-1 ring-primary/40" : "bg-foreground/[0.05] text-muted-foreground hover:text-foreground"}`}>
            {t(ETIQUETA_TIPO[k])}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">{t("aus.form.desde")}
          <input type="date" className={CAMPO} value={desde} min={registrar || tipo === "incapacidad" ? undefined : minimo}
            onChange={(e) => { setDesde(e.target.value); if (!hasta || hasta < e.target.value) setHasta(e.target.value); }} />
        </label>
        {!parcial && (
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">{t("aus.form.hasta")}
            <input type="date" className={CAMPO} value={hasta} min={desde || undefined} onChange={(e) => setHasta(e.target.value)} />
          </label>
        )}
        {parcial && (
          <div className="flex items-end gap-2">
            <label className="flex flex-1 flex-col gap-1 text-xs text-muted-foreground">{t("aus.form.horaDesde")}
              <input type="time" className={CAMPO} value={horaDesde} onChange={(e) => setHoraDesde(e.target.value)} />
            </label>
            <label className="flex flex-1 flex-col gap-1 text-xs text-muted-foreground">{t("aus.form.horaHasta")}
              <input type="time" className={CAMPO} value={horaHasta} onChange={(e) => setHoraHasta(e.target.value)} />
            </label>
          </div>
        )}
      </div>
      {tipo !== "vacaciones" && (
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <Switch checked={parcial} onCheckedChange={setParcial} />{t("aus.form.parcial")}
        </label>
      )}
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">{t("aus.form.motivo")}
        <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={1000} rows={2} className="text-sm" />
      </label>
      {(tipo === "incapacidad" || registrar) && (
        <label className="flex cursor-pointer flex-col gap-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5"><Paperclip className="h-3.5 w-3.5" />{t("aus.form.adjunto")}</span>
          <input type="file" accept="image/*,application/pdf" className="text-xs" onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} />
          <span className="text-[11px]">{t("aus.form.adjuntoAyuda")}</span>
        </label>
      )}
      {registrar && (
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <Switch checked={pagada} onCheckedChange={setPagada} />{t("aus.reg.pagada")}
        </label>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" className="h-9 rounded-lg" disabled={!puedeEnviar} onClick={() => void enviar()}>
          {ocupado ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Send className="mr-1.5 h-4 w-4" />}
          {subiendo ? t("aus.form.subiendo") : t(registrar ? "aus.reg.guardar" : "aus.form.enviar")}
        </Button>
        {desde && !error && <span className="text-[11px] text-muted-foreground">{parcial ? t("aus.form.medioDia") : t("aus.form.dias", { n: dias })}</span>}
        {avisoTexto && <span className="text-[11px] text-muted-foreground">{avisoTexto}</span>}
        {!desde && !registrar && <span className="text-[11px] text-muted-foreground">{tipo === "incapacidad" ? t("aus.form.sinAviso") : t("aus.form.avisoMinimo", { n: tipo === "vacaciones" ? pol.aviso_vacaciones_dias : tipo === "permiso" ? pol.aviso_permiso_dias : pol.aviso_dia_libre_dias, f: fecha(minimo) })}</span>}
      </div>
    </div>
  );
}
