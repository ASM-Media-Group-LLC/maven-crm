import { CalendarHeart, Loader2, Paperclip, X } from "lucide-react";
import { Page } from "@/components/ui/page";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/hooks/useLanguage";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import type { TranslationKey } from "@/lib/i18n";
import {
  abrirAdjunto, useAccionesAusencias, useMiHorarioSemana, useMisAusencias, useSaldo,
} from "@/hooks/useAusencias";
import { ETIQUETA_ESTADO, ETIQUETA_TIPO } from "@/lib/ausencias";
import { FormularioAusencia } from "@/components/ausencias/FormularioAusencia";
import { Fallo, Pastilla, useFechaCorta, useRango } from "@/components/ausencias/piezas";

// MIS DÍAS (Alvaro, 20/11/2026): lo de cada persona, para todos. Pedir una
// ausencia, ver mis solicitudes, mi saldo de vacaciones y mi horario. La regla
// (aviso mínimo, saldo, quién aprueba) vive en la base.

const DIA_CORTO: Record<number, TranslationKey> = {
  0: "hr.horEq.dia.0", 1: "hr.horEq.dia.1", 2: "hr.horEq.dia.2", 3: "hr.horEq.dia.3",
  4: "hr.horEq.dia.4", 5: "hr.horEq.dia.5", 6: "hr.horEq.dia.6",
};

function TarjetaSaldo({ userId }: { userId: string }) {
  const { t } = useLanguage();
  const fecha = useFechaCorta();
  const s = useSaldo(userId);
  if (s.isLoading) return <div className="vidrio flex justify-center p-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  if (s.isError) return <div className="vidrio"><Fallo texto="aus.saldo.fallo" reintentar={() => void s.refetch()} /></div>;
  if (!s.data) return null;
  const d = s.data;
  const libre = Math.max(0, d.disponibles - d.pendientes);
  return (
    <section className="vidrio flex flex-col gap-1.5 p-4">
      <p className="text-xs text-muted-foreground">{t("aus.saldo.titulo")}</p>
      <p className="text-3xl font-semibold tabular-nums text-foreground">{t("aus.saldo.dias", { n: libre.toFixed(1).replace(/\.0$/, "") })}</p>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-foreground/[0.07]">
        <div className="h-full rounded-full bg-primary/70" style={{ width: `${d.acumulados > 0 ? Math.min(100, (d.usados / d.acumulados) * 100) : 0}%` }} />
      </div>
      <p className="text-[11px] text-muted-foreground">{t("aus.saldo.detalle", { a: d.acumulados, u: d.usados, p: d.pendientes })}</p>
      <p className="text-[11px] text-muted-foreground">{t("aus.saldo.politica", { d: d.dias_anio, f: fecha(d.fecha_ingreso) })}</p>
      {d.ingreso_estimado && <p className="text-[11px] text-muted-foreground">{t("aus.saldo.estimado")}</p>}
    </section>
  );
}

function MiHorario() {
  const { t } = useLanguage();
  const h = useMiHorarioSemana();
  return (
    <section className="vidrio flex flex-col gap-2 p-4">
      <p className="text-xs text-muted-foreground">{t("aus.mias.horario")}</p>
      {h.isLoading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        : h.isError ? <Fallo texto="aus.mias.fallo" reintentar={() => void h.refetch()} />
        : (h.data ?? []).every((d) => !d.entrada) ? <p className="text-sm text-muted-foreground">{t("aus.mias.sinHorario")}</p>
        : (
          <ul className="flex flex-col gap-1 text-sm">
            {(h.data ?? []).map((d) => (
              <li key={d.dia} className="flex items-center justify-between gap-2 rounded-lg bg-foreground/[0.035] px-3 py-1.5">
                <span className="font-medium text-foreground/85">{t(DIA_CORTO[d.dia])}</span>
                <span className="tabular-nums text-muted-foreground">{d.entrada && d.salida ? `${d.entrada.slice(0, 5)}–${d.salida.slice(0, 5)}` : t("aus.mias.descansa")}</span>
              </li>
            ))}
          </ul>
        )}
    </section>
  );
}

