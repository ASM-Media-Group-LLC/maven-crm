import { useState } from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { Check, Clock, History, Loader2, Pencil, ShieldAlert, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { UserAvatar } from "@/components/UserAvatar";
import { toast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/useLanguage";
import { useFormato } from "@/hooks/useFormato";
import { useFotosCaso, useJuzgarCaso } from "@/hooks/useCasosArgos";
import {
  type CasoArgos, type Veredicto, chipsDelCaso, ETIQUETA_VEREDICTO, fechaDeDia, fotosDelCaso, fraseValida, tonoChip, tonoVeredicto,
} from "@/lib/casosArgos";

// Un caso de Argos para RR. HH. (19/11/2026): quién, qué pasó en chips, las
// fotos, y los tres botones con la frase obligatoria. Ya juzgado, muestra el
// veredicto con su color, la frase, quién y cuándo, y «Corregir» si el puesto
// lo permite. `compacto` (la tarjeta de la persona) esconde lo de RR. HH.

const OPCIONES: Veredicto[] = ["cometio", "no_cometio", "justificado"];

function BotonVeredicto({ v, activo, onClick }: { v: Veredicto; activo: boolean; onClick: () => void }) {
  const { t } = useLanguage();
  const tono = tonoVeredicto(v);
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      className={`flex-1 rounded-control border px-3 py-2 text-sm font-semibold transition ${activo ? `${tono.caja} ${tono.texto} ring-1 ring-current/30` : "border-border/60 bg-background/40 text-muted-foreground hover:text-foreground"}`}
    >
      {t(ETIQUETA_VEREDICTO[v])}
    </button>
  );
}

export function CasoTarjeta({ caso, compacto = false }: { caso: CasoArgos; compacto?: boolean }) {
  const { t } = useLanguage();
  const f = useFormato();
  const juzgar = useJuzgarCaso();
  const [editando, setEditando] = useState(false);
  const [eleccion, setEleccion] = useState<Veredicto | null>(null);
  const [frase, setFrase] = useState("");
  const [visor, setVisor] = useState<string | null>(null);

  const chips = chipsDelCaso(caso.resumen);
  const fotos = fotosDelCaso(caso);
  const urls = useFotosCaso(fotos);
  const tono = tonoVeredicto(caso.veredicto);
  const abierto = (caso.puede_juzgar && !caso.veredicto) || editando;
  const listo = !!eleccion && fraseValida(frase);
  const hora = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString(f.intl(), { hour: "numeric", minute: "2-digit" }) : "");
  const corregido = caso.historial.some((h) => h.veredicto_antes);

  const guardar = () => {
    if (!eleccion || !fraseValida(frase)) return;
    juzgar.mutate({ id: caso.id, veredicto: eleccion, frase }, {
      onSuccess: () => { setEditando(false); setEleccion(null); setFrase(""); toast({ title: t("hr.casos.guardado") }); },
      onError: (e) => toast({ title: t("hr.casos.errorGuardar"), description: (e as Error).message, variant: "destructive" }),
    });
  };

  return (
    <article className={`vidrio flex flex-col gap-3 overflow-hidden p-4 ${caso.veredicto ? "" : caso.gravedad === 3 ? "ring-1 ring-destructive/20" : ""}`}>
      {/* Quién */}
      <header className="flex items-start gap-3">
        <UserAvatar name={caso.nombre ?? "?"} src={caso.avatar_url ?? undefined} size="md" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="truncate text-sm font-semibold text-foreground">{caso.nombre ?? t("hr.casos.sinNombre")}</h3>
            {caso.gravedad === 3 && !caso.veredicto && (
              <span className="inline-flex items-center gap-1 rounded-full border border-destructive/25 bg-destructive/[0.08] px-2 py-0.5 text-[11px] font-semibold text-destructive">
                <ShieldAlert className="h-3 w-3" />{t("hr.casos.grave")}
              </span>
            )}
          </div>
          <p className="truncate text-xs text-muted-foreground">
            {[caso.puesto, caso.equipo && caso.equipo !== "Otros" ? caso.equipo : null].filter(Boolean).join(" · ")}
            {compacto ? ` · ${format(fechaDeDia(caso.dia), "EEEE d MMM", { locale: f.fechas })}` : ""}
          </p>
        </div>
        {caso.veredicto ? (
          <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${tono.caja} ${tono.texto}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${tono.punto}`} />{t(ETIQUETA_VEREDICTO[caso.veredicto])}
          </span>
        ) : caso.en_curso ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border/60 px-2.5 py-1 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />{t("hr.casos.enCurso")}
          </span>
        ) : (
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border/60 bg-foreground/[0.04] px-2.5 py-1 text-xs font-medium text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-warning" />{t("hr.casos.pendiente")}
          </span>
        )}
      </header>

      {/* Qué pasó */}
      {chips.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {chips.map((c) => (
            <span key={c.clave} className={`inline-flex max-w-full items-center truncate rounded-full border px-2.5 py-1 text-xs font-medium ${tonoChip(c.tono)}`}>
              {t(c.etiqueta, c.vars)}
            </span>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">{t("hr.casos.sinDetalle")}</p>
      )}

      {/* Las fotos */}
      {fotos.length > 0 && (
        <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
          {fotos.slice(0, compacto ? 3 : 4).map((p) => (
            <button key={p} type="button" onClick={() => setVisor(p)}
              className="relative aspect-video overflow-hidden rounded-control border border-border/50 bg-foreground/[0.05]">
              {urls.data?.[p]
                ? <img src={urls.data[p]} alt="" loading="lazy" className="h-full w-full object-cover" />
                : <span className="absolute inset-0 animate-pulse bg-foreground/[0.04]" />}
            </button>
          ))}
        </div>
      )}

      {/* Enlaces */}
      {!compacto && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          <Link to={`/hr/expediente/${caso.user_id}?dia=${caso.dia}`} className="font-medium text-primary hover:underline">{t("hr.casos.verDia")}</Link>
          {(caso.resumen.videos_n ?? 0) > 0 && (
            <span className="inline-flex items-center gap-1 text-muted-foreground"><Video className="h-3.5 w-3.5" />{t("hr.casos.videos", { n: caso.resumen.videos_n ?? 0 })}</span>
          )}
          {(caso.resumen.actividad?.top_ajenas?.length ?? 0) > 1 && (
            <span className="truncate text-muted-foreground">
              {t("hr.casos.otrasApps", { lista: (caso.resumen.actividad?.top_ajenas ?? []).map((a) => `${a.nombre} ${a.min} min`).join(" · ") })}
            </span>
          )}
        </div>
      )}

      {/* Veredicto ya dado */}
      {caso.veredicto && !editando && (
        <div className={`flex flex-col gap-1.5 rounded-control border p-3 ${tono.caja}`}>
          {caso.frase && <p className="text-sm text-foreground">«{caso.frase}»</p>}
          <p className="text-xs text-muted-foreground">
            {t("hr.casos.porQuien", { quien: caso.juzgado_por ?? "RR. HH.", hora: hora(caso.juzgado_at) })}
            {corregido ? ` · ${t("hr.casos.corregido")}` : ""}
          </p>
          {!compacto && corregido && (
            <ul className="mt-1 flex flex-col gap-1 border-t border-border/40 pt-2">
              {caso.historial.map((h, i) => (
                <li key={i} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                  <History className="mt-0.5 h-3 w-3 shrink-0" />
                  <span>{h.por ?? "—"}: {h.veredicto_antes ? `${t(ETIQUETA_VEREDICTO[h.veredicto_antes])} → ` : ""}{t(ETIQUETA_VEREDICTO[h.veredicto])} · «{h.frase}»</span>
                </li>
              ))}
            </ul>
          )}
          {caso.puede_corregir && !compacto && (
            <div>
              <Button variant="ghost" size="sm" className="h-7 rounded-control px-2 text-xs"
                onClick={() => { setEditando(true); setEleccion(caso.veredicto); setFrase(""); }}>
                <Pencil className="mr-1 h-3 w-3" />{t("hr.casos.corregir")}
              </Button>
            </div>
          )}
        </div>
      )}

      {caso.en_curso && !caso.veredicto && !compacto && (
        <p className="text-xs text-muted-foreground">{t("hr.casos.seJuzgaManana")}</p>
      )}

      {/* Juzgar (o corregir) */}
      {abierto && !compacto && (
        <div className="flex flex-col gap-2 rounded-control border border-border/60 bg-background/40 p-3">
          <div className="flex gap-1.5">
            {OPCIONES.map((v) => <BotonVeredicto key={v} v={v} activo={eleccion === v} onClick={() => setEleccion(v)} />)}
          </div>
          <Textarea
            value={frase}
            onChange={(e) => setFrase(e.target.value)}
            maxLength={500}
            rows={2}
            placeholder={t(eleccion === "justificado" ? "hr.casos.fraseJustificado" : eleccion === "no_cometio" ? "hr.casos.fraseNoCometio" : "hr.casos.fraseCometio")}
            className="min-h-[60px] resize-none rounded-control text-sm"
          />
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-muted-foreground">{t("hr.casos.fraseObligatoria")}</span>
            <div className="flex gap-1.5">
              {editando && (
                <Button variant="ghost" size="sm" className="rounded-control" onClick={() => { setEditando(false); setEleccion(null); setFrase(""); }}>
                  {t("common.cancel")}
                </Button>
              )}
              <Button size="sm" className="rounded-control" disabled={!listo || juzgar.isPending} onClick={guardar}>
                {juzgar.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Check className="mr-1 h-3.5 w-3.5" />}
                {t("hr.casos.guardar")}
              </Button>
            </div>
          </div>
        </div>
      )}

      <Dialog open={!!visor} onOpenChange={(o) => !o && setVisor(null)}>
        <DialogContent className="max-w-5xl gap-3 p-3 sm:p-4">
          <DialogTitle className="text-sm font-semibold">{caso.nombre} · {format(fechaDeDia(caso.dia), "EEEE d MMM", { locale: f.fechas })}</DialogTitle>
          {visor && urls.data?.[visor]
            ? <img src={urls.data[visor]} alt="" className="max-h-[75vh] w-full rounded-control object-contain" />
            : <div className="flex h-64 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>}
          {fotos.length > 1 && (
            <div className="flex gap-1.5 overflow-x-auto">
              {fotos.map((p) => (
                <button key={p} type="button" onClick={() => setVisor(p)}
                  className={`h-14 w-24 shrink-0 overflow-hidden rounded-control border ${visor === p ? "border-primary" : "border-border/50"}`}>
                  {urls.data?.[p] && <img src={urls.data[p]} alt="" className="h-full w-full object-cover" />}
                </button>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </article>
  );
}
