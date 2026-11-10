import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNowStrict } from "date-fns";
import { es as esLocale } from "date-fns/locale";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowRight, HardDrive, Loader2, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import { useEsDueno } from "@/hooks/useEsDueno";
import {
  ALERTA_PCT, LLENO_PCT, cuantoFalta, partesDeLoUsado, pctUsado, tamanoNas, tonoDelNas,
  type ResumenNas, type TonoNas,
} from "@/lib/espacioNas";

// MEDIDOR DEL NAS en el Centro de operaciones (Alvaro, 10/11/2026): "¿qué tan
// lleno está, cuánto falta para que se llene y qué es lo que más ocupa?". Solo
// dueño/admin (la RPC también lo exige). Si la lectura falla se dice y se ofrece
// reintentar: un fallo no es "vacío".

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sinTipar = supabase as unknown as { rpc: (f: string, a?: unknown) => Promise<{ data: any; error: { message: string } | null }> };

const CLAVE_FALTA = {
  semanas: "dashboard.centro.nas.falta.semanas",
  meses: "dashboard.centro.nas.falta.meses",
  anios: "dashboard.centro.nas.falta.anios",
} as const;

const BARRA: Record<TonoNas, string> = { ok: "bg-primary", atento: "bg-warning", urgente: "bg-destructive" };
/** Las barritas de discos y de "qué ocupa" van apagadas: el color fuerte queda
 *  solo para la barra principal (Alvaro: los colores encendidos molestan). */
const BARRA_SUAVE: Record<TonoNas, string> = { ok: "bg-primary/45", atento: "bg-warning/70", urgente: "bg-destructive/70" };
const TEXTO: Record<TonoNas, string> = { ok: "text-foreground", atento: "text-warning", urgente: "text-destructive" };

function hace(iso: string | null | undefined, idioma: string): string {
  if (!iso) return "—";
  try { return formatDistanceToNowStrict(new Date(iso), { addSuffix: true, locale: idioma === "es" ? esLocale : undefined }); } catch { return "—"; }
}

/** Barra fina con su porcentaje (discos y "qué ocupa"). */
function BarraFina({ pct, tono = "ok" }: { pct: number; tono?: TonoNas }) {
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
      <div className={`h-full rounded-full ${BARRA_SUAVE[tono]}`} style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
    </div>
  );
}

/** Dónde vive el detalle completo (EspacioNasPage). */
export const RUTA_ESPACIO_NAS = "/oficina/espacio-nas";

/** El resumen del NAS (solo el dueño). Lo comparten el bloque de la página,
 *  la línea del Centro y la ficha: una sola lectura en caché. */
export function useResumenNas() {
  const { user } = useAuth();
  const { esDueno } = useEsDueno();
  // Solo el dueño (Alvaro, 10/11: «Salud y NAS solo tú»).
  const puede = esDueno === true;
  const q = useQuery<ResumenNas>({
    queryKey: ["centro-espacio-nas"],
    enabled: !!user && puede,
    staleTime: 5 * 60_000,
    refetchInterval: 10 * 60_000,
    retry: 1,
    queryFn: async () => {
      const { data, error } = await sinTipar.rpc("nas_espacio_resumen");
      if (error) throw new Error(error.message);
      return data as ResumenNas;
    },
  });
  return { puede, q };
}

export default function EspacioNasBloque({ conEnlace = true, compacto = false }: { conEnlace?: boolean; compacto?: boolean }) {
  const { puede, q } = useResumenNas();
  if (!puede) return null;
  return (
    <EspacioNasVista
      resumen={q.data} cargando={q.isLoading} fallo={q.isError} onReintentar={() => void q.refetch()}
      enlaceDetalle={conEnlace ? RUTA_ESPACIO_NAS : undefined} compacto={compacto}
    />
  );
}

/** La vista: solo dibuja. Separada para mirarla con datos reales en el banco
 *  visual (/harness.html?ver=nas) sin iniciar sesión. */
