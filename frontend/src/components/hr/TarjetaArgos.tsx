import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { Bot, Monitor, CameraOff, ScreenShareOff, Loader2, Sparkles, X } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { a12 } from "@/lib/horaBogota";
import { urlCaptura, urlsDeNas } from "@/hooks/useMonitorEventos";
import type { CapturaDia, DiaExpediente } from "@/hooks/useExpedienteEmpleado";
import type { TranslationKey } from "@/lib/i18n";
import { TarjetaArgosClasica } from "@/components/hr/TarjetaArgosClasica";
import { disenoPulidoPrendido } from "@/lib/disenoDePrueba";
import { useEsDueno } from "@/hooks/useEsDueno";

// Argos como MANAGER del día, estilo FICHA CON EVIDENCIA (Alvaro, 09/11, v2).
// Antes era un párrafo rojo que DECÍA lo que encontró pero no dejaba verlo. Ahora
// es una ficha: veredicto corto arriba + las MINIATURAS de lo que Argos pilló, a
// la vista. Lo fuera de lugar resaltado; si todo bien, una muestra de lo que hacía.
// Cada foto se toca y se agranda (pantalla + cámara + lo que escribió Argos).
//
// PULIDO (Alvaro, 12/11/2026: «algo como lo que ya tengo pero más pulido»; «el
// titular de color destruye el diseño»). Misma ficha, mismo orden, misma
// cuadrícula de 3: el titular en blanco con un puntito de estado; las pastillas
// en UN solo estilo neutro (vidrio sutil, filo fino, el número en negrita; lo malo
// solo con un puntito); las fotos parejas (16:10, radio 12, filo de 1 px y sombra
// suave), la hora en una placa oscura con desenfoque y, debajo, la app en blanco y
// lo que hacía en gris (2 líneas). La foto fuera de lugar: solo un filo rojo fino y
// una placa oscura «Fuera de lugar». Sin bloques ni textos rojos.

type Tono = "verde" | "ambar" | "rojo" | "neutro";
type Frase = { k: TranslationKey; p?: Record<string, string | number> };
interface Evidencia { id: string; createdAt: string; pantalla: CapturaDia | null; camara: CapturaDia | null; fueraDeLugar: boolean; veredicto: string | null; }

const PUNTO: Record<Tono, string> = { verde: "bg-success", ambar: "bg-warning", rojo: "bg-destructive", neutro: "bg-muted-foreground" };

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

/** Las pastillas, todas iguales: vidrio sutil, filo fino, texto blanco. */
const PASTILLA = "inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-foreground/[0.04] px-3 py-1 text-xs text-foreground/90 backdrop-blur-sm";
/** Lo malo se marca solo con un puntito dentro de la pastilla. */
const PUNTITO: Record<"rojo" | "ambar", string> = { rojo: "bg-destructive", ambar: "bg-warning" };

/** «81 momentos mirados» → el 81 en negrita (el número es lo que se lee primero). */
function conNumero(texto: string, valores: Array<string | number> | undefined) {
  const n = (valores ?? []).map(String).find((v) => v && texto.includes(v));
  if (!n) return texto;
  const i = texto.indexOf(n);
  return <>{texto.slice(0, i)}<span className="font-semibold tabular-nums text-foreground">{n}</span>{texto.slice(i + n.length)}</>;
}

/** «Instagram Reels · Navegando en…» → la app y lo que hacía. */
function separar(veredicto: string | null): { app: string | null; que: string | null } {
  const v = (veredicto ?? "").trim();
  if (!v) return { app: null, que: null };
  const i = v.indexOf(" · ");
  return i < 0 ? { app: null, que: v } : { app: v.slice(0, i).trim() || null, que: v.slice(i + 3).trim() || null };
}

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

