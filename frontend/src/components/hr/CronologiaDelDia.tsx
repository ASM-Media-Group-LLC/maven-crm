import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { AlertTriangle, CameraOff, Check, ChevronRight, ListOrdered, Loader2, ScreenShareOff, ShieldCheck, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/hooks/useLanguage";
import { urlCaptura, urlsDeNas } from "@/hooks/useMonitorEventos";
import { usePerdonarCaptura, usePuedePerdonar } from "@/hooks/usePerdonarCaptura";
import type { CapturaDia, DiaExpediente } from "@/hooks/useExpedienteEmpleado";
import { armarTramos, minutosDe, veredictoDe, type EstadoTramo, type Tramo } from "@/lib/cronologiaArgos";
import { a12 } from "@/lib/horaBogota";
import type { TranslationKey } from "@/lib/i18n";

// El día de la persona como un CHAT (Alvaro, 18/11/2026, propuesta 3 de 4): lo
// más nuevo arriba; lo malo grande con su foto, lo que dijo Argos y sus avisos;
// lo bueno en una línea fina. Abajo, los días anteriores en una línea cada uno.
// No reemplaza nada del Expediente: va arriba y lo de siempre sigue debajo.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sinTipar = supabase as unknown as { from: (t: string) => any };

interface Nudge { id: string; tipo: string; mensaje: string | null; avisadoAt: string; escaladoAt: string | null; cerradoAt: string | null; }

const hhmmBog = (ms: number | string | null | undefined): string | null => {
  if (ms == null) return null;
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return null;
  return a12(d.toLocaleTimeString("en-GB", { timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit", hour12: false }));
};

/** ¿ms cae entre a y b (inclusive)? */
const entre = (ms: number, a: number, b: number): boolean => Math.min(Math.max(ms, a), b) === ms;

const durTxt = (min: number): string => (min >= 60 ? `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ""}` : `${min} min`);

const TITULO: Record<Exclude<EstadoTramo, "ok" | "tarde">, TranslationKey> = {
  sinCamara: "hr.exp.cron.sinCamara",
  sinPantalla: "hr.exp.cron.sinPantalla",
  fuera: "hr.exp.cron.fuera",
  sinCapturas: "hr.exp.cron.sinCapturas",
};
const PUNTO: Record<EstadoTramo, string> = {
  ok: "bg-success", tarde: "bg-muted-foreground", sinCamara: "bg-warning", sinPantalla: "bg-warning", fuera: "bg-destructive", sinCapturas: "bg-warning",
};

const claveFoto = (c: CapturaDia): string | null => (c.enNas ? c.nasPath : c.path);

/** La foto que representa un tramo: su primera pantalla, o su primera cámara. */
function fotoDe(tr: Tramo): { pantalla: CapturaDia | null; camara: CapturaDia | null } {
  const pantalla = tr.capturas.find((c) => c.tipo === "pantalla") ?? null;
  const camara = tr.capturas.find((c) => c.tipo === "camara") ?? null;
  return { pantalla, camara };
}

export function CronologiaDelDia({ userId, dia, horarioEntrada, diasMes, esHoy, onElegirDia, onVerMasDias, onVerFotos }: {
  userId: string;
  dia: DiaExpediente;
  horarioEntrada: string | null;
  diasMes: DiaExpediente[];
  esHoy: boolean;
  onElegirDia: (fecha: string) => void;
  onVerMasDias: () => void;
  onVerFotos: () => void;
}) {
  const { t } = useLanguage();
  const puedePerdonar = usePuedePerdonar();
  const perdonar = usePerdonarCaptura();

  const tramos = useMemo(
    () => armarTramos(dia.capturas, { fecha: dia.fecha, entroAt: dia.entroAt, horarioEntrada }),
    [dia, horarioEntrada],
  );

  // Los avisos de Argos del día (misma consulta y misma llave que AvisosDeArgos:
  // se comparte la caché y no se pide dos veces).
  const avisosQ = useQuery<Nudge[]>({
    queryKey: ["argos-nudges-dia", userId, dia.fecha],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await sinTipar.from("argos_nudges")
        .select("id, tipo, mensaje, avisado_at, escalado_at, cerrado_at")
        .eq("user_id", userId)
        .gte("avisado_at", `${dia.fecha}T00:00:00-05:00`)
        .lte("avisado_at", `${dia.fecha}T23:59:59-05:00`)
        .order("avisado_at", { ascending: false });
      if (error) throw new Error(error.message);
      return ((data ?? []) as Array<{ id: string; tipo: string; mensaje: string | null; avisado_at: string; escalado_at: string | null; cerrado_at: string | null }>).map((n) => ({
        id: n.id, tipo: n.tipo, mensaje: n.mensaje, avisadoAt: n.avisado_at, escaladoAt: n.escalado_at, cerradoAt: n.cerrado_at,
      }));
    },
  });

  // Cada aviso, pegado al tramo malo donde cayó (±2 min).
  const avisosDe = useMemo(() => {
    const mapa = new Map<Tramo, Nudge[]>();
    for (const n of avisosQ.data ?? []) {
      const ms = Date.parse(n.avisadoAt);
      const tr = tramos.find((x) => x.estado !== "ok" && entre(ms, x.desde - 120_000, x.hasta + 120_000))
        ?? tramos.find((x) => entre(ms, x.desde, x.hasta));
      if (!tr) continue;
      const l = mapa.get(tr);
      if (l) l.push(n); else mapa.set(tr, [n]);
    }
    return mapa;
  }, [avisosQ.data, tramos]);

  // Lo que se firma: la foto de cada tramo malo + el último pantallazo (ahora).
  const ultimo = useMemo(() => {
    const desc = [...dia.capturas].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    const p = desc.find((c) => c.tipo === "pantalla") ?? null;
    const c = desc.find((x) => x.tipo === "camara") ?? null;
    const ms = Math.max(p ? Date.parse(p.createdAt) : 0, c ? Date.parse(c.createdAt) : 0);
    return { pantalla: p, camara: c, ms };
  }, [dia.capturas]);
  const mostrarAhora = esHoy && ultimo.ms > 0 && Date.now() - ultimo.ms < 10 * 60_000;

  const [urls, setUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    let vivo = true;
    const fotos: CapturaDia[] = [];
    for (const tr of tramos) {
      if (tr.estado === "ok") continue;
      const f = fotoDe(tr);
      if (f.pantalla) fotos.push(f.pantalla);
      if (f.camara) fotos.push(f.camara);
    }
    if (mostrarAhora) { if (ultimo.pantalla) fotos.push(ultimo.pantalla); if (ultimo.camara) fotos.push(ultimo.camara); }
    void (async () => {
      const nas = fotos.filter((c) => c.enNas && c.nasPath).map((c) => c.nasPath!);
      const buzon = fotos.filter((c) => !c.enNas).map((c) => c.path);
      const [nasUrls, pares] = await Promise.all([
        urlsDeNas([...new Set(nas)]),
        Promise.all([...new Set(buzon)].map(async (p) => [p, await urlCaptura(p)] as const)),
      ]);
      if (vivo) setUrls({ ...nasUrls, ...Object.fromEntries(pares.filter(([, u]) => !!u) as [string, string][]) });
    })();
    return () => { vivo = false; };
  }, [tramos, mostrarAhora, ultimo]);

  const anteriores = useMemo(
    () => diasMes.filter((d) => d.fecha.localeCompare(dia.fecha) === -1 && (d.capturas.length + d.horas) !== 0).sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 5),
    [diasMes, dia.fecha],
  );

  const Foto = ({ c, chica }: { c: CapturaDia | null; chica?: boolean }) => {
    const u = c ? urls[claveFoto(c) ?? ""] : undefined;
    if (!c) {
      return (
        <div className={`flex h-full w-full items-center justify-center bg-destructive/10 text-destructive ${chica ? "" : "flex-col gap-1"}`}>
          {chica ? <CameraOff className="h-3.5 w-3.5" /> : <><ScreenShareOff className="h-5 w-5 opacity-70" /><span className="text-[10px] font-medium">{t("hr.exp.cron.sinFoto")}</span></>}
        </div>
      );
    }
    return u
      ? <img src={u} alt="" loading="lazy" className="h-full w-full object-cover" />
      : <div className="flex h-full w-full items-center justify-center text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /></div>;
  };

  const abrir = async (c: CapturaDia | null) => {
    if (!c) return;
    const k = claveFoto(c);
    const u = (k && urls[k]) || (!c.enNas ? await urlCaptura(c.path) : null);
    if (u) window.open(u, "_blank", "noopener");
  };

  const fechaTxt = (f: string): string => {
    const ayer = new Date(Date.now() - 86_400_000).toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
    const larga = format(new Date(`${f}T12:00:00`), "EEEE d", { locale: es });
    return f === ayer ? `${t("hr.exp.cron.ayer")} · ${larga}` : larga;
  };

  const desc = [...tramos].reverse();

  return (
    <section className="vidrio sube mt-4 p-4 lg:p-5">
      <div className="v-cont flex flex-col gap-4">
        <div>
          <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
            <ListOrdered className="h-3.5 w-3.5" />{t("hr.exp.cron.titulo")}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{t("hr.exp.cron.sub")}</p>
        </div>

        {/* AHORA: su último pantallazo con la cámara pegada, si es de hace poco. */}
        {mostrarAhora && (
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <button type="button" onClick={() => abrir(ultimo.pantalla)} className="relative aspect-[16/10] overflow-hidden rounded-xl border border-border/50 bg-muted/40">
              <Foto c={ultimo.pantalla} />
              <span className="absolute left-2 top-2 inline-flex items-center gap-1.5 rounded-md bg-black/60 px-2 py-1 text-[11px] font-semibold text-white backdrop-blur-sm">
                <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden />{t("hr.exp.cron.ahora")} · {t("hr.exp.pantalla")}
              </span>
            </button>
            <button type="button" onClick={() => abrir(ultimo.camara)} className="relative aspect-[16/10] overflow-hidden rounded-xl border border-border/50 bg-muted/40">
              <Foto c={ultimo.camara} />
              <span className="absolute left-2 top-2 rounded-md bg-black/60 px-2 py-1 text-[11px] font-semibold text-white backdrop-blur-sm">{t("hr.exp.camara")}</span>
              <span className="absolute bottom-2 left-2 rounded-md bg-black/60 px-2 py-1 text-[10px] tabular-nums text-white backdrop-blur-sm">{t("hr.exp.cron.ultimo", { hora: hhmmBog(ultimo.ms) ?? "—" })}</span>
            </button>
          </div>
        )}

        {/* El día, lo más nuevo arriba. */}
        {tramos.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{t("hr.exp.cron.vacio")}</p>
        ) : (
          <ol className="flex flex-col">
            {desc.map((tr, i) => {
              const min = minutosDe(tr);
              const hora = hhmmBog(tr.desde) ?? "—";
              const linea = (
                <span className="flex w-4 shrink-0 flex-col items-center self-stretch">
                  <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${PUNTO[tr.estado]}`} aria-hidden />
                  {i < desc.length - 1 && <span className="mt-1 w-px flex-1 bg-border/60" aria-hidden />}
                </span>
              );
              const horaCol = <span className="w-14 shrink-0 pt-0.5 text-right text-xs font-semibold tabular-nums text-muted-foreground">{hora}</span>;

              if (tr.estado === "ok") {
                return (
                  <li key={`${tr.desde}-ok`} className="flex gap-2.5 pb-2">
                    {horaCol}{linea}
                    <div className="min-w-0 flex-1 rounded-xl border border-dashed border-border/50 px-3 py-1.5 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground/85">{t("hr.exp.cron.trabajo", { dur: durTxt(min) })}</span>
                      {veredictoDe(tr) && <span> · {veredictoDe(tr)}</span>}
                      {/* Avisos que cayeron en un rato bueno (la falla duró tan poco
                          que no hizo tramo propio): igual se ven. */}
                      {(avisosDe.get(tr) ?? []).map((n) => (
                        <span key={n.id} className="mt-1 flex items-center gap-1.5 text-foreground/85">
                          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-warning" aria-hidden />
                          <span><span className="text-muted-foreground">{t("hr.exp.cron.aviso", { hora: hhmmBog(n.avisadoAt) ?? "—" })}</span> {n.mensaje ?? n.tipo}
                            {n.cerradoAt && <span className="text-muted-foreground"> · {t("hr.exp.cron.volvio", { hora: hhmmBog(n.cerradoAt) ?? "—" })}</span>}</span>
                        </span>
                      ))}
                    </div>
                  </li>
                );
              }

              if (tr.estado === "tarde") {
                return (
                  <li key={`${tr.desde}-tarde`} className="flex gap-2.5 pb-3">
                    {horaCol}{linea}
                    <div className="min-w-0 flex-1 rounded-xl border border-border/50 bg-card/30 px-3 py-2.5">
                      <p className="text-sm font-semibold">{t("hr.exp.cron.tarde", { dur: durTxt(min) })}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{t("hr.exp.cron.tardeDet", { debia: hhmmBog(tr.desde) ?? "—", entro: hhmmBog(tr.hasta) ?? "—" })}</p>
                    </div>
                  </li>
                );
              }

              const f = fotoDe(tr);
              const ver = veredictoDe(tr);
              const avisos = (avisosDe.get(tr) ?? []).slice().sort((a, b) => (a.avisadoAt < b.avisadoAt ? -1 : 1));
              const fueras = tr.capturas.filter((c) => c.tipo === "pantalla" && c.fueraDeLugar === true);
              const todasPerdonadas = fueras.length > 0 && fueras.every((c) => c.perdonado);
              return (
                <li key={`${tr.desde}-${tr.estado}`} className="flex gap-2.5 pb-3">
                  {horaCol}{linea}
                  <div className="min-w-0 flex-1 rounded-xl border border-border/50 bg-card/30 p-3">
                    <p className="flex items-center gap-1.5 text-sm font-semibold">
                      {tr.estado === "fuera" && <AlertTriangle className="h-3.5 w-3.5 text-destructive" />}
                      {t(TITULO[tr.estado], { dur: durTxt(min) })}
                    </p>
                    <div className="mt-2 grid gap-3 sm:grid-cols-[11rem_minmax(0,1fr)]">
                      {tr.estado === "sinCapturas" ? (
                        <div className="flex aspect-[16/10] items-center justify-center rounded-lg border border-dashed border-border/50 text-muted-foreground"><ScreenShareOff className="h-5 w-5 opacity-60" /></div>
                      ) : (
                        <button type="button" onClick={() => abrir(f.pantalla ?? f.camara)} className="relative aspect-[16/10] overflow-hidden rounded-lg border border-border/50 bg-muted/40">
                          <Foto c={f.pantalla ?? f.camara} />
                          {f.pantalla && (
                            <span className="absolute bottom-1 right-1 h-9 w-12 overflow-hidden rounded border-2 border-background/80">
                              <Foto c={f.camara} chica />
                            </span>
                          )}
                        </button>
                      )}
                      <div className="flex min-w-0 flex-col gap-1.5 text-xs">
                        {tr.estado === "sinCapturas"
                          ? <p className="text-muted-foreground">{t("hr.exp.cron.sinCapturasDet")}</p>
                          : ver && <p className="flex items-start gap-1.5"><Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" /><span><span className="text-muted-foreground">{t("hr.exp.cron.argosDijo")}</span> {ver}</span></p>}
                        {avisos.map((n) => (
                          <p key={n.id}>
                            <span className="text-muted-foreground">{t("hr.exp.cron.aviso", { hora: hhmmBog(n.avisadoAt) ?? "—" })}</span>{" "}
                            {n.mensaje ?? n.tipo}
                            {n.cerradoAt && <span className="text-muted-foreground"> · {t("hr.exp.cron.volvio", { hora: hhmmBog(n.cerradoAt) ?? "—" })}</span>}
                            {n.escaladoAt && <span className="text-destructive"> · {t("hr.exp.cron.escalado")}</span>}
                          </p>
                        ))}
                        <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
                          {tr.capturas.length > 1 && (
                            <button type="button" onClick={onVerFotos} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                              {t("hr.exp.cron.verFotos", { n: tr.capturas.length })}<ChevronRight className="h-3 w-3" />
                            </button>
                          )}
                          {fueras.length > 0 && (todasPerdonadas ? (
                            <span className="inline-flex items-center gap-1 text-xs text-success"><Check className="h-3.5 w-3.5" />{t("hr.exp.cron.perdonado")}</span>
                          ) : puedePerdonar ? (
                            <button type="button" disabled={perdonar.isPending}
                              onClick={() => { for (const c of fueras) if (!c.perdonado) perdonar.mutate({ id: c.id, perdonar: true }); }}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary transition hover:bg-primary/15 disabled:opacity-50">
                              {perdonar.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}{t("hr.exp.cron.perdonar")}
                            </button>
                          ) : null)}
                        </div>
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}

        {/* Días anteriores: una línea cada uno; tocar abre ese día. */}
        {anteriores.length > 0 && (
          <div className="border-t border-border/40 pt-3">
            <p className="mb-2 text-xs font-semibold text-muted-foreground">{t("hr.exp.cron.diasAntes")}</p>
            <div className="flex flex-col gap-1.5">
              {anteriores.map((d) => (
                <button key={d.fecha} type="button" onClick={() => onElegirDia(d.fecha)}
                  className="flex w-full items-center gap-3 rounded-xl border border-dashed border-border/50 px-3 py-2 text-left text-xs transition hover:border-primary/40 hover:bg-card/30">
                  <span className="w-28 shrink-0 font-semibold capitalize text-foreground/90">{fechaTxt(d.fecha)}</span>
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">
                    {t("hr.exp.cron.resumenDia", { entro: hhmmBog(d.entroAt ?? null) ?? "—", horas: d.horas.toFixed(1), faltas: d.faltas.length })}
                  </span>
                  {d.nota.valor != null && <span className="shrink-0 tabular-nums text-muted-foreground">{t("hr.exp.cron.notaDia", { n: d.nota.valor })}</span>}
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                </button>
              ))}
            </div>
            <button type="button" onClick={onVerMasDias} className="mt-2 text-xs font-medium text-primary hover:underline">{t("hr.exp.cron.verMas")}</button>
          </div>
        )}
      </div>
    </section>
  );
}
