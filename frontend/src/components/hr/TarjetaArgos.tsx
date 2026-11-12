import { useEffect, useMemo, useRef, useState } from "react";
import { Bot, Monitor, CameraOff, ScreenShareOff, Loader2, Images } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { urlCaptura, urlsDeNas } from "@/hooks/useMonitorEventos";
import type { CapturaDia, DiaExpediente } from "@/hooks/useExpedienteEmpleado";
import type { TranslationKey } from "@/lib/i18n";
import { bandaDelDia, type Jornada } from "@/lib/argosJornada";
import { appDe, loBuenoYLoMalo, loPeor, tiempoPorApp, type CapturaJuzgada, type Hecho } from "@/lib/argosResumen";
import type { ClipArgos } from "@/lib/argosMomentos";
import { cn } from "@/lib/utils";
import { TARJETA, hora as horaDe, horaRedonda, pct, textoMin, type Tr } from "@/components/argos/piezas";
import { VisorEvidencia, type FotoEvidencia } from "@/components/argos/VisorEvidencia";

// ARGOS, TU MANAGER DEL DÍA (Alvaro, 09/11 y 11/11/2026). Tres piezas:
//   · FraseDelDia: UNA frase que dice cómo va y por qué, en minutos («Va mal hoy.
//     Trabajó 1 h 29 min de 10 h. Por esto: …»).
//   · TarjetaArgos: «Lo bueno» y «Lo malo», cada cosa con su hora; una línea de
//     texto con los hechos («18 momentos mirados · 1 fuera de lugar (9:03) · entró
//     7 min tarde») y «Dónde pasó el tiempo» en filas con una barra fina.
//   · FotosDeArgos: las fotos por hora, grandes; debajo UNA línea gris
//     («9:03 · Flojo · Instagram»); la floja se marca solo con su marco y la
//     palabra. La descripción completa, la cámara y el zoom, en el visor.
// Diseño serio (11/11): tarjetas planas, cifras en tinta neutra y rojo solo en lo
// malo; sin pastillas ni colores de adorno.

const HORA_MS = 3_600_000;
const claveFoto = (c: CapturaDia | null): string | null => (c ? (c.enNas ? c.nasPath : c.path) : null);

function juzgadasDe(dia: DiaExpediente): CapturaJuzgada[] {
  return dia.capturas
    .filter((c) => c.tipo === "pantalla" && c.veredicto != null)
    .map((c) => ({ at: Date.parse(c.createdAt), veredicto: c.veredicto, flojo: c.fueraDeLugar === true && !c.perdonado }));
}

const FALLA: Partial<Record<string, TranslationKey>> = {
  fuera_cowork: "argos.hecho.fueraCowork",
  sin_camara: "argos.hecho.sinCamara",
  sin_pantalla: "argos.hecho.sinPantalla",
  fuera_de_camara: "argos.hecho.fueraDeCuadro",
  pausa_de_mas: "argos.hecho.pausaDeMas",
  distraido: "argos.hecho.distraido",
};

/** Qué pasó, en palabras simples (sin la hora). */
function textoHecho(h: Hecho, t: Tr): string {
  const m = textoMin(h.min ?? 0, t);
  switch (h.clave) {
    case "tarde": return t("argos.hecho.tarde", { m });
    case "seFue": return t("argos.hecho.seFue", { m });
    case "aTiempo": return t("argos.hecho.aTiempo");
    case "bienTramo": return t("argos.hecho.bienTramo", { m });
    case "pausaOk": return t("argos.hecho.pausaOk", { m });
    case "flojo": return h.app ? t("argos.hecho.flojoEn", { app: h.app }) : t("argos.hecho.flojo");
    case "falla":
      if (h.estado === "distraido" && h.app) return t("argos.hecho.enApp", { m, app: h.app });
      return t(FALLA[h.estado ?? ""] ?? "argos.hecho.distraido", { m });
  }
}

