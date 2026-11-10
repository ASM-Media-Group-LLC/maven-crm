import { useState } from "react";
import { ChevronDown, CloudUpload, HardDriveDownload, ShieldAlert, Snowflake, Star, Database } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { tamanoNas, type FichaNas, type ResumenNas } from "@/lib/espacioNas";
import { FichaNasVista } from "./FichaNas";
import type { EstadoDe } from "./comun";

// COPIA DE SEGURIDAD DEL NAS (Alvaro, 10/11/2026): "eran propuestas de copia de
// seguridad entonces... desplegarlo en algún lugar que recomiendas". Hoy cada
// archivo existe una sola vez (NAS1 o NAS2, sin espejo: decisión del
// 28/09/2026). Cuatro caminos con lo que cuestan y lo que protegen, y la
// recomendación. Precios de lista consultados el 10/11/2026 (Backblaze Computer
// Backup US$99/año con discos externos incluidos; B2 US$6,95/TB/mes; Wasabi
// ~US$7–8/TB/mes; Glacier Deep Archive ~US$1/TB/mes con recuperación de 12–48 h).
// La ficha del NAS (qué es, cómo llega el contenido) queda plegada abajo.

type Opcion = {
  clave: "backblaze" | "espejo" | "nube" | "frio";
  icono: LucideIcon;
  recomendada?: boolean;
};
const OPCIONES: Opcion[] = [
  { clave: "backblaze", icono: CloudUpload, recomendada: true },
  { clave: "espejo", icono: HardDriveDownload, recomendada: true },
  { clave: "nube", icono: Database },
  { clave: "frio", icono: Snowflake },
];
const CLAVES = {
  backblaze: {
    titulo: "dashboard.centro.nas.copia.backblaze.titulo", costo: "dashboard.centro.nas.copia.backblaze.costo",
    protege: "dashboard.centro.nas.copia.backblaze.protege", ojo: "dashboard.centro.nas.copia.backblaze.ojo",
  },
  espejo: {
    titulo: "dashboard.centro.nas.copia.espejo.titulo", costo: "dashboard.centro.nas.copia.espejo.costo",
    protege: "dashboard.centro.nas.copia.espejo.protege", ojo: "dashboard.centro.nas.copia.espejo.ojo",
  },
  nube: {
    titulo: "dashboard.centro.nas.copia.nube.titulo", costo: "dashboard.centro.nas.copia.nube.costo",
    protege: "dashboard.centro.nas.copia.nube.protege", ojo: "dashboard.centro.nas.copia.nube.ojo",
  },
  frio: {
    titulo: "dashboard.centro.nas.copia.frio.titulo", costo: "dashboard.centro.nas.copia.frio.costo",
    protege: "dashboard.centro.nas.copia.frio.protege", ojo: "dashboard.centro.nas.copia.frio.ojo",
  },
} as const;
const PASOS = [
  "dashboard.centro.nas.copia.paso1",
  "dashboard.centro.nas.copia.paso2",
  "dashboard.centro.nas.copia.paso3",
] as const;

export function CopiaSeguridadNasVista({ resumen, ficha }: { resumen: ResumenNas | undefined; ficha: EstadoDe<FichaNas> }) {
  const { t, language } = useLanguage();
  const [verFicha, setVerFicha] = useState(false);
  const usado = resumen && !resumen.sin_muestras ? tamanoNas(resumen.usado, language) : "—";
  const discoMayor = resumen && !resumen.sin_muestras && resumen.discos.length
    ? tamanoNas(Math.max(...resumen.discos.map((d) => d.total - d.libre)), language) : "—";

  return (
    <div className="flex flex-col gap-4">
      <section className="vidrio sube flex gap-3 p-4">
        <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
        <div className="text-sm">
          <p className="font-semibold">{t("dashboard.centro.nas.copia.hoyTitulo")}</p>
          <p className="mt-1 max-w-3xl text-muted-foreground">{t("dashboard.centro.nas.copia.hoyTexto", { usado, disco: discoMayor })}</p>
        </div>
      </section>

      <section className="vidrio sube p-4">
        <h2 className="text-sm font-semibold">{t("dashboard.centro.nas.copia.propuestas")}</h2>
        <p className="mb-3 mt-1 max-w-3xl text-xs text-muted-foreground">{t("dashboard.centro.nas.copia.propuestasNota")}</p>
        <div className="grid gap-3 md:grid-cols-2">
          {OPCIONES.map((o) => {
            const k = CLAVES[o.clave];
            const Icono = o.icono;
            return (
              <article key={o.clave} className={`flex flex-col gap-2 rounded-panel border p-3 ${o.recomendada ? "border-primary/40 bg-primary/5" : "border-border/60 bg-card/40"}`}>
                <div className="flex items-center gap-2">
                  <Icono className="h-4 w-4 text-primary/80" />
                  <h3 className="text-sm font-semibold">{t(k.titulo)}</h3>
                  {o.recomendada && (
                    <span className="ml-auto inline-flex items-center gap-1 rounded-full border border-primary/30 px-2 py-0.5 text-[10px] font-semibold text-primary">
                      <Star className="h-3 w-3" />{t("dashboard.centro.nas.copia.recomendada")}
                    </span>
                  )}
                </div>
                <p className="font-display text-base font-semibold">{t(k.costo)}</p>
                <p className="text-xs"><span className="font-medium">{t("dashboard.centro.nas.copia.protegeDe")}</span> {t(k.protege)}</p>
                <p className="text-xs text-muted-foreground"><span className="font-medium">{t("dashboard.centro.nas.copia.ojo")}</span> {t(k.ojo)}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section className="vidrio sube p-4">
        <h2 className="text-sm font-semibold">{t("dashboard.centro.nas.copia.miRecomendacion")}</h2>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{t("dashboard.centro.nas.copia.recomendacionTexto")}</p>
        <h3 className="mt-3 text-xs font-semibold">{t("dashboard.centro.nas.copia.paraArrancar")}</h3>
        <ol className="mt-1 flex max-w-3xl list-decimal flex-col gap-1 pl-5 text-sm text-muted-foreground">
          {PASOS.map((p) => <li key={p}>{t(p)}</li>)}
        </ol>
      </section>

      {/* Cómo funciona el NAS (la ficha), plegado: Alvaro lo revisa aparte. */}
      <section className="vidrio sube p-4">
        <button type="button" onClick={() => setVerFicha((v) => !v)} className="flex w-full items-center justify-between gap-2 text-left text-sm font-semibold">
          {t("dashboard.centro.nas.copia.comoFunciona")}
          <ChevronDown className={`h-4 w-4 transition-transform ${verFicha ? "rotate-180" : ""}`} />
        </button>
        {verFicha && <div className="mt-3"><FichaNasVista q={ficha} resumen={resumen} sinAvisoRespaldo /></div>}
      </section>
    </div>
  );
}
