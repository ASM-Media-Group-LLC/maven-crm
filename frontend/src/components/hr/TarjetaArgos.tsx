import { useEffect, useMemo, useRef, useState } from "react";
import { Bot, Monitor, CameraOff, ScreenShareOff, Loader2, Sparkles } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { urlCaptura, urlsDeNas } from "@/hooks/useMonitorEventos";
import type { CapturaDia, DiaExpediente } from "@/hooks/useExpedienteEmpleado";
import type { TranslationKey } from "@/lib/i18n";
import { razonesDelDia, type Jornada, type Razon } from "@/lib/argosJornada";
import { hora as horaDe, horaRedonda, pct, textoMin } from "@/components/argos/piezas";
import { VisorEvidencia, type FotoEvidencia } from "@/components/argos/VisorEvidencia";
import { separarPantalla } from "@/hooks/useDondeEsta";
import type { ClipArgos } from "@/lib/argosMomentos";

// Argos como MANAGER del día, estilo FICHA CON EVIDENCIA (Alvaro, 09/11, v2).
// Antes era un párrafo rojo que DECÍA lo que encontró pero no dejaba verlo. Ahora
// es una ficha: veredicto corto arriba + las MINIATURAS de lo que Argos pilló, a
// la vista. Lo fuera de lugar resaltado; si todo bien, una muestra de lo que hacía.
// Cada foto se toca y se agranda (pantalla + cámara + lo que escribió Argos).
//
// 11/11 (Alvaro: «Isabel tiene un día flojo no dice POR QUÉ»): debajo del
// titular va el porqué EN MINUTOS, sacado del turno minuto a minuto (se fue
// antes, fuera de Cowork, sin pantalla, sin cámara…), de lo más grande a lo más
// chico. Los hechos van en texto simple, sin pastillas ni ⚠.
//
// Las FOTOS (Alvaro, 11/11: «ahí se mira algo, quiero verlo mejor»): por hora,
// cada hora con su % · productiva sí/no · cuántos pantallazos y grabaciones; dos
// por fila en la compu y una en el teléfono, la pantalla ENTERA (sin recortar);
// debajo UNA línea: la hora · Bien / Flojo · qué hacía en pocas palabras. Las
// flojas llevan marco rojo y el cartel «Flojo». La descripción completa, la cámara
// y el zoom van en el visor.

const HORA_MS = 3_600_000;
/** Las primeras palabras de lo que hacía (la app, si Argos la dijo). */
function enPocasPalabras(veredicto: string | null, max = 6): string {
  const { app, que } = separarPantalla(veredicto);
  const base = app ?? que ?? "";
  const palabras = base.split(/\s+/).filter(Boolean);
  return palabras.length > max ? `${palabras.slice(0, max).join(" ")}…` : base;
}

const RAZON: Partial<Record<Razon["estado"], TranslationKey>> = {
  se_fue: "argos.razon.se_fue",
  no_entro: "argos.razon.no_entro",
  fuera_cowork: "argos.razon.fuera_cowork",
  sin_pantalla: "argos.razon.sin_pantalla",
  sin_camara: "argos.razon.sin_camara",
  fuera_de_camara: "argos.razon.fuera_de_camara",
  distraido: "argos.razon.distraido",
  pausa_de_mas: "argos.razon.pausa_de_mas",
};

type Tono = "verde" | "ambar" | "rojo" | "neutro";
type Frase = { k: TranslationKey; p?: Record<string, string | number> };
interface Evidencia { id: string; createdAt: string; pantalla: CapturaDia | null; camara: CapturaDia | null; fueraDeLugar: boolean; veredicto: string | null; }

const PUNTO: Record<Tono, string> = { verde: "bg-success", ambar: "bg-warning", rojo: "bg-destructive", neutro: "bg-muted-foreground" };
const TITULAR: Record<Tono, string> = { verde: "text-success", ambar: "text-warning", rojo: "text-destructive", neutro: "text-foreground" };

