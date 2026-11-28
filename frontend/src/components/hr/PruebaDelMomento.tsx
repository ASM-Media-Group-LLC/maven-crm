import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { urlsDeNas, urlsDelBuzon } from "@/hooks/useMonitorEventos";
import type { CapturaDia } from "@/hooks/useExpedienteEmpleado";
import { horaBogota } from "@/lib/llegadas";

// LA PRUEBA DE UN MOMENTO (Alvaro, 27/11/2026: «quiero ver qué pasó»): los
// pantallazos de pantalla y cámara más cercanos a ese rato del día. Se firman
// solo al abrir la línea (no antes), igual que la tira del expediente: los del
// NAS por la edge argos-foto, los del buzón con Supabase.

const clave = (c: CapturaDia) => (c.enNas ? c.nasPath : c.path);
const MARGEN = 2 * 60_000;

/** Las capturas del rato [desde, hasta] (con 2 min de margen); si no hay, la más
 *  cercana de cada tipo en los 10 min alrededor. Máximo 2 pares. */
export function capturasDelRato(capturas: CapturaDia[], ini: number, fin: number): CapturaDia[] {
  const ms = (c: CapturaDia) => Date.parse(c.createdAt);
  const dentro = capturas.filter((c) => ms(c) >= ini - MARGEN && ms(c) <= fin + MARGEN);
  const elegir = (tipo: CapturaDia["tipo"]) => {
    const xs = dentro.filter((c) => c.tipo === tipo).sort((a, b) => ms(a) - ms(b));
    if (xs.length) return [xs[0], xs[xs.length - 1]].filter((c, i, a) => a.indexOf(c) === i);
    const cerca = capturas.filter((c) => c.tipo === tipo && Math.abs(ms(c) - ini) <= 10 * 60_000)
      .sort((a, b) => Math.abs(ms(a) - ini) - Math.abs(ms(b) - ini));
    return cerca.slice(0, 1);
  };
  return [...elegir("pantalla"), ...elegir("camara")];
}

export function PruebaDelMomento({ capturas, desde, hasta }: { capturas: CapturaDia[]; desde: number; hasta: number }) {
  const { t } = useLanguage();
  const fotos = useMemo(() => capturasDelRato(capturas, desde, hasta), [capturas, desde, hasta]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [cargando, setCargando] = useState(fotos.length > 0);
  useEffect(() => {
    let vivo = true;
    const nas = fotos.filter((c) => c.enNas && c.nasPath).map((c) => c.nasPath!);
    const buzon = fotos.filter((c) => !c.enNas).map((c) => c.path);
    if (!nas.length && !buzon.length) { setCargando(false); return; }
    void Promise.all([urlsDeNas(nas), urlsDelBuzon(buzon)]).then(([a, b]) => {
      if (vivo) { setUrls({ ...a, ...b }); setCargando(false); }
    });
    return () => { vivo = false; };
  }, [fotos]);

  if (!fotos.length) return <p className="text-xs text-muted-foreground">{t("hr.paso.sinFoto")}</p>;
  if (cargando) return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {fotos.map((c) => {
        const u = clave(c) ? urls[clave(c)!] : undefined;
        return (
          <a key={c.id} href={u} target="_blank" rel="noopener noreferrer"
            className="group relative block overflow-hidden rounded-lg border border-border/50 bg-black/40">
            {u ? <img src={u} alt="" loading="lazy" className="aspect-video w-full object-cover transition group-hover:opacity-90" />
              : <div className="flex aspect-video items-center justify-center text-[10px] text-muted-foreground">{t("hr.paso.sinFoto")}</div>}
            <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-white">
              {t(c.tipo === "pantalla" ? "hr.paso.pantalla" : "hr.paso.camara")} · {horaBogota(c.createdAt)}
            </span>
          </a>
        );
      })}
    </div>
  );
}