/** «9:03 a. m.» o «10:37 a. m. – 1:18 p. m.». */
function horaDeHecho(h: Hecho, lang: string): string {
  return h.hasta && h.hasta - h.at >= 60_000 ? `${horaDe(h.at, lang)} – ${horaDe(h.hasta, lang)}` : horaDe(h.at, lang);
}

/** LA FRASE DEL DÍA: cómo va y por qué, en minutos. */
export function FraseDelDia({ jornada: j, dia, esHoy }: { jornada: Jornada | null; dia: DiaExpediente; esHoy: boolean }) {
  const { t, language } = useLanguage();
  if (!j) return null;
  if (j.sinSenal) return <p className="text-base leading-relaxed">{t("argos.frase.noEntro")}</p>;
  const { malo } = loBuenoYLoMalo(j, juzgadasDe(dia));
  const banda = bandaDelDia(j);
  const lead = banda === "bueno" ? t(esHoy ? "argos.frase.bienHoy" : "argos.frase.bienDia")
    : banda === "regular" ? t(esHoy ? "argos.frase.regularHoy" : "argos.frase.regularDia")
    : t(esHoy ? "argos.frase.malHoy" : "argos.frase.malDia");
  const total = textoMin((Math.min(j.fin, Date.now()) - j.inicio) / 60_000, t);
  const peor = loPeor(malo);
  const item = (h: Hecho) => {
    const que = textoHecho(h, t);
    if (h.clave === "tarde" || h.clave === "seFue") return `${que} (${horaDe(h.at, language)})`;
    const hh = horaDe(h.at, language);
    return t(hh.startsWith("1:") ? "argos.frase.aLa" : "argos.frase.aLas", { h: hh, que });
  };
  const lista = peor.map(item);
  const unidos = lista.length > 1 ? `${lista.slice(0, -1).join(", ")} ${t("argos.frase.y")} ${lista[lista.length - 1]}` : lista[0];
  return (
    <p className="text-base leading-relaxed">
      <span className={cn("font-semibold", banda === "flojo" && "text-destructive")}>{lead}</span>{" "}
      {t("argos.frase.trabajo", { m: textoMin(j.conectadoSeg / 60, t), total })}{" "}
      {lista.length > 0
        ? <>{banda === "bueno" ? t("argos.frase.loUnico") : t("argos.frase.porEsto")} {unidos}.</>
        : t("argos.frase.sinFallas")}
    </p>
  );
}

function Fila({ h, lang, t, malo }: { h: Hecho; lang: string; t: Tr; malo: boolean }) {
  return (
    <li className="grid grid-cols-1 gap-x-4 gap-y-0.5 border-b border-border py-2.5 text-sm last:border-b-0 sm:grid-cols-[11.5rem_minmax(0,1fr)]">
      <span className="tabular-nums text-muted-foreground">{horaDeHecho(h, lang)}</span>
      <span className={malo ? "text-destructive" : "text-foreground/90"}>{textoHecho(h, t)}</span>
    </li>
  );
}

