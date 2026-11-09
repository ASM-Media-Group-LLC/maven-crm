import { useMemo } from "react";
import { format } from "date-fns";
import { Bot, Monitor, AlertTriangle, ArrowRight } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { a12 } from "@/lib/horaBogota";
import type { DiaExpediente } from "@/hooks/useExpedienteEmpleado";
import type { TranslationKey } from "@/lib/i18n";

// La tarjeta de Argos como MANAGER del día (Alvaro, 09/11). Lo PRIMERO del
// expediente: en vez de barras de pantalla/cámara, Argos "habla" — juzga el día
// con criterio en un par de frases (lo bueno, lo que ojo, qué vigilar), dice en
// qué sistemas pasó el tiempo y nombra lo que pilló fuera de lugar. Se arma con
// reglas en el momento (sin gastar IA): la lectura por pantallazo ya la hizo
// Gemini; aquí solo se resume con cabeza de gerente.

interface Atencion { pct: number; ok: number; n: number }
type Tono = "verde" | "ambar" | "rojo" | "neutro";
type Frase = { k: TranslationKey; p?: Record<string, string | number> };

const CLASES: Record<Tono, { caja: string; punto: string; titular: string }> = {
  verde: { caja: "border-success/30 bg-success/5", punto: "bg-success", titular: "text-success" },
  ambar: { caja: "border-warning/30 bg-warning/5", punto: "bg-warning", titular: "text-warning" },
  rojo: { caja: "border-destructive/30 bg-destructive/5", punto: "bg-destructive", titular: "text-destructive" },
  neutro: { caja: "border-border/40 bg-card/20", punto: "bg-muted-foreground", titular: "text-foreground" },
};

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

export function TarjetaArgos({ nombre, dia, horario }: {
  nombre: string;
  dia: DiaExpediente;
  horario: { entrada: string | null; salida: string | null };
}) {
  const { t } = useLanguage();

  const r = useMemo(() => {
    const nom = nombre.split(" ")[0] || nombre;
    const banda = dia.nota.banda;
    const juzgadas = dia.capturas.filter((c) => c.veredicto && c.tipo === "pantalla");
    const fuera = juzgadas.filter((c) => c.fueraDeLugar === true && !c.perdonado);

    const conteo = new Map<string, number>();
    for (const c of juzgadas) for (const s of sistemasDe(c.veredicto!)) conteo.set(s, (conteo.get(s) ?? 0) + 1);
    const sistemas = [...conteo.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
    const sistemasTxt = sistemas.slice(0, 3).map(([s]) => s).join(", ");

    const fPant = dia.nota.factores.find((f) => f.clave === "pantalla")?.sub ?? null;
    const fCam = dia.nota.factores.find((f) => f.clave === "camara")?.sub ?? null;

    const difEnt = minDif(horario.entrada, hhmm(dia.entroAt));
    const difSal = minDif(horario.salida, hhmm(dia.salioAt));
    const tarde = difEnt != null && difEnt > 5;
    const temprano = difSal != null && difSal < -5;

    const titular: Frase = banda === "bien" ? { k: "hr.exp.mgr.bien", p: { n: nom } }
      : banda === "ojo" ? { k: "hr.exp.mgr.ojo", p: { n: nom } }
      : banda === "mal" ? { k: "hr.exp.mgr.mal", p: { n: nom } }
      : { k: "hr.exp.mgr.sindatos", p: { n: nom } };
    const tono: Tono = banda === "bien" ? "verde" : banda === "ojo" ? "ambar" : banda === "mal" ? "rojo" : "neutro";

    const frases: Frase[] = [];
    if (juzgadas.length === 0) frases.push({ k: "hr.exp.mgr.sinJuicio" });
    else if (fuera.length === 0) {
      frases.push({ k: "hr.exp.mgr.enfocado", p: { n: juzgadas.length } });
      if (sistemasTxt) frases.push({ k: "hr.exp.mgr.dondePaso", p: { sistemas: sistemasTxt } });
    } else {
      frases.push({ k: "hr.exp.mgr.fuera", p: { fuera: fuera.length, n: juzgadas.length } });
      if (sistemasTxt) frases.push({ k: "hr.exp.mgr.dondePaso", p: { sistemas: sistemasTxt } });
    }
    if (fPant != null && fPant < 50) frases.push({ k: "hr.exp.mgr.pantallaBaja", p: { pct: Math.round(fPant) } });
    if (fCam != null && fCam < 50) frases.push({ k: "hr.exp.mgr.camaraBaja", p: { pct: Math.round(fCam) } });
    if (temprano) frases.push({ k: "hr.exp.mgr.salioTemprano", p: { min: Math.abs(difSal!), hora: a12(hhmm(dia.salioAt)) ?? "" } });
    if (tarde) frases.push({ k: "hr.exp.mgr.entroTarde", p: { min: difEnt! } });
    if (dia.minutosPausaDeMas > 5) frases.push({ k: "hr.exp.mgr.pausas", p: { min: Math.round(dia.minutosPausaDeMas) } });
    if (dia.faltas.length > 0) frases.push({ k: "hr.exp.mgr.faltas", p: { n: dia.faltas.length } });

    const cierre: Frase | null = fuera.length > 0 ? { k: "hr.exp.mgr.cierreFuera" }
      : banda === "mal" && ((fPant != null && fPant < 50) || (fCam != null && fCam < 50)) ? { k: "hr.exp.mgr.cierreCamPant" }
      : banda === "bien" ? { k: "hr.exp.mgr.cierreBien" }
      : null;

    const fueraLista = [...fuera].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .map((c) => ({ id: c.id, hora: a12(format(new Date(c.createdAt), "HH:mm")), v: c.veredicto! }));

    return { nom, tono, titular, frases, cierre, sistemas, fueraLista };
  }, [nombre, dia, horario]);

  const cl = CLASES[r.tono];

  return (
    <section className="vidrio sube mt-4 p-4 lg:p-5">
      <div className="v-cont">
        <div className="mb-3 flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/15 text-primary">
            <Bot className="h-4 w-4" />
          </span>
          <p className="text-xs font-semibold text-muted-foreground">{t("hr.exp.mgr.titulo")}</p>
        </div>

        {/* El veredicto del manager: titular con color + párrafo con criterio. */}
        <div className={`rounded-2xl border px-4 py-3.5 ${cl.caja}`}>
          <p className={`flex items-center gap-2 font-display text-base font-bold ${cl.titular}`}>
            <span className={`h-2 w-2 shrink-0 rounded-full ${cl.punto}`} />
            {t(r.titular.k, r.titular.p)}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-foreground/90">
            {r.frases.map((f) => t(f.k, f.p)).join(" ")}
          </p>
          {r.cierre && (
            <p className="mt-2.5 flex items-start gap-1.5 text-sm font-medium">
              <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span>{t(r.cierre.k)}</span>
            </p>
          )}
        </div>

        {/* En qué sistemas pasó el tiempo (lo que Argos reconoció). */}
        {r.sistemas.length > 0 && (
          <div className="mt-3">
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

        {/* Lo que Argos marcó fuera de lugar, uno a uno. */}
        {r.fueraLista.length > 0 && (
          <div className="mt-3 border-t border-border/40 pt-3">
            <p className="mb-1.5 text-[11px] font-semibold text-destructive">{t("hr.exp.mgr.fueraTitulo")}</p>
            <div className="flex flex-col gap-1.5">
              {r.fueraLista.map((f) => (
                <div key={f.id} className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-2.5 py-1.5">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
                  <span className="min-w-0 flex-1 text-xs">{f.v}</span>
                  <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">{f.hora}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
