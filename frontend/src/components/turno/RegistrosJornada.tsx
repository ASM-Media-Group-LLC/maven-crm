import { useState } from "react";
import { Clock3, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import { useJornadaAcciones, useJornadaRegistros, type RegistroJornada } from "@/hooks/useJornada";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const local = (iso: string) => { const d = new Date(iso); return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0,16); };
const fecha = (iso: string) => new Date(iso).toLocaleString();
export function RegistrosJornada({ empresa = false }: { empresa?: boolean }) {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [abierto, setAbierto] = useState(false);
  const [fila, setFila] = useState<RegistroJornada | null>(null);
  const [inicio, setInicio] = useState(""); const [fin, setFin] = useState(""); const [motivo, setMotivo] = useState("");
  const q = useJornadaRegistros(abierto);
  const { solicitar, resolver } = useJornadaAcciones();
  const elegir = (r: RegistroJornada) => { setFila(r); setInicio(local(r.inicio)); setFin(local(r.fin!)); setMotivo(""); solicitar.reset(); };
  return <>
    <Button variant="ghost" size="sm" onClick={() => setAbierto(true)} className="gap-2"><Clock3 className="h-4 w-4" />{t(empresa ? "cowork.jornada.empresa" : "cowork.jornada.misHoras")}</Button>
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
        <DialogTitle>{t(empresa ? "cowork.jornada.empresa" : "cowork.jornada.misHoras")}</DialogTitle>
        <p className="text-sm text-muted-foreground">{t("cowork.jornada.historialDesc")}</p>
        {q.isLoading && <Loader2 className="h-5 w-5 animate-spin" />}
        {q.isError && <div role="alert"><p>{t("cowork.jornada.errorCarga")}</p><Button onClick={() => void q.refetch()}>{t("cowork.jornada.reintentar")}</Button></div>}
        {q.data && <>
          <section className="space-y-3">
            <h3 className="font-semibold">{t("cowork.jornada.solicitudes")}</h3>
            {!q.data.solicitudes.length && <p className="text-sm text-muted-foreground">{t("cowork.jornada.sinSolicitudes")}</p>}
            {q.data.solicitudes.map((s) => <article key={s.id} className="rounded-xl border border-border p-3 text-sm">
              <p className="font-semibold">{s.nombre} · {t(`cowork.jornada.${s.estado}`)}</p>
              <p className="mt-1 text-muted-foreground">{t("cowork.jornada.antes")}: {fecha(s.antes_inicio)} — {fecha(s.antes_fin)}</p>
              <p>{t("cowork.jornada.propuesto")}: {fecha(s.nuevo_inicio)} — {fecha(s.nuevo_fin)}</p>
              <p className="mt-2 whitespace-pre-wrap">{s.motivo}</p>
              {q.data.dueno && s.estado === "pendiente" && <div className="mt-3 flex gap-2">
                <Button size="sm" disabled={resolver.isPending} onClick={() => resolver.mutate({ id: s.id, aprobar: true })}>{t("cowork.jornada.aprobar")}</Button>
                <Button size="sm" variant="outline" disabled={resolver.isPending} onClick={() => resolver.mutate({ id: s.id, aprobar: false })}>{t("cowork.jornada.rechazar")}</Button>
              </div>}
            </article>)}
            {resolver.isError && <p role="alert" className="text-sm text-destructive">{resolver.error.message}</p>}
          </section>
          <section className="space-y-2">
            <h3 className="font-semibold">{t("cowork.jornada.registros")}</h3>
            {!q.data.registros.length && <p className="text-sm text-muted-foreground">{t("cowork.jornada.sinRegistros")}</p>}
            {q.data.registros.map((r) => <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border p-3 text-sm">
              <div><p className="font-semibold">{r.nombre}</p><p>{fecha(r.inicio)} — {r.fin ? fecha(r.fin) : t("cowork.jornada.abierta")}</p>
                <p className="text-muted-foreground">{t("cowork.jornada.pausaMin", { n: Math.round(Number(r.pausa_seg) / 60) })}</p></div>
              {r.user_id === user?.id && r.fin && <Button size="sm" variant="outline" onClick={() => elegir(r)}>{t("cowork.jornada.solicitar")}</Button>}
            </div>)}
          </section>
        </>}
        {fila && <form className="space-y-3 rounded-xl border border-primary/40 p-4" onSubmit={(e) => {
          e.preventDefault();
          solicitar.mutate({ marca: fila.id, inicio: new Date(inicio).toISOString(), fin: new Date(fin).toISOString(), motivo }, { onSuccess: () => setFila(null) });
        }}>
          <h3 className="font-semibold">{t("cowork.jornada.solicitar")}</h3>
          <p className="text-xs text-muted-foreground">{t("cowork.jornada.zonaLocal")}</p>
          <div className="grid gap-3 sm:grid-cols-2">{([["inicio", inicio, setInicio], ["fin", fin, setFin]] as const).map(([key, value, setter]) =>
            <label key={key} className="flex flex-col gap-1 text-sm">{t(key === "inicio" ? "cowork.jornada.entrada" : "cowork.jornada.salida")}
              <input required type="datetime-local" value={value} onChange={(e) => setter(e.target.value)} className="rounded border border-input bg-background p-2" /></label>)}
          </div>
          <label className="flex flex-col gap-1 text-sm">{t("cowork.jornada.motivo")}<textarea required minLength={5} maxLength={1000} value={motivo} onChange={(e) => setMotivo(e.target.value)} className="rounded border border-input bg-background p-2" /></label>
          {solicitar.isError && <p role="alert" className="text-sm text-destructive">{solicitar.error.message}</p>}
          <div className="flex gap-2"><Button disabled={solicitar.isPending} type="submit">{t("cowork.jornada.enviar")}</Button><Button type="button" variant="ghost" onClick={() => setFila(null)}>{t("cowork.jornada.cancelar")}</Button></div>
        </form>}
      </DialogContent>
    </Dialog>
  </>;
}