/** «Lo bueno» y «Lo malo», los hechos en una línea y dónde pasó el tiempo. */
export function TarjetaArgos({ dia, horario, jornada }: {
  dia: DiaExpediente;
  horario: { entrada: string | null; salida: string | null };
  jornada?: Jornada | null;
}) {
  const { t, language } = useLanguage();
  const juzgadas = useMemo(() => juzgadasDe(dia), [dia]);
  const res = useMemo(() => (jornada ? loBuenoYLoMalo(jornada, juzgadas) : null), [jornada, juzgadas]);
  const tiempo = useMemo(() => tiempoPorApp(juzgadas), [juzgadas]);
  const maxMin = tiempo.reduce((a, x) => Math.max(a, x.min), 1);

  // La línea de hechos, en texto simple.
  const flojas = juzgadas.filter((c) => c.flojo);
  const hechos: string[] = [];
  if (juzgadas.length > 0) hechos.push(t("hr.exp.mgr.hecho.momentos", { n: juzgadas.length }));
  if (flojas.length > 0) hechos.push(t("argos.hechos.fuera", { n: flojas.length, h: flojas.slice(0, 3).map((c) => horaDe(c.at, language)).join(", ") }));
  const tarde = res?.malo.find((h) => h.clave === "tarde");
  if (tarde) hechos.push(t("argos.hecho.tarde", { m: textoMin(tarde.min ?? 0, t) }));
  const hoyB = new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
  const ultCap = dia.capturas.reduce((mx, c) => (c.createdAt > mx ? c.createdAt : mx), "");
  if (dia.fecha === hoyB && !!ultCap && Date.now() - Date.parse(ultCap) < 5 * 60_000) hechos.push(t("hr.exp.mgr.hecho.enSala"));
  void horario;

  return (
    <section className={cn("mt-5 p-5 sm:p-6", TARJETA)}>
      <p className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground/90"><Bot className="h-4 w-4 text-muted-foreground" />{t("hr.exp.mgr.titulo")}</p>
      {hechos.length > 0 && <p className="mb-5 text-sm text-muted-foreground">{hechos.join(" · ")}</p>}

      {res && (
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <p className="mb-1 text-sm font-semibold">{t("argos.bloque.malo")}</p>
            {res.malo.length === 0 ? <p className="py-2.5 text-sm text-muted-foreground">{t("argos.bloque.nadaMalo")}</p> : (
              <ul>{res.malo.map((h) => <Fila key={`${h.clave}-${h.at}`} h={h} lang={language} t={t} malo />)}</ul>
            )}
            {res.masMalo > 0 && <p className="pt-2 text-xs text-muted-foreground">{t("argos.equipo.yMas", { n: res.masMalo })}</p>}
          </div>
          <div>
            <p className="mb-1 text-sm font-semibold">{t("argos.bloque.bueno")}</p>
            {res.bueno.length === 0 ? <p className="py-2.5 text-sm text-muted-foreground">{t("argos.bloque.nadaBueno")}</p> : (
              <ul>{res.bueno.map((h) => <Fila key={`${h.clave}-${h.at}`} h={h} lang={language} t={t} malo={false} />)}</ul>
            )}
          </div>
        </div>
      )}

      {tiempo.length > 0 && (
        <div className="mt-6">
          <p className="mb-2 flex items-center gap-2 text-sm font-semibold"><Monitor className="h-4 w-4 text-muted-foreground" />{t("hr.exp.mgr.dondeTitulo")}</p>
          <ul className="flex flex-col gap-2.5">
            {tiempo.map((x) => (
              <li key={x.app} className="grid grid-cols-[minmax(0,1fr)_4.5rem] items-center gap-x-4 gap-y-1 text-sm sm:grid-cols-[14rem_minmax(0,1fr)_4.5rem]">
                <span className="truncate">{x.app}</span>
                <span className="col-span-2 row-start-2 block h-1 w-full bg-foreground/[0.08] sm:col-span-1 sm:row-start-auto">
                  <span className="block h-full bg-foreground/60" style={{ width: `${Math.max(2, (x.min / maxMin) * 100)}%` }} />
                </span>
                <span className="row-start-1 text-right tabular-nums text-muted-foreground sm:row-start-auto">{t("argos.tiempo.aprox", { m: textoMin(x.min, t) })}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

// ─── Las fotos de Argos, por hora ────────────────────────────────────────────

interface Evidencia { id: string; createdAt: string; pantalla: CapturaDia | null; camara: CapturaDia | null; fueraDeLugar: boolean; veredicto: string | null }
const MAX_EVIDENCIAS = 6;

function camaraDe(pantalla: CapturaDia, camaras: CapturaDia[], usadas: Set<string>): CapturaDia | null {
  let best: CapturaDia | null = null, bestD = Infinity;
  for (const cam of camaras) {
    if (usadas.has(cam.id)) continue;
    const d = Math.abs(Date.parse(cam.createdAt) - Date.parse(pantalla.createdAt));
    if (d < bestD) { bestD = d; best = cam; }
  }
  if (best && bestD <= 90_000) { usadas.add(best.id); return best; }
  return null;
}

export function FotosDeArgos({ dia, jornada, clips }: { dia: DiaExpediente; jornada?: Jornada | null; clips?: ClipArgos[] | null }) {
  const { t, language } = useLanguage();
  // La muestra: primero lo fuera de lugar, luego lo que hacía (lo más reciente).
  const evid = useMemo(() => {
    const pantallas = dia.capturas.filter((c) => c.tipo === "pantalla").sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    const camaras = dia.capturas.filter((c) => c.tipo === "camara");
    const juzgadas = pantallas.filter((c) => c.veredicto);
    const fuera = juzgadas.filter((c) => c.fueraDeLugar === true && !c.perdonado);
    const usadas = new Set<string>();
    const tomar = (c: CapturaDia): Evidencia => ({ id: c.id, createdAt: c.createdAt, pantalla: c, camara: camaraDe(c, camaras, usadas), fueraDeLugar: c.fueraDeLugar === true && !c.perdonado, veredicto: c.veredicto });
    const out: Evidencia[] = fuera.map(tomar);
    for (const c of juzgadas) {
      if (out.length >= MAX_EVIDENCIAS) break;
      if (!out.some((e) => e.id === c.id)) out.push(tomar(c));
    }
    return out.sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
  }, [dia.capturas]);

  const grupos = useMemo(() => {
    const m = new Map<number, Evidencia[]>();
    for (const e of evid) { const k = Math.floor(Date.parse(e.createdAt) / HORA_MS) * HORA_MS; m.set(k, [...(m.get(k) ?? []), e]); }
    const enHora = (iso: string, k: number) => Math.floor(Date.parse(iso) / HORA_MS) * HORA_MS === k;
    return [...m.entries()].map(([desde, items]) => ({
      desde, items,
      h: jornada?.horas.find((x) => Math.floor(x.desde / HORA_MS) * HORA_MS === desde) ?? null,
      pantallazos: dia.capturas.filter((c) => c.tipo === "pantalla" && enHora(c.createdAt, desde)).length,
      grabaciones: (clips ?? []).filter((c) => enHora(c.desde, desde)).length,
    }));
  }, [evid, jornada, dia.capturas, clips]);

  // Firmar las URLs (buzón + NAS); si una falla, se vuelve a firmar una vez.
  const [urls, setUrls] = useState<Record<string, string>>({});
  const refirmados = useRef<Set<string>>(new Set());
  useEffect(() => {
    let vivo = true;
    const nas = new Set<string>(), buzon = new Set<string>();
    for (const e of evid) for (const c of [e.pantalla, e.camara]) {
      const k = claveFoto(c); if (!k) continue;
      if (c!.enNas) nas.add(k); else buzon.add(k);
    }
    void (async () => {
      const [nasUrls, buzonPairs] = await Promise.all([
        urlsDeNas([...nas]),
        Promise.all([...buzon].map(async (p) => [p, await urlCaptura(p)] as const)),
      ]);
      if (vivo) setUrls({ ...nasUrls, ...Object.fromEntries(buzonPairs.filter(([, u]) => !!u) as [string, string][]) });
    })();
    return () => { vivo = false; };
  }, [evid]);
  const reFirmar = async (c: CapturaDia | null) => {
    if (!c || c.enNas || refirmados.current.has(c.path)) return;
    refirmados.current.add(c.path);
    const u = await urlCaptura(c.path);
    if (u) setUrls((prev) => ({ ...prev, [c.path]: u }));
  };
  const urlDe = (c: CapturaDia | null) => (c ? urls[claveFoto(c)!] : undefined);
  const [visorIdx, setVisorIdx] = useState<number | null>(null);

  if (evid.length === 0) return null;
  return (
    <section className={cn("mt-5 p-5 sm:p-6", TARJETA)}>
      <p className="mb-5 flex items-center gap-2 text-sm font-semibold text-foreground/90">
        <Images className="h-4 w-4 text-muted-foreground" />{evid.some((e) => e.fueraDeLugar) ? t("hr.exp.mgr.pruebaFuera") : t("hr.exp.mgr.pruebaMuestra")}
      </p>
      <div className="flex flex-col gap-8">
        {grupos.map((g) => (
          <div key={g.desde}>
            <div className="mb-4 flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-border pb-2.5">
              <span className="text-sm font-semibold tabular-nums">{horaRedonda(g.desde, language)}</span>
              {g.h && g.h.productiva !== null && (
                <span className="text-sm tabular-nums">
                  <span className={cn("font-semibold", (g.h.pctBien ?? 0) < 0.6 && "text-destructive")}>{pct(g.h.pctBien)}</span>
                  <span className="text-muted-foreground"> · {g.h.productiva ? t("argos.hora.productiva") : t("argos.hora.noProductiva")}</span>
                </span>
              )}
              <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                {g.pantallazos === 1 ? t("argos.tira.pantallazo1") : t("argos.tira.pantallazos", { n: g.pantallazos })}
                {" · "}
                {g.grabaciones === 1 ? t("argos.tira.grabacion1") : t("argos.tira.grabaciones", { n: g.grabaciones })}
              </span>
            </div>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              {g.items.map((e) => {
                const up = urlDe(e.pantalla), uc = urlDe(e.camara);
                const hora = horaDe(e.createdAt, language);
                return (
                  <button key={e.id} type="button" onClick={() => setVisorIdx(evid.indexOf(e))} className="group text-left">
                    <span className={cn("relative block aspect-[16/10] w-full overflow-hidden rounded-control bg-black transition-colors", e.fueraDeLugar ? "border-2 border-destructive" : "border border-border group-hover:border-foreground/40")}>
                      {e.pantalla ? (up ? <img src={up} alt={hora} loading="lazy" onError={() => reFirmar(e.pantalla)} className="h-full w-full object-contain" />
                        : <span className="flex h-full w-full items-center justify-center"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></span>)
                        : <span className="flex h-full w-full flex-col items-center justify-center gap-1 text-white/60"><ScreenShareOff className="h-6 w-6" /><span className="text-xs">{t("hr.exp.sinPantalla")}</span></span>}
                      <span className="absolute bottom-2 right-2 h-14 w-20 overflow-hidden rounded-control border border-white/60">
                        {e.camara ? (uc ? <img src={uc} alt="" loading="lazy" onError={() => reFirmar(e.camara)} className="h-full w-full object-cover" /> : <span className="flex h-full w-full items-center justify-center bg-muted"><Loader2 className="h-3 w-3 animate-spin text-muted-foreground" /></span>)
                          : <span className="flex h-full w-full items-center justify-center bg-black/80 text-white/70"><CameraOff className="h-4 w-4" /></span>}
                      </span>
                    </span>
                    <span className="mt-2 block truncate text-sm tabular-nums text-muted-foreground">
                      {hora} · {e.fueraDeLugar ? t("argos.foto.flojo") : t("argos.foto.bien")} · {appDe(e.veredicto) ?? "—"}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <VisorEvidencia
        fotos={evid.map((e): FotoEvidencia => ({
          id: e.id, at: e.createdAt, pantallaUrl: urlDe(e.pantalla), camaraUrl: urlDe(e.camara),
          tienePantalla: !!e.pantalla, tieneCamara: !!e.camara, veredicto: e.veredicto, fueraDeLugar: e.fueraDeLugar,
        }))}
        indice={visorIdx} onIndice={setVisorIdx} onCerrar={() => setVisorIdx(null)} t={t} lang={language} />
    </section>
  );
}
