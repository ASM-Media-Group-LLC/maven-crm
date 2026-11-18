import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
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

export function AhoraEnVivo({ userId, capturas }: { userId: string; capturas: CapturaDia[] }) {
  const { t } = useLanguage();
  const [escuchar, setEscuchar] = useState(false);
  const obs = useObservadorEnVivo(userId, true, escuchar);
  const vivo = EN_VIVO.has(obs.estado);

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
    <section className="vidrio sube mt-4 p-4 lg:p-5">
      <div className="v-cont flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold">{t("hr.exp.cron.ahora")}</h2>
          {vivo ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-destructive/12 px-2 py-0.5 text-[11px] font-semibold text-destructive">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive opacity-60 motion-reduce:animate-none" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-destructive" />
              </span>
              {t("hr.exp.vivo.enVivo")}
            </span>
          ) : (
            <span className="text-[11px] text-muted-foreground">{motivo}</span>
          )}
          <Link
            to={`/hr/en-vivo/${userId}`}
            className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-border/60 px-2.5 py-1 text-[11px] font-medium text-foreground/80 transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
          >
            <Maximize2 className="h-3.5 w-3.5" />{t("hr.exp.vivo.abrirGrande")}
          </Link>
        </div>

        {vivo ? (
          <div className="overflow-hidden rounded-xl">
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
          <div className="grid gap-2 sm:grid-cols-2">
            {([["pantalla", ultimo.pantalla], ["camara", ultimo.camara]] as const).map(([tipo, c]) => (
              <div key={tipo} className="relative aspect-[16/10] overflow-hidden rounded-xl border border-border/50 bg-muted/40">
                {c ? (
                  url(c) ? <img src={url(c)} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /></div>
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                    {tipo === "pantalla" ? <ScreenShareOff className="h-5 w-5 opacity-60" /> : <CameraOff className="h-5 w-5 opacity-60" />}
                  </div>
                )}
                <span className="absolute left-2 top-2 rounded-md bg-black/60 px-2 py-1 text-[11px] font-semibold text-white backdrop-blur-sm">
                  {tipo === "pantalla" ? t("hr.exp.pantalla") : t("hr.exp.camara")}
                </span>
                {c && (
                  <span className="absolute bottom-2 left-2 rounded-md bg-black/60 px-2 py-1 text-[10px] tabular-nums text-white backdrop-blur-sm">
                    {t("hr.exp.cron.ultimo", { hora: hhmm(c.createdAt) })}
                  </span>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="py-6 text-center text-sm text-muted-foreground">{t("hr.exp.vivo.sinNada")}</p>
        )}
      </div>
    </section>
  );
}
