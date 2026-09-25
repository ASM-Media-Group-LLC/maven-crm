// Vista "Pausas" del supervisor (pedido del jefe, 08/09): cuánto baño y cuánto
// break lleva cada persona, y quién se pasó. Baño se mide contra el presupuesto
// del DÍA; break contra el tope por pausa que fijó el supervisor en las reglas.
import { useState } from "react";
import { Coffee, Loader2, RefreshCw, Video } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useCoworkPausas } from "@/hooks/useCoworkPausas";
import { useCoworkMeetsResumen } from "@/hooks/useCoworkMeetsResumen";
import { fechaBogota } from "@/pages/admin/coworkVsHubstaff/useCoworkVsHubstaff";
import { minutosLegibles, type PersonaPausas } from "@/lib/coworkPausasResumen";
import { useLanguage } from "@/hooks/useLanguage";
import { useFormato } from "@/hooks/useFormato";
import type { Formato } from "@/lib/formato";
import type { Traductor } from "./textosCowork";

// El `id` es el valor que se compara; lo que se ve es la clave.
const RANGOS = [
  { id: "hoy", label: "common.today", dias: 0 },
  { id: "7", label: "cowork.pauses.range7", dias: 6 },
  { id: "30", label: "cowork.pauses.range30", dias: 29 },
] as const;

/** Frase corta del exceso de una persona, o null si va bien. Misma cuenta que
 *  `fraseDeExcesos` de lib/coworkPausasResumen, dicha en el idioma de quien mira. */
function fraseDeExcesos(p: PersonaPausas, t: Traductor): string | null {
  const partes: string[] = [];
  if (p.diasBanoExcedido) {
    partes.push(p.diasBanoExcedido === 1
      ? t("cowork.pauses.bathroomDaysOverOne")
      : t("cowork.pauses.bathroomDaysOverMany", { n: p.diasBanoExcedido }));
  }
  if (p.breaksExcedidos) {
    partes.push(p.breaksExcedidos === 1
      ? t("cowork.pauses.breaksOverOne", { extra: minutosLegibles(p.segBreakDeMas) })
      : t("cowork.pauses.breaksOverMany", { n: p.breaksExcedidos, extra: minutosLegibles(p.segBreakDeMas) }));
  }
  return partes.length ? partes.join(" · ") : null;
}

/** "8 sept · 3:05 p. m." en español (como lib/coworkMeetsResumen), "Sep 8 · 3:05 PM" en inglés. */
function fechaHoraCorta(iso: string, f: Formato): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const dia = d.toLocaleDateString(f.intl("es-CO"), { day: "numeric", month: "short" });
  const hora = d.toLocaleTimeString(f.intl("es-CO"), { hour: "numeric", minute: "2-digit" });
  return `${dia} · ${hora}`;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  sessionId: string | null;
  nombreSesion: string;
  banoMin: number;
  breakMin: number;
}

