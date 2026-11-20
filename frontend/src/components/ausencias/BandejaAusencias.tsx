import { useState } from "react";
import { Check, Loader2, Paperclip, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { UserAvatar } from "@/components/UserAvatar";
import { useLanguage } from "@/hooks/useLanguage";
import { useToast } from "@/hooks/use-toast";
import { type FilaBandeja, abrirAdjunto, useAccionesAusencias, useBandejaAusencias } from "@/hooks/useAusencias";
import { ETIQUETA_ESTADO, ETIQUETA_TIPO } from "@/lib/ausencias";
import { Fallo, Pastilla, useRango } from "./piezas";

// LA BANDEJA (20/11/2026): lo pendiente que YO puedo decidir. El jefe aprueba o
// rechaza el primer nivel (sin ver motivo ni adjunto); quien tiene la
// aprobación final ve todo y dice si es pagada.

function Solicitud({ a, resaltar }: { a: FilaBandeja; resaltar: boolean }) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const rango = useRango();
  const { decidirJefe, decidirFinal } = useAccionesAusencias();
  const [pagada, setPagada] = useState<boolean>(a.pagada ?? (a.tipo === "vacaciones" || a.tipo === "incapacidad"));
  const [rechazando, setRechazando] = useState(false);
  const [nota, setNota] = useState("");
  const ocupado = decidirJefe.isPending || decidirFinal.isPending;
  const final = a.puedo_final;
  const listo = { onSuccess: () => toast({ title: t("aus.bandeja.listo") }), onError: (e: unknown) => toast({ title: t("aus.bandeja.noSeGuardo"), description: (e as Error).message, variant: "destructive" as const }) };

  const aprobar = () => (final
    ? decidirFinal.mutate({ id: a.id, aprobar: true, pagada }, listo)
    : decidirJefe.mutate({ id: a.id, aprobar: true }, listo));
  const rechazar = () => (final
    ? decidirFinal.mutate({ id: a.id, aprobar: false, nota }, listo)
    : decidirJefe.mutate({ id: a.id, aprobar: false, nota }, listo));

  return (
    <li className={`flex flex-col gap-2 px-3 py-3.5 sm:px-4 ${resaltar ? "bg-primary/[0.06]" : ""}`}>
      <div className="flex min-w-0 items-center gap-3">
        <UserAvatar name={a.nombre ?? "—"} src={a.avatar_url ?? undefined} seed={a.avatar_seed ?? undefined} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">{a.nombre ?? "—"}</p>
          <p className="truncate text-[11px] text-muted-foreground">{[a.equipo, t(ETIQUETA_TIPO[a.tipo]), rango(a.desde, a.hasta, a.hora_desde, a.hora_hasta)].filter(Boolean).join(" · ")}</p>
        </div>
        <Pastilla className="hidden bg-foreground/[0.07] text-foreground/80 sm:inline-flex">{t(ETIQUETA_ESTADO[a.estado])}</Pastilla>
      </div>
      <div className="flex flex-col gap-1 pl-0 text-xs text-muted-foreground sm:pl-11">
        {a.jefe_nombre && <span>{a.jefe_nota ? t("aus.bandeja.notaJefeTexto", { n: a.jefe_nombre, t: a.jefe_nota }) : t("aus.bandeja.notaJefe", { n: a.jefe_nombre })}</span>}
        {a.motivo && <span>{t("aus.bandeja.motivo", { m: a.motivo })}</span>}
        {a.saldo_disponible != null && <span>{t("aus.bandeja.saldo", { n: Number(a.saldo_disponible) })} · {t("aus.form.dias", { n: Number(a.dias) })}</span>}
      </div>
      <div className="flex flex-wrap items-center gap-2 pl-0 sm:pl-11">
        {final && (
          <label className="flex items-center gap-2 text-xs text-muted-foreground"><Switch checked={pagada} onCheckedChange={setPagada} />{t("aus.pagada")}</label>
        )}
        <Button size="sm" className="h-9 rounded-lg" disabled={ocupado} onClick={aprobar}>
          {ocupado ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Check className="mr-1.5 h-4 w-4" />}
          {t(final ? "aus.bandeja.aprobarFinal" : "aus.bandeja.aprobar")}
        </Button>
        <Button size="sm" variant="outline" className="h-9 rounded-lg" disabled={ocupado} onClick={() => setRechazando((v) => !v)}>
          <X className="mr-1.5 h-4 w-4" />{t("aus.bandeja.rechazar")}
        </Button>
        {a.adjunto_path && (
          <Button size="sm" variant="ghost" className="h-9" onClick={() => void abrirAdjunto(a.adjunto_path!).catch((e) => toast({ title: (e as Error).message, variant: "destructive" }))}>
            <Paperclip className="mr-1 h-3.5 w-3.5" />{t("aus.lista.verAdjunto")}
          </Button>
        )}
      </div>
      {rechazando && (
        <div className="flex flex-col gap-2 pl-0 sm:pl-11">
          <Textarea value={nota} onChange={(e) => setNota(e.target.value)} placeholder={t("aus.bandeja.porQue")} rows={2} maxLength={500} className="text-sm" />
          <Button size="sm" variant="destructive" className="h-9 self-start rounded-lg" disabled={ocupado || !nota.trim()} onClick={rechazar}>{t("aus.bandeja.rechazar")}</Button>
        </div>
      )}
    </li>
  );
}

export function BandejaAusencias({ resaltarId }: { resaltarId?: string | null }) {
  const { t } = useLanguage();
  const q = useBandejaAusencias();
  if (q.isLoading) return <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  if (q.isError) return <Fallo texto="aus.bandeja.fallo" reintentar={() => void q.refetch()} />;
  const filas = q.data ?? [];
  if (filas.length === 0) return <p className="p-4 text-sm text-muted-foreground">{t("aus.bandeja.vacia")}</p>;
  return <ul className="divide-y divide-border/25">{filas.map((a) => <Solicitud key={a.id} a={a} resaltar={a.id === resaltarId} />)}</ul>;
}