export function TarjetaArgosPulida({ nombre, dia, horario }: {
  nombre: string;
  dia: DiaExpediente;
  horario: { entrada: string | null; salida: string | null };
}) {
  const { t } = useLanguage();

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
    else if (difSal != null && difSal < -5) hechos.push({ k: "hr.exp.mgr.hecho.salioAntes", p: { min: Math.abs(difSal) }, tono: "ambar" });
    if (difEnt != null && difEnt > 5) hechos.push({ k: "hr.exp.mgr.hecho.entroTarde", p: { min: difEnt }, tono: "ambar" });
    if (fPant != null && fPant < 50) hechos.push({ k: "hr.exp.mgr.hecho.pantalla", p: { pct: Math.round(fPant) }, tono: "ambar" });
    if (fCam != null && fCam < 50) hechos.push({ k: "hr.exp.mgr.hecho.camara", p: { pct: Math.round(fCam) }, tono: "ambar" });

    return { nom, tono, titular, hechos, sistemas, evid, hayFuera: fuera.length > 0, hayJuicio: juzgadas.length > 0 };
  }, [nombre, dia, horario]);

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

  const [visor, setVisor] = useState<Evidencia | null>(null);
  useEffect(() => {
    if (!visor) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") setVisor(null); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [visor]);

  const miniPantalla = (e: Evidencia) => (e.pantalla ? urls[claveFoto(e.pantalla)!] : undefined);
  const miniCamara = (e: Evidencia) => (e.camara ? urls[claveFoto(e.camara)!] : undefined);

  return (
    <section className="vidrio sube mt-4 p-5 lg:p-6">
      <div className="v-cont">
        <div className="mb-4 flex items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-full border border-border/70 bg-foreground/[0.04] text-foreground/80"><Bot className="h-4 w-4" /></span>
          <p className="text-xs font-medium text-muted-foreground">{t("hr.exp.mgr.titulo")}</p>
        </div>

        {/* Veredicto corto: el titular en blanco, con un puntito de estado. */}
        <p className="flex items-center gap-2.5 font-display text-lg font-semibold leading-tight text-foreground">
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${PUNTO[r.tono]}`} aria-hidden />
          {t(r.titular.k, r.titular.p)}
        </p>
        {r.hechos.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {r.hechos.map((h, i) => (
              <span key={i} className={PASTILLA}>
                {h.tono !== "neutro" && <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${PUNTITO[h.tono]}`} aria-hidden />}
                <span>{conNumero(t(h.k, h.p), h.p ? Object.values(h.p) : undefined)}</span>
              </span>
            ))}
          </div>
        )}

        {/* La evidencia a la vista: miniaturas de lo que Argos vio. */}
        {r.evid.length > 0 && (
          <div className="mt-6">
            <p className="mb-3 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5" />{r.hayFuera ? t("hr.exp.mgr.pruebaFuera") : t("hr.exp.mgr.pruebaMuestra")}
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
              {r.evid.map((e) => {
                const up = miniPantalla(e), uc = miniCamara(e);
                const hora = a12(format(new Date(e.createdAt), "HH:mm"));
                const { app, que } = separar(e.veredicto);
                return (
                  <button key={e.id} type="button" onClick={() => setVisor(e)}
                    className={`group flex h-full flex-col overflow-hidden rounded-[12px] border bg-card/50 text-left shadow-[0_1px_2px_rgba(0,0,0,0.10),0_10px_24px_-14px_rgba(0,0,0,0.45)] transition-colors ${e.fueraDeLugar ? "border-destructive/70" : "border-border/60 hover:border-foreground/25"}`}>
                    <div className="relative aspect-[16/10] w-full shrink-0 bg-muted/40">
                      {e.pantalla ? (up ? (
                        <img src={up} alt={hora} loading="lazy" onError={() => reFirmar(e.pantalla)} className="h-full w-full object-cover" />
                      ) : <div className="flex h-full w-full items-center justify-center"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
                      ) : <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-muted-foreground"><ScreenShareOff className="h-5 w-5 opacity-60" /><span className="text-[10px]">{t("hr.exp.sinPantalla")}</span></div>}
                      <div className="absolute bottom-2 right-2 h-9 w-14 overflow-hidden rounded-[6px] border border-white/40 shadow-md sm:h-10 sm:w-16">
                        {e.camara ? (uc ? <img src={uc} alt="" loading="lazy" onError={() => reFirmar(e.camara)} className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center bg-muted/60"><Loader2 className="h-3 w-3 animate-spin text-muted-foreground" /></div>)
                          : <div className="flex h-full w-full items-center justify-center bg-black/70 text-white/80"><CameraOff className="h-3.5 w-3.5" /></div>}
                      </div>
                      <span className="absolute bottom-2 left-2 rounded-full bg-black/45 px-2 py-0.5 text-[10px] font-medium tabular-nums text-white/95 ring-1 ring-white/10 backdrop-blur-md">{hora}</span>
                      {e.fueraDeLugar && (
                        <span className="absolute left-2 top-2 inline-flex items-center gap-1.5 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-medium text-white ring-1 ring-white/15 backdrop-blur-md">
                          <span className="h-1.5 w-1.5 rounded-full bg-destructive" aria-hidden />{t("hr.exp.fueraDeLugar")}
                        </span>
                      )}
                    </div>
                    {(app || que) && (
                      <div className="flex flex-1 flex-col gap-0.5 px-3 pb-3 pt-2.5">
                        {app ? (
                          <Fragment>
                            <p className="truncate text-[13px] font-semibold leading-snug text-foreground">{app}</p>
                            {que && <p className="line-clamp-2 text-xs leading-snug text-muted-foreground">{que}</p>}
                          </Fragment>
                        ) : (
                          <p className="line-clamp-2 text-xs leading-snug text-muted-foreground">{que}</p>
                        )}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Dónde pasó el tiempo: las mismas pastillas neutras. */}
        {r.sistemas.length > 0 && (
          <div className="mt-6">
            <p className="mb-2.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Monitor className="h-3.5 w-3.5" />{t("hr.exp.mgr.dondeTitulo")}
            </p>
            <div className="flex flex-wrap gap-2">
              {r.sistemas.map(([sistema, n]) => (
                <span key={sistema} className={PASTILLA}>
                  <span className="max-w-[180px] truncate">{sistema}</span>
                  <span className="font-semibold tabular-nums text-foreground">{n}</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Visor: la prueba en grande al tocar una miniatura. */}
      {visor && (
        <Dialog open onOpenChange={(o) => { if (!o) setVisor(null); }}>
          <DialogContent className="max-w-3xl bg-none from-transparent p-2 sm:p-3">
            <DialogTitle className="sr-only">{t("hr.exp.mgr.titulo")}</DialogTitle>
            <div className="flex flex-col gap-2.5">
              <div className={`relative overflow-hidden rounded-[12px] border bg-black ${visor.fueraDeLugar ? "border-destructive/70" : "border-border/50"}`}>
                <div className="relative aspect-[16/10] w-full">
                  {visor.pantalla && miniPantalla(visor) ? <img src={miniPantalla(visor)} alt="" className="h-full w-full object-contain" />
                    : <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-muted-foreground"><ScreenShareOff className="h-9 w-9 opacity-60" /><span className="text-xs font-semibold">{t("hr.exp.sinPantalla")}</span></div>}
                  <div className="absolute bottom-2.5 right-2.5 w-[32%] max-w-[220px] overflow-hidden rounded-[8px] border border-white/50 shadow-xl">
                    <div className="relative aspect-[4/3] bg-black">
                      {visor.camara && miniCamara(visor) ? <img src={miniCamara(visor)} alt="" className="h-full w-full object-cover" />
                        : <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-white/80"><CameraOff className="h-5 w-5" /><span className="text-[9px] font-semibold">{t("hr.exp.camaraApagada")}</span></div>}
                    </div>
                  </div>
                  <span className="absolute left-2.5 top-2.5 rounded-full bg-black/50 px-2.5 py-1 text-xs font-medium tabular-nums text-white ring-1 ring-white/10 backdrop-blur-md">{a12(format(new Date(visor.createdAt), "HH:mm"))}</span>
                  {visor.fueraDeLugar && (
                    <span className="absolute left-2.5 top-10 inline-flex items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-medium text-white ring-1 ring-white/15 backdrop-blur-md">
                      <span className="h-1.5 w-1.5 rounded-full bg-destructive" aria-hidden />{t("hr.exp.fueraDeLugar")}
                    </span>
                  )}
                </div>
              </div>
              {visor.veredicto && (
                <div className="flex items-start gap-2 rounded-[12px] border border-border/50 bg-card/50 px-3 py-2.5 text-sm text-foreground/85">
                  <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" /><span>{visor.veredicto}</span>
                </div>
              )}
              <button type="button" onClick={() => setVisor(null)} className="flex items-center justify-center gap-1.5 rounded-[12px] border border-border/50 bg-card/50 py-2 text-sm font-medium text-muted-foreground transition hover:text-foreground">
                <X className="h-4 w-4" />{t("hr.exp.clips.cerrar")}
              </button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </section>
  );
}


/** La tarjeta del Expediente. El diseño pulido sale solo para el dueño que lo
 *  prendió con su link (`?diseno=pulido`); todos los demás ven el de siempre. */
export function TarjetaArgos(props: Parameters<typeof TarjetaArgosPulida>[0]) {
  const { esDueno } = useEsDueno();
  if (esDueno === true && disenoPulidoPrendido()) return <TarjetaArgosPulida {...props} />;
  return <TarjetaArgosClasica {...props} />;
}