export function EspacioNasVista({ resumen: r, cargando, fallo, onReintentar, enlaceDetalle, compacto = false }: {
  resumen: ResumenNas | undefined; cargando: boolean; fallo: boolean; onReintentar: () => void;
  /** Si viene, el encabezado lleva «Ver detalle» hacia la página completa. */
  enlaceDetalle?: string;
  /** Solo lo lleno y los tres números (Alvaro: "no algo tan extendido"); los
   *  discos y «qué ocupa más» viven en las pestañas de adentro. */
  compacto?: boolean;
}) {
  const { t, language } = useLanguage();
  const pct = r && !r.sin_muestras ? pctUsado(r) : 0;
  const tono = tonoDelNas(pct);
  const falta = r ? cuantoFalta(r.semanas_para_llenarse) : null;
  const fecha = r?.fecha_llena
    ? new Date(`${r.fecha_llena}T12:00:00`).toLocaleDateString(language === "es" ? "es-CO" : "en-US", { month: "long", year: "numeric" })
    : null;

  return (
    <section className="vidrio sube p-4" style={{ animationDelay: "0.14s" }}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <span className="flex h-7 w-7 items-center justify-center rounded-panel bg-primary/10 text-primary"><HardDrive className="h-4 w-4" /></span>
          {t("dashboard.centro.nas.titulo")}
        </h2>
        <div className="flex items-center gap-3">
          <span className="text-[11px] text-muted-foreground">
            {r && !r.sin_muestras ? t("dashboard.centro.nas.medido", { hace: hace(r.medido_at, language) }) : t("dashboard.centro.nas.soloAdmins")}
          </span>
          {enlaceDetalle && (
            <Link to={enlaceDetalle} className="inline-flex items-center gap-1 rounded-control border border-border px-2.5 py-1 text-xs font-medium hover:bg-muted">
              {t("dashboard.centro.nas.verDetalle")}<ArrowRight className="h-3.5 w-3.5" />
            </Link>
          )}
        </div>
      </div>

      {cargando ? (
        <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : fallo ? (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-panel border border-destructive/30 bg-destructive/5 p-3 text-sm">
          <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
          <span className="min-w-0 flex-1">{t("dashboard.centro.nas.fallo")}</span>
          <button type="button" onClick={onReintentar} className="inline-flex items-center gap-1.5 rounded-control border border-border px-2.5 py-1 text-xs font-medium hover:bg-muted">
            <RefreshCw className="h-3.5 w-3.5" />{t("dashboard.centro.nas.reintentar")}
          </button>
        </div>
      ) : !r || r.sin_muestras ? (
        <p className="py-4 text-sm text-muted-foreground">{t("dashboard.centro.nas.sinMuestras")}</p>
      ) : (
        <div className="flex flex-col gap-4">
          {/* Lo usado contra el total, con las marcas del aviso (80 %) y del tope real (95 %). */}
          <div>
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className={`font-display text-[26px] font-bold leading-tight tracking-tight tabular-nums ${TEXTO[tono]}`}>{tamanoNas(r.usado, language)}</span>
              <span className="text-sm text-muted-foreground tabular-nums">{t("dashboard.centro.nas.deTotal", { total: tamanoNas(r.total, language) })}</span>
              <span className={`ml-auto font-display text-lg font-semibold tabular-nums ${TEXTO[tono]}`}>{Math.round(pct)} %</span>
            </div>
            <div className="relative mt-2">
              <div className="h-3 overflow-hidden rounded-full bg-muted">
                <div className={`h-full rounded-full transition-[width] ${BARRA[tono]}`} style={{ width: `${Math.min(100, pct)}%` }} />
              </div>
              {[ALERTA_PCT, LLENO_PCT].map((m) => (
                <div key={m} className="absolute -top-1 h-5 w-px bg-foreground/40" style={{ left: `${m}%` }} aria-hidden />
              ))}
            </div>
            {/* Leyenda de las marcas (en el celular, pegadas en la barra se pisaban). */}
            <div className="mt-1.5 flex justify-end gap-3 text-[10px] text-muted-foreground">
              {([["dashboard.centro.nas.marcaAlerta", ALERTA_PCT], ["dashboard.centro.nas.marcaLleno", LLENO_PCT]] as const).map(([clave, m]) => (
                <span key={m} className="inline-flex items-center gap-1 whitespace-nowrap">
                  <span className="inline-block h-2.5 w-px bg-foreground/40" aria-hidden />{t(clave)} {m} %
                </span>
              ))}
            </div>
          </div>

          {/* Lo que importa para decidir: cuánto queda, a qué ritmo y cuándo se llena. */}
          <div className="grid gap-2.5 sm:grid-cols-3">
            <div className="rounded-panel border border-border/60 bg-card/40 p-3">
              <div className="text-[11px] font-medium text-muted-foreground">{t("dashboard.centro.nas.libreUtil")}</div>
              <div className="mt-1 font-display text-lg font-semibold tabular-nums">{tamanoNas(r.util_restante, language)}</div>
              <div className="mt-0.5 text-[11px] text-muted-foreground">{t("dashboard.centro.nas.libreUtilNota")}</div>
            </div>
            <div className="rounded-panel border border-border/60 bg-card/40 p-3">
              <div className="text-[11px] font-medium text-muted-foreground">{t("dashboard.centro.nas.ritmo")}</div>
              <div className="mt-1 font-display text-lg font-semibold tabular-nums">
                {r.ritmo_semana && r.ritmo_semana > 0 ? t("dashboard.centro.nas.ritmoValor", { tam: tamanoNas(r.ritmo_semana, language) }) : "—"}
              </div>
              <div className="mt-0.5 text-[11px] text-muted-foreground">
                {r.ritmo_fuente === "disco" ? t("dashboard.centro.nas.ritmoDisco") : t("dashboard.centro.nas.ritmoDrive")}
              </div>
            </div>
            <div className="rounded-panel border border-border/60 bg-card/40 p-3">
              <div className="text-[11px] font-medium text-muted-foreground">{t("dashboard.centro.nas.seLlena")}</div>
              <div className={`mt-1 font-display text-lg font-semibold tabular-nums ${TEXTO[tono]}`}>
                {falta ? t(CLAVE_FALTA[falta.unidad], { n: falta.n.toLocaleString(language === "es" ? "es-CO" : "en-US") }) : t("dashboard.centro.nas.noCrece")}
              </div>
              {fecha && <div className="mt-0.5 text-[11px] text-muted-foreground">{t("dashboard.centro.nas.hacia", { fecha })}</div>}
            </div>
          </div>

          {!compacto && (
            <>
          {/* Cada disco por separado: el NAS los llena parejo, pero si uno se adelanta se ve acá. */}
          {r.discos.length > 1 && (
            <div className="grid gap-2.5 sm:grid-cols-2">
              {r.discos.map((d, i) => {
                const p = pctUsado({ usado: d.total - d.libre, total: d.total });
                return (
                  <div key={i} className="flex flex-col gap-1">
                    <div className="flex items-baseline justify-between text-[11px]">
                      <span className="font-medium">{t("dashboard.centro.nas.disco", { n: i + 1 })}</span>
                      <span className="tabular-nums text-muted-foreground">{tamanoNas(d.total - d.libre, language)} / {tamanoNas(d.total, language)} · {Math.round(p)} %</span>
                    </div>
                    <BarraFina pct={p} tono={tonoDelNas(p)} />
                  </div>
                );
              })}
            </div>
          )}

          {/* Qué ocupa más: por unidad compartida, como parte de lo usado. */}
          <div>
            <h3 className="mb-2 text-xs font-semibold text-muted-foreground">{t("dashboard.centro.nas.queOcupa")}</h3>
            <ul className="flex flex-col gap-2">
              {partesDeLoUsado(r).map((u) => (
                <li key={u.unidad ?? "-"} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1">
                  <span className="truncate text-sm" title={u.unidad ?? undefined}>{u.unidad ?? t("dashboard.centro.nas.miUnidad")}</span>
                  <span className="text-right text-xs tabular-nums text-muted-foreground">
                    {tamanoNas(u.bytes, language)} · {Math.round(u.pct)} %
                  </span>
                  <div className="col-span-2"><BarraFina pct={u.pct} /></div>
                  <span className="col-span-2 -mt-0.5 text-[10px] text-muted-foreground tabular-nums">
                    {t("dashboard.centro.nas.archivos", { n: u.archivos.toLocaleString(language === "es" ? "es-CO" : "en-US") })}
                  </span>
                </li>
              ))}
            </ul>
          </div>

            </>
          )}

          {r.alertas.length > 0 && (
            <p className="flex items-center gap-1.5 text-[11px] text-warning">
              <AlertTriangle className="h-3.5 w-3.5" />
              {r.alertas.map((a) => t("dashboard.centro.nas.alertaEnviada", { nivel: a.nivel, hace: hace(a.avisado_at, language) })).join(" · ")}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
