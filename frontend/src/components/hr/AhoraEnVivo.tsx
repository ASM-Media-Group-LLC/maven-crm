import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { CameraOff, Loader2, Maximize2, ScreenShareOff } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { useObservadorEnVivo } from "@/hooks/useObservadorEnVivo";
import { EscenarioEnVivo } from "@/components/vigilancia/EscenarioEnVivo";
import { urlCaptura, urlsDeNas } from "@/hooks/useMonitorEventos";
import type { CapturaDia } from "@/hooks/useExpedienteEmpleado";
import { a12 } from "@/lib/horaBogota";

// AHORA MISMO, EN VIVO (Alvaro, 18/11/2026: «¿de qué me sirven los pantallazos
// si tiene que tener la cámara encendida? Dice live: la idea es que esté live»).
// Arriba del expediente, su pantalla y su cámara EN VIDEO, como en Argos › En
// vivo (observador oculto de su sala de Cowork: ella no ve a nadie entrar). Si
// no está en Cowork, se dice y queda su último pantallazo de hoy.

const EN_VIVO = new Set(["conectando", "en_vivo", "reconectando"]);

const hhmm = (iso: string) =>
  a12(new Date(iso).toLocaleTimeString("en-GB", { timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit", hour12: false }));

/** `junto` (27/11/2026): va dentro de la cabecera de la ficha, sin marco propio. */
export function AhoraEnVivo({ userId, capturas, junto = false }: { userId: string; capturas: CapturaDia[]; junto?: boolean }) {
  const { t } = useLanguage();
  const [escuchar, setEscuchar] = useState(false);
  const obs = useObservadorEnVivo(userId, true, escuchar);
  const vivo = EN_VIVO.has(obs.estado);
  // Foto abierta en grande (Alvaro, 27/11/2026: «si yo quiero le doy clic a la foto
  // y que abra en grande, pero ahorita está muy grande toda esa parte»).
  const [abierta, setAbierta] = useState<string | null>(null);

  // Si no hay video: su último pantallazo y su última cámara de hoy.
  const ultimo = useMemo(() => {
    const desc = [...capturas].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    return { pantalla: desc.find((c) => c.tipo === "pantalla") ?? null, camara: desc.find((c) => c.tipo === "camara") ?? null };
  }, [capturas]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    if (vivo) return;
    let sigue = true;
    const fotos = [ultimo.pantalla, ultimo.camara].filter((c): c is CapturaDia => !!c);
    void (async () => {
      const nas = await urlsDeNas(fotos.filter((c) => c.enNas && c.nasPath).map((c) => c.nasPath!));
      const buzon = await Promise.all(fotos.filter((c) => !c.enNas).map(async (c) => [c.path, await urlCaptura(c.path)] as const));
      if (sigue) setUrls({ ...nas, ...Object.fromEntries(buzon.filter(([, u]) => !!u) as [string, string][]) });
    })();
    return () => { sigue = false; };
  }, [vivo, ultimo]);
  const url = (c: CapturaDia | null) => (c ? urls[(c.enNas ? c.nasPath : c.path) ?? ""] : undefined);

  const motivo = obs.estado === "sin_cowork" ? t("hr.exp.vivo.sinCowork")
    : obs.estado === "esperando" ? t("hr.exp.vivo.noConectada")
    : obs.estado === "sin_permiso" ? t("hr.exp.vivo.sinPermiso")
    : t("hr.exp.vivo.noDisponible");

  return (
    <section className={junto ? "flex min-w-0 flex-col gap-3" : "vidrio sube mt-4 p-4 lg:p-5"}>
      <div className={junto ? "flex flex-col gap-3" : "v-cont flex flex-col gap-3"}>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold">{t("hr.exp.cron.ahora")}</h2>
          {/* «En vivo» ya lo dice el video (18/11/2026: «se repite»). */}
          {!vivo && <span className="text-[11px] text-muted-foreground">{motivo}</span>}
          {/* Con el video ya está su botón de agrandar (Alvaro, 28/11/2026: «es tontera
              tener 2 veces esa parte»). */}
          {!(junto && vivo) && <Link
            to={`/hr/en-vivo/${userId}`}
            className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-border/60 px-2.5 py-1 text-[11px] font-medium text-foreground/80 transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
          >
            <Maximize2 className="h-3.5 w-3.5" />{t("hr.exp.vivo.abrirGrande")}
          </Link>}
        </div>

        {vivo ? (
          // Grande (Alvaro, 18/11/2026: «el live está muy chiquito»): a todo el ancho,
          // hasta casi el alto de la ventana.
          <div className={`mx-auto w-full overflow-hidden rounded-xl ${junto ? "rounded-2xl ring-1 ring-border/40 shadow-lg" : "max-w-[calc((100vh-9rem)*16/9)]"}`}>
            <EscenarioEnVivo
              estado={obs.estado}
              pantalla={obs.pantalla}
              camara={obs.camara}
              audio={obs.audio}
              sala={obs.sala}
              escuchar={escuchar}
              onEscuchar={setEscuchar}
              onReintentar={obs.reintentar}
              t={t}
            />
          </div>
        ) : ultimo.pantalla || ultimo.camara ? (
          // En la ficha (junto): dos miniaturas lado a lado; clic = grande.
          <div className={`grid gap-2 ${junto ? "grid-cols-2" : "sm:grid-cols-2"}`}>
            {([["pantalla", ultimo.pantalla], ["camara", ultimo.camara]] as const).map(([tipo, c]) => {
              const u = url(c);
              return (
              <div key={tipo} className="flex min-w-0 flex-col gap-1">
                <button type="button" disabled={!u} onClick={() => u && setAbierta(u)}
                  title={u ? t("hr.exp.vivo.abrirGrande") : undefined}
                  className={`group relative aspect-[16/10] overflow-hidden rounded-xl border border-border/50 bg-muted/40 ${u ? "cursor-zoom-in" : ""}`}>
                  {c ? (
                    u ? <img src={u} alt="" className="h-full w-full object-cover transition group-hover:brightness-110" /> : <div className="flex h-full w-full items-center justify-center text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /></div>
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                      {tipo === "pantalla" ? <ScreenShareOff className="h-5 w-5 opacity-60" /> : <CameraOff className="h-5 w-5 opacity-60" />}
                    </div>
                  )}
                  {!junto && (
                    <span className="absolute left-2 top-2 rounded-md bg-black/60 px-2 py-1 text-[11px] font-semibold text-white backdrop-blur-sm">
                      {tipo === "pantalla" ? t("hr.exp.pantalla") : t("hr.exp.camara")}
                    </span>
                  )}
                </button>
                {junto ? (
                  <p className="flex items-baseline justify-between gap-2 px-0.5 text-[11px] text-muted-foreground">
                    <span className="font-medium text-foreground/80">{tipo === "pantalla" ? t("hr.exp.pantalla") : t("hr.exp.camara")}</span>
                    {c && <span className="tabular-nums">{hhmm(c.createdAt)}</span>}
                  </p>
                ) : c && (
                  <span className="text-[10px] tabular-nums text-muted-foreground">{t("hr.exp.cron.ultimo", { hora: hhmm(c.createdAt) })}</span>
                )}
              </div>
              );
            })}
          </div>
        ) : (
          <p className="py-6 text-center text-sm text-muted-foreground">{t("hr.exp.vivo.sinNada")}</p>
        )}
      </div>
      {abierta && (
        <Dialog open onOpenChange={(o) => { if (!o) setAbierta(null); }}>
          <DialogContent className="max-w-5xl p-2 sm:p-3">
            <DialogTitle className="sr-only">{t("hr.exp.cron.ahora")}</DialogTitle>
            <img src={abierta} alt="" className="max-h-[80vh] w-full rounded-lg object-contain" />
          </DialogContent>
        </Dialog>
      )}
    </section>
  );
}
