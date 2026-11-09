import { useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { Bot, Monitor, AlertTriangle, CameraOff, ScreenShareOff, Loader2, Sparkles, X } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { a12 } from "@/lib/horaBogota";
import { urlCaptura, urlsDeNas } from "@/hooks/useMonitorEventos";
import type { CapturaDia, DiaExpediente } from "@/hooks/useExpedienteEmpleado";
import type { TranslationKey } from "@/lib/i18n";

// Argos como MANAGER del día, estilo FICHA CON EVIDENCIA (Alvaro, 09/11, v2).
// Antes era un párrafo rojo que DECÍA lo que encontró pero no dejaba verlo. Ahora
// es una ficha: veredicto corto arriba + las MINIATURAS de lo que Argos pilló, a
// la vista. Lo fuera de lugar resaltado; si todo bien, una muestra de lo que hacía.
// Cada foto se toca y se agranda (pantalla + cámara + lo que escribió Argos).

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

export function TarjetaArgos({ nombre, dia, horario }: {
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

    const titular: Frase = banda === "bien" ? { k: "hr.exp.mgr.bien", p: { n: nom } }
      : banda === "ojo" ? { k: "hr.exp.mgr.ojo", p: { n: nom } }
      : banda === "mal" ? { k: "hr.exp.mgr.mal", p: { n: nom } }
      : { k: "hr.exp.mgr.sindatos", p: { n: nom } };
    const tono: Tono = banda === "bien" ? "verde" : banda === "ojo" ? "ambar" : banda === "mal" ? "rojo" : "neutro";

    // Hechos cortos (reemplazan el párrafo): cada uno con su color semántico.
    const hechos: Array<{ k: TranslationKey; p?: Record<string, string | number>; tono: "neutro" | "rojo" | "ambar" }> = [];
    if (juzgadas.length > 0) hechos.push({ k: "hr.exp.mgr.hecho.momentos", p: { n: juzgadas.length }, tono: "neutro" });
    if (fuera.length > 0) hechos.push({ k: "hr.exp.mgr.hecho.fuera", p: { n: fuera.length }, tono: "rojo" });
    if (difSal != null && difSal < -5) hechos.push({ k: "hr.exp.mgr.hecho.salioAntes", p: { min: Math.abs(difSal) }, tono: "ambar" });
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
        {r.hechos.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {r.hechos.map((h, i) => (
              <span key={i} className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
                h.tono === "rojo" ? "border-destructive/40 bg-destructive/5 text-destructive"
                : h.tono === "ambar" ? "border-warning/40 bg-warning/5 text-warning"
                : "border-border/50 bg-card/40 text-foreground/80"}`}>
                {t(h.k, h.p)}
              </span>
            ))}
          </div>
        )}

        {/* La evidencia a la vista: miniaturas de lo que Argos vio. */}
        {r.evid.length > 0 && (
          <div className="mt-3.5">
            <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
              <Sparkles className="h-3 w-3 text-primary" />{r.hayFuera ? t("hr.exp.mgr.pruebaFuera") : t("hr.exp.mgr.pruebaMuestra")}
            </p>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              {r.evid.map((e) => {
                const up = miniPantalla(e), uc = miniCamara(e);
                const hora = a12(format(new Date(e.createdAt), "HH:mm"));
                return (
                  <button key={e.id} type="button" onClick={() => setVisor(e)}
                    className={`group overflow-hidden rounded-xl border text-left transition ${e.fueraDeLugar ? "border-destructive/60 ring-1 ring-destructive/30" : "border-border/40 hover:border-primary/50"}`}>
                    <div className="relative aspect-[16/10] w-full bg-muted/40">
                      {e.pantalla ? (up ? (
                        <img src={up} alt={hora} loading="lazy" onError={() => reFirmar(e.pantalla)} className="h-full w-full object-cover" />
                      ) : <div className="flex h-full w-full items-center justify-center"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
                      ) : <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-muted-foreground"><ScreenShareOff className="h-5 w-5 opacity-60" /><span className="text-[9px]">{t("hr.exp.sinPantalla")}</span></div>}
                      <div className="absolute bottom-1 right-1 h-9 w-14 overflow-hidden rounded-md border-2 border-background/80 shadow">
                        {e.camara ? (uc ? <img src={uc} alt="" loading="lazy" onError={() => reFirmar(e.camara)} className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center bg-muted/60"><Loader2 className="h-3 w-3 animate-spin text-muted-foreground" /></div>)
                          : <div className="flex h-full w-full items-center justify-center bg-destructive/15 text-destructive"><CameraOff className="h-3.5 w-3.5" /></div>}
                      </div>
                      <span className="absolute bottom-1 left-1 rounded bg-black/55 px-1 py-0.5 text-[9px] font-semibold tabular-nums text-white backdrop-blur-sm">{hora}</span>
                      {e.fueraDeLugar && <span className="absolute left-1 top-1 inline-flex items-center gap-0.5 rounded bg-destructive px-1 py-0.5 text-[9px] font-semibold text-white"><AlertTriangle className="h-2.5 w-2.5" />{t("hr.exp.fueraDeLugar")}</span>}
                    </div>
                    {e.veredicto && <p className={`px-2 py-1.5 text-[11px] leading-snug ${e.fueraDeLugar ? "text-destructive" : "text-muted-foreground"}`}>{e.veredicto}</p>}
                  </button>
                );
              })}
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
                <span key={sistema} className="inline-flex items-center gap-1.5 rounded-full border border-border/50 bg-card/40 px-2.5 py-1 text-xs">
                  <span className="max-w-[180px] truncate">{sistema}</span>
                  <span className="rounded-full bg-primary/15 px-1.5 text-[10px] font-semibold tabular-nums text-primary">{n}</span>
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
              <div className="relative overflow-hidden rounded-xl border border-border/50 bg-black">
                <div className="relative aspect-[16/10] w-full">
                  {visor.pantalla && miniPantalla(visor) ? <img src={miniPantalla(visor)} alt="" className="h-full w-full object-contain" />
                    : <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-muted-foreground"><ScreenShareOff className="h-9 w-9 opacity-60" /><span className="text-xs font-semibold">{t("hr.exp.sinPantalla")}</span></div>}
                  <div className="absolute bottom-2.5 right-2.5 w-[32%] max-w-[220px] overflow-hidden rounded-lg border-2 border-white/80 shadow-xl">
                    <div className="relative aspect-[4/3] bg-black">
                      {visor.camara && miniCamara(visor) ? <img src={miniCamara(visor)} alt="" className="h-full w-full object-cover" />
                        : <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-destructive"><CameraOff className="h-5 w-5" /><span className="text-[9px] font-semibold">{t("hr.exp.camaraApagada")}</span></div>}
                    </div>
                  </div>
                  <span className="absolute left-2.5 top-2.5 rounded-lg bg-black/60 px-2.5 py-1.5 text-xs font-semibold tabular-nums text-white backdrop-blur-sm">{a12(format(new Date(visor.createdAt), "HH:mm"))}</span>
                  {visor.fueraDeLugar && <span className="absolute left-2.5 top-11 inline-flex items-center gap-1 rounded-lg bg-destructive px-2 py-1 text-[11px] font-semibold text-white"><AlertTriangle className="h-3 w-3" />{t("hr.exp.fueraDeLugar")}</span>}
                </div>
              </div>
              {visor.veredicto && (
                <div className={`flex items-start gap-2 rounded-lg border border-border/40 bg-card/40 px-3 py-2 text-sm ${visor.fueraDeLugar ? "text-destructive" : "text-muted-foreground"}`}>
                  <Sparkles className="mt-0.5 h-4 w-4 shrink-0 opacity-70" /><span>{visor.veredicto}</span>
                </div>
              )}
              <button type="button" onClick={() => setVisor(null)} className="flex items-center justify-center gap-1.5 rounded-lg border border-border/50 bg-card/40 py-2 text-sm font-medium text-muted-foreground transition hover:text-foreground">
                <X className="h-4 w-4" />{t("hr.exp.clips.cerrar")}
              </button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </section>
  );
}