function MisSolicitudes() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const rango = useRango();
  const q = useMisAusencias();
  const { cancelar } = useAccionesAusencias();
  if (q.isLoading) return <div className="flex justify-center p-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  if (q.isError) return <Fallo texto="aus.lista.fallo" reintentar={() => void q.refetch()} />;
  const filas = q.data ?? [];
  if (filas.length === 0) return <p className="p-4 text-sm text-muted-foreground">{t("aus.lista.vacia")}</p>;
  return (
    <ul className="divide-y divide-border/25">
      {filas.map((a) => (
        <li key={a.id} className="flex flex-col gap-1 px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-foreground">{t(ETIQUETA_TIPO[a.tipo])}</span>
            <span className="text-sm text-muted-foreground">{rango(a.desde, a.hasta, a.hora_desde, a.hora_hasta)}</span>
            <Pastilla className={a.estado === "aprobada" ? "bg-success/15 text-foreground" : a.estado === "rechazada" ? "bg-destructive/15 text-foreground" : "bg-foreground/[0.07] text-foreground/80"}>
              {t(ETIQUETA_ESTADO[a.estado])}
            </Pastilla>
            {a.estado === "aprobada" && a.pagada != null && <Pastilla className="bg-foreground/[0.05] text-muted-foreground">{t(a.pagada ? "aus.pagada" : "aus.noPagada")}</Pastilla>}
            {a.directa && <Pastilla className="bg-foreground/[0.05] text-muted-foreground">{t("aus.directa")}</Pastilla>}
            <span className="ml-auto flex items-center gap-1">
              {a.adjunto_path && (
                <Button variant="ghost" size="sm" className="h-8" onClick={() => void abrirAdjunto(a.adjunto_path!).catch((e) => toast({ title: (e as Error).message, variant: "destructive" }))}>
                  <Paperclip className="mr-1 h-3.5 w-3.5" />{t("aus.lista.verAdjunto")}
                </Button>
              )}
              {(a.estado === "pendiente_jefe" || a.estado === "pendiente_rrhh") && (
                <Button variant="ghost" size="sm" className="h-8" disabled={cancelar.isPending}
                  onClick={() => cancelar.mutate(a.id, {
                    onSuccess: () => toast({ title: t("aus.lista.cancelada") }),
                    onError: (e) => toast({ title: (e as Error).message, variant: "destructive" }),
                  })}>
                  <X className="mr-1 h-3.5 w-3.5" />{t("aus.lista.cancelar")}
                </Button>
              )}
            </span>
          </div>
          {a.rechazo_motivo && <p className="text-xs text-muted-foreground">{t("aus.lista.rechazo", { m: a.rechazo_motivo })}</p>}
        </li>
      ))}
    </ul>
  );
}

export default function MisDias() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const saldo = useSaldo(user?.id);
  const horario = useMiHorarioSemana();
  const libre = saldo.data ? Math.max(0, saldo.data.disponibles - saldo.data.pendientes) : null;
  return (
    <Page>
      <PageHeader icon={<CalendarHeart className="h-5 w-5" />} title={t("aus.mias.titulo")} subtitle={t("aus.mias.sub")} />
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-4">
          <section className="vidrio flex flex-col gap-3 p-4">
            <h2 className="text-sm font-semibold text-foreground">{t("aus.form.titulo")}</h2>
            <FormularioAusencia horario={horario.data} saldoLibre={libre} />
          </section>
          <section className="vidrio overflow-hidden p-0">
            <h2 className="border-b border-border/40 px-4 py-3 text-sm font-semibold text-foreground">{t("aus.lista.titulo")}</h2>
            <MisSolicitudes />
          </section>
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          {user?.id && <TarjetaSaldo userId={user.id} />}
          <MiHorario />
        </div>
      </div>
    </Page>
  );
}