function sistemasDe(veredicto: string): string[] {
  return veredicto.split("·")[0].trim().split("/").map((s) => s.trim()).filter((s) => s.length > 1);
}
function hhmm(iso: string | null | undefined): string | null {
  if (!iso) return null;
  try { return new Date(iso).toLocaleTimeString("es-CO", { timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit", hour12: false }); }
  catch { return null; }
}
function minDif(hAsig: string | null, hReal: string | null): number | null {
  if (!hAsig || !hReal) return null;
  const [ha, ma] = hAsig.split(":").map(Number);
  const [hr, mr] = hReal.split(":").map(Number);
  if (Number.isNaN(ha) || Number.isNaN(hr)) return null;
  return (hr * 60 + mr) - (ha * 60 + ma);
}
const claveFoto = (c: CapturaDia | null): string | null => (c ? (c.enNas ? c.nasPath : c.path) : null);

// Empareja cada pantalla con la cámara más cercana en el tiempo (≤ 90 s).
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

const MAX_EVIDENCIAS = 6;

export function TarjetaArgos({ nombre, dia, horario, jornada, clips }: {
  nombre: string;
  dia: DiaExpediente;
  horario: { entrada: string | null; salida: string | null };
  /** El turno minuto a minuto: de aquí sale el porqué en minutos. */
  jornada?: Jornada | null;
  /** Las grabaciones del día (para contar cuántas hubo en cada hora). */
  clips?: ClipArgos[] | null;
}) {
  const { t, language } = useLanguage();
  const razones = jornada ? razonesDelDia(jornada) : [];
  const veces = (n: number) => (n === 0 ? t("argos.veces.cortas") : n === 1 ? t("argos.veces.una") : t("argos.veces.n", { n }));
  const frase = (r: Razon) => {
    const k = r.estado === "no_entro" && jornada?.sinSenal ? "argos.razon.noVino" : RAZON[r.estado] ?? "argos.razon.fuera_cowork";
    return t(k, { m: textoMin(r.min, t), v: veces(r.veces), h: horaDe(r.estado === "no_entro" ? jornada?.entro : jornada?.salio, language) });
  };

  const r = useMemo(() => {
    const nom = nombre.split(" ")[0] || nombre;
    const banda = dia.nota.banda;
    const pantallas = dia.capturas.filter((c) => c.tipo === "pantalla").sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    const camaras = dia.capturas.filter((c) => c.tipo === "camara").sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    const juzgadas = pantallas.filter((c) => c.veredicto);
    const fuera = juzgadas.filter((c) => c.fueraDeLugar === true && !c.perdonado);

    // Evidencia: primero lo fuera de lugar, luego una muestra de lo que hacía.
    const usadas = new Set<string>();
    const tomar = (c: CapturaDia): Evidencia => ({
      id: c.id, createdAt: c.createdAt, pantalla: c, camara: camaraDe(c, camaras, usadas),
      fueraDeLugar: c.fueraDeLugar === true && !c.perdonado, veredicto: c.veredicto,
    });
    const evid: Evidencia[] = [...fuera.map(tomar)];
    for (const c of juzgadas) {
      if (evid.length >= MAX_EVIDENCIAS) break;
      if (evid.some((e) => e.id === c.id)) continue;
      evid.push(tomar(c));
    }

    const conteo = new Map<string, number>();
    for (const c of juzgadas) for (const s of sistemasDe(c.veredicto!)) conteo.set(s, (conteo.get(s) ?? 0) + 1);
    const sistemas = [...conteo.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);

    const fCam = dia.nota.factores.find((f) => f.clave === "camara")?.sub ?? null;
    const fPant = dia.nota.factores.find((f) => f.clave === "pantalla")?.sub ?? null;
    const difEnt = minDif(horario.entrada, hhmm(dia.entroAt));
    const difSal = minDif(horario.salida, hhmm(dia.salioAt));
    // ¿Sigue EN SALA ahora? (hoy + última captura fresca). Si es así, NO "salió":
    // el cálculo de salida puede confundir un break o un latido con una salida.
    const hoyB = new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
    const ultCap = dia.capturas.reduce((mx, c) => (c.createdAt > mx ? c.createdAt : mx), "");
    const enSala = dia.fecha === hoyB && !!ultCap && Date.now() - Date.parse(ultCap) < 5 * 60_000;

    const titular: Frase = banda === "bien" ? { k: "hr.exp.mgr.bien", p: { n: nom } }
      : banda === "ojo" ? { k: "hr.exp.mgr.ojo", p: { n: nom } }
      : banda === "mal" ? { k: "hr.exp.mgr.mal", p: { n: nom } }
      : { k: "hr.exp.mgr.sindatos", p: { n: nom } };
    const tono: Tono = banda === "bien" ? "verde" : banda === "ojo" ? "ambar" : banda === "mal" ? "rojo" : "neutro";

    // Hechos cortos (reemplazan el párrafo): cada uno con su color semántico.
    const hechos: Array<{ k: TranslationKey; p?: Record<string, string | number>; tono: "neutro" | "rojo" | "ambar" }> = [];
    if (juzgadas.length > 0) hechos.push({ k: "hr.exp.mgr.hecho.momentos", p: { n: juzgadas.length }, tono: "neutro" });
    if (fuera.length > 0) hechos.push({ k: "hr.exp.mgr.hecho.fuera", p: { n: fuera.length }, tono: "rojo" });
    if (enSala) hechos.push({ k: "hr.exp.mgr.hecho.enSala", tono: "neutro" });
    else if (!jornada && difSal != null && difSal < -5) hechos.push({ k: "hr.exp.mgr.hecho.salioAntes", p: { min: Math.abs(difSal) }, tono: "ambar" });
    if (!jornada && difEnt != null && difEnt > 5) hechos.push({ k: "hr.exp.mgr.hecho.entroTarde", p: { min: difEnt }, tono: "ambar" });
    if (!jornada && fPant != null && fPant < 50) hechos.push({ k: "hr.exp.mgr.hecho.pantalla", p: { pct: Math.round(fPant) }, tono: "ambar" });
    if (!jornada && fCam != null && fCam < 50) hechos.push({ k: "hr.exp.mgr.hecho.camara", p: { pct: Math.round(fCam) }, tono: "ambar" });

    return { nom, tono, titular, hechos, sistemas, evid, hayFuera: fuera.length > 0, hayJuicio: juzgadas.length > 0 };
  }, [nombre, dia, horario, jornada]);

  // Firmar las URLs de las miniaturas de evidencia (buzón + NAS).
  const [urls, setUrls] = useState<Record<string, string>>({});
  const refirmados = useRef<Set<string>>(new Set());
  useEffect(() => {
    let vivo = true;
    const nas = new Set<string>(), buzon = new Set<string>();
    for (const e of r.evid) for (const c of [e.pantalla, e.camara]) {
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
  }, [r.evid]);
  const reFirmar = async (c: CapturaDia | null) => {
    if (!c || c.enNas || refirmados.current.has(c.path)) return;
    refirmados.current.add(c.path);
    const u = await urlCaptura(c.path);
    if (u) setUrls((prev) => ({ ...prev, [c.path]: u }));
  };

  // Las fotos en orden de hora, agrupadas por hora (el visor pasa de una a otra).
  const ordenadas = useMemo(() => [...r.evid].sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1)), [r.evid]);
  const grupos = useMemo(() => {
    const m = new Map<number, Evidencia[]>();
    for (const e of ordenadas) {
      const k = Math.floor(Date.parse(e.createdAt) / HORA_MS) * HORA_MS;
      m.set(k, [...(m.get(k) ?? []), e]);
    }
    return [...m.entries()].map(([desde, items]) => ({
      desde,
      items,
      h: jornada?.horas.find((x) => Math.floor(x.desde / HORA_MS) * HORA_MS === desde) ?? null,
      pantallazos: dia.capturas.filter((c) => c.tipo === "pantalla" && Math.floor(Date.parse(c.createdAt) / HORA_MS) * HORA_MS === desde).length,
      grabaciones: (clips ?? []).filter((c) => Math.floor(Date.parse(c.desde) / HORA_MS) * HORA_MS === desde).length,
    }));
  }, [ordenadas, jornada, dia.capturas, clips]);
  const [visorIdx, setVisorIdx] = useState<number | null>(null);

  const miniPantalla = (e: Evidencia) => (e.pantalla ? urls[claveFoto(e.pantalla)!] : undefined);
  const miniCamara = (e: Evidencia) => (e.camara ? urls[claveFoto(e.camara)!] : undefined);

  return (
    <section className="vidrio sube mt-4 p-4 lg:p-5">
      <div className="v-cont">
        <div className="mb-3 flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/15 text-primary"><Bot className="h-4 w-4" /></span>
          <p className="text-xs font-semibold text-muted-foreground">{t("hr.exp.mgr.titulo")}</p>
        </div>

        {/* Veredicto corto: titular + hechos en chips (sin párrafo ni caja de color). */}
        <p className={`flex items-center gap-2 font-display text-base font-bold ${TITULAR[r.tono]}`}>
          <span className={`h-2 w-2 shrink-0 rounded-full ${PUNTO[r.tono]}`} />
          {t(r.titular.k, r.titular.p)}
        </p>
        {razones.length > 0 && (
          <div className="mt-2.5">
            <p className="mb-1 text-[11px] font-semibold text-muted-foreground">{t("argos.dia.porQue")}</p>
            <ul className="space-y-1">
              {razones.map((x) => (
                <li key={x.estado} className="flex gap-2.5 text-sm">
                  <span className="w-[4.75rem] shrink-0 text-right font-semibold tabular-nums">{textoMin(x.min, t)}</span>
                  <span className="min-w-0 text-foreground/80">{frase(x)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {r.hechos.length > 0 && (
          <p className="mt-2 text-xs text-muted-foreground">
            {r.hechos.map((h, i) => (
              <span key={i} className={h.tono === "rojo" ? "font-semibold text-destructive" : h.tono === "ambar" ? "font-medium text-warning" : undefined}>
                {i > 0 && <span className="text-muted-foreground"> · </span>}{t(h.k, h.p)}
              </span>
            ))}
          </p>
        )}

        {/* Las fotos de Argos, por hora: grandes, una línea clara y las flojas a la vista. */}
        {grupos.length > 0 && (
          <div className="mt-4">
            <p className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
              <Sparkles className="h-3 w-3 text-primary" />{r.hayFuera ? t("hr.exp.mgr.pruebaFuera") : t("hr.exp.mgr.pruebaMuestra")}
            </p>
            <div className="flex flex-col gap-6">
              {grupos.map((g) => (
                <div key={g.desde}>
                  <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-border/50 pb-2">
                    <span className="text-sm font-semibold tabular-nums">{horaRedonda(g.desde, language)}</span>
                    {g.h && g.h.productiva !== null && (
                      <>
                        <span className="text-sm font-semibold tabular-nums">{pct(g.h.pctBien)}</span>
                        <span className={`text-xs ${g.h.productiva ? "font-medium text-success" : "text-muted-foreground"}`}>
                          {g.h.productiva ? t("argos.hora.productiva") : t("argos.hora.noProductiva")}
                        </span>
                      </>
                    )}
                    <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                      {g.pantallazos === 1 ? t("argos.tira.pantallazo1") : t("argos.tira.pantallazos", { n: g.pantallazos })}
                      {" · "}
                      {g.grabaciones === 1 ? t("argos.tira.grabacion1") : t("argos.tira.grabaciones", { n: g.grabaciones })}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {g.items.map((e) => {
                      const up = miniPantalla(e), uc = miniCamara(e);
                      const hora = horaDe(e.createdAt, language);
                      return (
                        <button key={e.id} type="button" onClick={() => setVisorIdx(ordenadas.indexOf(e))}
                          className={`group overflow-hidden rounded-panel border-2 bg-card/40 text-left transition ${e.fueraDeLugar ? "border-destructive" : "border-border/60 hover:border-primary/60"}`}>
                          <div className="relative aspect-[16/10] w-full bg-black">
                            {e.pantalla ? (up ? (
                              <img src={up} alt={hora} loading="lazy" onError={() => reFirmar(e.pantalla)} className="h-full w-full object-contain" />
                            ) : <div className="flex h-full w-full items-center justify-center"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
                            ) : <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-white/60"><ScreenShareOff className="h-6 w-6" /><span className="text-xs">{t("hr.exp.sinPantalla")}</span></div>}
                            <div className="absolute bottom-2 right-2 h-14 w-20 overflow-hidden rounded-control border border-white/70 shadow-lg">
                              {e.camara ? (uc ? <img src={uc} alt="" loading="lazy" onError={() => reFirmar(e.camara)} className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center bg-muted/60"><Loader2 className="h-3 w-3 animate-spin text-muted-foreground" /></div>)
                                : <div className="flex h-full w-full items-center justify-center bg-destructive/20 text-destructive"><CameraOff className="h-4 w-4" /></div>}
                            </div>
                            {e.fueraDeLugar && (
                              <span className="absolute left-0 top-0 rounded-br-control bg-destructive px-2.5 py-1 text-xs font-bold text-destructive-foreground">{t("argos.foto.flojo")}</span>
                            )}
                          </div>
                          <p className="flex min-w-0 items-baseline gap-1.5 px-3 py-2 text-sm">
                            <span className="shrink-0 font-semibold tabular-nums">{hora}</span>
                            <span className="text-muted-foreground">·</span>
                            <span className={`shrink-0 font-semibold ${e.fueraDeLugar ? "text-destructive" : "text-success"}`}>{e.fueraDeLugar ? t("argos.foto.flojo") : t("argos.foto.bien")}</span>
                            <span className="text-muted-foreground">·</span>
                            <span className="min-w-0 truncate text-foreground/80">{enPocasPalabras(e.veredicto)}</span>
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Dónde pasó el tiempo. */}
        {r.sistemas.length > 0 && (
          <div className="mt-3.5">
            <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
              <Monitor className="h-3 w-3" />{t("hr.exp.mgr.dondeTitulo")}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {r.sistemas.map(([sistema, n]) => (
                <span key={sistema} className="inline-flex items-center gap-1.5 rounded-control border border-border/60 bg-card/50 px-2.5 py-1 text-xs">
                  <span className="max-w-[180px] truncate">{sistema}</span>
                  <span className="text-[11px] font-semibold tabular-nums text-muted-foreground">{n}</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Visor grande: pantalla entera con zoom, la cámara al lado, lo que dijo Argos y anterior / siguiente. */}
      <VisorEvidencia
        fotos={ordenadas.map((e): FotoEvidencia => ({
          id: e.id, at: e.createdAt, pantallaUrl: miniPantalla(e), camaraUrl: miniCamara(e),
          tienePantalla: !!e.pantalla, tieneCamara: !!e.camara, veredicto: e.veredicto, fueraDeLugar: e.fueraDeLugar,
        }))}
        indice={visorIdx} onIndice={setVisorIdx} onCerrar={() => setVisorIdx(null)} t={t} lang={language} />
    </section>
  );
}