export default function CoworkPausasDialog({ open, onOpenChange, sessionId, nombreSesion, banoMin, breakMin }: Props) {
  const { t } = useLanguage();
  const f = useFormato();
  const [rango, setRango] = useState<(typeof RANGOS)[number]["id"]>("hoy");
  const [todas, setTodas] = useState(false);
  const r = RANGOS.find((x) => x.id === rango) ?? RANGOS[0];
  const hasta = fechaBogota(0);
  const desde = fechaBogota(r.dias);
  const { data, cargando, error, refrescar } = useCoworkPausas(desde, hasta, todas ? null : sessionId, open);
  // Los meets grupales (Jhon, 10/09): mismo rango y misma sesión, categoría aparte.
  const meets = useCoworkMeetsResumen(desde, hasta, todas ? null : sessionId, open);
  const meetDe = new Map((meets.data?.personas ?? []).map((p) => [p.userId, p]));
  // La tabla junta a quien tuvo pausas y a quien SOLO tuvo meets (con las pausas en cero).
  const filasTabla: PersonaPausas[] = [
    ...(data?.personas ?? []),
    ...(meets.data?.personas ?? [])
      .filter((mp) => !(data?.personas ?? []).some((p) => p.userId === mp.userId))
      .map((mp) => ({
        userId: mp.userId, nombre: mp.nombre, dias: 0, banos: 0, segBano: 0, diasBanoExcedido: 0,
        breaks: 0, segBreak: 0, breaksExcedidos: 0, segBreakDeMas: 0, autoCerradas: 0, conExcesos: false,
      })),
  ];
  const hayAlgo = filasTabla.length > 0 || (meets.data?.meets.length ?? 0) > 0;
  const cargandoTodo = cargando || meets.cargando;

  return (
    // NO modal: con el diálogo abierto se puede seguir moviendo la ventanita del
    // Supervisor Hub (Jhon, 08/09: "cuando despliego este popup no puedo mover el
    // supervisor hub"). Sin overlay, un clic afuera cerraría el diálogo al
    // arrastrar: se cierra solo con la X o Escape.
    <Dialog open={open} onOpenChange={onOpenChange} modal={false}>
      <DialogContent
        className="w-[calc(100%-1.5rem)] sm:max-w-3xl max-h-[92vh] overflow-y-auto shadow-2xl"
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Coffee className="h-4 w-4" /> {t("cowork.pauses.title")}</DialogTitle>
          <DialogDescription>{t("cowork.pauses.desc", { bathroom: banoMin, break: breakMin })}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <div className="inline-flex rounded-full border border-border p-0.5">
            {RANGOS.map((x) => (
              <button
                key={x.id}
                type="button"
                onClick={() => setRango(x.id)}
                className={cn("rounded-full px-3 py-1", rango === x.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
              >
                {t(x.label)}
              </button>
            ))}
          </div>
          <div className="inline-flex rounded-full border border-border p-0.5">
            <button type="button" onClick={() => setTodas(false)} className={cn("rounded-full px-3 py-1", !todas ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground")}>
              {nombreSesion || t("cowork.common.thisSession")}
            </button>
            <button type="button" onClick={() => setTodas(true)} className={cn("rounded-full px-3 py-1", todas ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground")}>
              {t("cowork.pauses.allSessions")}
            </button>
          </div>
          <Button variant="ghost" size="icon" className="ml-auto h-7 w-7" title={t("cowork.pauses.refresh")} onClick={() => { void refrescar(); void meets.refrescar(); }}>
            <RefreshCw className={cn("h-3.5 w-3.5", cargandoTodo && "animate-spin")} />
          </Button>
        </div>

        {error && <p className="text-xs text-destructive">{t("cowork.pauses.loadError", { error: error.message })}</p>}
        {meets.error && <p className="text-xs text-destructive">{t("cowork.pauses.meetsLoadError", { error: meets.error.message })}</p>}
        {cargandoTodo && !data && !meets.data && (
          <div className="flex items-center gap-2 py-8 justify-center text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> {t("common.loading")}</div>
        )}

        {data && meets.data && !hayAlgo && !cargandoTodo && (
          <p className="py-8 text-center text-sm text-muted-foreground">{t("cowork.pauses.empty")}</p>
        )}

        {data && hayAlgo && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
              <Resumen label={t("cowork.pauses.people")} valor={String(filasTabla.length)} />
              <Resumen label={t("cowork.pause.bano")} valor={minutosLegibles(data.totales.segBano)} sub={data.totales.banos === 1 ? t("cowork.pauses.tripsOne") : t("cowork.pauses.tripsMany", { n: data.totales.banos })} />
              <Resumen label={t("cowork.pause.break")} valor={minutosLegibles(data.totales.segBreak)} sub={data.totales.breaks === 1 ? t("cowork.pauses.breaksOne") : t("cowork.pauses.breaksMany", { n: data.totales.breaks })} />
              <Resumen label={t("cowork.meet.title")} valor={minutosLegibles(meets.data?.totales.segMeet ?? 0)} sub={(meets.data?.totales.meets ?? 0) === 1 ? t("cowork.pauses.meetsOne") : t("cowork.pauses.meetsMany", { n: meets.data?.totales.meets ?? 0 })} />
              <Resumen label={t("cowork.pauses.withExcess")} valor={String(data.totales.conExcesos)} alerta={data.totales.conExcesos > 0} />
            </div>
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="tabla-movil w-full text-xs" data-testid="tabla-pausas">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr className="[&>th]:px-3 [&>th]:py-2 [&>th]:text-left [&>th]:font-medium">
                    <th>{t("cowork.pauses.person")}</th>
                    <th className="!text-right">{t("cowork.pause.bano")}</th>
                    <th className="!text-right">{t("cowork.pause.break")}</th>
                    <th className="!text-right">{t("cowork.pauses.meet")}</th>
                    <th>{t("cowork.pauses.excess")}</th>
                  </tr>
                </thead>
                <tbody>
                  {filasTabla.map((p) => {
                    const excesos = fraseDeExcesos(p, t);
                    return (
                      <tr key={p.userId} className="border-t border-border/60 [&>td]:px-3 [&>td]:py-2 align-top">
                        <td className="font-medium">
                          {p.nombre}
                          {r.dias > 0 && <span className="ml-1 text-muted-foreground font-normal">· {p.dias === 1 ? t("cowork.pauses.daysOne") : t("cowork.pauses.daysMany", { n: p.dias })}</span>}
                          {p.autoCerradas > 0 && (
                            <div className="text-[10px] text-muted-foreground">{p.autoCerradas === 1 ? t("cowork.pauses.autoClosedOne") : t("cowork.pauses.autoClosedMany", { n: p.autoCerradas })}</div>
                          )}
                        </td>
                        <td className="text-right tabular-nums">
                          <div className={cn(p.diasBanoExcedido > 0 && "text-destructive font-semibold")}>{minutosLegibles(p.segBano)}</div>
                          <div className="text-[10px] text-muted-foreground">{p.banos === 1 ? t("cowork.pauses.tripsOne") : t("cowork.pauses.tripsMany", { n: p.banos })}</div>
                        </td>
                        <td className="text-right tabular-nums">
                          <div className={cn(p.breaksExcedidos > 0 && "text-destructive font-semibold")}>{minutosLegibles(p.segBreak)}</div>
                          <div className="text-[10px] text-muted-foreground">{p.breaks === 1 ? t("cowork.pauses.breaksOne") : t("cowork.pauses.breaksMany", { n: p.breaks })}</div>
                        </td>
                        <td className="text-right tabular-nums">
                          {(() => {
                            const m = meetDe.get(p.userId);
                            return m ? (
                              <>
                                <div className="text-primary">{minutosLegibles(m.segMeet)}</div>
                                <div className="text-[10px] text-muted-foreground">{m.meets === 1 ? t("cowork.pauses.meetsOne") : t("cowork.pauses.meetsMany", { n: m.meets })}</div>
                              </>
                            ) : <div className="text-muted-foreground">—</div>;
                          })()}
                        </td>
                        <td className={cn(excesos ? "text-destructive" : "text-muted-foreground")}>{excesos ?? t("cowork.pauses.onTrack")}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {/* Cada meet del período: cuándo, cuánto duró, quién lo invocó y quiénes fueron. */}
            {meets.data && meets.data.meets.length > 0 && (
              <div className="space-y-2">
                <h3 className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                  <Video className="h-3.5 w-3.5 text-primary" /> {t("cowork.pauses.groupMeets", { n: meets.data.meets.length })}
                </h3>
                {meets.data.meets.map((m) => (
                  <div key={m.meetId} className="rounded-xl border border-border/60 bg-muted/20 px-3 py-2 text-xs">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-medium text-foreground">{fechaHoraCorta(m.startedAt, f)}</span>
                      <span className="tabular-nums text-primary">{minutosLegibles(m.segundos)}</span>
                      {m.abierto && <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary">{t("cowork.pauses.ongoing")}</span>}
                      <span className="text-muted-foreground">· {t("cowork.pauses.calledBy", { name: m.creador })}</span>
                      {todas && <span className="text-muted-foreground">· {m.sesion}</span>}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {m.gente.map((g) => (
                        <span key={g.userId} className="inline-flex items-center gap-1 rounded-full bg-background px-2 py-0.5 text-[11px]">
                          <span className="font-medium">{g.nombre}</span>
                          {g.sala && <span className="text-muted-foreground">· {g.sala}</span>}
                          <span className="tabular-nums text-muted-foreground">· {minutosLegibles(g.segundos)}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Resumen({ label, valor, sub, alerta }: { label: string; valor: string; sub?: string; alerta?: boolean }) {
  return (
    <div className={cn("rounded-xl border px-3 py-2", alerta ? "border-destructive/40 bg-destructive/10" : "border-border bg-muted/30")}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn("font-display text-base font-semibold tabular-nums", alerta && "text-destructive")}>{valor}</div>
      {sub && <div className="text-[10px] text-muted-foreground">{sub}</div>}
    </div>
  );
}
